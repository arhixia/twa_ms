import json
from fastapi import APIRouter, Body, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import Task, TaskAttachment, Role, TaskReport, TaskWork
from back.utils.selectel import get_s3_client
from back.users.users_schemas import require_roles
from back.db.models import FileType
import aiofiles
import hashlib
from sqlalchemy.orm import selectinload
from back.files.handlers import delete_object_from_s3, validate_and_process_attachment
from fastapi import Path
from back.files.handlers import delete_object_from_s3

router = APIRouter()


class InitMultipartIn(BaseModel):
    filename: str
    content_type: str
    size: int
    task_id: Optional[int] = None
    report_id: Optional[int] = None  # НОВОЕ: ID отчёта
    draft: Optional[bool] = False



class InitMultipartOut(BaseModel):
    storage_key: str
    upload_id: str
    part_size: int
    parts_count: int
    parts: List[int]


class CompleteMultipartIn(BaseModel):
    storage_key: str
    upload_id: str
    parts: List[Dict[str, Any]]
    task_id: Optional[int] = None
    report_id: Optional[int] = None  # НОВОЕ: ID отчёта
    original_name: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None

class AttachmentOut(BaseModel):
    id: int
    storage_key: str
    presigned_url: Optional[str] = None
    thumb_key: Optional[str] = None
    uploader_id: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    size: Optional[int] = None
    original_name: Optional[str] = None


@router.post("/init-multipart", response_model=InitMultipartOut)
async def init_multipart(
    payload: InitMultipartIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_role = getattr(current_user, "role", None)
    if user_role not in (Role.logist, Role.montajnik, Role.tech_supp, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Размер и mime проверки
    if payload.size is None or payload.size <= 0 or payload.size > 10 * 1024 ** 3:
        raise HTTPException(status_code=400, detail="Invalid size, max 10 GiB")
    if payload.content_type not in ("image/jpeg", "image/png", "image/webp", "image/jpg"):
        raise HTTPException(status_code=400, detail="Unsupported content_type")

    s3 = get_s3_client()

    # --- НОВОЕ: Проверка report_id ---
    if payload.report_id:
        # Загрузить отчёт и проверить, что он принадлежит задаче и автор - текущий пользователь
        report_res = await db.execute(
            select(TaskReport)
            .where(TaskReport.id == payload.report_id, TaskReport.task_id == payload.task_id)
        )
        report = report_res.scalars().first()
        if not report:
            raise HTTPException(status_code=404, detail="Отчёт не найден или не принадлежит задаче")
        if report.author_id != current_user.id:
            raise HTTPException(status_code=403, detail="Только автор отчёта может добавлять к нему вложения")
        # Убедиться, что текущий пользователь - монтажник
        if current_user.role != Role.montajnik:
            raise HTTPException(status_code=403, detail="Только монтажник может добавлять вложения к отчёту")

    # Генерируем ключ в зависимости от наличия report_id
    if payload.report_id:
        key = s3.key_for_report_attachment(payload.task_id or 0, payload.report_id, payload.filename)
    else:
        # Если report_id нет, используем старую логику
        key = s3.key_for_task(payload.task_id or 0, payload.filename)

    upload_id = await s3.create_multipart_upload(key, content_type=payload.content_type)
    parts_info = s3.compute_parts(payload.size)
    return InitMultipartOut(
        storage_key=key,
        upload_id=upload_id,
        part_size=parts_info["part_size"],
        parts_count=parts_info["parts_count"],
        parts=parts_info["parts"],
    )


# Клиент завершил upload частей — завершаем multipart и создаём запись в БД
@router.post("/complete-multipart")
async def complete_multipart(
    background_tasks: BackgroundTasks,
    payload: CompleteMultipartIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_role = getattr(current_user, "role", None)
    if user_role not in (Role.logist, Role.montajnik, Role.tech_supp, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    s3 = get_s3_client()
    # Complete in S3
    try:
        await s3.complete_multipart_upload(payload.storage_key, payload.upload_id, payload.parts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 complete failed: {e}")

    # optional: head_object for verification
    try:
        meta = await s3.head_object(payload.storage_key)
    except Exception:
        meta = {}

    # --- НОВОЕ: Проверка report_id перед созданием записи ---
    report = None
    if payload.report_id:
        # Загрузить отчёт и проверить, что он принадлежит задаче и автор - текущий пользователь
        report_res = await db.execute(
            select(TaskReport)
            .where(TaskReport.id == payload.report_id, TaskReport.task_id == payload.task_id)
        )
        report = report_res.scalars().first()
        if not report or report.author_id != current_user.id or current_user.role != Role.montajnik:
            raise HTTPException(status_code=403, detail="Недостаточно прав для добавления вложения к отчёту")

    # Создаём запись TaskAttachment
    attach = TaskAttachment(
        task_id=payload.task_id if payload.task_id is not None else 0,
        report_id=payload.report_id,  # Указываем report_id если есть
        storage_key=payload.storage_key,
        file_type=FileType.photo,
        original_name=payload.original_name,
        mime_type=payload.mime_type or meta.get("ContentType"),
        size=payload.size or meta.get("ContentLength"),
        uploader_id=getattr(current_user, "id", None),
        uploader_role=getattr(current_user, "role", None).value if getattr(current_user, "role", None) else None,
        processed=False,
    )
    db.add(attach)
    await db.flush()
    await db.commit()
    await db.refresh(attach)

    # --- НОВОЕ: Обновить photos_json у отчёта ---
    if attach.report_id and report: # report уже загружен выше
        # Получить все storage_key вложений этого отчёта
        attachments_res = await db.execute(
            select(TaskAttachment.storage_key)
            .where(TaskAttachment.report_id == attach.report_id)
        )
        keys = [row[0] for row in attachments_res.fetchall()]
        report.photos_json = json.dumps(keys)
        await db.flush()
        await db.commit()

    # запуск обработки: thumbnail, checksum, validation
    background_tasks.add_task(validate_and_process_attachment, attach.id)
    return {"attachment_id": attach.id, "storage_key": attach.storage_key}



@router.post("/upload-fallback")
async def upload_fallback_report(
    background_tasks: BackgroundTasks,
    task_id: int = Query(..., description="ID задачи"),
    report_id: Optional[int] = Query(None, description="ID отчёта (опционально)"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Загрузка файла в S3 с созданием записи TaskAttachment для отчёта.
    """
    # Проверки прав
    user_role = getattr(current_user, "role", None)
    if user_role not in (Role.logist, Role.montajnik, Role.tech_supp, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Проверка mime
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/jpg"):
        raise HTTPException(status_code=400, detail="Unsupported content_type")

    # --- НОВОЕ: Проверка report_id ---
    report = None
    if report_id:
        # Загрузить отчёт и проверить, что он принадлежит задаче и автор - текущий пользователь
        report_res = await db.execute(
            select(TaskReport)
            .where(TaskReport.id == report_id, TaskReport.task_id == task_id)
        )
        report = report_res.scalars().first()
        if not report:
            raise HTTPException(status_code=404, detail="Отчёт не найден или не принадлежит задаче")
        if report.author_id != current_user.id:
            raise HTTPException(status_code=403, detail="Только автор отчёта может добавлять к нему вложения")
        # Убедиться, что текущий пользователь - монтажник
        if current_user.role != Role.montajnik:
            raise HTTPException(status_code=403, detail="Только монтажник может добавлять вложения к отчёту")

    # Чтение файла
    data = await file.read()
    if len(data) > 10 * 1024 ** 3:
        raise HTTPException(status_code=400, detail="File too large")

    s3 = get_s3_client()

    # Генерируем ключ с учётом report_id
    if report_id:
        key = s3.key_for_report_attachment(task_id, report_id, file.filename)
    else:
        # Если report_id нет, используем старую логику
        key = s3.key_for_task(task_id, file.filename)

    # Загрузка в S3
    await s3.put_object(
        key,
        data,
        content_type=file.content_type,
        content_disposition="inline"
    )

    # Создаем запись в БД
    attach = TaskAttachment(
        task_id=task_id,
        report_id=report_id,  
        storage_key=key,
        file_type=FileType.photo,
        original_name=file.filename,
        mime_type=file.content_type,
        size=len(data),
        uploader_id=getattr(current_user, "id", None),
        uploader_role=getattr(current_user, "role", None).value if getattr(current_user, "role", None) else None,
        processed=False,
    )
    db.add(attach)
    await db.flush()
    await db.commit()
    await db.refresh(attach)

    # --- НОВОЕ: Обновить photos_json у отчёта ---
    if attach.report_id and report:
        attachments_res = await db.execute(
            select(TaskAttachment.storage_key)
            .where(TaskAttachment.report_id == attach.report_id)
        )
        keys = [row[0] for row in attachments_res.fetchall()]
        report.photos_json = json.dumps(keys)
        await db.flush()
        await db.commit()

    # Фоновая обработка
    background_tasks.add_task(validate_and_process_attachment, attach.id)

    return {"attachment_id": attach.id, "storage_key": key}

# Список вложений задачи
@router.get("/attachments/tasks/{task_id}/attachments", response_model=List[AttachmentOut])
async def list_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
  
    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    
    

    res = await db.execute(
        select(TaskAttachment)
        .where(TaskAttachment.task_id == task_id, TaskAttachment.deleted_at.is_(None), TaskAttachment.processed == True)
    )
    items = res.scalars().all()
    s3 = get_s3_client()
    out = []
    for it in items:
        url = None
        try:
            url = await s3.presign_get(it.storage_key, expires=15000)  # 1 час
        except Exception:
            url = None
        out.append(AttachmentOut(
            id=it.id,
            storage_key=it.storage_key,
            presigned_url=url,  # ✅ Включаем предварительный URL
            thumb_key=it.thumb_key,
            uploader_id=it.uploader_id,
            uploaded_at=it.uploaded_at,
            size=it.size,
            original_name=it.original_name,
        ))
    return out


@router.get("/reports/{report_id}/attachments", response_model=List[AttachmentOut])
async def list_report_attachments(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Загрузить отчёт и связанную задачу, чтобы проверить права
    report_res = await db.execute(
        select(TaskReport)
        .options(selectinload(TaskReport.task))
        .where(TaskReport.id == report_id)
    )
    report = report_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Отчёт не найден")

    task = report.task

    # Проверить права доступа: автор отчёта, создатель задачи (логист), исполнитель (монтажник), админ
    allowed = False
    if report.author_id == getattr(current_user, "id", None):
        allowed = True
    elif task.created_by == getattr(current_user, "id", None): # логист
        allowed = True
    elif task.assigned_user_id == getattr(current_user, "id", None): # монтажник
        allowed = True
    elif getattr(current_user, "role", None) == Role.admin:
        allowed = True
    elif getattr(current_user, "role", None) == Role.tech_supp: # тех.спец может смотреть, если его просят
        # Проверим, требуется ли тех.проверка для задачи
        # Загрузим работы задачи
        task_works_res = await db.execute(
            select(TaskWork).where(TaskWork.task_id == task.id).options(selectinload(TaskWork.work_type))
        )
        task_works = task_works_res.scalars().all()
        requires_tech_review = any(tw.work_type and tw.work_type.tech_supp_require for tw in task_works)
        if requires_tech_review:
            allowed = True

    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Загрузить вложения отчёта
    res = await db.execute(
        select(TaskAttachment)
        .where(TaskAttachment.report_id == report_id, TaskAttachment.deleted_at.is_(None), TaskAttachment.processed == True)
    )
    items = res.scalars().all()
    s3 = get_s3_client()
    out = []
    for it in items:
        url = None
        try:
            url = await s3.presign_get(it.storage_key, expires=15000)  # 1 час
        except Exception:
            url = None
        out.append(AttachmentOut(
            id=it.id,
            storage_key=it.storage_key,
            presigned_url=url,
            thumb_key=it.thumb_key,
            uploader_id=it.uploader_id,
            uploaded_at=it.uploaded_at,
            size=it.size,
            original_name=it.original_name,
        ))
    return out


# Удаление вложения (soft delete + background S3 delete)
class DeleteOut(BaseModel):
    detail: str



# --- ЭНДПОИНТ: Удаление вложения по storage_key ---
@router.delete("/pending/{storage_key:path}") # Новый маршрут
async def delete_pending_attachment(
    background_tasks: BackgroundTasks,
    storage_key: str = Path(..., description="Storage key в S3"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Удаляет вложение, которое ещё не привязано к отчёту (report_id = null).
    Используется для отмены загрузки вложений перед созданием отчёта.
    """
    # Найти вложение по storage_key, которое НЕ привязано к отчёту, принадлежит задаче пользователя и ему же загружено
    res = await db.execute(
        select(TaskAttachment)
        .where(
            TaskAttachment.storage_key == storage_key,
            TaskAttachment.report_id.is_(None), # Только непривязанные
            TaskAttachment.uploader_id == current_user.id, # Только загруженные текущим пользователем
        )
    )
    attachment = res.scalars().first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Вложение не найдено или не может быть удалено")

    # Удаляем запись из БД
    await db.delete(attachment)
    await db.commit()

    # Запланировать удаление из S3 в фоне
    background_tasks.add_task(delete_object_from_s3, attachment.storage_key)

    return {"detail": "Вложение удалено"}


@router.get("/{full_path:path}")
async def get_attachment(
    full_path: str = Path(..., description="Storage key в S3"),
    db: AsyncSession = Depends(get_db),
):
    print(f"[DEBUG] get_attachment called with full_path: {full_path}") # <--- Используем full_path

    res = await db.execute(
        select(TaskAttachment)
        .where(
            (
                (TaskAttachment.storage_key == full_path) |  # <--- Используем full_path
                (TaskAttachment.thumb_key == full_path)     # <--- Используем full_path
            ),
            TaskAttachment.deleted_at.is_(None)
        )
    )
    attachment = res.scalars().first()
    print(f"[DEBUG] Found attachment: {attachment}")

    if not attachment:
        raise HTTPException(status_code=404, detail="Вложение не найдено")

    s3 = get_s3_client()
    try:
        url = await s3.presign_get(full_path, expires=3600)
        print(f"[DEBUG] Generated presigned URL: {url}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url)
    except Exception as e:
        print(f"[DEBUG] get_attachment: S3 presign failed for {full_path}: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения файла из S3")