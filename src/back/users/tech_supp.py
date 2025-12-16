import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import logging

from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import (
    ClientCompany,
    ContactPerson,
    Equipment,
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
    WorkType,
)
from back.utils.notify import notify_user
from back.users.users_schemas import ReportReviewIn, TaskHistoryItem, require_roles,Role
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
async def tech_active_tasks(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Список активных задач для тех.специалиста.
    Возвращаются задачи, которые не в состоянии completed или archived, не являются черновиками,
    и имеют *назначенные* виды работ, требующие проверки тех.специалистом.
    """
    _ensure_tech_or_403(current_user)

    # Сначала получаем количество задач
    count_query = select(func.count(Task.id)).where(
        Task.is_draft == False,
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
        # Фильтр: задача должна быть связана с TaskWork, у которого work_type.tech_supp_required = True
        Task.id.in_(
            select(TaskWork.task_id).join(WorkType).where(WorkType.tech_supp_require == True)
        )
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    q = select(Task).where(
        Task.is_draft == False,
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
        # Фильтр: задача должна быть связана с TaskWork, у которого work_type.tech_supp_required = True
        Task.id.in_(
            select(TaskWork.task_id).join(WorkType).where(WorkType.tech_supp_require == True)
        )
    ).options(
        # Загружаем контактное лицо и компанию для отображения в списке
        selectinload(Task.contact_person).selectinload(ContactPerson.company)
    )
    res = await db.execute(q)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        # Получаем имя контактного лица и компании (аналогично предыдущей версии)
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        client_display = f"{company_name} - {contact_person_name}" if company_name and contact_person_name else (company_name or contact_person_name or "—")

        out.append({
            "id": t.id,
            "client": client_display,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
        })

    logger.info(f"Тех.спец {current_user.id} получил {len(out)} активных задач, требующих его проверки.")
    return {
        "tasks": out,
        "total_count": total_count
    }


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
async def tech_review_report(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    payload: Dict[str, Any] = Body(...), # <--- Временное решение: принимаем dict, но проверяем только approval
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Ревью отчёта тех.специалистом.
    payload: {"approval": "approved"} # Только approve, больше ничего
    Правила:
    - только роль tech_supp
    - устанавливаем approval_tech, reviewed_at (comment и photos игнорируются)
    - если оба approval (логист + тех) == approved -> задача считается completed, фиксируем completed_at и history
    - если отклонено (не должно быть) -> оставляем задачу в inspection, ревью можно отправлять повторно; уведомляем автора отчёта
    """
    _ensure_tech_or_403(current_user)

    approval = payload.get("approval")

    # ✅ УБИРАЕМ "rejected" из допустимых значений
    if approval != "approved": # <--- Позволяем только "approved"
        raise HTTPException(status_code=400, detail="Тех.спец может только принять отчёт. approval must be 'approved'")

    # load report
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # load task WITH equipment, work_types and contact_person/company for snapshot
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
        raise HTTPException(status_code=404, detail="Task not found")


    old_approval = report.approval_tech
    # ✅ УБИРАЕМ возможность установить rejected
    report.approval_tech = ReportApproval.approved # <--- Всегда approved, если пришло "approved"
    report.reviewed_at_tech_supp = datetime.now(timezone.utc)

    try:
        # if both approved -> finalize task
        if report.approval_tech == ReportApproval.approved and report.approval_logist == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc)

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
                # ✅ Комментарий для истории, когда оба одобрены
                comment=f"Задача проверена тех.специалистом.",
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,
                contact_person_id=task.contact_person_id,
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
                equipment_snapshot=equipment_snapshot_for_history,
                work_types_snapshot=work_types_snapshot_for_history,
            )
            db.add(hist)
        else:
            # if tech approved, but logist hasn't reviewed yet -> keep task in inspection state; add history entry for tech approval
            action = TaskStatus.inspection # Статус задачи не изменился, но отчёт проверялся
            # ✅ Комментарий для истории, когда только тех.спец одобрил
            hist_comment = f"Задача проверена тех.специалистом"

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
                company_id=task.company_id,
                contact_person_id=task.contact_person_id,
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
                equipment_snapshot=equipment_snapshot_for_history,
                work_types_snapshot=work_types_snapshot_for_history,
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


    if task.assigned_user_id:
        # Если оба одобрены - уведомляем монтажника о завершении
        if (report.approval_tech == ReportApproval.approved and 
            report.approval_logist == ReportApproval.approved):
            montajnik_msg = f"Работы по задаче {task_id} проверены и выполнены"
        else:
            # Только тех.спец одобрил - уведомляем о тех.проверке
            montajnik_msg = f"Отчет по задаче {task_id} одобрен тех.специалистом"
        
        background_tasks.add_task(
            notify_user,
            task.assigned_user_id,
            montajnik_msg,
            task_id
        )

    return {"detail": "Reviewed", "approval": "approved"}



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
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
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

    requires_tech_supp = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)

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

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None


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

@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.tech_supp))])
async def get_tech_task_full_history(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user) # Для проверки существования задачи и прав (упрощенно)
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

    # Считаем количество задач, которые тех.спец сейчас проверяет (в статусе inspection)
    active_checking_query = select(func.count(Task.id)).where(
        Task.status.not_in([TaskStatus.completed,TaskStatus.archived]),
        Task.id.in_(
            select(TaskWork.task_id).join(WorkType).where(WorkType.tech_supp_require == True)
        )
    )
    active_checking_res = await db.execute(active_checking_query)
    active_checking_count = active_checking_res.scalar() or 0

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
            ).where
            (
                Task.id.in_(checked_task_ids),
                Task.status == TaskStatus.completed # Только завершённые
            ).order_by(desc(Task.id)) 
        )
        completed = task_res.scalars().all()
    else:
        completed = []

    # Сумма цен клиента по выполненным задачам (где участвовал тех.спец)
    total = sum([float(t.client_price or 0) for t in completed])

    history = []
    for t in completed:
        history.append({
            "id": t.id,
            "client": t.company.name if t.company else "—", # Имя компании
            "contact_person": t.contact_person.name if t.contact_person else "—", # Имя контактного лица
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        })

    return {
        "id": current_user.id,
        "name": current_user.name,
        "lastname": current_user.lastname,
        "role": current_user.role.value if current_user.role else None,
        "active_checking_count": active_checking_count,
        "completed_count": len(completed),
        "history": history,
    }


@router.get("/tasks_tech_supp/filter", summary="Фильтрация задач (только тех.специалист)")
async def tech_supp_filter_tasks(
    status: Optional[str] = Query(None, description="Статусы через запятую"),
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db)
):
    query = select(Task).where(
        Task.is_draft != True,
        # Добавляем условие: задача должна содержать виды работ, требующие проверки тех.специалистом
        Task.id.in_(
            select(TaskWork.task_id).join(WorkType).where(WorkType.tech_supp_require == True)
        )
    )

    if status:
        status_list = [TaskStatus(s) for s in status.split(",") if s]
        if status_list:
            query = query.where(Task.status.in_(status_list))
    else:
        # Для тех.специалистов показываем только активные задачи (не completed или archived)
        open_statuses = [
            TaskStatus.new, TaskStatus.accepted, TaskStatus.on_the_road,
            TaskStatus.on_site, TaskStatus.started, TaskStatus.assigned,
            TaskStatus.inspection, TaskStatus.returned
        ]
        query = query.where(Task.status.in_(open_statuses))

    if company_id:
        company_ids = [int(id) for id in company_id.split(",") if id.strip().isdigit()]
        if company_ids:
            query = query.where(Task.company_id.in_(company_ids))

    if assigned_user_id:
        user_ids = [int(id) for id in assigned_user_id.split(",") if id.strip().isdigit()]
        if user_ids:
            query = query.where(Task.assigned_user_id.in_(user_ids))

    if task_id is not None:
        query = query.where(Task.id == task_id)

    if work_type_id:
        work_type_ids = [int(id) for id in work_type_id.split(",") if id.strip().isdigit()]
        if work_type_ids:
            query = query.join(Task.works).where(TaskWork.work_type_id.in_(work_type_ids))

    if equipment_id:
        equipment_ids = [int(id) for id in equipment_id.split(",") if id.strip().isdigit()]
        if equipment_ids:
            query = query.where(Task.equipment_links.any(TaskEquipment.equipment_id.in_(equipment_ids)))

    if search:
        search_lower = search.lower()
        search_term = f"%{search}%"
        task_field_conditions = [
            Task.location.ilike(search_term),
            Task.comment.ilike(search_term),
            Task.vehicle_info.ilike(search_term),
            Task.gos_number.ilike(search_term),
        ]

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

    query = query.options(selectinload(Task.contact_person).selectinload(ContactPerson.company))

    res = await db.execute(query)
    tasks = res.scalars().unique().all()

    out = []
    for t in tasks:
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        client_display = f"{company_name} - {contact_person_name}" if company_name and contact_person_name else (company_name or contact_person_name or "—")

        out.append({
            "id": t.id,
            "client": client_display,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "location": t.location,
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "comment": t.comment,
            "assignment_type": t.assignment_type.value if t.assignment_type else None,
            "assigned_user_id": t.assigned_user_id,
            "client_price": str(t.client_price) if t.client_price else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward else None,
            "is_draft": t.is_draft,
            "photo_required": t.photo_required,
        })

    return out


@router.get("/tech_supp_completed-tasks/filter", summary="Фильтрация завершенных задач (тех.специалист)")
async def tech_supp_filter_completed_tasks(
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Сначала находим ID задач, где тех.спец проверял отчёты
    report_res = await db.execute(
        select(TaskReport.task_id).where(TaskReport.approval_tech != ReportApproval.waiting)
    )
    checked_task_ids = [row[0] for row in report_res.fetchall() if row[0] is not None]

    query = select(Task).where(
        Task.is_draft != True,
        Task.status == TaskStatus.completed,
        Task.id.in_(checked_task_ids)
    )

    if company_id:
        company_ids = [int(id) for id in company_id.split(",") if id.strip().isdigit()]
        if company_ids:
            query = query.where(Task.company_id.in_(company_ids))

    if assigned_user_id:
        user_ids = [int(id) for id in assigned_user_id.split(",") if id.strip().isdigit()]
        if user_ids:
            query = query.where(Task.assigned_user_id.in_(user_ids))

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
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        client_display = f"{company_name} - {contact_person_name}" if company_name and contact_person_name else (company_name or contact_person_name or "—")

        assigned_user_full_name = None
        if t.assigned_user:
            assigned_user_full_name = f"{t.assigned_user.name} {t.assigned_user.lastname}"

        equipment = []
        if t.equipment_links:
            for link in t.equipment_links:
                equipment.append({
                    "id": link.equipment.id,
                    "name": link.equipment.name,
                    "category": link.equipment.category,
                    "price": str(link.equipment.price),
                    "quantity": link.quantity,
                    "serial_number": link.serial_number
                })

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
            "client": client_display,
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
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
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

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None

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