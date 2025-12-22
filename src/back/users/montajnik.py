from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, select, and_, or_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import json
import logging
from back.users.users_schemas import MontajnikReportReview, TaskHistoryItem, require_roles,Role
from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import (
    AssignmentType,
    ClientCompany,
    ContactPerson,
    Equipment,
    FileType,
    Task,
    TaskHistoryEventType,
    TaskStatus,
    TaskHistory,
    TaskAttachment,
    TaskReport,
    BroadcastResponse,
    TaskWork,
    TaskEquipment,
    TaskHistory as TH,
    User,
    Role,
    ReportApproval,
    WorkType,
)
from back.utils.notify import notify_user
from back.utils.selectel import get_s3_client
from back.files.handlers import validate_and_process_attachment

router = APIRouter()
logger = logging.getLogger(__name__)


def _now_utc():
    return datetime.now(timezone.utc)


STATUS_TRANSLATIONS_RU = {
    TaskStatus.new: "Создана",
    TaskStatus.accepted: "Принята монтажником",
    TaskStatus.on_the_road: "Выехал на работу",
    TaskStatus.started: "В процессе выполнения",
    TaskStatus.on_site: "Прибыл на место",
    TaskStatus.completed: "Завершена",
    TaskStatus.inspection: "На проверке логистом/тех поддержкой",
    TaskStatus.returned: "Возвращена на доработку",
    TaskStatus.archived: "Архивирована",
    TaskStatus.assigned: "Назначена",
}


def _ensure_montajnik_or_403(user: User):
    if getattr(user, "role", None) != Role.montajnik:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    


# --- Endpoints -------------------------------------------------------------

@router.get("/tasks/mine", dependencies=[Depends(require_roles(Role.montajnik))])
async def my_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Список задач для текущего монтажника:
    - назначенные (assigned_user_id == me)
    - в работе / на проверке и т.д.
    Возвращает краткую информацию о задачах, включая назначенное оборудование.
    """
    _ensure_montajnik_or_403(current_user)

    count_query = select(func.count(Task.id)).where(
        Task.assigned_user_id == current_user.id,
        Task.is_draft == False,
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived, TaskStatus.assigned]),
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    q = select(Task).where(
        Task.assigned_user_id == current_user.id,
        Task.is_draft == False,
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived, TaskStatus.assigned]),
    ).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company),
        selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
    )
    res = await db.execute(q)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"

        equipment = [
            {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number, "equipment": te.equipment}
            for te in (t.equipment_links or [])
        ] or None

        out.append({
            "id": t.id,
            "client_name": client_name,  # ✅ Только название компании или ИП
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "equipment": equipment,
        })

    return {
        "tasks": out,
        "total_count": total_count
    }


@router.get("/tasks/available", dependencies=[Depends(require_roles(Role.montajnik, Role.logist, Role.tech_supp, Role.admin))])
async def available_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Общие (broadcast) задачи, доступные всем активным монтажникам.
    Возвращает список рассылок (tasks with assignment_type == broadcast и is_draft == False).
    """

    # Сначала получаем количество задач
    count_query = select(func.count(Task.id)).where(
        Task.assignment_type == AssignmentType.broadcast,
        Task.is_draft == False,
        Task.status == TaskStatus.new,
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    # Загружаем задачи с контактным лицом и компанией
    res = await db.execute(
        select(Task)
        .where(
            Task.assignment_type == AssignmentType.broadcast, # Используем Enum напрямую
            Task.is_draft == False,
            Task.status == TaskStatus.new, 
        )
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
        )
    )
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"

        equipment = [
            {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number, "equipment": te.equipment}
            for te in (t.equipment_links or [])
        ] or None

        out.append({
            "id": t.id,
            "client_name": client_name,  # ✅ Только название компании или ИП
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "equipment": equipment,
        })

    return {
        "tasks": out,
        "total_count": total_count
    }


@router.get("/tasks/assigned", dependencies=[Depends(require_roles(Role.montajnik, Role.logist, Role.tech_supp, Role.admin))])
async def assigned_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Сначала получаем количество задач
    count_query = select(func.count(Task.id)).where(
        Task.assignment_type == AssignmentType.individual,
        Task.is_draft == False,
        Task.status == TaskStatus.assigned,
        Task.assigned_user_id == current_user.id,
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    res = await db.execute(
        select(Task)
        .where(
            Task.assignment_type == AssignmentType.individual, # Используем Enum напрямую
            Task.is_draft == False,
            Task.status == TaskStatus.assigned, 
            Task.assigned_user_id == current_user.id,
        )
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
        )
    )
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"

        equipment = [
            {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number, "equipment": te.equipment}
            for te in (t.equipment_links or [])
        ] or None

        out.append({
            "id": t.id,
            "client_name": client_name,  # ✅ Только название компании или ИП
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "equipment": equipment,
        })

    return {
        "tasks": out,
        "total_count": total_count
    }



@router.get("/tasks/available/{task_id}")
async def available_task_detail(
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
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  
            selectinload(Task.assigned_user),
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
    contact_person_position = task.contact_person.position if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None


    return {
        "id": task.id,
        "company_name": company_name,  
        "contact_person_name": contact_person_name,  
        "contact_person_phone": task.contact_person_phone,
        "contact_person_position": contact_person_position,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "location" : task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "assigned_user_name": assigned_user_full_name,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None
    }


@router.get("/tasks/{task_id}")
async def mont_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Загружаем задачу с контактным лицом, компанией и другими связями
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user),
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

    requires_tech_supp = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)

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
    contact_person_position = task.contact_person.position if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None
    

    return {
        "id": task.id,
        "company_name": company_name,  # ✅ Новое
        "contact_person_name": contact_person_name,  # ✅ Новое
        "contact_person_phone": task.contact_person_phone,
        "contact_person_position": contact_person_position,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "location": task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "assigned_user_name": assigned_user_full_name,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None,
        "requires_tech_supp": requires_tech_supp,
    }


@router.get("/tasks/history")
async def logist_history(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    # Загружаем завершённые задачи с контактным лицом и компанией
    q = select(Task).where(
        Task.status == TaskStatus.completed,
        Task.is_draft == False,
        Task.created_by == current_user.id # ✅ Фильтр по создателю (логисту)
    ).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company) # ✅ Загружаем контактное лицо и компанию
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
            "completed_at": str(t.completed_at),
        })
    return out


@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.logist, Role.admin, Role.montajnik))])
async def mont_get_task_full_history(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user) 
):
    
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
        .options(
            selectinload(TaskHistory.user),
            selectinload(TaskHistory.assigned_user)) 
    )
    history_records = res.scalars().all()

    # 3. Форматируем для ответач
    out = []
    for h in history_records:
        item = TaskHistoryItem.model_validate(h)

        # имя пользователя, совершившего действие
        if h.user:
            item.user_name = f"{h.user.name or ''} {h.user.lastname or ''}".strip()

        # имя монтажника, назначенного на задачу
        if h.assigned_user:
            item.assigned_user_name = f"{h.assigned_user.name or ''} {h.assigned_user.lastname or ''}".strip()

        out.append(item)

    return out




@router.post("/tasks/{task_id}/accept", dependencies=[Depends(require_roles(Role.montajnik))])
async def accept_task(
    background_tasks: BackgroundTasks,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Монтажник принимает задачу (transition -> accepted).
    Фиксируем accepted_at (history) и изменяем статус.
    Для broadcast — создаём запись BroadcastResponse.
    """
    _ensure_montajnik_or_403(current_user)

    # Загружаем задачу с контактным лицом, компанией, оборудованием и видами работ для истории
    res = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.is_draft == False)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем компанию
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment), # ✅ Загружаем оборудование
            selectinload(Task.works).selectinload(TaskWork.work_type) # ✅ Загружаем виды работ
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.assignment_type == AssignmentType.individual and task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Задача не назначена вам")

    if task.assignment_type == AssignmentType.broadcast:
        exist = await db.execute(select(BroadcastResponse).where(BroadcastResponse.task_id == task.id, BroadcastResponse.user_id == current_user.id))
        if not exist.scalars().first():
            br = BroadcastResponse(task_id=task.id, user_id=current_user.id, is_first=False)
            db.add(br)

    task.assigned_user_id = current_user.id
    old_status = task.status
    task.status = TaskStatus.accepted

    # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ ---
    # Формируем снимки *до* commit
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
        action=TaskStatus.accepted, # action - новый статус
        event_type=TaskHistoryEventType.status_changed, # ✅ Новый тип события
        comment="Принято монтажником",
        # --- Сохраняем все основные поля задачи ---
        company_id=task.company_id,  # ✅ Заменено
        contact_person_id=task.contact_person_id,  # ✅ Заменено
        contact_person_phone=task.contact_person_phone,
        vehicle_info=task.vehicle_info,
        gos_number = task.gos_number,
        scheduled_at=task.scheduled_at,
        location=task.location,
        comment_field=task.comment, # ✅ Используем comment_field
        status=task.status.value if task.status else None, # status - новый статус
        assigned_user_id=task.assigned_user_id,
        client_price=str(task.client_price) if task.client_price is not None else None,
        montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
        photo_required=task.photo_required,
        assignment_type=task.assignment_type.value if task.assignment_type else None,
        field_name="status", # Поле, которое изменилось
        old_value=old_status.value if old_status else None, # Старое значение статуса
        new_value=TaskStatus.accepted.value, # Новое значение
        # --- НОВЫЕ ПОЛЯ: Снимки ---
        equipment_snapshot=equipment_snapshot_for_history, # <--- Добавлено
        work_types_snapshot=work_types_snapshot_for_history, # <--- Добавлено
    )
    db.add(hist)
    try:
        await db.flush()
        await db.commit()
    except Exception as e:
        logger.exception("Failed to accept task: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Ошибка при принятии задачи")

    if task.created_by:
        background_tasks.add_task(
            notify_user,
            task.created_by,
            f"Монтажник {current_user.name} {current_user.lastname} принял задачу #{task.id}",
            task.id
        )
    return {"detail": "accepted"}


@router.post("/tasks/{task_id}/reject", dependencies=[Depends(require_roles(Role.montajnik))])
async def reject_task(
    background_tasks: BackgroundTasks,
    task_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Монтажник отклоняет задачу.
    После отклонения:
      - статус -> new
      - assigned_user_id -> None
      - запись в истории со всеми полями, как в accept_task
    """
    _ensure_montajnik_or_403(current_user)

    res = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.is_draft == False)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type)
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.status in [TaskStatus.completed]:
        raise HTTPException(status_code=400, detail="Нельзя отклонить завершённую задачу")

    old_status = task.status
    task.status = TaskStatus.new
    task.assigned_user_id = None
    task.assignment_type = AssignmentType.broadcast

    # комментарий из тела запроса
    comment_text = f"Отклонено монтажником: {payload.get('comment')}" if payload.get("comment") else "Отклонено монтажником"

    # --- СНИМКИ ДЛЯ ИСТОРИИ ---
    equipment_snapshot_for_history = [
        {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
        for te in task.equipment_links
    ]

    work_types_snapshot_for_history = [
        {"name": tw.work_type.name, "quantity": tw.quantity}
        for tw in task.works
    ]

    # --- ИСТОРИЯ СО ВСЕМИ ПОЛЯМИ ---
    hist = TaskHistory(
        task_id=task.id,
        user_id=current_user.id,
        action=TaskStatus.new,
        event_type=TaskHistoryEventType.status_changed,
        comment=comment_text,
        # основные поля задачи
        company_id=task.company_id,
        contact_person_id=task.contact_person_id,
        contact_person_phone=task.contact_person_phone,
        vehicle_info=task.vehicle_info,
        gos_number=task.gos_number,
        scheduled_at=task.scheduled_at,
        location=task.location,
        comment_field=task.comment,
        status=task.status.value if task.status else None,
        assigned_user_id=None,  # открепили монтажника
        client_price=str(task.client_price) if task.client_price is not None else None,
        montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
        photo_required=task.photo_required,
        assignment_type=task.assignment_type.value if task.assignment_type else None,
        field_name="status",
        old_value=old_status.value if old_status else None,
        new_value=TaskStatus.new.value,
        equipment_snapshot=equipment_snapshot_for_history,
        work_types_snapshot=work_types_snapshot_for_history,
    )
    db.add(hist)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при отклонении задачи: {e}")

    # уведомляем логиста/создателя, если есть
    if task.created_by:
        background_tasks.add_task(
            notify_user,
            task.created_by,
            f"Монтажник {current_user.name} {current_user.lastname} отклонил задачу #{task.id}",
            task.id
        )

    return {"detail": "rejected"}



@router.post("/tasks/{task_id}/status")
async def change_status(
    background_tasks: BackgroundTasks,
    task_id: int,
    status: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Поменять статус задачи: expected body {"status": "on_the_road" | "on_site" | "started" | "completed"}.
    При смене статуса фиксируем timestamp в Task и добавляем запись в history.
    """
    _ensure_montajnik_or_403(current_user)
    new_status_str = status.get("status")
    if new_status_str not in ("accepted", "on_the_road", "on_site", "started", "completed"):
        raise HTTPException(status_code=400, detail="Неверный статус")

    try:
        new_status_enum = TaskStatus(new_status_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный статус")

    # Загружаем задачу с контактным лицом, компанией, оборудованием и видами работ для истории
    res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем компанию
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment), # ✅ Загружаем оборудование
            selectinload(Task.works).selectinload(TaskWork.work_type) # ✅ Загружаем виды работ
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.is_draft:
        raise HTTPException(status_code=400, detail="Нельзя менять статус черновика")

    if task.assigned_user_id and task.assigned_user_id != current_user.id:
        hist_res = await db.execute(select(TaskHistory).where(
            TaskHistory.task_id == task.id,
            TaskHistory.user_id == current_user.id,
            TaskHistory.action == TaskStatus.accepted
        ))
        if not hist_res.scalars().first():
            raise HTTPException(status_code=403, detail="Вы не можете менять статус этой задачи")

    try:
        old_status = task.status
        timestamp_field_to_set = None
        now_time = datetime.now(timezone.utc)

        if new_status_enum in (TaskStatus.on_the_road, TaskStatus.on_site, TaskStatus.started) and not task.started_at:
             timestamp_field_to_set = "started_at"
             setattr(task, "started_at", now_time)
        elif new_status_enum == TaskStatus.completed and not task.completed_at:
             timestamp_field_to_set = "completed_at"
             setattr(task, "completed_at", now_time)

        if new_status_enum == TaskStatus.completed:
            task.status = TaskStatus.inspection
        else:
            task.status = new_status_enum

        # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ ---
        # Формируем снимки *до* flush/commit
        equipment_snapshot_for_history = [
            {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
            for te in task.equipment_links
        ]

        work_types_snapshot_for_history = [
            {"name": tw.work_type.name, "quantity": tw.quantity}
            for tw in task.works
        ]

        # --- ФОРМИРОВАНИЕ РУССКОГО КОММЕНТАРИЯ ---
        old_status_ru = STATUS_TRANSLATIONS_RU.get(old_status, old_status.value if old_status else 'None')
        new_status_ru = STATUS_TRANSLATIONS_RU.get(new_status_enum, new_status_enum.value)

        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status, # action - статус задачи *после* изменения
            event_type=TaskHistoryEventType.status_changed, # ✅ Новый тип
            comment=f"Статус изменён с {old_status_ru} на {new_status_ru}", # <--- Используем русские названия
            field_name="status", # Поле, которое изменилось
            old_value=old_status_ru, # <--- Старое значение статуса (русское)
            new_value=new_status_ru, # <--- Новое значение (русское)
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,  # ✅ Заменено
            contact_person_id=task.contact_person_id,  # ✅ Заменено
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            gos_number = task.gos_number,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment, # ✅ Используем comment_field
            status=task.status.value if task.status else None, # status - статус задачи *после* изменения
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price) if task.client_price is not None else None,
            montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
            # --- НОВЫЕ ПОЛЯ: Снимки ---
            equipment_snapshot=equipment_snapshot_for_history, # <--- Добавлено
            work_types_snapshot=work_types_snapshot_for_history, # <--- Добавлено
        )
        db.add(hist)
        await db.flush()

        await db.commit()

    except Exception as e:
        logger.exception("Failed to change status: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Ошибка при смене статуса")

    return {"detail": "ok", "status": new_status_enum.value}

@router.post("/tasks/{task_id}/report")
async def create_report(
    background_tasks: BackgroundTasks,
    task_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Создать черновой отчёт монтажника (text, список storage_key вложений). Возвращает report_id.
    payload: {"text": "...", "attachment_storage_keys": ["..."]}
    """
    # Проверка, что пользователь - монтажник
    if getattr(current_user, "role", None) != Role.montajnik:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Загружаем задачу с контактным лицом, компанией, оборудованием и видами работ для истории
    res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type)
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.is_draft:
        raise HTTPException(status_code=400, detail="Нельзя добавлять отчёт к черновику")
    if task.assigned_user_id and task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Задача не назначена вам")

    text = payload.get("text")
    # Получаем список storage_key вложений, которые нужно привязать
    attachment_storage_keys = payload.get("attachment_storage_keys", []) or []

    # --- НОВОЕ: Найти ТОЛЬКО УКАЗАННЫЕ вложения пользователя, привязанные к задаче, но НЕ к отчёту ---
    attachments_res = await db.execute(
        select(TaskAttachment)
        .where(
            TaskAttachment.task_id == task_id,
            TaskAttachment.storage_key.in_(attachment_storage_keys), # <--- Только указанные ключи
            TaskAttachment.report_id.is_(None),  # Не привязаны к отчёту
            TaskAttachment.uploader_id == current_user.id,
            TaskAttachment.processed == True,  # Только обработанные
            TaskAttachment.deleted_at.is_(None) # И не удалённые
        )
    )
    user_attachments = attachments_res.scalars().all()

    # Проверим, все ли переданные ключи были найдены
    found_keys = {att.storage_key for att in user_attachments}
    missing_keys = set(attachment_storage_keys) - found_keys
    if missing_keys:
        raise HTTPException(status_code=400, detail=f"Вложения не найдены или недоступны для привязки: {list(missing_keys)}")

    # Создаём отчёт
    report = TaskReport(task_id=task.id, author_id=current_user.id, text=text, photos_json=json.dumps([]))
    db.add(report)
    await db.flush() # Получаем report.id

    # --- НОВОЕ: Обновить вложения, привязав их к отчёту ---
    attachment_keys = []
    for att in user_attachments:
        att.report_id = report.id
        attachment_keys.append(att.storage_key)

    # --- НОВОЕ: Обновить photos_json отчёта ---
    report.photos_json = json.dumps(attachment_keys)

    # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (создание отчёта) ---
    equipment_snapshot_for_history = [
        {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
        for te in task.equipment_links
    ]

    work_types_snapshot_for_history = [
        {"name": tw.work_type.name, "quantity": tw.quantity}
        for tw in task.works
    ]

    hist = TaskHistory(
        task_id=task.id,
        user_id=getattr(current_user, "id", None),
        action=task.status,
        comment=f"Отчёт #{report.id} создан монтажником",
        event_type=TaskHistoryEventType.report_submitted,
        related_entity_id=report.id,
        related_entity_type="report",
        company_id=task.company_id,
        contact_person_id=task.contact_person_id,
        contact_person_phone=task.contact_person_phone,
        vehicle_info=task.vehicle_info,
        gos_number = task.gos_number,
        scheduled_at=task.scheduled_at,
        location=task.location,
        comment_field=task.comment,
        status=task.status.value if task.status else None,
        assigned_user_id=task.assigned_user_id,
        client_price=str(task.client_price) if task.client_price is not None else None,
        montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
        photo_required=task.photo_required,
        assignment_type=task.assignment_type.value if task.assignment_type else None,
        equipment_snapshot=equipment_snapshot_for_history,
        work_types_snapshot=work_types_snapshot_for_history,
    )
    db.add(hist)

    await db.commit()
    await db.refresh(report) # Обновляем объект, чтобы получить актуальные данные

    return {"report_id": report.id}


@router.post("/tasks/{task_id}/report/{report_id}/submit", dependencies=[Depends(require_roles(Role.montajnik))])
async def submit_report_for_review(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Отправить отчёт на проверку. Логика:
    - Если ранее одна из сторон отклонила (approval == rejected), то уведомить только ту сторону и поставить её approval в waiting.
    - Иначе поставить обе approval = waiting и уведомить обе стороны (логист и тех.спец, если требуется).
    - Перевести задачу в status = inspection.
    """
    _ensure_montajnik_or_403(current_user)
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Отчёт не найден")

    if report.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Не автор отчёта")

    # --- НОВАЯ ЛОГИКА: Проверяем, требуется ли проверка тех.спеца для *этой задачи* ---
    # Загружаем задачу с её видами работ
    t_res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.works).selectinload(TaskWork.work_type)) # Загружаем работы и типы работ
    )
    task = t_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Проверяем, есть ли среди видов работ для *этой задачи* хотя бы один с tech_supp_required=True
    requires_tech_review = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)
    # --- КОНЕЦ НОВОЙ ЛОГИКИ ---

    notify_logist = True
    # ✅ Уведомление тех.спеца теперь зависит от флага в работах задачи
    notify_tech = requires_tech_review # <--- Изменено

    if report.approval_logist == ReportApproval.rejected and report.approval_tech != ReportApproval.rejected:
        notify_tech = requires_tech_review # <--- Уведомляем теха, только если нужно
        report.approval_logist = ReportApproval.waiting
    elif report.approval_tech == ReportApproval.rejected and report.approval_logist != ReportApproval.rejected:
        notify_logist = False
        report.approval_tech = ReportApproval.waiting
    else:
        report.approval_logist = ReportApproval.waiting
        report.approval_tech = ReportApproval.waiting
        # notify_tech уже установлен на requires_tech_review выше

    report.reviewed_at_logist = None  # сброс reviewed time
    report.reviewed_at_tech_supp = None

    try:
        full_t_res = await db.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(
                selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем компанию
                selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment), # ✅ Загружаем оборудование
                selectinload(Task.works).selectinload(TaskWork.work_type) # ✅ Загружаем виды работ
            )
        )
        task = full_t_res.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")

        task.status = TaskStatus.inspection
        await db.flush()

        # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (отправка отчёта на проверку) ---
        # Формируем снимки *до* commit
        equipment_snapshot_for_history = [
            {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
            for te in task.equipment_links
        ]

        work_types_snapshot_for_history = [
            {"name": tw.work_type.name, "quantity": tw.quantity}
            for tw in task.works
        ]

        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status, # action - новый статус задачи (inspection)
            comment=f"Отчёт #{report.id} отправлен на проверку монтажником",
            event_type=TaskHistoryEventType.report_status_changed, # Новый тип
            field_name="status", # Поле, которое изменилось
            old_value=task.status.value if task.status else None, # Старое значение статуса (до смены на inspection)
            new_value=TaskStatus.inspection.value, # Новое значение
            related_entity_id=report.id,
            related_entity_type="report",
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            gos_number = task.gos_number,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment,
            status=task.status.value if task.status else None,
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price) if task.client_price is not None else None,
            montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
            # --- НОВЫЕ ПОЛЯ: Снимки ---
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        )
        db.add(hist)
        await db.commit()
    except Exception as e:
        logger.exception("Failed to submit report: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Ошибка при отправке отчёта на проверку")

    if notify_logist and task.created_by:
        background_tasks.add_task(notify_user, task.created_by, f"По задаче #{task.id} отправлен отчёт на проверку", task.id)

    if notify_tech:
        tech_q = await db.execute(select(User).where(User.role == Role.tech_supp, User.is_active == True))
        techs = tech_q.scalars().all()
        for tuser in techs:
            background_tasks.add_task(notify_user, tuser.id, f"По задаче #{task.id} отправлен отчёт на проверку (требуется тех.проверка)", task.id)

    return {"detail": "sent for review"}


@router.get("/me")
async def my_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Личный кабинет монтажника:
    - имя, фамилия, роль
    - история выполненных задач (completed)
    - суммарный заработок (сумма montajnik_reward по completed)
    """
    _ensure_montajnik_or_403(current_user)

    # completed tasks assigned to this user
    q = select(Task).options(
        selectinload(Task.contact_person) # ✅ Загружаем контактное лицо
    ).where(
        Task.assigned_user_id == current_user.id, 
        Task.status == TaskStatus.completed
    ).order_by(desc(Task.id)) 
    res = await db.execute(q)
    completed = res.scalars().all()

    total = sum([float(t.montajnik_reward or 0) for t in completed])

    history = []
    for t in completed:
        history.append({
            "id": t.id,
            "client": t.contact_person.name if t.contact_person else "—", # ✅ Новое: имя контактного лица
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
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


@router.get("/completed-tasks/filter", summary="Фильтрация завершенных задач (монтажник)")
async def montajnik_filter_completed_tasks(
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = select(Task).where(
        Task.assigned_user_id == current_user.id,
        Task.status == TaskStatus.completed
    )

    if company_id:
        company_ids = [int(id) for id in company_id.split(",") if id.strip().isdigit()]
        if company_ids:
            query = query.where(Task.company_id.in_(company_ids))

    if work_type_id:
        work_type_ids = [int(id) for id in work_type_id.split(",") if id.strip().isdigit()]
        if work_type_ids:
            query = query.join(Task.works).where(TaskWork.work_type_id.in_(work_type_ids))

    if equipment_id:
        equipment_ids = [int(id) for id in equipment_id.split(",") if id.strip().isdigit()]
        if equipment_ids:
            query = query.where(Task.equipment_links.any(TaskEquipment.equipment_id.in_(equipment_ids)))

    if search:
        search_term = f"%{search}%"
        task_field_conditions = [
            Task.location.ilike(search_term),
            Task.comment.ilike(search_term),
            Task.vehicle_info.ilike(search_term),
            Task.gos_number.ilike(search_term),
        ]

        # Подзапросы с exists, как в рабочем эндпоинте
        company_exists = select(ClientCompany).where(
            and_(ClientCompany.id == Task.company_id, ClientCompany.name.ilike(search_term))
        ).exists()

        contact_exists = select(ContactPerson).where(
            and_(ContactPerson.id == Task.contact_person_id, ContactPerson.name.ilike(search_term))
        ).exists()

        work_type_exists = select(TaskWork).join(TaskWork.work_type).where(
            and_(TaskWork.task_id == Task.id, WorkType.name.ilike(search_term))
        ).exists()

        equipment_exists = select(TaskEquipment).join(TaskEquipment.equipment).where(
            and_(TaskEquipment.task_id == Task.id, Equipment.name.ilike(search_term))
        ).exists()

        assigned_user_exists = select(User).where(
            and_(User.id == Task.assigned_user_id, User.name.ilike(search_term))
        ).exists()

        creator_exists = select(User).where(
            and_(User.id == Task.created_by, User.name.ilike(search_term))
        ).exists()

        conditions = [
            *task_field_conditions,
            company_exists,
            contact_exists,
            work_type_exists,
            equipment_exists,
            assigned_user_exists,
            creator_exists
        ]
        
        # Добавляем условие поиска по ID, если search - число
        if search.isdigit():
            conditions.append(Task.id == int(search))
        
        combined_search_condition = or_(*conditions)
        query = query.where(combined_search_condition)

    query = query.options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company),
        selectinload(Task.assigned_user),
        selectinload(Task.creator),
        selectinload(Task.works).selectinload(TaskWork.work_type),
        selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment)
    ).order_by(desc(Task.id))

    res = await db.execute(query)
    tasks = res.scalars().unique().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"

        assigned_user_full_name = None
        if t.assigned_user:
            assigned_user_full_name = f"{t.assigned_user.name} {t.assigned_user.lastname}"

        equipment = [
            {
                "equipment_id": te.equipment_id,
                "quantity": te.quantity,
                "serial_number": te.serial_number,
                "equipment": {
                    "id": te.equipment.id,
                    "name": te.equipment.name
                } if te.equipment else None
            }
            for te in (t.equipment_links or [])
        ] or []

        work_types = []
        if t.works:
            for tw in t.works:
                work_types.append({
                    "id": tw.work_type.id,
                    "name": tw.work_type.name,
                    "quantity": tw.quantity
                })

        out.append({
            "id": t.id,
            "client": client_name,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "location": t.location,
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "comment": t.comment,
            "assignment_type": t.assignment_type.value if t.assignment_type else None,
            "assigned_user_id": t.assigned_user_id,
            "assigned_user_name": assigned_user_full_name,
            "client_price": str(t.client_price) if t.client_price else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward else None,
            "is_draft": t.is_draft,
            "photo_required": t.photo_required,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "company_id": t.company_id,
            "contact_person_id": t.contact_person_id,
            "company_name": company_name,
            "contact_person_name": contact_person_name,
            "equipment": equipment,
            "work_types": work_types,
        })

    return out


@router.get("/earnings-by-period", summary="Заработок монтажника за период")
async def montajnik_earnings_by_period(
    start_year: Optional[int] = Query(None, description="Год начала (например, 2025)"),
    start_month: Optional[int] = Query(None, description="Месяц начала (1-12)"),
    end_year: Optional[int] = Query(None, description="Год окончания (например, 2025)"),
    end_month: Optional[int] = Query(None, description="Месяц окончания (1-12)"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    from datetime import date
    import calendar
    
    # Если параметры не указаны, используем текущий месяц
    if start_year is None or start_month is None or end_year is None or end_month is None:
        current_date = date.today()
        start_year = current_date.year
        start_month = current_date.month
        end_year = current_date.year
        end_month = current_date.month
    
    # Получаем первый день начального месяца и последний день конечного месяца
    start_date = date(start_year, start_month, 1)
    end_date = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    
    # Проверяем, что начальная дата не позже конечной
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Начальная дата не может быть позже конечной")
    
    # Запрос для подсчета суммы наград за выполненные задачи в указанный период
    query = select(func.sum(Task.montajnik_reward)).where(
        Task.assigned_user_id == current_user.id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= start_date,
        Task.completed_at <= end_date
    )
    
    result = await db.execute(query)
    total_earned = result.scalar() or 0
    
    # Также можем вернуть количество задач за период
    count_query = select(func.count(Task.id)).where(
        Task.assigned_user_id == current_user.id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= start_date,
        Task.completed_at <= end_date
    )
    
    count_result = await db.execute(count_query)
    task_count = count_result.scalar() or 0
    
    return {
        "period": f"{start_year}-{start_month:02d} - {end_year}-{end_month:02d}",
        "total_earned": str(total_earned),
        "task_count": task_count,
        "period_display": f"{start_year} г., {calendar.month_name[start_month]} - {end_year} г., {calendar.month_name[end_month]}",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat()
    }


@router.get("/completed-tasks/{task_id}")
async def mont_completed_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    _ensure_montajnik_or_403(current_user) # Проверяем, что пользователь - монтажник

    # Загружаем задачу с контактным лицом, компанией и другими связями
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
        )
        .where(
            Task.id == task_id,
            Task.assigned_user_id == current_user.id, # ✅ Убедимся, что задача назначена текущему монтажнику
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

    requires_tech_supp = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)

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
    contact_person_position = task.contact_person.position if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None


    return {
        "id": task.id,
        "company_name": company_name,
        "contact_person_name": contact_person_name,
        "contact_person_phone": task.contact_person_phone,
        "contact_person_position": contact_person_position,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None, # Если поле есть
        "location": task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "assigned_user_name": assigned_user_full_name,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None,
        "requires_tech_supp": requires_tech_supp
    }

@router.get("/my_reports_reviews", response_model=List[MontajnikReportReview], dependencies=[Depends(require_roles(Role.montajnik))])
async def get_my_reports_reviews(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить все отчёты текущего монтажника и связанные с ними ревью (ответы логиста/техспеца).
    Включает комментарии и фото от проверяющих.
    """
    _ensure_montajnik_or_403(current_user)

    # Загружаем все отчёты, автором которых является текущий монтажник
    # Загружаем связанные задачи
    res = await db.execute(
        select(TaskReport)
        .options(
            selectinload(TaskReport.task), # Загружаем задачу
            # УБРАНО: selectinload(TaskReport.attachments).where(...), # Нет такого relationship, и не нужно для review_attachments
            # УБРАНО: selectinload(TaskReport.review_attachments).where(...), # Было проблемой
        )
        .where(TaskReport.author_id == current_user.id)
        .order_by(TaskReport.task_id, TaskReport.created_at.asc()) # Сортируем по задаче и времени
    )
    reports = res.scalars().all()

    s3 = get_s3_client()
    S3_PUBLIC_URL = s3.endpoint_url

    reviews_list = []
    for r in reports:
        # Формируем список фото из оригинального отчёта
        original_photos = []
        if r.photos_json:
            try:
                keys = json.loads(r.photos_json)
                original_photos = [f"{S3_PUBLIC_URL}/{k}" for k in keys]
            except Exception:
                logger.warning(f"Failed to parse photos_json for report {r.id}: {r.photos_json}")
                original_photos = []

  
        review_attachments_res = await db.execute(
            select(TaskAttachment)
            .where(
                TaskAttachment.report_id == r.id, # Привязка к отчёту
                TaskAttachment.deleted_at == None,
                TaskAttachment.uploader_role.in_(["logist", "tech_supp"]) # Только вложения проверяющих
            )
        )
        review_attachments = review_attachments_res.scalars().all()
        review_photos = [f"{S3_PUBLIC_URL}/{att.storage_key}" for att in review_attachments]
        # -------------------------------------------------------------

        if r.approval_logist != ReportApproval.waiting: # Если логист уже давал ревью (approved или rejected)
            review_entry = MontajnikReportReview(
                report_id=r.id,
                task_id=r.task_id,
                review_comment=r.review_comment if r.approval_logist == ReportApproval.rejected else None, # Комментарий только если rejected
                review_photos=review_photos if r.approval_logist == ReportApproval.rejected else [], # Фото только если rejected
                reviewer_role="logist",
                approval_status=r.approval_logist.value,
                reviewed_at_logist=r.reviewed_at_logist,
                original_report_text=r.text,
                original_report_photos=original_photos,
            )
            reviews_list.append(review_entry)

        # Тех.спец
        if r.approval_tech != ReportApproval.waiting: # Если тех.спец уже давал ревью (approved или rejected)
            review_entry = MontajnikReportReview(
                report_id=r.id,
                task_id=r.task_id,
                review_comment=r.review_comment if r.approval_tech == ReportApproval.rejected else None, # Комментарий только если rejected
                review_photos=review_photos if r.approval_tech == ReportApproval.rejected else [], # Фото только если rejected
                reviewer_role="tech_supp",
                approval_status=r.approval_tech.value,
                reviewed_at_tech_supp=r.reviewed_at_tech_supp,
                original_report_text=r.text,
                original_report_photos=original_photos,
            )
            reviews_list.append(review_entry)

    
    reviews_list.sort(key=lambda x: (
        x.reviewed_at_logist or x.reviewed_at_tech_supp or getattr(x, 'created_at', None), # Используем одно из новых полей
        x.report_id
    ))

    return reviews_list



@router.get("/companies", dependencies=[Depends(require_roles(Role.montajnik))])
async def mont_get_companies(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ClientCompany))
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.montajnik))])
async def mont_get_contact_persons(company_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ContactPerson).where(ContactPerson.company_id == company_id))
    contacts = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in contacts]


@router.get("/contact-persons/{contact_person_id}/phone", dependencies=[Depends(require_roles(Role.montajnik))])
async def get_mont_contact_person_phone(
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


