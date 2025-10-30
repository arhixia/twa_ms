from fastapi import APIRouter, Body, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import Task, TaskAttachment, Role
from back.utils.selectel import get_s3_client
from back.users.users_schemas import require_roles
from back.db.models import FileType
import aiofiles
import hashlib

from back.files.handlers import delete_object_from_s3, validate_and_process_attachment

router = APIRouter()


class InitMultipartIn(BaseModel):
    filename: str
    content_type: str
    size: int
    task_id: Optional[int] = None  # можно привязать к черновику/задаче
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


# Инициация multipart upload — возвращаем upload_id и список частей
@router.post("/init-multipart", response_model=InitMultipartOut)
async def init_multipart(
    payload: InitMultipartIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Проверки прав: пользователь должен быть логист/монтажник/tech/admin в зависимости от контекста.
    user_role = getattr(current_user, "role", None)
    if user_role not in (Role.logist, Role.montajnik, Role.tech_supp, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Размер и mime проверки
    if payload.size is None or payload.size <= 0 or payload.size > 10 * 1024 ** 3:
        raise HTTPException(status_code=400, detail="Invalid size, max 10 GiB")
    if payload.content_type not in ("image/jpeg", "image/png", "image/webp", "image/jpg"):
        raise HTTPException(status_code=400, detail="Unsupported content_type")

    s3 = get_s3_client()
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

    # Создаём запись TaskAttachment
    attach = TaskAttachment(
        task_id=payload.task_id if payload.task_id is not None else 0,
        report_id=None,
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

    # запуск обработки: thumbnail, checksum, validation
    background_tasks.add_task(validate_and_process_attachment, attach.id)
    return {"attachment_id": attach.id, "storage_key": attach.storage_key}


# Fallback серверный upload (для небольших файлов)
@router.post("/upload-fallback")
async def upload_fallback(
    background_tasks: BackgroundTasks,
    task_id: Optional[int] = Query(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Проверка ролей
    user_role = getattr(current_user, "role", None)
    if user_role not in (Role.logist, Role.montajnik, Role.tech_supp, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Проверка mime
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/jpg"):
        raise HTTPException(status_code=400, detail="Unsupported content_type")

    # Чтение файла с обработкой ошибок
    try:
        data = await file.read()
        if len(data) > 10 * 1024 ** 3:
            raise HTTPException(status_code=400, detail="File too large")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File read failed: {e}")

    s3 = get_s3_client()
    key = s3.key_for_task(task_id or 0, file.filename)

    # Загрузка в S3 с обработкой ошибок
    try:
        await s3.put_object(
            key,
            data,
            content_type=file.content_type,
            content_disposition="inline"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    # Создаем запись в БД
    attach = TaskAttachment(
        task_id=task_id if task_id is not None else 0,
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

    # Фоновая обработка (thumbnail, checksum)
    background_tasks.add_task(validate_and_process_attachment, attach.id)

    return {"attachment_id": attach.id, "storage_key": key}


# Список вложений задачи
@router.get("/tasks/{task_id}/attachments", response_model=List[AttachmentOut])
async def list_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
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


@router.delete("/tasks/{task_id}/attachments/{attachment_id}", response_model=DeleteOut)
async def delete_attachment(task_id: int, attachment_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    res = await db.execute(select(TaskAttachment).where(TaskAttachment.id == attachment_id, TaskAttachment.task_id == task_id))
    att = res.scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Права: uploader OR task.creator(logist) OR admin
    allowed = False
    if att.uploader_id and att.uploader_id == getattr(current_user, "id", None):
        allowed = True
    # проверяем создателя задачи
    t_res = await db.execute(select(Task).where(Task.id == task_id))
    task = t_res.scalars().first()
    if task and task.created_by == getattr(current_user, "id", None):
        allowed = True
    if getattr(current_user, "role", None) == Role.admin:
        allowed = True
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    att.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()

    # запланировать удаление из S3
    background_tasks.add_task(delete_object_from_s3, att.storage_key)
    return DeleteOut(detail="Deleted")
