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


#страничка редактирвоания админа


def _ensure_tech_supp_or_403(user: User):
    if getattr(user, "role", None) != Role.tech_supp:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    


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
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Ревью отчёта тех.специалистом.
    payload: {"approval": "approved" | "rejected", "comment": "optional text", "photos": ["storage_key1", ...]}
    Правила:
    - только роль tech_supp
    - устанавливаем approval_tech и review_comment, reviewed_at
    - если оба approval (логист + тех) == approved -> задача считается completed, фиксируем completed_at и history
    - если отклонено -> оставляем задачу в inspection, ревью можно отправлять повторно; уведомляем автора отчёта
    """
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

    # load task WITH equipment and work_types for snapshot
    t_res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем компанию
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment), # <--- ЗАГРУЖАЕМ оборудование
            selectinload(Task.works).selectinload(TaskWork.work_type)              # <--- ЗАГРУЖАЕМ виды работ
        )
    )
    task = t_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # set tech approval
    old_approval = report.approval_tech
    report.approval_tech = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    report.review_comment = comment
    report.reviewed_at = datetime.now(timezone.utc) # _now_utc() ?

    try:
        # if both approved -> finalize task
        if report.approval_tech == ReportApproval.approved and report.approval_logist == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc) # _now_utc() ?

            # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (завершение задачи) ---
            # Так как связи уже загружены через options в t_res, мы можем их использовать
            equipment_snapshot_for_history = [
                {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
                for te in task.equipment_links
            ]

            work_types_snapshot_for_history = [
                {"name": tw.work_type.name, "quantity": tw.quantity}
                for tw in task.works
            ]

            # Создаём запись в истории с *всеми* полями задачи и снимками
            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=TaskStatus.completed, # action - новый статус
                event_type=TaskHistoryEventType.report_status_changed, # ✅ Новый тип
                comment="Both approvals -> completed by tech",
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,  # ✅ Заменено
                contact_person_id=task.contact_person_id,  # ✅ Заменено
                contact_person_phone=task.contact_person_phone,
                vehicle_info=task.vehicle_info,
                gos_number = task.gos_number,
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
                # --- НОВЫЕ ПОЛЯ: Снимки ---
                equipment_snapshot=equipment_snapshot_for_history, # <--- Добавлено
                work_types_snapshot=work_types_snapshot_for_history, # <--- Добавлено
            )
            db.add(hist)
        else:
            # if rejected -> keep task in inspection state; add history entry for rejection or waiting
            action = TaskStatus.inspection # Статус задачи не изменился, но отчёт проверялся
            hist_comment = f"Tech review: {approval}"
            if comment:
                hist_comment += f". Comment: {comment}"

            # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (проверка отчёта тех.специалистом) ---
            # Так как связи уже загружены через options в t_res, мы можем их использовать
            equipment_snapshot_for_history = [
                {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
                for te in task.equipment_links
            ]

            work_types_snapshot_for_history = [
                {"name": tw.work_type.name, "quantity": tw.quantity}
                for tw in task.works
            ]

            # Создаём запись в истории с *всеми* полями задачи и снимками
            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=action, # action - текущий статус задачи
                event_type=TaskHistoryEventType.report_status_changed, # ✅ Новый тип
                comment=hist_comment,
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,  # ✅ Заменено
                contact_person_id=task.contact_person_id,  # ✅ Заменено
                contact_person_phone=task.contact_person_phone,
                vehicle_info=task.vehicle_info,
                gos_number = task.gos_number,
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
                # --- НОВЫЕ ПОЛЯ: Снимки ---
                equipment_snapshot=equipment_snapshot_for_history, # <--- Добавлено
                work_types_snapshot=work_types_snapshot_for_history, # <--- Добавлено
            )
            db.add(hist)

        await db.flush()
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
        background_tasks.add_task(
            "back.utils.notify.notify_user", # Убедитесь, что notify_user создаёт свою сессию
            report.author_id,
            f"Report #{report.id} reviewed by tech: {approval}. Comment: {comment or ''}",
            task_id
        )

    return {"detail": "Reviewed", "approval": approval}


@router.get("/tasks/{task_id}")
async def tech_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
        )
        .where(Task.id == task_id)
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # --- equipment и work_types ---
    equipment = [
        {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number} # <--- Добавлен serial_number
        for te in (task.equipment_links or [])
    ] or None

    work_types = [
        {"work_type_id": tw.work_type_id, "quantity": tw.quantity}
        for tw in (task.works or []) 
    ] or None

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
                photos = keys # Возвращаем список storage_key
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
        "contact_person_phone": task.contact_person_phone,
        "gos_number" : task.gos_number,
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


@router.get("/contact-persons/{contact_person_id}/phone", dependencies=[Depends(require_roles(Role.tech_supp))])
async def tech_get_contact_person_phone(
    contact_person_id: int,
    db: AsyncSession = Depends(get_db)
):

    res = await db.execute(
        select(ContactPerson.phone).where(ContactPerson.id == contact_person_id)
    )
    phone_number = res.scalar_one_or_none()

    if phone_number is None:
        raise HTTPException(status_code=404, detail="Контактное лицо не найдено")

    return {"phone": phone_number}



@router.get("/me")
async def tech_supp_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Личный кабинет тех.спеца:
    - имя, фамилия, роль
    - история задач, где тех.спец участвовал (например, проверял отчёты)
    """
    _ensure_tech_supp_or_403(current_user)

    # Задачи, где тех.спец проверял отчёты (approval_tech)
    # Получаем ID отчётов, которые проверял текущий тех.спец
    report_res = await db.execute(
        select(TaskReport.task_id).where(TaskReport.approval_tech != ReportApproval.waiting) # Не "ожидает", т.е. проверен
    )
    checked_task_ids = [row[0] for row in report_res.fetchall() if row[0] is not None]

    # Получаем задачи по этим ID, включая связанные объекты
    if checked_task_ids:
        task_res = await db.execute(
            select(Task).options(
                selectinload(Task.company),
                selectinload(Task.contact_person),
                selectinload(Task.reports.and_(TaskReport.approval_tech != ReportApproval.waiting)) # Опционально: только отчёты, проверенные техспецом
            ).where(
                Task.id.in_(checked_task_ids),
                Task.status == TaskStatus.completed # Только завершённые
            )
        )
        completed = task_res.scalars().all()
    else:
        completed = []

    # Сумма цен клиента по выполненным задачам (где участвовал тех.спец)
    total = sum([float(t.client_price or 0) for t in completed])

    history = []
    for t in completed:
        # Найдём отчёты, проверенные тех.спецом (если загружены)
        # Для простоты возьмём любое упоминание в отчётах или просто факт участия
        # Можно уточнить логику: например, брать только задачи, где хотя бы один отчёт был одобрен/отклонён тех.спецом
        # Пока просто добавляем задачу, если она в списке checked_task_ids
        history.append({
            "id": t.id,
            "client": t.company.name if t.company else "—", # Имя компании
            "contact_person": t.contact_person.name if t.contact_person else "—", # Имя контактного лица
            "vehicle_info": t.vehicle_info,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "reward": str(t.client_price) if t.client_price is not None else None, # Цена клиента как "награда"
        })

    return {
        "id": current_user.id,
        "name": current_user.name,
        "lastname": current_user.lastname,
        "role": current_user.role.value if current_user.role else None,
        "completed_count": len(completed),
        "total_earned": str(round(total, 2)),
        "history": history,
    }


# --- НОВЫЙ ЭНДПОИНТ: Детали завершённой задачи для тех.спеца ---
@router.get("/completed-tasks/{task_id}")
async def tech_supp_completed_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    _ensure_tech_supp_or_403(current_user) # Проверяем, что пользователь - тех.спец

    report_res = await db.execute(
        select(TaskReport.task_id).where(
            TaskReport.task_id == task_id,
            TaskReport.approval_tech != ReportApproval.waiting # Не "ожидает", т.е. проверен
        )
    )
    checked_task_ids = [row[0] for row in report_res.fetchall() if row[0] is not None]

    if not checked_task_ids: # Если нет отчётов, проверенных тех.спецом, задача недоступна
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна (нет проверенных отчётов)")

    # Теперь загружаем саму задачу
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports), # Загружаем отчёты
            selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
        )
        .where(
            Task.id == task_id,
            Task.status == TaskStatus.completed      # ✅ И что она завершена
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна")

    # --- equipment и work_types ---
    equipment = [
        {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number}
        for te in (task.equipment_links or [])
    ] or None

    work_types = [
        {"work_type_id": tw.work_type_id, "quantity": tw.quantity}
        for tw in (task.works or [])
    ] or None

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
                photos = keys # Возвращаем список storage_key
            except Exception:
                photos = []
        reports.append({
            "id": r.id,
            "text": r.text,
            "approval_logist": r.approval_logist.value if r.approval_logist else None,
            "approval_tech": r.approval_tech.value if r.approval_tech else None,
            "photos": photos or None
        })

    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    return {
        "id": task.id,
        "company_name": company_name,
        "contact_person_name": contact_person_name,
        "contact_person_phone": task.contact_person_phone,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "location": task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None
    }