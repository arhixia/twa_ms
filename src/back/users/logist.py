from typing import Counter, List
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

def _ensure_logist_or_403(user: User):
    if getattr(user, "role", None) != Role.logist:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    


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
    contact_person_phone = None
    if contact_person_id:
        cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
        contact_person = cp_res.scalars().first()
        if not contact_person:
            raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
        company_id = contact_person.company_id
        contact_person_phone = contact_person.phone

    scheduled_at = _parse_datetime(data.get("scheduled_at")) if data.get("scheduled_at") else None
    assignment_type = _parse_assignment_type(data.get("assignment_type")) if data.get("assignment_type") else None

    data["assigned_user_id"] = _normalize_assigned_user_id(data.get("assigned_user_id"))

    # === НОВАЯ РАСЧЁТНАЯ ЛОГИКА ЦЕН ===
    work_types_ids_raw = data.get("work_types", [])
    equipment_data_raw = data.get("equipment", [])

    # --- Рассчёт по Work Types ---
    work_type_counts = Counter(work_types_ids_raw)
    work_types_ids_unique = list(work_type_counts.keys())

    calculated_works_cost_for_client = Decimal('0')
    if work_types_ids_unique:
        wt_res = await db.execute(
            select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True)
        )
        work_types_from_db = wt_res.scalars().all()
        if len(work_types_from_db) != len(work_types_ids_unique):
            missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
            raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

        for wt in work_types_from_db:
            count = work_type_counts[wt.id]
            calculated_works_cost_for_client += (wt.price or Decimal('0')) * count # Цена за единицу * количество

    # --- Рассчёт по Equipment ---
    equipment_quantities = {}
    for eq_item in equipment_data_raw:
        # eq_item - это словарь { "equipment_id": ..., "serial_number": "...", "quantity": ... }
        eq_id = eq_item.get("equipment_id")
        qty = eq_item.get("quantity", 1) # Дефолтное значение 1
        equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

    calculated_equipment_cost = Decimal('0')
    if equipment_quantities:
        eq_res = await db.execute(
            select(Equipment).where(Equipment.id.in_(list(equipment_quantities.keys())))
        )
        equipment_from_db = eq_res.scalars().all()
        if len(equipment_from_db) != len(equipment_quantities):
            missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
            raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

        for eq in equipment_from_db:
            qty = equipment_quantities[eq.id]
            calculated_equipment_cost += (eq.price or Decimal('0')) * qty # Цена за единицу * количество

    # --- ИТОГОВЫЕ ЦЕНЫ ПО НОВОЙ ЛОГИКЕ ---
    final_client_price = calculated_works_cost_for_client + calculated_equipment_cost
    final_montajnik_reward = calculated_equipment_cost

    task = Task(
        contact_person_id=contact_person_id,
        company_id=company_id,
        contact_person_phone=contact_person_phone,
        vehicle_info=data.get("vehicle_info"),
        scheduled_at=scheduled_at,
        location=data.get("location"),
        comment=data.get("comment"),
        status=TaskStatus.new,
        assignment_type=assignment_type,
        assigned_user_id=data.get("assigned_user_id"),
        logist_contact_id=getattr(current_user, "telegram_id", None),

        # ✅ Устанавливаем рассчитанные цены по НОВОЙ логике
        client_price=final_client_price,
        montajnik_reward=final_montajnik_reward,

        is_draft=True,
        photo_required=data.get("photo_required", False),
        created_by=int(current_user.id),
        gos_number=gos_number,
    )

    db.add(task)
    await db.flush() # flush, чтобы получить task.id

    # --- SAVE EQUIPMENT ---
    for eq_item in equipment_data_raw:
        equipment_id = eq_item.get("equipment_id")
        serial_number = eq_item.get("serial_number")
        quantity = eq_item.get("quantity", 1)

        # Проверяем, существует ли оборудование
        eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
        equipment_obj = eq_res.scalars().first()
        if not equipment_obj:
            raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")

        db.add(TaskEquipment(
            task_id=task.id,
            equipment_id=equipment_id,
            serial_number=serial_number,
            quantity=quantity
        ))

    # --- SAVE WORK TYPES ---
    for wt_id, count in work_type_counts.items():
        # Проверяем, существует ли тип работы (уже делали выше, но на всякий случай)
        wt_res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
        wt = wt_res.scalars().first()
        if not wt:
            raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")

        db.add(TaskWork(
            task_id=task.id,
            work_type_id=wt_id,
            quantity=count # ✅ Учитываем количество
        ))

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
            selectinload(Task.assigned_user)
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

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None



    payload = {
        "company_id": task.company_id,
        "contact_person_id": task.contact_person_id,
        "company_name": company_name,
        "contact_person_phone": task.contact_person_phone,
        "contact_person_name": contact_person_name,
        "vehicle_info": task.vehicle_info,
        "scheduled_at": task.scheduled_at,
        "location": task.location,
        "comment": task.comment,
        "assignment_type": task.assignment_type.value if task.assignment_type else None,
        "assigned_user_id": task.assigned_user_id,
        "assigned_user_name": assigned_user_full_name,
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
    logger.info(f"patch_draft вызван для черновика ID: {draft_id}")

    # --- Проверки роли и существования черновика ---
    _ensure_logist_or_403(current_user)

    # Загружаем черновик и *старые* связи (опционально, для сравнения)
    result = await db.execute(
        select(Task)
        .where(Task.id == draft_id, Task.is_draft == True)
        # Загружаем связи для получения старых значений (для расчёта цен и сравнения)
        .options(selectinload(Task.works).selectinload(TaskWork.work_type))
        .options(selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment))
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company))  # ✅ Загружаем компанию
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    # Сохраняем *старые* значения связей для *проверки изменений* и *пересчёта цен*
    # ✅ Обновляем получение старых данных с учетом quantity и serial_number
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    old_contact_person_phone = task.contact_person.phone if task.contact_person else None
    old_assigned_user_id = task.assigned_user_id # <--- Добавлено
    old_assignment_type = task.assignment_type # <--- Добавлено
    # ✅ Сохраняем старые цены для проверки изменений
    old_client_price = task.client_price
    old_montajnik_reward = task.montajnik_reward
    logger.info(f"Старые связи для черновика {draft_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name},contact_person_phone = {old_contact_person_phone}, company={old_company_name}, client_price={old_client_price}, montajnik_reward={old_montajnik_reward}")

    data = payload.model_dump()
    logger.info(f"Полный data dict: {data}")

    contact_person_id = data.get("contact_person_id")
    assigned_user_id = data.get("assigned_user_id")
    gos_number = data.get("gos_number")

    # --- Обновление contact_person_id, company_id, contact_person_phone ---
    if contact_person_id is not None:
        if contact_person_id:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            old_cp_phone = task.contact_person_phone
            setattr(task, "contact_person_id", contact_person_id)
            setattr(task, "company_id", contact_person.company_id)
            setattr(task, "contact_person_phone", contact_person.phone)
            logger.info(f"Поле 'contact_person_id' и 'company_id' помечены как изменённые: {old_cp_id}->{contact_person_id}, {old_co_id}->{contact_person.company_id},{old_cp_phone}->{contact_person.phone}")
        else:
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            old_cp_phone = task.contact_person_phone
            setattr(task, "contact_person_id", None)
            setattr(task, "company_id", None)
            setattr(task, "contact_person_phone", None)
            logger.info(f"Поле 'contact_person_id' и 'company_id' сброшены: {old_cp_id}->{None}, {old_co_id}->{None},{old_cp_phone}->{None}")

    if "assigned_user_id" in data:  # Проверяем, пришло ли поле вообще
        new_assigned_user_id = data["assigned_user_id"]
        old_assigned_user_id = task.assigned_user_id
        old_assignment_type = task.assignment_type

        if new_assigned_user_id is None:
            setattr(task, "assigned_user_id", None)
        # Если был индивидуальный монтажник, переключаем на broadcast
            if task.assignment_type == AssignmentType.individual:
                task.assignment_type = AssignmentType.broadcast
                logger.info(f"assigned_user_id сброшен ({old_assigned_user_id} -> None), "
                            f"assignment_type изменён {old_assignment_type} -> {task.assignment_type}")
        else:
            setattr(task, "assigned_user_id", new_assigned_user_id)
            logger.info(f"assigned_user_id изменён {old_assigned_user_id} -> {new_assigned_user_id}")

    # --- Обновление основных полей задачи (кроме связей) ---
    changed = []
    for key, value in data.items():
        # ✅ Пропускаем equipment, work_types, contact_person_id, gos_number - они обрабатываются отдельно
        if key in {"equipment", "work_types", "contact_person_id","assigned_user_id" "gos_number"}:
            continue
        if value is not None:
            old = getattr(task, key)
            old_cmp = old.value if hasattr(old, "value") else old
            new_cmp = value.value if hasattr(value, "value") else value
            logger.debug(f"Сравнение поля '{key}': DB={old_cmp}, Payload={new_cmp}")
            if str(old_cmp) != str(new_cmp):
                setattr(task, key, value)
                changed.append((key, old, value))
                logger.info(f"Поле '{key}' помечено как изменённое: {old_cmp} -> {new_cmp}")

    # ✅ Устанавливаем gos_number, если пришло
    if gos_number is not None: # Позволяем установить null
        setattr(task, "gos_number", gos_number)

    # --- Обновление оборудования ---
    # ✅ НОВАЯ ЛОГИКА обновления оборудования
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

        changed.append(("equipment", "old_equipment_set", equipment_data))
        logger.info("Оборудование помечено как изменённое")


    # --- Обновление видов работ ---
    # ✅ НОВАЯ ЛОГИКА обновления видов работ (учитываем quantity)
    work_types_data = data.get("work_types", None) # Проверяем, переданы ли work_types
    if work_types_data is not None: # Если переданы work_types
        # 1. Удаляем все старые записи TaskWork
        await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
        
        # 2. Создаем новые записи с учетом количества
        from collections import Counter
        work_type_counts = Counter(work_types_data) # Подсчитываем количество для каждого ID
        for wt_id, count in work_type_counts.items():
            res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            wt = res.scalars().first()
            if not wt:
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            # ✅ Создаем TaskWork с quantity=count
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))
        
        changed.append(("work_types", "old_work_set", work_types_data))
        logger.info("Типы работ помечены как изменённые")


    # --- НОВАЯ ЛОГИКА РАСЧЁТА ЦЕН ---
    calculated_client_price = Decimal('0')
    calculated_montajnik_reward = Decimal('0')

    # 1. Рассчитываем стоимость оборудования (для клиента и монтажника)
    equipment_res = await db.execute(
        select(TaskEquipment)
        .options(selectinload(TaskEquipment.equipment)) # Загрузим оборудование для получения цены
        .where(TaskEquipment.task_id == task.id)
    )
    task_equipment_list = equipment_res.scalars().all()
    for te in task_equipment_list:
        equipment_unit_price = te.equipment.price or Decimal('0') # Используем новое поле unit_price
        calculated_client_price += equipment_unit_price * te.quantity # ✅ Учитываем количество
        calculated_montajnik_reward += equipment_unit_price * te.quantity # ✅ Учитываем количество

    # 2. Рассчитываем стоимость работ (только для клиента)
    work_res = await db.execute(
        select(TaskWork)
        .options(selectinload(TaskWork.work_type)) # Загрузим тип работы для получения цены
        .where(TaskWork.task_id == task.id)
    )
    task_work_list = work_res.scalars().all()
    for tw in task_work_list:
        work_unit_price = tw.work_type.price or Decimal('0') # Используем новое поле unit_price
        calculated_client_price += work_unit_price * tw.quantity # ✅ Учитываем количество
        # montajnik_reward НЕ увеличивается за работы

    # 3. Устанавливаем рассчитанные цены в объект задачи
    task.client_price = calculated_client_price
    task.montajnik_reward = calculated_montajnik_reward
    logger.info(f"Рассчитанные цены: client_price={calculated_client_price}, montajnik_reward={calculated_montajnik_reward}")

    # --- Проверка изменений ---
    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")
    has_changes = bool(changed)
    prices_changed = (task.client_price != old_client_price) or (task.montajnik_reward != old_montajnik_reward)
    logger.info(f"'has_changes' рассчитано как: {has_changes}, 'prices_changed' как: {prices_changed}")

    if not has_changes and not prices_changed:
        logger.info("Нет изменений (включая цены) для сохранения, возвращаем 'Без изменений'")
        return {"detail": "Без изменений"}
    else:
        logger.info("Обнаружены изменения (или изменились цены), продолжаем выполнение")

    try:
        # --- В ЧЕРНОВИКАХ ИСТОРИЯ НЕ ЛОГИРУЕТСЯ ---
        # Код, связанный с TaskHistory, УБИРАЕМ из этого эндпоинта.

        await db.commit() # теперь коммитим все изменения
        logger.info("Транзакция успешно зафиксирована")
    except Exception as e:
        logger.exception("Failed to update draft: %s", e) # Убедитесь, что logger импортирован
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to update draft")

    return {"detail": "Updated"}



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

    if draft_id:
        # --- Публикация из черновика ---
        res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True))
        task = res.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Черновик не найден")

        # Обновляем поля, кроме связей и рассчитанных цен (цены пересчитаем ниже)
        for key, value in data.items():
            if key in {"draft_id", "equipment", "work_types", "client_price", "montajnik_reward"}:
                continue # Пропускаем специальные поля
            if value is not None:
                setattr(task, key, value)

        # --- НОВАЯ РАСЧЁТНАЯ ЛОГИКА ЦЕН ДЛЯ ПУБЛИКАЦИИ ИЗ ЧЕРНОВИКА ---
        # Загружаем текущие связи из черновика для пересчёта и снимков
        current_wt_res = await db.execute(
            select(TaskWork)
            .options(selectinload(TaskWork.work_type)) # <--- ЗАГРУЖАЕМ work_type
            .where(TaskWork.task_id == task.id)
        )
        current_work_items = current_wt_res.scalars().all()

        current_eq_res = await db.execute(
            select(TaskEquipment)
            .options(selectinload(TaskEquipment.equipment)) # <--- ЗАГРУЖАЕМ equipment
            .where(TaskEquipment.task_id == task.id)
        )
        current_equipment_items = current_eq_res.scalars().all()

        # --- Пересчёт Work Types ---
        work_types_ids_for_calc = []
        for tw in current_work_items:
            work_types_ids_for_calc.extend([tw.work_type_id] * tw.quantity) # Воссоздаём плоский список

        work_type_counts = Counter(work_types_ids_for_calc)
        work_types_ids_unique = list(work_type_counts.keys())

        calculated_works_cost_for_client = Decimal('0')
        if work_types_ids_unique:
            wt_res = await db.execute(
                select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True)
            )
            work_types_from_db = wt_res.scalars().all()
            if len(work_types_from_db) != len(work_types_ids_unique):
                missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
                raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

            for wt in work_types_from_db:
                count = work_type_counts[wt.id]
                calculated_works_cost_for_client += (wt.price or Decimal('0')) * count

        # --- Пересчёт Equipment ---
        equipment_quantities = {}
        for te in current_equipment_items:
            eq_id = te.equipment_id
            qty = te.quantity
            equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

        calculated_equipment_cost = Decimal('0')
        if equipment_quantities:
            eq_res = await db.execute(
                select(Equipment).where(Equipment.id.in_(list(equipment_quantities.keys())))
            )
            equipment_from_db = eq_res.scalars().all()
            if len(equipment_from_db) != len(equipment_quantities):
                missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
                raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

            for eq in equipment_from_db:
                qty = equipment_quantities[eq.id]
                calculated_equipment_cost += (eq.price or Decimal('0')) * qty

        # --- ИТОГОВЫЕ ЦЕНЫ ПО НОВОЙ ЛОГИКЕ ---
        # Клиент платит за работы + за оборудование
        task.client_price = calculated_works_cost_for_client + calculated_equipment_cost
        # Монтажник получает только за оборудование
        task.montajnik_reward = calculated_equipment_cost

        task.is_draft = False # Меняем статус на опубликованную задачу

        # --- СОЗДАНИЕ СНИМКОВ ОБОРУДОВАНИЯ И ВИДОВ РАБОТ ДЛЯ ИСТОРИИ (на основе current_work_items и current_equipment_items) ---
        equipment_snapshot_for_history = [
            {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
            for te in current_equipment_items
        ]

        work_types_snapshot_for_history = [
            {"name": tw.work_type.name, "quantity": tw.quantity}
            for tw in current_work_items
        ]

        # Добавляем запись в историю
        db.add(TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action=task.status,
            event_type=TaskHistoryEventType.published,
            comment="Published from draft",
            # ... (остальные поля задачи для истории) ...
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
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
            gos_number = task.gos_number,
            # --- НОВЫЕ ПОЛЯ ---
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        ))

    else:
        # --- Прямая публикация (без черновика) ---
        contact_person_id = data.get("contact_person_id")
        gos_number = data.get("gos_number")

        company_id = None
        contact_person_phone = None
        if contact_person_id:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
            company_id = contact_person.company_id
            contact_person_phone = contact_person.phone

        work_types_ids_raw = data.get("work_types", [])
        equipment_data_raw = data.get("equipment", [])

        # --- Рассчёт цен для новой задачи ---
        work_type_counts = Counter(work_types_ids_raw)
        work_types_ids_unique = list(work_type_counts.keys())

        calculated_works_cost_for_client = Decimal('0')
        if work_types_ids_unique:
            wt_res = await db.execute(
                select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True)
            )
            work_types_from_db = wt_res.scalars().all()
            if len(work_types_from_db) != len(work_types_ids_unique):
                missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
                raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

            for wt in work_types_from_db:
                count = work_type_counts[wt.id]
                calculated_works_cost_for_client += (wt.price or Decimal('0')) * count

        equipment_quantities = {}
        for eq_item in equipment_data_raw:
            eq_id = eq_item.get("equipment_id")
            qty = eq_item.get("quantity", 1)
            equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

        calculated_equipment_cost = Decimal('0')
        if equipment_quantities:
            eq_res = await db.execute(
                select(Equipment).where(Equipment.id.in_(list(equipment_quantities.keys())))
            )
            equipment_from_db = eq_res.scalars().all()
            if len(equipment_from_db) != len(equipment_quantities):
                missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
                raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

            for eq in equipment_from_db:
                qty = equipment_quantities[eq.id]
                calculated_equipment_cost += (eq.price or Decimal('0')) * qty

        # --- ИТОГОВЫЕ ЦЕНЫ ПО НОВОЙ ЛОГИКЕ ---
        final_client_price = calculated_works_cost_for_client + calculated_equipment_cost
        final_montajnik_reward = calculated_equipment_cost

        task = Task(
            contact_person_id=contact_person_id,
            company_id=company_id,
            contact_person_phone=contact_person_phone,
            vehicle_info=data.get("vehicle_info"),
            scheduled_at=_parse_datetime(data.get("scheduled_at")),
            location=data.get("location"),
            comment=data.get("comment"),
            status=TaskStatus.new,
            assignment_type=_parse_assignment_type(data.get("assignment_type")),
            assigned_user_id=_normalize_assigned_user_id(data.get("assigned_user_id")),
            logist_contact_id=getattr(current_user, "telegram_id", None),

            # ✅ Устанавливаем рассчитанные цены по НОВОЙ логике
            client_price=final_client_price,
            montajnik_reward=final_montajnik_reward,

            is_draft=False, # Новая задача, не черновик
            photo_required=data.get("photo_required", False),
            created_by=int(current_user.id),
            gos_number=gos_number,
        )

        db.add(task)
        await db.flush() # flush, чтобы получить task.id

        # --- SAVE EQUIPMENT для новой задачи ---
        equipment_snapshot_for_history = [] # <--- Собираем снимок
        for eq_item in equipment_data_raw:
            equipment_id = eq_item.get("equipment_id")
            serial_number = eq_item.get("serial_number")
            quantity = eq_item.get("quantity", 1)

            eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            equipment_obj = eq_res.scalars().first()
            if not equipment_obj:
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")

            # --- СОХРАНЯЕМ ДАННЫЕ В СНИМОК ---
            equipment_snapshot_for_history.append({
                "name": equipment_obj.name,
                "serial_number": serial_number,
                "quantity": quantity
            })

            db.add(TaskEquipment(
                task_id=task.id,
                equipment_id=equipment_id,
                serial_number=serial_number,
                quantity=quantity
            ))

        # --- SAVE WORK TYPES для новой задачи ---
        work_types_snapshot_for_history = [] # <--- Собираем снимок
        for wt_id, count in work_type_counts.items():
            wt_res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            wt = wt_res.scalars().first()
            if not wt:
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")

            # --- СОХРАНЯЕМ ДАННЫЕ В СНИМОК ---
            work_types_snapshot_for_history.append({
                "name": wt.name,
                "quantity": count
            })

            db.add(TaskWork(
                task_id=task.id,
                work_type_id=wt_id,
                quantity=count
            ))

        # Добавляем запись в историю для новой задачи
        db.add(TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action=task.status,
            event_type=TaskHistoryEventType.created, # или published
            comment="Task created directly",
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
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
            gos_number = task.gos_number,
            # --- НОВЫЕ ПОЛЯ ---
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        ))

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
    _ensure_logist_or_403(current_user)

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
    # ✅ Обновляем получение старых данных с учетом quantity и serial_number
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    old_contact_person_phone = task.contact_person.phone if task.contact_person else None
    old_client_price = task.client_price
    old_montajnik_reward = task.montajnik_reward
    old_assigned_user_id = task.assigned_user_id # <--- Добавлено
    old_assignment_type = task.assignment_type
    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name},contact_person_phone = {old_contact_person_phone}, company={old_company_name}")

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
    
    payload_dict = patch.model_dump() # Это включает null-значения

    incoming_with_nulls = {}
    for k, v in payload_dict.items():
        if k not in {"equipment", "work_types"}: # Эти обрабатываем отдельно
            incoming_with_nulls[k] = v # Включаем всё, включая None

    # --- Обработка assigned_user_id (может быть null) ---
    if "assigned_user_id" in incoming_with_nulls:
        new_assigned_user_id = incoming_with_nulls["assigned_user_id"]
        old_assigned_user_id = task.assigned_user_id
        old_assignment_type = task.assignment_type
        if new_assigned_user_id is None:
            # Если пришло null, сбрасываем assigned_user_id и, возможно, assignment_type
            setattr(task, "assigned_user_id", None)
            # Если assignment_type не broadcast, меняем его на broadcast
            if task.assignment_type != AssignmentType.broadcast:
                setattr(task, "assignment_type", AssignmentType.broadcast)
                logger.info(f"Тип назначения изменён на broadcast, так как assigned_user_id сброшен")
            changed.append(("assigned_user_id", old_assigned_user_id, None))
            changed.append(("assignment_type", old_assignment_type, task.assignment_type))
            logger.info(f"assigned_user_id сброшен: {old_assigned_user_id} -> {None}")
        else:
            # Если пришло не null, просто обновляем
            old_val = getattr(task, "assigned_user_id")
            setattr(task, "assigned_user_id", new_assigned_user_id)
            changed.append(("assigned_user_id", old_val, new_assigned_user_id))
            logger.info(f"assigned_user_id изменён: {old_val} -> {new_assigned_user_id}")

    # Удаляем assigned_user_id из словаря, чтобы не обрабатывать его в основном цикле дважды
    incoming_with_nulls.pop("assigned_user_id", None)

    # --- Обновление основных полей задачи ---
    for field, value in incoming.items():
        # ✅ Пропускаем equipment и work_types, они обрабатываются отдельно
        if field in {"id", "created_at", "created_by", "is_draft", "equipment", "work_types"}:
            continue
        if field == "assigned_user_id": # <--- Должно быть обновление
            setattr(task, field, value) # <--- value может быть null
            changed.append((field, getattr(task, field, None), value))
            
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

    # --- Обновление contact_person_id, company_id и contact_person_phone ---
    contact_person_id = incoming.get("contact_person_id")
    if contact_person_id is not None:
        if contact_person_id:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            old_cp_phone = task.contact_person_phone
            setattr(task, "contact_person_id", contact_person_id)
            setattr(task, "company_id", contact_person.company_id)
            setattr(task, "contact_person_phone", contact_person.phone) 
            changed.append(("contact_person_id", old_cp_id, contact_person_id))
            changed.append(("company_id", old_co_id, contact_person.company_id))
            changed.append(("contact_person_phone", old_cp_phone, contact_person.phone))
            logger.info(f"Поле 'contact_person_id' и 'company_id' помечены как изменённые: {old_cp_id}->{contact_person_id}, {old_co_id}->{contact_person.company_id},{old_cp_phone}->{contact_person.phone}")
        else:
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            old_cp_phone = task.contact_person_phone
            setattr(task, "contact_person_id", None)
            setattr(task, "company_id", None)
            setattr(task, "contact_person_phone", None)
            changed.append(("contact_person_id", old_cp_id, None))
            changed.append(("company_id", old_co_id, None))
            changed.append(("contact_person_phone", old_cp_phone, None))
            logger.info(f"Поле 'contact_person_id' и 'company_id' сброшены: {old_cp_id}->{None}, {old_co_id}->{None},{old_cp_phone}->{None}")

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


    # --- НОВАЯ ЛОГИКА РАСЧЁТА ЦЕН ---
    calculated_client_price = Decimal('0')
    calculated_montajnik_reward = Decimal('0')

    # 1. Рассчитываем стоимость оборудования (для клиента и монтажника)
    equipment_res = await db.execute(
        select(TaskEquipment)
        .options(selectinload(TaskEquipment.equipment)) # Загрузим оборудование для получения цены
        .where(TaskEquipment.task_id == task.id)
    )
    task_equipment_list = equipment_res.scalars().all()
    for te in task_equipment_list:
        equipment_unit_price = te.equipment.price or Decimal('0') # Используем новое поле unit_price
        calculated_client_price += equipment_unit_price * te.quantity
        calculated_montajnik_reward += equipment_unit_price * te.quantity # Монтажник получает за оборудование

    # 2. Рассчитываем стоимость работ (только для клиента)
    work_res = await db.execute(
        select(TaskWork)
        .options(selectinload(TaskWork.work_type)) # Загрузим тип работы для получения цены
        .where(TaskWork.task_id == task.id)
    )
    task_work_list = work_res.scalars().all()
    for tw in task_work_list:
        work_unit_price = tw.work_type.price or Decimal('0') # Используем новое поле unit_price
        calculated_client_price += work_unit_price * tw.quantity
        # montajnik_reward НЕ увеличивается за работы

    # 3. Устанавливаем рассчитанные цены в объект задачи
    task.client_price = calculated_client_price
    task.montajnik_reward = calculated_montajnik_reward
    logger.info(f"Рассчитанные цены: client_price={calculated_client_price}, montajnik_reward={calculated_montajnik_reward}")

    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")
    has_changes = bool(changed)
    prices_changed = (task.client_price != old_client_price) or (task.montajnik_reward != old_montajnik_reward) # <--- Проверяем изменение цен
    assigned_user_id_changed = (task.assigned_user_id != old_assigned_user_id)
    assignment_type_changed = (task.assignment_type != old_assignment_type)
    if assigned_user_id_changed:
        changed.append(("assigned_user_id", old_assigned_user_id, task.assigned_user_id))
    if assignment_type_changed:
        changed.append(("assignment_type", old_assignment_type, task.assignment_type))
    logger.info(f"'has_changes' рассчитано как: {has_changes}, 'prices_changed' как: {prices_changed}")

    if not has_changes and not prices_changed: # <--- Изменено условие
        logger.info("Нет изменений (включая цены) для сохранения, возвращаем 'Без изменений'")
        return {"detail": "Без изменений"}
    else:
        logger.info("Обнаружены изменения (или изменились цены), продолжаем выполнение")

    try:
        res_works = await db.execute(
            select(TaskWork)
            .options(selectinload(TaskWork.work_type)) # Загрузить work_type для каждой TaskWork
            .where(TaskWork.task_id == task.id)
        )
        full_works_list = res_works.scalars().all()
        new_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in full_works_list] # <- Теперь .name доступно синхронно

        # 2. Получить полные данные по оборудованию (включая equipment.name)
        res_equip = await db.execute(
            select(TaskEquipment)
            .options(selectinload(TaskEquipment.equipment)) # Загрузить equipment для каждого TaskEquipment
            .where(TaskEquipment.task_id == task.id)
        )
        full_equip_list = res_equip.scalars().all()
        new_equipment_with_sn_qty = [
            (te.equipment.name, te.serial_number, te.quantity) for te in full_equip_list # <- Теперь .name доступно синхронно
        ]

        new_contact_person_name = None
        new_company_name = None
        if task.contact_person_id: # Если контактное лицо установлено
            res_cp = await db.execute(
                select(ContactPerson)
                .options(selectinload(ContactPerson.company)) # Загрузить компанию для контактного лица
                .where(ContactPerson.id == task.contact_person_id)
            )
            new_contact_person_obj = res_cp.scalars().first()
            if new_contact_person_obj: # Убедимся, что объект найден
                new_contact_person_name = new_contact_person_obj.name
                new_company_name = new_contact_person_obj.company.name if new_contact_person_obj.company else None
        # Если task.contact_person_id == None, то и имена останутся None

        logger.info(f"Новые связи для задачи {task_id}: equipment={new_equipment_with_sn_qty}, work_types={new_works_with_qty}, contact_person={new_contact_person_name}, company={new_company_name}")

        # Собираем *все* изменения, включая equipment и work_types
        all_changes = []
        for f, o, n in changed:
            # ✅ Обрабатываем equipment и work_types отдельно
            if f not in ["equipment", "work_types", "contact_person_id", "company_id", "contact_person_phone"]:
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

        if assigned_user_id_changed:
            all_changes.append({
                "field": "assigned_user_id",
                "old": str(old_assigned_user_id),
                "new": str(task.assigned_user_id)
            })
        if assignment_type_changed:
            all_changes.append({
                "field": "assignment_type",
                "old": old_assignment_type.value if old_assignment_type else None,
                "new": task.assignment_type.value if task.assignment_type else None
            })

       
        # Проверяем изменения contact_person и company
        old_cp_co = f"{old_contact_person_name} ({old_company_name})" if old_contact_person_name and old_company_name else "—"
        new_cp_co = f"{new_contact_person_name} ({new_company_name})" if new_contact_person_name and new_company_name else "—"
        if old_cp_co != new_cp_co:
            all_changes.append({"field": "contact_person", "old": old_cp_co, "new": new_cp_co})
        
        # Обработка изменения contact_person_phone отдельно, если оно произошло
        cp_phone_change = next((item for item in changed if item[0] == "contact_person_phone"), None)
        if cp_phone_change:
            all_changes.append({"field": "contact_person_phone", "old": str(cp_phone_change[1]), "new": str(cp_phone_change[2])})

        # ✅ Добавляем изменения цен в историю, если они произошли
        if prices_changed:
            all_changes.append({
                "field": "client_price",
                "old": str(old_client_price),
                "new": str(task.client_price)
            })
            all_changes.append({
                "field": "montajnik_reward",
                "old": str(old_montajnik_reward),
                "new": str(task.montajnik_reward)
            })

        logger.info(f"Список 'all_changes' для истории: {all_changes}")
        # Создаём комментарий с *всеми* изменениями
        comment = json.dumps(all_changes, ensure_ascii=False)
        logger.info(f"Комментарий для истории (JSON): {comment}")

        # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ ---
        # Формируем снимки *после* обновления связей, но *до* commit
        equipment_snapshot_for_history = [
            {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
            for te in full_equip_list
        ]

        work_types_snapshot_for_history = [
            {"name": tw.work_type.name, "quantity": tw.quantity}
            for tw in full_works_list
        ]

        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=task.status,
            comment=comment,
            event_type=TaskHistoryEventType.updated, # ✅ Новый тип
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,  # ✅ Заменено
            contact_person_id=task.contact_person_id,  # ✅ Заменено
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment,
            status=task.status.value if task.status else None,
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price), # <--- Сохраняем новую рассчитанную цену
            montajnik_reward=str(task.montajnik_reward), # <--- Сохраняем новую рассчитанную награду
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
            gos_number = task.gos_number,
            # --- НОВЫЕ ПОЛЯ: Снимки ---
            equipment_snapshot=equipment_snapshot_for_history, # <--- Добавлено
            work_types_snapshot=work_types_snapshot_for_history, # <--- Добавлено
        )
        db.add(hist)
        await db.flush() # flush после добавления истории
        logger.info("Запись в TaskHistory добавлена и зафлашена")

        await db.commit() # теперь коммитим все изменения
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
    payload: ReportReviewIn = Body(...), # Используем Pydantic схему, если она есть
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

    # load task WITH equipment, work_types and contact_person/company for snapshot and check for tech_supp_required
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

    # Проверяем, требуется ли проверка тех.спеца для *этой задачи*
    requires_tech_review = any(tw.work_type.tech_supp_require for tw in task.works if tw.work_type)

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
                comment="Both approvals -> completed",
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
            action = TaskStatus.inspection # Статус задачи не изменился, но отчёт проверялся
            hist_comment = f"Report #{report.id} reviewed by {current_user.role.value}: {approval}"
            if comment:
                hist_comment += f". Comment: {comment}"

            # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ (проверка отчёта) ---
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
                field_name="report_approval", # Поле, связанное с отчётом
                old_value=f"logist:{old_approval_logist.value if old_approval_logist else 'None'}, tech:{old_approval_tech.value if old_approval_tech else 'None'}",
                new_value=f"logist:{report.approval_logist.value}, tech:{report.approval_tech.value}",
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
        background_tasks.add_task(notify_user, report.author_id, msg, task_id)


    if (
        current_user.role == Role.logist
        and report.approval_tech == ReportApproval.waiting
        and requires_tech_review
    ):
        tech_q = await db.execute(select(User).where(User.role == Role.tech_supp, User.is_active == True))
        techs = tech_q.scalars().all()
        for tuser in techs:
            background_tasks.add_task(
                notify_user,
                tuser.id,
                f"Отчёт #{report.id} по задаче #{task.id} ожидает вашей проверки (требуется тех.проверка).",
                task_id
            )

    return {"detail": "Reviewed", "approval": approval}




@router.get("/tasks/active")
async def logist_active(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    # Загружаем задачи с контактным лицом и компанией
    q = select(Task).where(
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
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
            "client": t.contact_person_id,
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




@router.get("/tasks/{task_id}")
async def task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Используем Task вместо TaskView
    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history).selectinload(TaskHistory.user), # Загрузим и пользователя истории, если нужно
            selectinload(Task.reports), # ✅ УБРАНО .selectinload(TaskReport.user)
            # Загружаем контактное лицо и компанию для получения company_id и contact_person_id
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.assigned_user)
        )
        .where(Task.id == task_id)
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # --- equipment ---
    equipment = [
        {"equipment_id": te.equipment_id, "quantity": te.quantity, "serial_number": te.serial_number}
        for te in (task.equipment_links or [])
    ] or None

    # --- work_types ---
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
    # Извлекаем ID и имена из связанных объектов
    company_id = task.contact_person.company.id if task.contact_person and task.contact_person.company else None
    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_id = task.contact_person.id if task.contact_person else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None

    # Формируем ответ, включая company_id и contact_person_id
    return {
        "id": task.id,
        "company_id": company_id,  # ✅ Добавлено
        "contact_person_id": contact_person_id,  # ✅ Добавлено
        "company_name": company_name,
        "contact_person_name": contact_person_name,
        "contact_person_phone": task.contact_person_phone,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "location": task.location or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
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
        "reports": reports or None
    }

#редактирование лоигврование 



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
    return [{"id": c.id, "name": c.name, "phone": c.phone} for c in contacts]


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
    phone = payload.get("phone") 
    if not name:
        raise HTTPException(status_code=400, detail="ФИО контактного лица обязательно")
    res = await db.execute(select(ClientCompany).where(ClientCompany.id == company_id))
    company = res.scalars().first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    contact = ContactPerson(company_id=company_id, name=name, phone=phone) 
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return {"id": contact.id, "name": contact.name, "phone": contact.phone} # 



@router.get("/contact-persons/{contact_person_id}/phone", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_contact_person_phone(
    contact_person_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить телефон контактного лица по его ID.
    """
    res = await db.execute(
        select(ContactPerson.phone).where(ContactPerson.id == contact_person_id)
    )
    phone_number = res.scalar_one_or_none()

    if phone_number is None:
        raise HTTPException(status_code=404, detail="Контактное лицо не найдено")

    return {"phone": phone_number}


@router.get("/me")
async def logist_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Личный кабинет логиста:
    - имя, фамилия, роль
    - история выполненных задач (где логист был создателем или участвовал в истории)
    """
    _ensure_logist_or_403(current_user)

    # Загружаем задачи и *предварительно* загружаем связанные объекты company и contact_person
    q = select(Task).options(
        selectinload(Task.company), # ✅ Загружаем компанию
        selectinload(Task.contact_person) # ✅ Загружаем контактное лицо
    ).where(
        Task.created_by == current_user.id,
        Task.status == TaskStatus.completed
    )
    res = await db.execute(q)
    completed = res.scalars().all()

    total = sum([float(t.client_price or 0) for t in completed])

    history = []
    for t in completed: # Теперь обращение к t.company и t.contact_person НЕ вызывает ленивую загрузку
        history.append({
            "id": t.id,
            # Теперь t.company и t.contact_person уже загружены, обращение к .name безопасно
            "client": t.company.name if t.company else "—", # Имя компании
            "contact_person": t.contact_person.name if t.contact_person else "—", # Имя контактного лица
            "vehicle_info": t.vehicle_info,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "reward": str(t.client_price) if t.client_price is not None else None,
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
async def logist_completed_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    _ensure_logist_or_403(current_user) # Проверяем, что пользователь - логист

    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
        )
        .where(
            Task.id == task_id,
            Task.created_by == current_user.id, # ✅ Убедимся, что задача создана текущим логистом
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
        "reports": reports or None
    }


@router.get("/montajniks", dependencies=[Depends(require_roles(Role.logist, Role.admin,Role.montajnik,Role.tech_supp))])
async def get_active_montajniks(db: AsyncSession = Depends(get_db)):
    """
    Получить список активных монтажников.
    """
    res = await db.execute(
        select(User)
        .where(User.role == Role.montajnik, User.is_active == True) # Фильтруем по роли и статусу
        .order_by(User.name, User.lastname) # Сортируем для удобства
    )
    montajniks = res.scalars().all()
    return [{"id": m.id, "name": m.name, "lastname": m.lastname} for m in montajniks]



@router.patch("/tasks/{task_id}/archive", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def archive_task(
    background_tasks: BackgroundTasks, # Добавим, если нужно уведомлять
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
  
    logger.info(f"archive_task вызван для задачи ID: {task_id}")

    _ensure_logist_or_403(current_user)

    # Загружаем задачу с контактным лицом и компанией для истории
    res = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.is_draft == False) # Не черновик
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # ✅ УБРАНА проверка на статус "completed"
    # if task.status != TaskStatus.completed:
    #     raise HTTPException(status_code=400, detail=f"Нельзя архивировать задачу со статусом '{task.status.value}'. Архивировать можно только завершённые задачи.")

    old_status = task.status
    task.status = TaskStatus.archived

    try:
        equipment_snapshot_for_history = [
            {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
            for te in task.equipment_links
        ]

        work_types_snapshot_for_history = [
            {"name": tw.work_type.name, "quantity": tw.quantity}
            for tw in task.works
        ]

        # Создаём запись в истории
        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=TaskStatus.archived, # action - новый статус
            event_type=TaskHistoryEventType.status_changed, # ✅ Новый тип
            comment=f"Task archived by logist. Status changed from {old_status.value} to {TaskStatus.archived.value}",
            field_name="status", # Поле, которое изменилось
            old_value=old_status.value if old_status else None, # Старое значение статуса
            new_value=TaskStatus.archived.value, # Новое значение (запрашиваемое)
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
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
            gos_number = task.gos_number,
            # --- НОВЫЕ ПОЛЯ: Снимки ---
            equipment_snapshot=equipment_snapshot_for_history, # <--- Передаём корректно
            work_types_snapshot=work_types_snapshot_for_history, # <--- Передаём корректно
        )
        db.add(hist)
        await db.flush() # flush после добавления истории

        await db.commit() # commit после flush
        logger.info(f"Задача {task_id} архивирована и запись в историю добавлена")
    except Exception as e:
        logger.exception("Failed to archive task: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to archive task")

    return {"detail": "Archived"}


@router.delete("/tasks/{task_id}/archive", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def delete_archived_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    logger.info(f"delete_archived_task вызван для задачи ID: {task_id}")

    _ensure_logist_or_403(current_user)
    res = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.status == TaskStatus.archived) # Только архивированные
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или не архивирована")

    try:
        await db.delete(task)
        await db.flush()
        await db.commit()
        logger.info(f"Задача {task_id} удалена из архива")
    except Exception as e:
        logger.exception("Failed to delete archived task: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to delete archived task")

    return {"detail": "Deleted"}


@router.get("/archived-tasks")
async def logist_archive(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    q = (
        select(Task)
        .where(
            Task.status == TaskStatus.archived,
            Task.is_draft == False,
            Task.created_by == current_user.id
        )
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company))
    )
    res = await db.execute(q)
    tasks = res.scalars().all()

    out = []
    for t in tasks:
        contact_person_name = t.contact_person.name if t.contact_person else None
        company_name = t.contact_person.company.name if t.contact_person and t.contact_person.company else None
        client_display = (
            f"{company_name} - {contact_person_name}"
            if company_name and contact_person_name
            else (company_name or contact_person_name or "—")
        )
        out.append({
            "id": t.id,
            "vehicle_info": t.vehicle_info,
            "client": client_display,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "client_price": t.client_price,
            "montajnik_reward": t.montajnik_reward,
        })

    print("📦 Архивные задачи:", [t.id for t in tasks])  # debug

    return out


@router.get("/archived-tasks/{task_id}")
async def logist_archive_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    _ensure_logist_or_403(current_user) # Проверяем, что пользователь - логист

    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
        )
        .where(
            Task.id == task_id,
            Task.created_by == current_user.id, 
            Task.status == TaskStatus.archived      
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
        "reports": reports or None
    }