from typing import List
from fastapi import APIRouter, Body, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import (
    AssignmentType,
    ClientCompany,
    ContactPerson,
    Equipment,
    FileType,
    ReportApproval,
    Role,
    Task,
    TaskAttachment,
    TaskEquipment,
    TaskHistory,
    TaskHistoryEventType,
    TaskStatus,
    TaskWork,
    User,
    BroadcastResponse,
    TaskReport,
    WorkType,
)
from back.users.users_schemas import DraftIn, DraftOut, PublishIn, ReportAttachmentIn, TaskEquipmentItem, TaskHistoryItem, TaskPatch, ReportReviewIn, SimpleMsg,require_roles
from back.utils.notify import notify_user
from datetime import datetime, timezone
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
import json
import logging
from decimal import Decimal

from back.utils.selectel import get_s3_client
from back.files.handlers import validate_and_process_attachment

S3_CLIENT = get_s3_client()

S3_PUBLIC_URL = S3_CLIENT.endpoint_url


router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_datetime(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="scheduled_at must be ISO datetime")
    raise HTTPException(status_code=400, detail="scheduled_at must be datetime or ISO string")


def _parse_decimal(val, field_name):
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a decimal number")


def _parse_assignment_type(val):
    if val is None:
        return None
    if isinstance(val, AssignmentType):
        return val
    if isinstance(val, str):
        try:
            return AssignmentType(val)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid assignment_type")
    raise HTTPException(status_code=400, detail="Invalid assignment_type")

def _normalize_assigned_user_id(val):
    """
    Превращает 'false' значения и невалидные в None.
    Возвращает int или None.
    """
    if val is None:
        return None
    # пустые строки, 0, False считаем как отсутствие назначения
    if val in ("", 0, "0", False):
        return None
    try:
        iv = int(val)
        if iv <= 0:
            return None
        return iv
    except Exception:
        return None
    

async def _attach_storage_keys_to_task(db: AsyncSession, storage_keys: list, task_id: int, uploader_id: int, uploader_role: str, background_tasks: BackgroundTasks):
    """
    Привязать список storage_key к задаче: если запись уже есть (task_id == 0 или task_id NULL),
    обновить task_id; иначе создать новую запись TaskAttachment.
    После создания/обновления планируем background обработчик validate_and_process_attachment.
    """
    s3 = get_s3_client()
    created = []
    for sk in storage_keys or []:
        # найти существующую attachment по storage_key, если есть — обновить
        res = await db.execute(select(TaskAttachment).where(TaskAttachment.storage_key == sk))
        existing = res.scalars().first()
        if existing:
            # обновляем привязку к задаче, если не привязан или привязан в temp
            existing.task_id = task_id
            existing.uploader_id = existing.uploader_id or uploader_id
            existing.uploader_role = existing.uploader_role or uploader_role
            existing.deleted_at = None
            await db.flush()
            created.append(existing)
            # запускаем в фоне в любом случае если ещё не processed
            if not existing.processed:
                background_tasks.add_task(validate_and_process_attachment, existing.id)
            continue

        att = TaskAttachment(
            task_id=task_id,
            report_id=None,
            storage_key=sk,
            file_type=FileType.photo,
            original_name=None,
            mime_type=None,
            size=None,
            uploader_id=uploader_id,
            uploader_role=uploader_role,
            processed=False,
        )
        db.add(att)
        await db.flush()
        created.append(att)
        background_tasks.add_task(validate_and_process_attachment, att.id)
    return created


@router.post("/drafts", status_code=201, dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def create_draft(
    background_tasks: BackgroundTasks,
    payload: DraftIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.model_dump()

    contact_person_id = data.get("contact_person_id")
    gos_number = data.get("gos_number")

    company_id = None
    if contact_person_id:
        cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
        contact_person = cp_res.scalars().first()
        if not contact_person:
            raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
        company_id = contact_person.company_id

    scheduled_at = _parse_datetime(data.get("scheduled_at")) if data.get("scheduled_at") else None
    assignment_type = _parse_assignment_type(data.get("assignment_type")) if data.get("assignment_type") else None

    data["assigned_user_id"] = _normalize_assigned_user_id(data.get("assigned_user_id"))

    # === РАСЧЁТ ЦЕН НА ОСНОВЕ work_types ===
    # ✅ Обновляем логику получения work_types_ids с учетом quantity
    work_types_ids_raw = data.get("work_types", [])
    from collections import Counter
    work_type_counts = Counter(work_types_ids_raw)
    work_types_ids_unique = list(work_type_counts.keys())
    
    calculated_client_price = None
    calculated_montajnik_reward = None

    if work_types_ids_unique:
        wt_res = await db.execute(select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True))
        work_types_from_db = wt_res.scalars().all()
        if len(work_types_from_db) != len(work_types_ids_unique):
            missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
            raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

        # Рассчитываем цены с учетом количества
        calculated_client_price = Decimal('0')
        calculated_montajnik_reward = Decimal('0')
        for wt in work_types_from_db:
            count = work_type_counts[wt.id]
            calculated_client_price += (wt.client_price or Decimal('0')) * count
            calculated_montajnik_reward += (wt.montajnik_price or wt.client_price or Decimal('0')) * count

    # ✅ Передаем gos_number в конструктор Task
    task = Task(
        contact_person_id=contact_person_id,
        company_id=company_id,
        vehicle_info=data.get("vehicle_info"),
        scheduled_at=scheduled_at,
        location=data.get("location"),
        comment=data.get("comment"),
        status=TaskStatus.new,
        assignment_type=assignment_type,
        assigned_user_id=data.get("assigned_user_id"),
        logist_contact_id=getattr(current_user, "telegram_id", None),

        # ✅ Устанавливаем рассчитанные цены
        client_price=calculated_client_price,
        montajnik_reward=calculated_montajnik_reward,

        is_draft=True,
        photo_required=data.get("photo_required", False),
        created_by=int(current_user.id),
        gos_number=gos_number,
    )

    db.add(task)
    await db.flush()

    # --- SAVE EQUIPMENT (новая логика) ---
    # ✅ Обработка equipment как списка TaskEquipmentItem
    for eq_item in (data.get("equipment") or []):
        # eq_item - это словарь TaskEquipmentItem
        equipment_id = eq_item.get("equipment_id")
        serial_number = eq_item.get("serial_number")
        quantity = eq_item.get("quantity", 1) # Дефолтное значение 1
        
        res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
        equip = res.scalars().first()
        if not equip:
            raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")
        # ✅ Создаем TaskEquipment с serial_number и quantity
        db.add(TaskEquipment(
            task_id=task.id, 
            equipment_id=equipment_id, 
            serial_number=serial_number,
            quantity=quantity
        ))


    for wt_id, count in work_type_counts.items():
        res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
        wt = res.scalars().first()
        if not wt:
            raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
        # ✅ Создаем TaskWork с quantity=count
        db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))

    await db.commit()
    await db.refresh(task)

    return {"draft_id": task.id, "saved_at": task.created_at, "data": data}




@router.get("/drafts/{draft_id}", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_draft(draft_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
        )
        .where(
            Task.id == draft_id,
            Task.is_draft == True,
            Task.created_by == getattr(current_user, "id", None)
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    # ✅ Формируем список equipment как TaskEquipmentItem
    equipment_items = [
        {
            "id": te.id, # ID записи TaskEquipment
            "equipment_id": te.equipment_id,
            "equipment_name": te.equipment.name, # Для удобства отображения
            "serial_number": te.serial_number, # ✅ Новое поле
            "quantity": te.quantity, # ✅ Новое поле
        }
        for te in task.equipment_links
    ]

    # ✅ Формируем список work_types как TaskWorkItem
    work_type_items = [
        {
            "id": tw.id, # ID записи TaskWork
            "work_type_id": tw.work_type_id,
            "work_type_name": tw.work_type.name, # Для удобства отображения
            "quantity": tw.quantity, # ✅ Новое поле
        }
        for tw in task.works
    ]

    payload = {
        "company_id": task.company_id,
        "contact_person_id": task.contact_person_id,
        "company_name": company_name,
        "contact_person_name": contact_person_name,
        "vehicle_info": task.vehicle_info,
        "scheduled_at": task.scheduled_at,
        "location": task.location,
        "comment": task.comment,
        "assignment_type": task.assignment_type.value if task.assignment_type else None,
        "assigned_user_id": task.assigned_user_id,
        "client_price": str(task.client_price) if task.client_price is not None else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward is not None else None,
        "photo_required": task.photo_required,
        "gos_number": task.gos_number, 
        "equipment": equipment_items, 
        "work_types": work_type_items, 
    }

    return {"draft_id": int(task.id), "saved_at": task.created_at, "data": payload}



@router.patch("/drafts/{draft_id}", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def patch_draft(
    background_tasks: BackgroundTasks,
    draft_id: int,
    payload: DraftIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True))
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    data = payload.model_dump()

    contact_person_id = data.get("contact_person_id")
    # ✅ Получаем новое поле gos_number
    gos_number = data.get("gos_number")

    # ✅ Проверяем contact_person_id и получаем company_id
    company_id = None
    if contact_person_id:
        cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
        contact_person = cp_res.scalars().first()
        if not contact_person:
            raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
        company_id = contact_person.company_id
        setattr(task, "contact_person_id", contact_person_id)
        setattr(task, "company_id", company_id)
    elif contact_person_id is None: # ✅ Явно проверяем на None
        # Если передано null, сбрасываем
        setattr(task, "contact_person_id", None)
        setattr(task, "company_id", None)

    # Обновляем все простые поля (кроме связей и gos_number)
    for key, value in data.items():
        # ✅ Пропускаем equipment, work_types, contact_person_id, gos_number - они обрабатываются отдельно
        if key in {"equipment", "work_types", "contact_person_id", "gos_number"}:
            continue
        if value is not None:
            setattr(task, key, value)
            
    # ✅ Устанавливаем gos_number
    if gos_number is not None: # Позволяем установить null
        setattr(task, "gos_number", gos_number)

    # === РАСЧЁТ ЦЕН НА ОСНОВЕ work_types (как в publish_task) ===
    work_types_ids_raw = data.get("work_types", None) # Проверяем, переданы ли work_types
    if work_types_ids_raw is not None: # Если переданы work_types
        from collections import Counter
        work_type_counts = Counter(work_types_ids_raw)
        work_types_ids_unique = list(work_type_counts.keys())
        
        if work_types_ids_unique: # И если список не пуст
            wt_res = await db.execute(select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True))
            work_types_from_db = wt_res.scalars().all()
            if len(work_types_from_db) != len(work_types_ids_unique):
                missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
                raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

            # Рассчитываем цены с учетом количества
            calculated_client_price = Decimal('0')
            calculated_montajnik_reward = Decimal('0')
            for wt in work_types_from_db:
                count = work_type_counts[wt.id]
                calculated_client_price += (wt.client_price or Decimal('0')) * count
                calculated_montajnik_reward += (wt.montajnik_price or wt.client_price or Decimal('0')) * count
        else: # Если список work_types пуст
            calculated_client_price = None
            calculated_montajnik_reward = None

        # Устанавливаем рассчитанные цены
        task.client_price = calculated_client_price
        task.montajnik_reward = calculated_montajnik_reward


    # --- Обновление оборудования (новая логика) ---
    # ✅ Обновляем equipment, если оно передано
    equipment_data = data.get("equipment", None) # Проверяем, передано ли оборудование
    if equipment_data is not None: # Если передано оборудование
        # 1. Получаем существующие записи TaskEquipment для этой задачи
        existing_te_res = await db.execute(
            select(TaskEquipment).where(TaskEquipment.task_id == task.id)
        )
        existing_te_list = existing_te_res.scalars().all()
        existing_te_map = {te.id: te for te in existing_te_list} # Map для быстрого поиска

        incoming_te_ids = set() # Будем собирать ID пришедших записей для сравнения

        # 2. Обрабатываем каждый пришедший элемент
        for item_data_dict in equipment_data:
            # Pydantic автоматически преобразует dict в TaskEquipmentItem
            item_data: TaskEquipmentItem = item_data_dict if isinstance(item_data_dict, TaskEquipmentItem) else TaskEquipmentItem(**item_data_dict)
            
            item_id = item_data.id
            equipment_id = item_data.equipment_id
            serial_number = item_data.serial_number
            quantity = item_data.quantity

            # Проверяем, существует ли оборудование
            eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            equipment_obj = eq_res.scalars().first()
            if not equipment_obj:
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")

            if item_id:
                # 2a. Обновление существующей записи
                if item_id in existing_te_map:
                    te_record = existing_te_map[item_id]
                    # Проверка, что запись принадлежит этой задаче
                    if te_record.task_id != task.id:
                        raise HTTPException(status_code=400, detail=f"Запись оборудования id={item_id} не принадлежит задаче {task.id}")
                    
                    te_record.equipment_id = equipment_id
                    te_record.serial_number = serial_number
                    te_record.quantity = quantity
                    # db.add(te_record) # Не обязательно, если объект уже отслеживается
                    incoming_te_ids.add(item_id)
                    logger.info(f"Обновлена запись TaskEquipment id={item_id}")
                else:
                    raise HTTPException(status_code=400, detail=f"Запись TaskEquipment id={item_id} не найдена для задачи {task.id}")
            else:
                # 2b. Создание новой записи
                new_te = TaskEquipment(
                    task_id=task.id,
                    equipment_id=equipment_id,
                    serial_number=serial_number,
                    quantity=quantity
                )
                db.add(new_te)
                await db.flush() # Нужно для получения new_te.id
                incoming_te_ids.add(new_te.id) # Добавляем ID новой записи
                logger.info(f"Создана новая запись TaskEquipment id={new_te.id}")

        # 3. Удаление записей, которых нет во входящих данных
        ids_to_delete = set(existing_te_map.keys()) - incoming_te_ids
        if ids_to_delete:
            delete_stmt = delete(TaskEquipment).where(TaskEquipment.id.in_(ids_to_delete))
            await db.execute(delete_stmt)
            logger.info(f"Удалены записи TaskEquipment ids={ids_to_delete}")


    if work_types_ids_raw is not None: # Если переданы work_types
        await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
        
        # 2. Создаем новые записи с учетом количества
        for wt_id, count in work_type_counts.items():
            res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            wt = res.scalars().first()
            if not wt:
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))


    db.add(TaskHistory(task_id=task.id, user_id=int(current_user.id), action=TaskStatus.new, comment="Draft updated"))
    await db.commit()
    await db.refresh(task)
    return {"draft_id": task.id, "saved_at": task.created_at, "data": data}



@router.delete("/drafts/{draft_id}", dependencies=[Depends(require_roles(Role.logist))])
async def delete_draft(draft_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True, Task.created_by == getattr(current_user, "id", None)))
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    try:
        await db.delete(task)
        await db.flush()
        await db.commit()
    except Exception as e:
        logger.exception("Failed to delete draft: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to delete draft")

    return {"detail": "Deleted"}


@router.post("/tasks", status_code=201, dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def publish_task(
    background_tasks: BackgroundTasks,
    payload: PublishIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.model_dump()
    draft_id = data.get("draft_id")
    contact_person_id = data.get("contact_person_id")
    gos_number = data.get("gos_number")

    contact_person = None
    company_id = None
    if contact_person_id:
        cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
        contact_person = cp_res.scalars().first()
        if not contact_person:
            raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
        company_id = contact_person.company_id

    work_types_ids_raw = data.get("work_types", [])
    from collections import Counter
    work_type_counts = Counter(work_types_ids_raw)
    work_types_ids_unique = list(work_type_counts.keys())
    
    if work_types_ids_unique:
        wt_res = await db.execute(select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True))
        work_types = wt_res.scalars().all()
        if len(work_types) != len(work_types_ids_unique):
            missing = set(work_types_ids_unique) - {wt.id for wt in work_types}
            raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")
        
        # Рассчитываем цены с учетом количества
        client_price = Decimal('0')
        montajnik_reward = Decimal('0')
        for wt in work_types:
            count = work_type_counts[wt.id]
            client_price += (wt.client_price or Decimal('0')) * count
            montajnik_reward += (wt.montajnik_price or wt.client_price or Decimal('0')) * count
    else:
        client_price = None
        montajnik_reward = None

    if draft_id:
        # --- Публикация из черновика ---
        res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True))
        task = res.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Черновик не найден")

        # Обновляем поля перед публикацией
        for key, val in data.items():
            # ✅ Обрабатываем contact_person_id отдельно
            if key == "contact_person_id":
                if val:
                    cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == val))
                    cp = cp_res.scalars().first()
                    if not cp:
                        raise HTTPException(status_code=400, detail=f"Контактное лицо id={val} не найдено")
                    setattr(task, "contact_person_id", val)
                    setattr(task, "company_id", cp.company_id)
                else:
                    setattr(task, "contact_person_id", None)
                    setattr(task, "company_id", None)
            # ✅ Устанавливаем gos_number
            elif key == "gos_number":
                setattr(task, key, val)
            # ✅ Пропускаем draft_id и equipment, work_types, они обрабатываются отдельно
            elif key not in ("draft_id", "equipment", "work_types"):
                if val is not None:
                    setattr(task, key, val)
        task.is_draft = False
        task.client_price = client_price
        task.montajnik_reward = montajnik_reward

        # --- Очистка и вставка equipment/work_types ---
        await db.execute(delete(TaskEquipment).where(TaskEquipment.task_id == task.id))
        await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
        
        # ✅ Обработка equipment (новая логика)
        for eq_item in (data.get("equipment") or []):
            # eq_item - это словарь TaskEquipmentItem
            equipment_id = eq_item.get("equipment_id")
            serial_number = eq_item.get("serial_number")
            quantity = eq_item.get("quantity", 1) # Дефолтное значение 1
            
            res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            if not res.scalars().first():
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")
            # ✅ Создаем TaskEquipment с serial_number и quantity
            db.add(TaskEquipment(
                task_id=task.id, 
                equipment_id=equipment_id, 
                serial_number=serial_number,
                quantity=quantity
            ))

        # ✅ Обработка work_types с учетом quantity (новая логика)
        # work_type_counts уже подсчитан выше
        for wt_id, count in work_type_counts.items():
            res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            if not res.scalars().first():
                 # Это уже проверено выше, но на всякий случай
                 raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            # ✅ Создаем TaskWork с quantity=count
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))

        
        db.add(TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action=TaskStatus.new,
            event_type=TaskHistoryEventType.published,
            comment="Published from draft",
            company_id=task.company_id,  
            contact_person_id=task.contact_person_id,
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
            gos_number = task.gos_number
        ))
        await db.flush()

    else:
        # --- Прямая публикация (без draft) ---
        # ✅ Передаем gos_number в конструктор Task
        task = Task(
            contact_person_id=contact_person_id,
            company_id=company_id, 
            vehicle_info=data.get("vehicle_info"),
            scheduled_at=_parse_datetime(data.get("scheduled_at")),
            location=data.get("location"),
            comment=data.get("comment"),
            assignment_type=_parse_assignment_type(data.get("assignment_type")),
            assigned_user_id=_normalize_assigned_user_id(data.get("assigned_user_id")),
            client_price=client_price,
            montajnik_reward=montajnik_reward,
            is_draft=False,
            created_by=current_user.id,
            gos_number=gos_number,
        )
        db.add(task)
        await db.flush()

        # ✅ Обработка equipment (новая логика)
        for eq_item in (data.get("equipment") or []):
            # eq_item - это словарь TaskEquipmentItem
            equipment_id = eq_item.get("equipment_id")
            serial_number = eq_item.get("serial_number")
            quantity = eq_item.get("quantity", 1) # Дефолтное значение 1
            
            res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            if not res.scalars().first():
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")
            # ✅ Создаем TaskEquipment с serial_number и quantity
            db.add(TaskEquipment(
                task_id=task.id, 
                equipment_id=equipment_id, 
                serial_number=serial_number,
                quantity=quantity
            ))

        
        for wt_id, count in work_type_counts.items():
            res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            if not res.scalars().first():
                 # Это уже проверено выше, но на всякий случай
                 raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            # ✅ Создаем TaskWork с quantity=count
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))

        db.add(TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action=TaskStatus.new,
            event_type=TaskHistoryEventType.published,
            comment="Задача добавлена",
            company_id=task.company_id,  
            contact_person_id=task.contact_person_id,
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
            gos_number = task.gos_number
        ))
        await db.flush()

    await db.commit()
    await db.refresh(task)
    return {"id": task.id}


@router.patch("/tasks/{task_id}", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def edit_task(
    background_tasks: BackgroundTasks,
    task_id: int,
    patch: TaskPatch = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    logger.info(f"edit_task вызван для задачи ID: {task_id}")
    # --- Проверки роли и существования задачи ---
    if getattr(current_user, "role", None) not in (Role.logist, Role.admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Загружаем задачу и *старые* связи для истории
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        # Загружаем связи для получения старых значений
        .options(selectinload(Task.works).selectinload(TaskWork.work_type))
        .options(selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment))
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company))  # ✅ Загружаем компанию
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.is_draft:
        raise HTTPException(status_code=400, detail="Нельзя редактировать черновик через этот эндпоинт — используйте /drafts")

    # Сохраняем *старые* значения связей для истории
    # ✅ Обновляем получение старых данных с учетом quantity
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    # ✅ Обновляем получение старых данных оборудования с serial_number и quantity
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name}, company={old_company_name}")

    incoming = {k: v for k, v in patch.model_dump().items() if v is not None}
    logger.info(f"Полный incoming dict: {incoming}")
    changed = []

    # --- normalize assigned_user_id ---
    if "assigned_user_id" in incoming:
        incoming["assigned_user_id"] = _normalize_assigned_user_id(incoming["assigned_user_id"])


    equipment_data: List[TaskEquipmentItem] = incoming.pop("equipment", None)
    # ✅ work_types_data - список ID
    work_types_data = incoming.pop("work_types", None)
    logger.info(f"equipment_data: {equipment_data}, work_types_data: {work_types_data}")

    # --- Обновление основных полей задачи ---
    for field, value in incoming.items():
        # ✅ Пропускаем equipment и work_types, они обрабатываются отдельно
        if field in {"id", "created_at", "created_by", "is_draft", "equipment", "work_types"}:
            continue
        old = getattr(task, field)
        old_cmp = old.value if hasattr(old, "value") else old
        new_cmp = value.value if hasattr(value, "value") else value
        logger.debug(f"Сравнение поля '{field}': DB={old_cmp}, Payload={new_cmp}")
        if str(old_cmp) != str(new_cmp):
            # конвертация assignment_type из строки
            if field == "assignment_type" and isinstance(value, str):
                try:
                    value = AssignmentType(value)
                except Exception:
                    raise HTTPException(status_code=400, detail="Invalid assignment_type")
            setattr(task, field, value)
            changed.append((field, old, value))
            logger.info(f"Поле '{field}' помечено как изменённое: {old_cmp} -> {new_cmp}")

    # --- Обновление contact_person_id и company_id ---
    contact_person_id = incoming.get("contact_person_id")
    if contact_person_id is not None:
        if contact_person_id:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            setattr(task, "contact_person_id", contact_person_id)
            setattr(task, "company_id", contact_person.company_id)
            changed.append(("contact_person_id", old_cp_id, contact_person_id))
            changed.append(("company_id", old_co_id, contact_person.company_id))
            logger.info(f"Поле 'contact_person_id' и 'company_id' помечены как изменённые: {old_cp_id}->{contact_person_id}, {old_co_id}->{contact_person.company_id}")
        else:
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            setattr(task, "contact_person_id", None)
            setattr(task, "company_id", None)
            changed.append(("contact_person_id", old_cp_id, None))
            changed.append(("company_id", old_co_id, None))
            logger.info(f"Поле 'contact_person_id' и 'company_id' сброшены: {old_cp_id}->{None}, {old_co_id}->{None}")

    # --- Обновление оборудования ---
    # ✅ НОВАЯ ЛОГИКА обновления оборудования
    if equipment_data is not None:
        # 1. Получаем существующие записи TaskEquipment для этой задачи
        existing_te_res = await db.execute(
            select(TaskEquipment).where(TaskEquipment.task_id == task.id)
        )
        existing_te_list = existing_te_res.scalars().all()
        existing_te_map = {te.id: te for te in existing_te_list} # Map для быстрого поиска

        incoming_te_ids = set() # Будем собирать ID пришедших записей для сравнения

        # 2. Обрабатываем каждый пришедший элемент
        for item_data_dict in equipment_data:
            # Pydantic автоматически преобразует dict в TaskEquipmentItem
            item_data: TaskEquipmentItem = item_data_dict if isinstance(item_data_dict, TaskEquipmentItem) else TaskEquipmentItem(**item_data_dict)
            
            item_id = item_data.id
            equipment_id = item_data.equipment_id
            serial_number = item_data.serial_number
            quantity = item_data.quantity

            # Проверяем, существует ли оборудование
            eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            equipment_obj = eq_res.scalars().first()
            if not equipment_obj:
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")

            if item_id:
                # 2a. Обновление существующей записи
                if item_id in existing_te_map:
                    te_record = existing_te_map[item_id]
                    # Проверка, что запись принадлежит этой задаче
                    if te_record.task_id != task.id:
                        raise HTTPException(status_code=400, detail=f"Запись оборудования id={item_id} не принадлежит задаче {task.id}")
                    
                    te_record.equipment_id = equipment_id
                    te_record.serial_number = serial_number
                    te_record.quantity = quantity
                    # db.add(te_record) # Не обязательно, если объект уже отслеживается
                    incoming_te_ids.add(item_id)
                    logger.info(f"Обновлена запись TaskEquipment id={item_id}")
                else:
                    raise HTTPException(status_code=400, detail=f"Запись TaskEquipment id={item_id} не найдена для задачи {task.id}")
            else:
                # 2b. Создание новой записи
                new_te = TaskEquipment(
                    task_id=task.id,
                    equipment_id=equipment_id,
                    serial_number=serial_number,
                    quantity=quantity
                )
                db.add(new_te)
                await db.flush() # Нужно для получения new_te.id
                incoming_te_ids.add(new_te.id) # Добавляем ID новой записи
                logger.info(f"Создана новая запись TaskEquipment id={new_te.id}")

        # 3. Удаление записей, которых нет во входящих данных
        ids_to_delete = set(existing_te_map.keys()) - incoming_te_ids
        if ids_to_delete:
            delete_stmt = delete(TaskEquipment).where(TaskEquipment.id.in_(ids_to_delete))
            await db.execute(delete_stmt)
            logger.info(f"Удалены записи TaskEquipment ids={ids_to_delete}")

        changed.append(("equipment", "old_equipment_set", equipment_data))
        logger.info("Оборудование помечено как изменённое")


   
    if work_types_data is not None:
         # Подсчитываем количество для каждого типа работ
         from collections import Counter
         work_type_counts = Counter(work_types_data)
         
         # 1. Удаляем все старые записи TaskWork
         await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
         
         # 2. Создаем новые записи с учетом количества
         for wt_id, count in work_type_counts.items():
             res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
             wt = res.scalars().first()
             if not wt:
                 raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
             db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))
         
         changed.append(("work_types", "old_work_set", work_types_data))
         logger.info("Типы работ помечены как изменённые")


    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")
    has_changes = bool(changed)
    logger.info(f"'has_changes' рассчитано как: {has_changes}")

    if not has_changes:
        logger.info("Нет изменений для сохранения, возвращаем 'Без изменений'")
        return {"detail": "Без изменений"}
    else:
        logger.info("Обнаружены изменения, продолжаем выполнение")

    try:
        # --- Логируем изменения в историю ---
        # Обновляем связи в объекте задачи в сессии, чтобы получить новые значения
        await db.refresh(task, attribute_names=['works', 'equipment_links', 'contact_person'])
        # Получаем *новые* значения связей
        # ✅ Обновляем получение новых данных с учетом quantity
        new_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
        # ✅ Обновляем получение новых данных оборудования с serial_number и quantity
        new_equipment_with_sn_qty = [
            (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
        ]
        new_contact_person_name = task.contact_person.name if task.contact_person else None
        new_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
        logger.info(f"Новые связи для задачи {task_id}: equipment={new_equipment_with_sn_qty}, work_types={new_works_with_qty}, contact_person={new_contact_person_name}, company={new_company_name}")

        # Собираем *все* изменения, включая equipment и work_types
        all_changes = []
        for f, o, n in changed:
            # ✅ Обрабатываем equipment и work_types отдельно
            if f not in ["equipment", "work_types", "contact_person_id", "company_id"]:
                all_changes.append({"field": f, "old": str(o), "new": str(n)})

        # ✅ Проверяем и добавляем изменения equipment
        if old_equipment_with_sn_qty != new_equipment_with_sn_qty:
            # Можно сделать более детализированное сравнение, но для простоты просто запишем весь список
            all_changes.append({
                "field": "equipment", 
                "old": old_equipment_with_sn_qty, 
                "new": new_equipment_with_sn_qty
            })
            
        # ✅ Проверяем и добавляем изменения work_types
        if old_works_with_qty != new_works_with_qty:
            # Можно сделать более детализированное сравнение, но для простоты просто запишем весь список
            all_changes.append({
                "field": "work_types", 
                "old": old_works_with_qty, 
                "new": new_works_with_qty
            })
            
        # Проверяем изменения contact_person и company
        old_cp_co = f"{old_contact_person_name} ({old_company_name})" if old_contact_person_name and old_company_name else "—"
        new_cp_co = f"{new_contact_person_name} ({new_company_name})" if new_contact_person_name and new_company_name else "—"
        if old_cp_co != new_cp_co:
            all_changes.append({"field": "contact_person", "old": old_cp_co, "new": new_cp_co})

        logger.info(f"Список 'all_changes' для истории: {all_changes}")
        # Создаём комментарий с *всеми* изменениями
        comment = json.dumps(all_changes, ensure_ascii=False)
        logger.info(f"Комментарий для истории (JSON): {comment}")
        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status,
            comment=comment,
            event_type=TaskHistoryEventType.updated, # ✅ Новый тип
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
            gos_number = task.gos_number
        )
        db.add(hist)
        await db.flush()
        logger.info("Запись в TaskHistory добавлена и зафлашена")

        await db.commit()
        logger.info("Транзакция успешно зафиксирована")
    except Exception as e:
        logger.exception("Failed to update task: %s", e) # Убедитесь, что logger импортирован
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to update task")

    # --- Уведомления ---
    # Убедитесь, что notify_user создаёт свою сессию
    notify_all = False
    if "assignment_type" in incoming:
        at = incoming.get("assignment_type")
        if isinstance(at, str):
            try:
                at = AssignmentType(at)
            except Exception:
                at = None
        if at == AssignmentType.broadcast:
            notify_all = True
    if notify_all or (getattr(task.assignment_type, "value", None) == AssignmentType.broadcast.value):
        res = await db.execute(select(User).where(User.role == Role.montajnik, User.is_active == True))
        for m in res.scalars().all():
            background_tasks.add_task("back.utils.notify.notify_user", m.id, f"Задача #{task.id} обновлена", task.id)
    else:
        if task.assigned_user_id:
            background_tasks.add_task("back.utils.notify.notify_user", task.assigned_user_id, f"Задача #{task.id} обновлена", task.id)

    return {"detail": "Updated"}




@router.post("/tasks/{task_id}/reports/{report_id}/review", dependencies=[Depends(require_roles(Role.logist, Role.tech_supp))])
async def review_report(
    background_tasks: BackgroundTasks,
    task_id: int,
    report_id: int,
    payload: ReportReviewIn = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Ревью отчёта логистом или тех.специалистом.
    payload: {"approval": "approved" | "rejected", "comment": "optional text", "photos": ["storage_key1", ...]}
    Правила:
    - только роль logist или tech_supp
    - устанавливаем approval_logist или approval_tech и review_comment, reviewed_at
    - если оба approval (логист + тех) == approved -> задача считается completed, фиксируем completed_at и history
    - если отклонено -> оставляем задачу в inspection, ревью можно отправлять повторно; уведомляем автора отчёта
    """
    if getattr(current_user, "role", None) not in (Role.logist, Role.tech_supp):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    approval = payload.approval
    comment = payload.comment


    if approval not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="approval must be 'approved' or 'rejected'")

    # load report
    r_res = await db.execute(select(TaskReport).where(TaskReport.id == report_id, TaskReport.task_id == task_id))
    report = r_res.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # load task
    t_res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company))  # ✅ Загружаем компанию
    )
    task = t_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Сохраняем старые статусы отчёта до изменения
    old_approval_logist = report.approval_logist
    old_approval_tech = report.approval_tech

    # set approval based on role
    if getattr(current_user, "role", None) == Role.logist:
        report.approval_logist = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    elif getattr(current_user, "role", None) == Role.tech_supp:
        report.approval_tech = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    report.review_comment = comment
    report.reviewed_at = datetime.now(timezone.utc)

    try:
        # if both approved -> finalize task
        if report.approval_logist == ReportApproval.approved and report.approval_tech == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc)
            # Создаём запись в истории с *всеми* полями задачи
            h = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=TaskStatus.completed, # action - новый статус
                event_type=TaskHistoryEventType.report_status_changed, # ✅ Новый тип
                comment="Both approvals -> completed",
                # --- Сохраняем все основные поля задачи ---
                company_id=task.company_id,  # ✅ Заменено
                contact_person_id=task.contact_person_id,  # ✅ Заменено
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

            )
            db.add(h)
        else:
            action = TaskStatus.inspection # Статус задачи не изменился, но отчёт проверялся
            hist_comment = f"Report #{report.id} reviewed by {current_user.role.value}: {approval}"
            if comment:
                hist_comment += f". Comment: {comment}"
            
            h = TaskHistory(
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
            
                field_name="report_approval", # Поле, связанное с отчётом
                old_value=f"logist:{old_approval_logist.value if old_approval_logist else 'None'}, tech:{old_approval_tech.value if old_approval_tech else 'None'}", # Старые статусы отчёта
                new_value=f"logist:{report.approval_logist.value}, tech:{report.approval_tech.value}", # Новые статусы отчёта
                related_entity_id=report.id,
                related_entity_type="report",
            )
            db.add(h)

        await db.flush()


        await db.commit()
    except Exception as e:
        logger.exception("Failed to review report: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to review report")

    # Notify report author about result
    if report.author_id:
        msg = f"Report #{report.id} reviewed by {current_user.role.value}: {approval}"
        if comment:
            msg += f". Comment: {comment}"
        background_tasks.add_task("back.utils.notify.notify_user", report.author_id, msg, task_id)

    return {"detail": "Reviewed", "approval": approval}




@router.get("/tasks/active")
async def logist_active(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    # Загружаем задачи с контактным лицом и компанией
    q = select(Task).where(
        Task.status != TaskStatus.completed, 
        Task.is_draft == False,
        Task.created_by == current_user.id
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
            "client": client_display,  # Используем составное имя
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
        })
    
    return out


@router.get("/drafts")
async def get_all_dafts(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    # Загружаем черновики с контактным лицом и компанией
    q = select(Task).where(
        Task.is_draft == True,
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
            "client": client_display,  # Используем составное имя
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
        })
    
    return out


@router.get("/tasks/history")
async def logist_history(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    q = select(Task).where(Task.status == TaskStatus.completed, Task.is_draft == False)
    res = await db.execute(q)
    tasks = res.scalars().all()
    out = [
        {
            "id": t.id,
            "client": t.client,
            "completed_at": str(t.completed_at),
        }
        for t in tasks
    ]
    return out


@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_task_full_history(
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

# -------------------------
# Task detail (restored)
# -------------------------



@router.get("/tasks/{task_id}")
async def task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links),
            selectinload(Task.works),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),  # ✅ Загружаем контактное лицо и компанию
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
        "company_name": company_name,  
        "contact_person_name": contact_person_name,  
        "vehicle_info": task.vehicle_info or None,
        "gos_number":task.gos_number or None,
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



@router.get("/equipment")
async def get_equipment(db:AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(Equipment))
    equipment_list = result.scalars().all()
    return [{"id": eq.id, "name": eq.name} for eq in equipment_list]    


@router.get("/work-types")
async def get_work_types(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(WorkType))
    work_types = result.scalars().all()
    return [{"id": wt.id, "name": wt.name,} for wt in work_types]
    


@router.get("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_companies(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ClientCompany))
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_contact_persons(company_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ContactPerson).where(ContactPerson.company_id == company_id))
    contacts = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in contacts]


@router.post("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def add_company(payload: dict = Body(...), db: AsyncSession = Depends(get_db)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Название компании обязательно")
    company = ClientCompany(name=name)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return {"id": company.id, "name": company.name}


@router.post("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def add_contact_person(company_id: int, payload: dict = Body(...), db: AsyncSession = Depends(get_db)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="ФИО контактного лица обязательно")
    res = await db.execute(select(ClientCompany).where(ClientCompany.id == company_id))
    company = res.scalars().first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    contact = ContactPerson(company_id=company_id, name=name)
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return {"id": contact.id, "name": contact.name}
