from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select, func
from sqlalchemy.orm import selectinload
import json

from back.db.models import (
    Task, TaskHistory, TaskStatus, ManagerStatus, ContactPerson, ClientCompany,
    TaskEquipment, Equipment, TaskWork, User, Role, WorkType
)
from back.db.database import get_db
from back.auth.auth import get_current_user  



router = APIRouter()


@router.get("/tasks")
async def manager_tasks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    count_query = (
        select(func.count(Task.id))
        .where(
            Task.manager_status.is_not(None),
            Task.user_company_id == current_user.company_id
        )
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    tasks_query = (
        select(Task)
        .where(
            Task.manager_status.is_not(None),
            Task.user_company_id == current_user.company_id
        )
        .order_by(Task.manager_status)  
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
        )
    )
    res = await db.execute(tasks_query)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"

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

        out.append({
            "id": t.id,
            "client_name": client_name,
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "manager_status": t.manager_status.value if t.manager_status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "equipment": equipment,
        })

    return {
        "tasks": out,
        "total_count": total_count
    }

@router.get("/tasks/filter", summary="Фильтрация задач менеджера")
async def manager_filter_tasks(
    manager_status: Optional[str] = Query(None, description="Статусы менеджера через запятую"),
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    query = select(Task).where(
        Task.manager_status.is_not(None),
        Task.user_company_id == current_user.company_id
    ).distinct()

    if manager_status:
        ms_list = [s.strip() for s in manager_status.split(",") if s.strip()]
        if ms_list:
            query = query.where(Task.manager_status.in_(ms_list))

    if company_id:
        company_ids = [int(i) for i in company_id.split(",") if i.strip().isdigit()]
        if company_ids:
            query = query.where(Task.company_id.in_(company_ids))

    if assigned_user_id:
        user_ids = [int(i) for i in assigned_user_id.split(",") if i.strip().isdigit()]
        if user_ids:
            query = query.where(Task.assigned_user_id.in_(user_ids))

    if task_id is not None:
        query = query.where(Task.id == task_id)

    if work_type_id:
        wt_ids = [int(i) for i in work_type_id.split(",") if i.strip().isdigit()]
        if wt_ids:
            query = query.join(Task.works).where(TaskWork.work_type_id.in_(wt_ids))

    if equipment_id:
        eq_ids = [int(i) for i in equipment_id.split(",") if i.strip().isdigit()]
        if eq_ids:
            query = query.where(Task.equipment_links.any(TaskEquipment.equipment_id.in_(eq_ids)))

    if search:
        search_term = f"%{search}%"
        conditions = [
            Task.location.ilike(search_term),
            Task.comment.ilike(search_term),
            Task.vehicle_info.ilike(search_term),
            Task.gos_number.ilike(search_term),
            select(ClientCompany).where(
                and_(ClientCompany.id == Task.company_id, ClientCompany.name.ilike(search_term))
            ).exists(),
            select(ContactPerson).where(
                and_(ContactPerson.id == Task.contact_person_id, ContactPerson.name.ilike(search_term))
            ).exists(),
            select(TaskWork).join(TaskWork.work_type).where(
                and_(TaskWork.task_id == Task.id, WorkType.name.ilike(search_term))
            ).exists(),
            select(TaskEquipment).join(TaskEquipment.equipment).where(
                and_(TaskEquipment.task_id == Task.id, Equipment.name.ilike(search_term))
            ).exists(),
            select(User).where(
                and_(User.id == Task.assigned_user_id, User.name.ilike(search_term))
            ).exists(),
        ]
        if search.isdigit():
            conditions.append(Task.id == int(search))
        query = query.where(or_(*conditions))

    query = query.order_by(Task.manager_status).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company),
        selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
    )

    res = await db.execute(query)
    tasks = res.scalars().unique().all()

    out = []
    for t in tasks:
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        contact_person_name = t.contact_person.name if t.contact_person else None
        client_name = company_name or contact_person_name or "—"
        equipment = [
            {
                "equipment_id": te.equipment_id,
                "quantity": te.quantity,
                "serial_number": te.serial_number,
                "equipment": {"id": te.equipment.id, "name": te.equipment.name} if te.equipment else None
            }
            for te in (t.equipment_links or [])
        ]
        out.append({
            "id": t.id,
            "client_name": client_name,
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "location": t.location,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status.value if t.status else None,
            "manager_status": t.manager_status.value if t.manager_status else None,
            "client_price": str(t.client_price) if t.client_price is not None else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward is not None else None,
            "equipment": equipment,
        })

    return {"tasks": out, "total_count": len(out)}


@router.get("/companies")
async def manager_get_companies(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    res = await db.execute(
        select(ClientCompany).where(ClientCompany.user_company_id == current_user.company_id)
    )
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/montajniks")
async def manager_get_montajniks(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    res = await db.execute(
        select(User).where(
            User.role == Role.montajnik,
            User.company_id == current_user.company_id,
            User.is_active == True
        )
    )
    montajniks = res.scalars().all()
    return [{"id": m.id, "name": m.name} for m in montajniks]


@router.get("/work-types")
async def manager_get_work_types(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    result = await db.execute(
        select(WorkType).where(WorkType.user_company_id == current_user.company_id)
    )
    work_types = result.scalars().all()
    return [{"id": wt.id, "name": wt.name} for wt in work_types]


@router.get("/equipment")
async def manager_get_equipment(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    result = await db.execute(
        select(Equipment).where(Equipment.user_company_id == current_user.company_id)
    )
    equipment_list = result.scalars().all()
    return [{"id": eq.id, "name": eq.name} for eq in equipment_list]


@router.get("/tasks/{task_id}")
async def manager_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history).selectinload(TaskHistory.user),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.assigned_user),
            selectinload(Task.district)
        )
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id,
            Task.manager_status.is_not(None)
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна")

    equipment = [
        {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number}
        for te in (task.equipment_links or [])
    ] or None

    work_types = [
        {"work_type_id": tw.work_type_id, "quantity": tw.quantity}
        for tw in (task.works or [])
    ] or None

    requires_tech_supp = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)

    history = [
        {
            "action": h.action.value if h.action else None,
            "user_id": h.user_id,
            "comment": h.comment,
            "ts": h.timestamp.isoformat() if h.timestamp else None
        }
        for h in (task.history or [])
    ] or None

    reports = []
    for r in (task.reports or []):
        photos = []
        if r.photos_json:
            try:
                keys = json.loads(r.photos_json)
                photos = keys
            except Exception:
                photos = []
        reports.append({
            "id": r.id,
            "text": r.text,
            "approval_logist": r.approval_logist.value if r.approval_logist else None,
            "approval_tech": r.approval_tech.value if r.approval_tech else None,
            "photos": photos or None
        })

    company_id = task.contact_person.company.id if task.contact_person and task.contact_person.company else None
    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_id = task.contact_person.id if task.contact_person else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None

    district_id = task.district.id if task.district else None
    district_name = task.district.name if task.district else None

    return {
        "id": task.id,
        "company_id": company_id,
        "contact_person_id": contact_person_id,
        "company_name": company_name,
        "contact_person_name": contact_person_name,
        "contact_person_phone": task.contact_person_phone,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "location": task.location or None,
        "scheduled_at": task.scheduled_at.isoformat() if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "manager_status": task.manager_status.value if task.manager_status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "assigned_user_name": assigned_user_full_name or None,
        "assignment_type": task.assignment_type.value if task.assignment_type else None,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None,
        "requires_tech_supp": requires_tech_supp,
        "district_id": district_id,
        "district_name": district_name
    }



@router.post("/tasks/{task_id}/set-invoice-issued")
async def set_invoice_issued(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Только менеджер может изменять статус")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    res = await db.execute(
        select(Task)
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id,
            Task.manager_status.is_not(None)
        )
        .with_for_update()
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна")

    task.manager_status = ManagerStatus.invoice_issued
    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "manager_status": task.manager_status.value}


@router.post("/tasks/{task_id}/set-warranty")
async def set_warranty(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Только менеджер может изменять статус")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    res = await db.execute(
        select(Task)
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id,
            Task.manager_status.is_not(None)
        )
        .with_for_update()
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна")

    task.manager_status = ManagerStatus.warranty
    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "manager_status": task.manager_status.value}


@router.post("/tasks/{task_id}/set-cash-payment")
async def set_cash_payment(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Только менеджер может изменять статус")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    res = await db.execute(
        select(Task)
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id,
            Task.manager_status.is_not(None)
        )
        .with_for_update()
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна")

    task.manager_status = ManagerStatus.cash_payment
    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "manager_status": task.manager_status.value}



# В файл с роутером менеджера (manager.py)

@router.get("/profile")
async def manager_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != Role.manager:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    counts_query = (
        select(
            Task.manager_status,
            func.count(Task.id).label("count")
        )
        .where(
            Task.manager_status.is_not(None),
            Task.user_company_id == current_user.company_id
        )
        .group_by(Task.manager_status)
    )
    counts_res = await db.execute(counts_query)
    status_counts = {row[0]: row[1] for row in counts_res.fetchall()}

    total_query = (
        select(func.count(Task.id))
        .where(
            Task.manager_status.is_not(None),
            Task.user_company_id == current_user.company_id
        )
    )
    total_res = await db.execute(total_query)
    total_count = total_res.scalar() or 0

    return {
        "id": current_user.id,
        "name": current_user.name,
        "lastname": current_user.lastname,
        "invoice_not_issued_count": status_counts.get(ManagerStatus.invoice_not_issued, 0),
        "invoice_issued_count": status_counts.get(ManagerStatus.invoice_issued, 0),
        "warranty_count": status_counts.get(ManagerStatus.warranty, 0),
        "cash_payment_count": status_counts.get(ManagerStatus.cash_payment, 0),
        "total_tasks_count": total_count
    }