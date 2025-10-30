import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import logging

from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import (
    ClientCompany,
    ContactPerson,
    FileType,
    Task,
    TaskAttachment,
    TaskEquipment,
    TaskHistoryEventType,
    TaskReport,
    TaskHistory,
    TaskStatus,
    ReportApproval,
    TaskWork,
    User,
    Role,
)
from back.utils.notify import notify_user
from back.users.users_schemas import TaskHistoryItem, require_roles,Role
from back.utils.selectel import get_s3_client
from back.files.handlers import validate_and_process_attachment
router = APIRouter()
logger = logging.getLogger(__name__)


def _now_utc():
    return datetime.now(timezone.utc)


def _ensure_tech_or_403(user: User):
    if getattr(user, "role", None) != Role.tech_supp:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


async def _add_history(db: AsyncSession, task: Task, user: User, action: TaskStatus, comment: Optional[str] = None):
    h = TaskHistory(task_id=task.id, user_id=getattr(user, "id", None), action=action, comment=comment)
    db.add(h)
    try:
        await db.flush()
    except Exception:
        logger.exception("Failed to flush history")


@router.get("/tasks/active", dependencies=[Depends(require_roles(Role.tech_supp))])
async def tech_active_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Список активных задач для тех.специалиста.
    Возвращаются задачи, которые не в состоянии completed и не являются черновиками.
    """
    _ensure_tech_or_403(current_user)
    # Загружаем задачи с контактным лицом и компанией
    q = select(Task).where(Task.status != TaskStatus.completed, Task.is_draft == False).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
    )
    res = await db.execute(q)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        # Получаем имя контактного лица и компании
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        # Формируем строку "Компания - Контактное лицо" или просто одно из значений
        client_display = f"{company_name} - {contact_person_name}" if company_name and contact_person_name else (company_name or contact_person_name or "—")

        out.append({
            "id": t.id,
            "client": client_display,  # ✅ Используем составное имя
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at),
        })
    return out





@router.get("/tasks/history", dependencies=[Depends(require_roles(Role.tech_supp))])
async def tech_history(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    История выполненных задач (only completed), доступная тех.спецу.
    """
    _ensure_tech_or_403(current_user)
    # Загружаем задачи с контактным лицом и компанией
    q = select(Task).where(Task.status == TaskStatus.completed, Task.is_draft == False).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
    )
    res = await db.execute(q)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        # Получаем имя контактного лица и компании
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        # Формируем строку "Компания - Контактное лицо" или просто одно из значений
        client_display = f"{company_name} - {contact_person_name}" if company_name and contact_person_name else (company_name or contact_person_name or "—")

        out.append({
            "id": t.id,
            "client": client_display,  # ✅ Используем составное имя
            "vehicle_info": t.vehicle_info,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
        })
    return out


@router.post("/tasks/{task_id}/reports/{report_id}/review", dependencies=[Depends(require_roles(Role.tech_supp))])
async def review_report(
    task_id: int,
    report_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    _ensure_tech_or_403(current_user)

    approval = payload.get("approval")
    comment = payload.get("comment")

    if approval not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="approval must be 'approved' or 'rejected'")

    # load report
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # load task with contact_person and company
    t_res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company))  # ✅ Загружаем контактное лицо и компанию
    )
    task = t_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # set tech approval
    old_approval = report.approval_tech
    report.approval_tech = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    report.review_comment = comment
    report.reviewed_at = _now_utc()

    try:
        # if both approved -> finalize task
        if report.approval_tech == ReportApproval.approved and report.approval_logist == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.completed_at = _now_utc()
            # Создаём запись в истории с *всеми* полями задачи
            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=TaskStatus.completed, # action - новый статус
                event_type=TaskHistoryEventType.report_status_changed, # ✅ Новый тип
                comment="Both approvals -> completed by tech",
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,  # ✅ Заменено
                contact_person_id=task.contact_person_id,  # ✅ Заменено
                vehicle_info=task.vehicle_info,
                scheduled_at=task.scheduled_at,
                location=task.location,
                comment_field=task.comment,
                status=task.status.value if task.status else None, # status - новый статус
                assigned_user_id=task.assigned_user_id,
                client_price=str(task.client_price) if task.client_price is not None else None,
                montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
                photo_required=task.photo_required,
                assignment_type=task.assignment_type.value if task.assignment_type else None,
                # --- Поля для структурированной истории (опционально для этого события) ---
                field_name="status", # Поле, которое изменилось
                old_value=task.status.value if task.status else None, # Старое значение статуса перед завершением
                new_value=TaskStatus.completed.value, # Новое значение
                related_entity_id=report.id,
                related_entity_type="report",
            )
            db.add(hist)
        else:
            # if rejected -> keep task in inspection state; add history entry for rejection or waiting
            action = TaskStatus.inspection # Статус задачи не изменился, но отчёт проверялся
            hist_comment = f"Tech review: {approval}"
            if comment:
                hist_comment += f". Comment: {comment}"
            # Создаём запись в истории с *всеми* полями задачи
            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=action, # action - текущий статус задачи
                event_type=TaskHistoryEventType.report_status_changed, # ✅ Новый тип
                comment=hist_comment,
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,  # ✅ Заменено
                contact_person_id=task.contact_person_id,  # ✅ Заменено
                vehicle_info=task.vehicle_info,
                scheduled_at=task.scheduled_at,
                location=task.location,
                comment_field=task.comment,
                status=task.status.value if task.status else None, # status - текущий статус задачи
                assigned_user_id=task.assigned_user_id,
                client_price=str(task.client_price) if task.client_price is not None else None,
                montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
                photo_required=task.photo_required,
                assignment_type=task.assignment_type.value if task.assignment_type else None,
                # --- Поля для структурированной истории ---
                field_name="report_approval_tech", # Поле, связанное с отчётом
                old_value=old_approval.value if old_approval else None, # Старое значение статуса отчёта тех.специалиста
                new_value=report.approval_tech.value, # Новое значение статуса отчёта тех.специалиста
                related_entity_id=report.id,
                related_entity_type="report",
            )
            db.add(hist)

        await db.flush()

        # ✅ Логируем ревью отчёта (структурированная запись с полным снимком)
        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status, # action - текущий статус задачи
            event_type=TaskHistoryEventType.report_status_changed, # Новый тип
            comment=f"Report #{report.id} reviewed by tech: {approval}. Comment: {comment or ''}",
            related_entity_id=report.id,
            related_entity_type="report",
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,  # ✅ Заменено
            contact_person_id=task.contact_person_id,  # ✅ Заменено
            vehicle_info=task.vehicle_info,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment,
            status=task.status.value if task.status else None,
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price) if task.client_price is not None else None,
            montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
        )
        db.add(hist)
        await db.commit()
    except Exception as e:
        logger.exception("Failed to perform tech review: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to review report")

    # Notify report author about result
    if report.author_id:
        background_tasks.add_task(notify_user, report.author_id, f"Report #{report.id} reviewed by tech: {approval}. Comment: {comment or ''}", task_id)

    return {"detail": "Reviewed", "approval": approval}


@router.post("/tasks/{task_id}/reports/{report_id}/attachments", dependencies=[Depends(require_roles(Role.tech_supp))])
async def attach_photos_by_tech(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    photos = payload.get("photos", [])
    if not isinstance(photos, list) or not all(isinstance(p, str) for p in photos):
        raise HTTPException(status_code=400, detail="photos must be a list of storage_key strings")

    res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    for sk in photos:
        att = TaskAttachment(
            task_id=task_id,
            report_id=report_id,
            storage_key=sk,
            file_type=FileType.photo,
            uploader_id=current_user.id,
            uploader_role=current_user.role.value,
            processed=False,
        )
        db.add(att)
        await db.flush()
        background_tasks.add_task(validate_and_process_attachment, att.id)

    await db.commit()
    return {"detail": f"{len(photos)} photo(s) attached by tech"}


@router.delete("/tasks/{task_id}/reports/{report_id}/attachments/{attachment_id}", dependencies=[Depends(require_roles(Role.tech_supp))])
async def delete_attachment_by_tech(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(TaskAttachment).where(
        TaskAttachment.id == attachment_id,
        TaskAttachment.task_id == task_id,
        TaskAttachment.report_id == report_id,
        TaskAttachment.uploader_id == current_user.id,
        TaskAttachment.deleted_at == None
    ))
    att = res.scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found or not yours")

    att.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    background_tasks.add_task("back.files.handlers.delete_object_from_s3", att.storage_key)
    return {"detail": "Attachment deleted"}



@router.get("/tasks/{task_id}")
async def tech_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Загружаем задачу с контактным лицом и компанией
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.attachments),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
        )
        .where(Task.id == task_id)
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Получаем объект S3
    s3 = get_s3_client()
    S3_PUBLIC_URL = s3.endpoint_url

    # --- attachments к задаче ---
    attachments = []
    for a in (task.attachments or []):
        if a.deleted_at or not a.processed:  # ✅ Фильтр по processed
            continue
        url = None
        try:
            url = await s3.presign_get(a.storage_key, expires=3600)  # ✅ presigned_url
        except Exception:
            url = None
        attachments.append({
            "id": a.id,
            "file_type": a.file_type.value if a.file_type else None,
            "presigned_url": url,  # ✅ Добавляем presigned_url
            "storage_key": a.storage_key,
            "processed": a.processed,
            "uploaded_at": a.uploaded_at,
            "original_name": a.original_name,
            "size": a.size,
        })
    attachments = attachments or None

    # --- equipment и work_types ---
    equipment = [
        {"equipment_id": te.equipment_id, "quantity": te.quantity}
        for te in (task.equipment_links or [])
    ] or None
    work_types = [tw.work_type_id for tw in (task.works or [])] or None

    # --- history ---
    history = [
        {
            "action": h.action.value if h.action else None,
            "user_id": h.user_id,
            "comment": h.comment,
            "ts": str(h.timestamp)
        }
        for h in (task.history or [])
    ] or None

    # --- reports с фото ---
    reports = []
    for r in (task.reports or []):
        photos = []
        if r.photos_json:
            try:
                keys = json.loads(r.photos_json)
                # ✅ Также используем presigned_url для photos, если нужно
                photo_urls = []
                for k in keys:
                    try:
                        photo_url = await s3.presign_get(k, expires=3600)
                        photo_urls.append(photo_url)
                    except Exception:
                        photo_urls.append(f"{S3_PUBLIC_URL}/{k}")  # fallback
                photos = photo_urls
            except Exception:
                photos = []
        reports.append({
            "id": r.id,
            "text": r.text,
            "approval_logist": r.approval_logist.value if r.approval_logist else None,
            "approval_tech": r.approval_tech.value if r.approval_tech else None,
            "photos": photos or None
        })

    # --- company и contact_person ---
    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    return {
        "id": task.id,
        "company_name": company_name,  # ✅ Новое
        "contact_person_name": contact_person_name,  # ✅ Новое
        "vehicle_info": task.vehicle_info or None,
        "location" : task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "attachments": attachments,  # ✅ Обновлено
        "history": history,
        "reports": reports or None
    }


@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.tech_supp))])
async def get_tech_task_full_history(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user) # Для проверки существования задачи и прав (упрощенно)
):
    """
    Получить полную историю изменений задачи.
    """
    # 1. Проверить существование задачи (можно добавить проверку прав)
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # 2. Получить историю, отсортированную по времени
    res = await db.execute(
        select(TaskHistory)
        .where(TaskHistory.task_id == task_id)
        .order_by(TaskHistory.timestamp.asc()) # От самых старых к новым
        # .options(selectinload(TaskHistory.user)) # Если нужно имя пользователя
    )
    history_records = res.scalars().all()

    # 3. Форматируем для ответа
    out = []
    for h in history_records:
        out.append(TaskHistoryItem.model_validate(h)) # Pydantic сам преобразует поля
    return out


@router.get("/companies", dependencies=[Depends(require_roles(Role.tech_supp))])
async def tech_get_companies(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ClientCompany))
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.tech_supp))])
async def tech_get_contact_persons(company_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ContactPerson).where(ContactPerson.company_id == company_id))
    contacts = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in contacts]
