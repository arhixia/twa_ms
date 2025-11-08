from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
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
)
from back.utils.notify import notify_user
from back.utils.selectel import get_s3_client
from back.files.handlers import validate_and_process_attachment

router = APIRouter()
logger = logging.getLogger(__name__)


def _now_utc():
    return datetime.now(timezone.utc)


def _ensure_montajnik_or_403(user: User):
    if getattr(user, "role", None) != Role.montajnik:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# --- Helpers ---------------------------------------------------------------

async def _add_history(db: AsyncSession, task: Task, user: User, action: TaskStatus, comment: Optional[str] = None):
    h = TaskHistory(task_id=task.id, user_id=getattr(user, "id", None), action=action, comment=comment)
    db.add(h)
    try:
        await db.flush()
    except Exception:
        logger.exception("Failed to flush history")


# --- Endpoints -------------------------------------------------------------

@router.get("/tasks/mine", dependencies=[Depends(require_roles(Role.montajnik))])
async def my_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Список задач для текущего монтажника:
    - назначенные (assigned_user_id == me)
    - в работе / на проверке и т.д.
    Возвращает краткую информацию о задачах.
    """
    _ensure_montajnik_or_403(current_user)
    # Загружаем задачи с контактным лицом и компанией
    q = select(Task).where(
        Task.assigned_user_id == current_user.id,
        Task.is_draft == False,
        Task.status != TaskStatus.completed
    ).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company)
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
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            # is_draft не нужен, так как мы фильтруем по is_draft == False
        })
    return out


@router.get("/tasks/available", dependencies=[Depends(require_roles(Role.montajnik, Role.logist, Role.tech_supp, Role.admin))])
async def available_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Общие (broadcast) задачи, доступные всем активным монтажникам.
    Возвращает список рассылок (tasks with assignment_type == broadcast и is_draft == False).
    """

    # Загружаем задачи с контактным лицом и компанией
    res = await db.execute(
        select(Task)
        .where(
            Task.assignment_type == AssignmentType.broadcast, # Используем Enum напрямую
            Task.is_draft == False,
            Task.status != TaskStatus.completed  # Исключаем completed задачи
        )
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company)
        )
    )
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
            "client": client_display,  
            "vehicle_info": t.vehicle_info,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "assigned_user_id": t.assigned_user_id,
        })
    return out



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

   
    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    return {
        "id": task.id,
        "company_name": company_name,  # ✅ Новое
        "contact_person_name": contact_person_name,  # ✅ Новое
        "contact_person_phone": task.contact_person_phone,
        "vehicle_info": task.vehicle_info or None,
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
    
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # 2. Получить историю, отсортированную по времени
    res = await db.execute(
        select(TaskHistory)
        .where(TaskHistory.task_id == task_id)
        .order_by(TaskHistory.timestamp.asc()) 
        # .options(selectinload(TaskHistory.user)) # Если нужно имя пользователя
    )
    history_records = res.scalars().all()

    # 3. Форматируем для ответа
    out = []
    for h in history_records:
        out.append(TaskHistoryItem.model_validate(h)) 
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
            "back.utils.notify.notify_user", # Предполагаем, что notify_user в отдельном модуле и создаёт свою сессию
            task.created_by,
            f"Задача #{task.id} принята монтажником {current_user.name} {current_user.lastname}",
            task.id
        )
    return {"detail": "accepted"}



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

        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status, # action - статус задачи *после* изменения
            event_type=TaskHistoryEventType.status_changed, # ✅ Новый тип
            comment=f"Статус изменён с {old_status.value if old_status else 'None'} на {new_status_enum.value}",
            field_name="status", # Поле, которое изменилось
            old_value=old_status.value if old_status else None, # Старое значение статуса
            new_value=new_status_enum.value, # Новое значение (запрашиваемое)
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

        if task.created_by:
            background_tasks.add_task(
                "back.utils.notify.notify_user", # Убедитесь, что notify_user создаёт свою сессию
                task.created_by,
                f"Монтажник {current_user.name} {current_user.lastname} изменил статус задачи #{task.id} -> {new_status_enum.value}",
                task.id
            )

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
    Создать черновой отчёт монтажника (text, photos list). Возвращает report_id.
    payload: {"text": "...", "photos": ["storage_key1", ...]}
    """
    _ensure_montajnik_or_403(current_user)

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
        raise HTTPException(status_code=400, detail="Нельзя добавлять отчёт к черновику")
    if task.assigned_user_id and task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Задача не назначена вам")

    text = payload.get("text")
    photos = payload.get("photos", [])  # список storage_key

    report = TaskReport(task_id=task.id, author_id=current_user.id, text=text, photos_json=json.dumps(photos or []))
    db.add(report)
    await db.flush()

    for sk in photos:
        att = TaskAttachment(
            task_id=task.id,
            report_id=report.id,
            storage_key=sk,
            file_type=FileType.photo,
            uploader_id=current_user.id,
            uploader_role=current_user.role.value,
            processed=False,
        )
        db.add(att)
        await db.flush()
        # Убедитесь, что validate_and_process_attachment создаёт свою сессию
        background_tasks.add_task("back.utils.processing.validate_and_process_attachment", att.id)

    # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (создание отчёта) ---
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
        action=task.status,
        comment=f"Отчёт #{report.id} создан монтажником",
        event_type=TaskHistoryEventType.report_submitted, # Новый тип
        related_entity_id=report.id,
        related_entity_type="report",
        # --- Сохраняем все основные поля задачи ---
        company_id=task.company_id,  # ✅ Заменено
        contact_person_id=task.contact_person_id,  # ✅ Заменено
        contact_person_phone=task.contact_person_phone,
        vehicle_info=task.vehicle_info,
        gos_number = task.gos_number,
        scheduled_at=task.scheduled_at,
        location=task.location,
        comment_field=task.comment, # ✅ Используем comment_field
        status=task.status.value if task.status else None,
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
    await db.commit()
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
    - Иначе поставить обе approval = waiting и уведомить обе стороны (логист и тех.спец).
    - Перевести задачу в status = inspection.
    """
    _ensure_montajnik_or_403(current_user)
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Отчёт не найден")

    if report.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Не автор отчёта")

    notify_logist = True
    notify_tech = True

    if report.approval_logist == ReportApproval.rejected and report.approval_tech != ReportApproval.rejected:
        notify_tech = False
        report.approval_logist = ReportApproval.waiting
    elif report.approval_tech == ReportApproval.rejected and report.approval_logist != ReportApproval.rejected:
        notify_logist = False
        report.approval_tech = ReportApproval.waiting
    else:
        report.approval_logist = ReportApproval.waiting
        report.approval_tech = ReportApproval.waiting

    report.reviewed_at = None  # сброс reviewed time

    try:
        # change task status to inspection
        # Загружаем задачу с контактным лицом, компанией, оборудованием и видами работ для истории
        t_res = await db.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(
                selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем компанию
                selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment), # ✅ Загружаем оборудование
                selectinload(Task.works).selectinload(TaskWork.work_type) # ✅ Загружаем виды работ
            )
        )
        task = t_res.scalars().first()
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
            company_id=task.company_id,  # ✅ Заменено
            contact_person_id=task.contact_person_id,  # ✅ Заменено
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            gos_number = task.gos_number,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment, # ✅ Используем comment_field
            status=task.status.value if task.status else None,
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
        await db.commit()
    except Exception as e:
        logger.exception("Failed to submit report: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Ошибка при отправке отчёта на проверку")

    if notify_logist and task.created_by:
        background_tasks.add_task("back.utils.notify.notify_user", task.created_by, f"По задаче #{task.id} отправлен отчёт на проверку", task.id)
    if notify_tech:
        tech_q = await db.execute(select(User).where(User.role == Role.tech_supp, User.is_active == True))
        techs = tech_q.scalars().all()
        for tuser in techs:
            background_tasks.add_task("back.utils.notify.notify_user", tuser.id, f"По задаче #{task.id} отправлен отчёт на проверку (тех.спец)", task.id)

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
    )
    res = await db.execute(q)
    completed = res.scalars().all()

    total = sum([float(t.montajnik_reward or 0) for t in completed])

    history = []
    for t in completed:
        history.append({
            "id": t.id,
            "client": t.contact_person.name if t.contact_person else "—", # ✅ Новое: имя контактного лица
            "vehicle_info": t.vehicle_info,
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
            selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
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
        "gos_number": task.gos_number or None, # Если поле есть
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


@router.get("/tasks/{task_id}/reports/{report_id}/attachments", dependencies=[Depends(require_roles(Role.montajnik))])
async def get_report_attachments(
    task_id: int,
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Проверка, что отчёт существует и принадлежит монтажнику
    res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = res.scalars().first()
    if not report or report.author_id != current_user.id:
        raise HTTPException(status_code=404, detail="Report not found or access denied")

    res = await db.execute(select(TaskAttachment).where(
        TaskAttachment.task_id == task_id,
        TaskAttachment.report_id == report_id,
        TaskAttachment.deleted_at == None
    ))
    items = res.scalars().all()

    s3 = get_s3_client()
    out = []
    for it in items:
        try:
            url = await s3.presign_get(it.storage_key, expires=300)
        except Exception:
            url = None
        out.append({
            "id": it.id,
            "storage_key": it.storage_key,
            "presigned_url": url,
            "thumb_key": it.thumb_key,
            "uploaded_at": it.uploaded_at,
            "original_name": it.original_name,
        })
    return out


@router.delete("/tasks/{task_id}/reports/{report_id}/attachments/{attachment_id}", dependencies=[Depends(require_roles(Role.montajnik))])
async def delete_report_attachment_by_montajnik(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Проверка, что отчёт существует и принадлежит монтажнику
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report or report.author_id != current_user.id:
        raise HTTPException(status_code=404, detail="Report not found or access denied")

    # Проверка, что вложение принадлежит этому отчёту и монтажнику
    a_res = await db.execute(select(TaskAttachment).where(
        TaskAttachment.id == attachment_id,
        TaskAttachment.task_id == task_id,
        TaskAttachment.report_id == report_id,
        TaskAttachment.uploader_id == current_user.id,
        TaskAttachment.deleted_at == None
    ))
    att = a_res.scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found or not yours")

    att.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    background_tasks.add_task("back.files.handlers.delete_object_from_s3", att.storage_key)
    return {"detail": "Attachment deleted"}


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
                reviewed_at=r.reviewed_at,
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
                reviewed_at=r.reviewed_at,
                original_report_text=r.text,
                original_report_photos=original_photos,
            )
            reviews_list.append(review_entry)

    
    reviews_list.sort(key=lambda x: (x.reviewed_at or getattr(x, 'created_at', None), x.report_id))

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


from fastapi.responses import RedirectResponse

@router.get("/call")
def redirect_to_tel(phone: str = Query(..., description="Номер телефона")):
    clean_phone = phone.strip().replace(" ", "")
    if not clean_phone.startswith("+") and not clean_phone.isdigit():
        return {"error": "Invalid phone number"}
    return RedirectResponse(url=f"tel:{clean_phone}")
