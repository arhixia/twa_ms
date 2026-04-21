import enum
from typing import Counter, List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.database import get_db
from back.auth.auth import get_current_user
from back.db.models import (
    AssignmentType,
    ClientCompany,
    ContactPerson,
    District,
    Equipment,
    FileType,
    LogistPerformance,
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
    ManagerStatus
)
from back.users.users_schemas import DraftIn, DraftOut, PublishIn, ReportAttachmentIn, SimpleDistrictResponse, TaskEquipmentItem, TaskHistoryItem, TaskPatch, ReportReviewIn, SimpleMsg, UpdateCompanyRequest, UpdateContactPersonRequest,require_roles
from back.utils.notify import notify_broadcast_task, notify_task_assignment, notify_user
from datetime import datetime, timedelta, timezone
from sqlalchemy import and_, case, delete, desc, func, or_, select
from sqlalchemy.orm import selectinload
import json
import logging
from decimal import Decimal
from datetime import date 
import calendar
from back.utils.selectel import get_s3_client
from back.files.handlers import validate_and_process_attachment
from back.messaging.producer import publish_notification

S3_CLIENT = get_s3_client()

S3_PUBLIC_URL = S3_CLIENT.endpoint_url


router = APIRouter()
logger = logging.getLogger(__name__)

def _ensure_logist_or_403(user: User):
    if getattr(user, "role", None) != Role.logist:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    

FIELD_TRANSLATIONS_RU = {
    "company_id": "Компания",
    "contact_person_id": "Контактное лицо",
    "contact_person_phone": "Телефон контактного лица",
    "vehicle_info": "ТС",
    "gos_number": "Гос. номер",
    "scheduled_at": "Дата и время",
    "location": "Место/Адрес",
    "comment": "Комментарий",
    "status": "Статус",
    "assigned_user_id": "Монтажник",
    "assignment_type": "Тип назначения",
    "photo_required": "Фото обязательно",
    "client_price": "Цена клиента",
    "montajnik_reward": "Награда монтажнику",
}

def format_value_rus(value):
    """
    Форматирует значение для отображения на русском.
    """
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Да" if value else "Нет"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y %H:%M")
    if isinstance(value, enum.Enum):
        # Возвращаем .value enum, а не строку вида "AssignmentType.individual"
        return value.value
    if isinstance(value, str):
        return value

    # --- НОВОЕ: Форматирование списков оборудования и типов работ ---
    if isinstance(value, list):
        if not value:
            return "—"
        # Проверяем, является ли это списком кортежей (equipment или work_types)
        # Пример: [('Отвёртка', '1445', 1), ...] или [('Проверка', 1), ...]
        formatted_items = []
        for item in value:
            if isinstance(item, tuple):
                if len(item) == 3: # equipment: (name, serial_number, quantity)
                    name, sn, qty = item
                    # Форматируем только если есть серийный номер, иначе не показываем "SN: "
                    formatted_sn = f" (SN: {sn})" if sn else ""
                    formatted_items.append(f"{name}{formatted_sn} x{qty}")
                elif len(item) == 2: # work_type: (name, quantity)
                    name, qty = item
                    formatted_items.append(f"{name} x{qty}")
                else:
                    # Если кортеж неизвестной длины, просто приводим к строке
                    formatted_items.append(str(item))
            else:
                # Если элемент не кортеж, просто приводим к строке
                formatted_items.append(str(item))
        return ", ".join(formatted_items)

    # Для прочих сложных объектов
    return str(value)

def build_changes_summary_ru(all_changes):
    """
    Создаёт человеко-читаемую строку изменений на русском с переносами строк.
    all_changes: [{"field": str, "old": value, "new": value}, ...]
    """
    if not all_changes:
        return "—"

    parts = []
    for change in all_changes:
        field_en = change.get("field")
        old_val = change.get("old", "—")
        new_val = change.get("new", "—")

        # --- Форматируем значения ---
        old_str = format_value_rus(old_val)
        new_str = format_value_rus(new_val)

        # Игнорируем изменения, где старое и новое значение совпадают
        if old_str == new_str:
            continue # <--- Пропускаем это изменение

        # --- ИСПОЛЬЗУЕМ РУССКОЕ НАЗВАНИЕ ПОЛЯ ---
        field_ru = FIELD_TRANSLATIONS_RU.get(field_en, field_en)
        # Заменяем на русские названия для equipment и work_types
        if field_en == "equipment":
            field_ru = "Оборудование"
        elif field_en == "work_types":
            field_ru = "Тип работ"
        elif field_en == "contact_person":
            field_ru = "Контактное лицо"

        parts.append(f"{field_ru}: {old_str} → {new_str}")

    if not parts:
        return "— Нет изменений —"

    return "\n".join(parts)

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

    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    # === Обработка contact_person ===
    contact_person_id = data.get("contact_person_id")
    company_id = None
    contact_person_phone = None
    if contact_person_id:
        cp_res = await db.execute(
            select(ContactPerson)
            .join(ClientCompany)
            .where(
                ContactPerson.id == contact_person_id,
                ClientCompany.user_company_id == current_user.company_id
            )
        )
        contact_person = cp_res.scalars().first()
        if not contact_person:
            raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено или не принадлежит вашей компании")
        company_id = contact_person.company_id
        contact_person_phone = contact_person.phone

    
    district_id = data.get("district_id")
    if district_id is not None:
        district_check = await db.execute(
            select(District).where(
                District.id == district_id,
                District.user_company_id == current_user.company_id
            )
        )
        if not district_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Район не найден или не принадлежит вашей компании")


    scheduled_at = _parse_datetime(data.get("scheduled_at")) if data.get("scheduled_at") else None
    assignment_type = _parse_assignment_type(data.get("assignment_type")) if data.get("assignment_type") else None

    data["assigned_user_id"] = _normalize_assigned_user_id(data.get("assigned_user_id"))

    work_types_ids_raw = data.get("work_types", [])
    equipment_data_raw = data.get("equipment", [])

    work_type_counts = Counter(work_types_ids_raw)
    work_types_ids_unique = list(work_type_counts.keys())

    calculated_works_cost_for_client = Decimal('0')
    calculated_works_cost_for_mont = Decimal('0')
    calculated_logist_reward = Decimal('0')
    if work_types_ids_unique:
        wt_res = await db.execute(
            select(WorkType).where(
                WorkType.id.in_(work_types_ids_unique),
                WorkType.is_active == True,
                WorkType.user_company_id == current_user.company_id
            )
        )
        work_types_from_db = wt_res.scalars().all()
        if len(work_types_from_db) != len(work_types_ids_unique):
            missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
            raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

        for wt in work_types_from_db:
            count = work_type_counts[wt.id]
            calculated_works_cost_for_client += (wt.client_price or Decimal('0')) * count
            calculated_works_cost_for_mont += (wt.mont_price or Decimal('0')) * count
            calculated_logist_reward += (wt.logist_price or Decimal('0')) * count 

    equipment_quantities = {}
    for eq_item in equipment_data_raw:
        eq_id = eq_item.get("equipment_id")
        qty = eq_item.get("quantity", 1)
        equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

    calculated_equipment_cost = Decimal('0')
    if equipment_quantities:
        eq_res = await db.execute(
            select(Equipment).where(
                Equipment.id.in_(list(equipment_quantities.keys())),
                Equipment.user_company_id == current_user.company_id
            )
        )
        equipment_from_db = eq_res.scalars().all()
        if len(equipment_from_db) != len(equipment_quantities):
            missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
            raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

        for eq in equipment_from_db:
            qty = equipment_quantities[eq.id]
            calculated_equipment_cost += (eq.price or Decimal('0')) * qty

    final_client_price = calculated_works_cost_for_client + calculated_equipment_cost
    final_montajnik_reward = calculated_works_cost_for_mont
    final_logist_reward = calculated_logist_reward

   
    task = Task(
        contact_person_id=contact_person_id,
        company_id=company_id,
        contact_person_phone=contact_person_phone,
        vehicle_info=data.get("vehicle_info"),
        scheduled_at=scheduled_at,
        location=data.get("location"),
        comment=data.get("comment"),
        status=TaskStatus.assigned if data.get("assigned_user_id") else TaskStatus.new,
        assignment_type=assignment_type,
        assigned_user_id=data.get("assigned_user_id"),
        logist_contact_id=getattr(current_user, "telegram_id", None),
        client_price=final_client_price,
        montajnik_reward=final_montajnik_reward,
        logist_reward = final_logist_reward,
        is_draft=True,
        photo_required=data.get("photo_required", False),
        created_by=int(current_user.id),
        gos_number=data.get("gos_number"),
        user_company_id=current_user.company_id,
        district_id=district_id,  
    )

    db.add(task)
    await db.flush()


    for eq_item in equipment_data_raw:
        equipment_id = eq_item.get("equipment_id")
        serial_number = eq_item.get("serial_number")
        quantity = eq_item.get("quantity", 1)

        eq_res = await db.execute(select(Equipment).where(
            Equipment.id == equipment_id,
            Equipment.user_company_id == current_user.company_id
        ))
        equipment_obj = eq_res.scalars().first()
        if not equipment_obj:
            raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено или не принадлежит вашей компании")

        db.add(TaskEquipment(
            task_id=task.id,
            equipment_id=equipment_id,
            serial_number=serial_number,
            quantity=quantity,
        ))

    # === Сохранение видов работ ===
    for wt_id, count in work_type_counts.items():
        wt_res = await db.execute(select(WorkType).where(
            WorkType.id == wt_id,
            WorkType.user_company_id == current_user.company_id
        ))
        wt = wt_res.scalars().first()
        if not wt:
            raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден или не принадлежит вашей компании")

        db.add(TaskWork(
            task_id=task.id,
            work_type_id=wt_id,
            quantity=count,
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
            selectinload(Task.assigned_user),
            selectinload(Task.district),
        )
        .where(
            Task.id == draft_id,
            Task.is_draft == True,
            Task.user_company_id == current_user.company_id,
        )
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    contact_person_name = task.contact_person.name if task.contact_person else None

    equipment_items = [
        {
            "id": te.id, # ID записи TaskEquipment
            "equipment_id": te.equipment_id,
            "equipment_name": te.equipment.name, # Для удобства отображения
            "serial_number": te.serial_number, 
            "quantity": te.quantity, 
        }
        for te in task.equipment_links
    ]

    #   Формируем список work_types как TaskWorkItem
    work_type_items = [
        {
            "id": tw.id, # ID записи TaskWork
            "work_type_id": tw.work_type_id,
            "work_type_name": tw.work_type.name, # Для удобства отображения
            "quantity": tw.quantity, #   Новое поле
        }
        for tw in task.works
    ]

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None
    district_id = task.district.id if task.district else None
    district_name = task.district.name if task.district else None


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
        "district_id": district_id,      
        "district_name": district_name,
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

    _ensure_logist_or_403(current_user)

    # Загружаем черновик
    result = await db.execute(
        select(Task)
        .where(Task.id == draft_id, Task.is_draft == True, Task.user_company_id == current_user.company_id)
        .options(
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.district),  
        )
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Черновик не найден")

    data = payload.model_dump()

    # --- СБРОС district_id ПРИ СМЕНЕ НА individual ---
    if "assignment_type" in data:
        new_assignment_type = data["assignment_type"]
        if new_assignment_type == AssignmentType.individual and task.district_id is not None:
            old_district_id = task.district_id
            task.district_id = None
            logger.info(f"Сброшен district_id из-за смены типа на 'individual' (старое значение: {old_district_id})")

    # --- ОБРАБОТКА district_id ---
    if "district_id" in data:
        district_id = data["district_id"]
        if district_id is not None:
            # Проверяем, что район принадлежит компании пользователя
            district_check = await db.execute(
                select(District).where(
                    District.id == district_id,
                    District.user_company_id == current_user.company_id
                )
            )
            if not district_check.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Район не найден или не принадлежит вашей компании")
        task.district_id = district_id

    # --- ОБНОВЛЕНИЕ assigned_user_id и assignment_type ---
    if "assigned_user_id" in data:
        new_assigned_user_id = data["assigned_user_id"]
        if new_assigned_user_id is None:
            task.assigned_user_id = None
            if task.assignment_type != AssignmentType.broadcast:
                task.assignment_type = AssignmentType.broadcast
        else:
            task.assigned_user_id = new_assigned_user_id
            task.assignment_type = AssignmentType.individual

    # --- ОБНОВЛЕНИЕ КОНТАКТНОГО ЛИЦА ---
    if "contact_person_id" in data:
        contact_person_id = data["contact_person_id"]
        if contact_person_id:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")
            task.contact_person_id = contact_person_id
            task.company_id = contact_person.company_id
            task.contact_person_phone = contact_person.phone
        else:
            task.contact_person_id = None
            task.company_id = None
            task.contact_person_phone = None

    # --- ОБНОВЛЕНИЕ ОСТАЛЬНЫХ ПОЛЕЙ ---
    for key, value in data.items():
        if key in {
            "equipment", "work_types", "contact_person_id",
            "assigned_user_id", "district_id", "assignment_type"
        }:
            continue
        if hasattr(task, key):
            setattr(task, key, value)

    # --- ОБНОВЛЕНИЕ EQUIPMENT ---
    if "equipment" in data:
        # Удаляем старые
        await db.execute(delete(TaskEquipment).where(TaskEquipment.task_id == task.id))
        # Добавляем новые
        for item in data["equipment"]:
            eq_id = item.get("equipment_id")
            # Валидация оборудования
            eq_res = await db.execute(
                select(Equipment).where(
                    Equipment.id == eq_id,
                    Equipment.user_company_id == current_user.company_id
                )
            )
            if not eq_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail=f"Оборудование id={eq_id} не найдено")
            db.add(TaskEquipment(
                task_id=task.id,
                equipment_id=eq_id,
                serial_number=item.get("serial_number"),
                quantity=item.get("quantity", 1),
            ))

    # --- ОБНОВЛЕНИЕ WORK TYPES ---
    if "work_types" in data:
        await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
        work_type_counts = Counter(data["work_types"])
        for wt_id, count in work_type_counts.items():
            wt_res = await db.execute(
                select(WorkType).where(
                    WorkType.id == wt_id,
                    WorkType.user_company_id == current_user.company_id
                )
            )
            if not wt_res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))

    # --- ПЕРЕСЧЁТ ЦЕН ---
    calculated_client_price = Decimal('0')
    calculated_montajnik_reward = Decimal('0')
    calculated_logist_reward = Decimal('0')

    # Equipment
    eq_res = await db.execute(
        select(TaskEquipment)
        .options(selectinload(TaskEquipment.equipment))
        .where(TaskEquipment.task_id == task.id)
    )
    for te in eq_res.scalars():
        calculated_client_price += (te.equipment.price or Decimal('0')) * te.quantity

    # Work types
    wt_res = await db.execute(
        select(TaskWork)
        .options(selectinload(TaskWork.work_type))
        .where(TaskWork.task_id == task.id)
    )
    for tw in wt_res.scalars():
        calculated_client_price += (tw.work_type.client_price or Decimal('0')) * tw.quantity
        calculated_montajnik_reward += (tw.work_type.mont_price or Decimal('0')) * tw.quantity
        calculated_logist_reward += (tw.work_type.logist_price or Decimal('0')) * tw.quantity

    task.client_price = calculated_client_price
    task.montajnik_reward = calculated_montajnik_reward
    task.logist_reward = calculated_logist_reward

    try:
        await db.commit()
        logger.info("Черновик успешно обновлён")
        return {"detail": "Updated"}
    except Exception as e:
        logger.exception("Ошибка при обновлении черновика")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось обновить черновик")



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

    required_fields = {
        "contact_person_id": "Контактное лицо",
        "vehicle_info": "Информация о транспорте", 
        "scheduled_at": "Дата и время",
        "gos_number": "Гос. номер",
        "location": "Местоположение",
        "comment": "Комментарий",
        "work_types": "Виды работ",
    }

    # Проверяем, что у пользователя есть компания
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")

    # Для проверки используем актуальные данные - из черновика или из payload
    if draft_id:
        res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True, Task.user_company_id == current_user.company_id))
        existing_task = res.scalars().first()
        if not existing_task:
            raise HTTPException(status_code=404, detail="Черновик не найден или не принадлежит вашей компании")
        
        current_data = {
            "contact_person_id": existing_task.contact_person_id,
            "vehicle_info": existing_task.vehicle_info,
            "scheduled_at": existing_task.scheduled_at,
            "gos_number": existing_task.gos_number,
            "location": existing_task.location,
            "comment": existing_task.comment,
        }
        
        # Получаем связанные данные из черновика
        current_wt_res = await db.execute(
            select(TaskWork).where(TaskWork.task_id == existing_task.id)
        )
        current_work_items = current_wt_res.scalars().all()
        current_data["work_types"] = current_work_items
        
        current_eq_res = await db.execute(
            select(TaskEquipment).where(TaskEquipment.task_id == existing_task.id)
        )
        current_equipment_items = current_eq_res.scalars().all()
        current_data["equipment"] = current_equipment_items
        
    else:
        current_data = data

    missing_fields = []
    for field_name, field_label in required_fields.items():
        value = current_data.get(field_name)
        if field_name == "work_types":
            if not value or (hasattr(value, '__len__') and len(value) == 0):
                missing_fields.append(field_label)
        elif field_name == "comment":
            if value is None or (isinstance(value, str) and value.strip() == ""):
                missing_fields.append(field_label)
        else:
            if value is None:
                missing_fields.append(field_label)
    
    assignment_type = data.get("assignment_type")
    if assignment_type is None and draft_id:
        assignment_type = getattr(existing_task, "assignment_type", None)
    
    if assignment_type == AssignmentType.broadcast:
        district_id = data.get("district_id")
        if draft_id and district_id is None:
            district_id = getattr(existing_task, "district_id", None)
        if district_id is None:
            missing_fields.append("Регион")

    if missing_fields:
        raise HTTPException(status_code=400, detail=f"Заполните все поля!")

    if draft_id:
        res = await db.execute(select(Task).where(Task.id == draft_id, Task.is_draft == True, Task.user_company_id == current_user.company_id))
        task = res.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Черновик не найден или не принадлежит вашей компании")

        # Обновляем поля, кроме связей и рассчитанных цен (цены пересчитаем ниже)
        for key, value in data.items():
            if key in {"draft_id", "equipment", "work_types", "client_price", "montajnik_reward"}:
                continue # Пропускаем специальные поля
            if value is not None:
                setattr(task, key, value)

        if "district_id" not in data:
            data["district_id"] = task.district_id

        # Обработка поля district_id
        if "district_id" in data:
            district_id = data["district_id"]
            if district_id is not None:
                # Проверяем, что район принадлежит компании пользователя
                district_check = await db.execute(
                    select(District).where(
                        District.id == district_id,
                        District.user_company_id == current_user.company_id
                    )
                )
                if not district_check.scalar_one_or_none():
                    raise HTTPException(status_code=400, detail="Район не найден или не принадлежит вашей компании")
            task.district_id = district_id

        current_wt_res = await db.execute(
            select(TaskWork)
            .options(selectinload(TaskWork.work_type))
            .where(TaskWork.task_id == task.id)
        )
        current_work_items = current_wt_res.scalars().all()

        current_eq_res = await db.execute(
            select(TaskEquipment)
            .options(selectinload(TaskEquipment.equipment))
            .where(TaskEquipment.task_id == task.id)
        )
        current_equipment_items = current_eq_res.scalars().all()

        # --- Пересчёт Work Types ---
        work_types_ids_for_calc = []
        for tw in current_work_items:
            work_types_ids_for_calc.extend([tw.work_type_id] * tw.quantity)

        work_type_counts = Counter(work_types_ids_for_calc)
        work_types_ids_unique = list(work_type_counts.keys())

        calculated_works_cost_for_client = Decimal('0')
        calculated_works_cost_for_mont = Decimal('0')
        calculated_logist_reward = Decimal('0')
        if work_types_ids_unique:
            wt_res = await db.execute(
                select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True, WorkType.user_company_id == current_user.company_id)
            )
            work_types_from_db = wt_res.scalars().all()
            if len(work_types_from_db) != len(work_types_ids_unique):
                missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
                raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

            for wt in work_types_from_db:
                count = work_type_counts[wt.id]
                calculated_works_cost_for_client += (wt.client_price or Decimal('0')) * count
                calculated_works_cost_for_mont += (wt.mont_price or Decimal('0')) * count
                calculated_logist_reward += (wt.logist_price or Decimal('0')) * count

        # --- Пересчёт Equipment ---
        equipment_quantities = {}
        for te in current_equipment_items:
            eq_id = te.equipment_id
            qty = te.quantity
            equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

        calculated_equipment_cost = Decimal('0')
        if equipment_quantities:
            eq_res = await db.execute(
                select(Equipment).where(Equipment.id.in_(list(equipment_quantities.keys())), Equipment.user_company_id == current_user.company_id)
            )
            equipment_from_db = eq_res.scalars().all()
            if len(equipment_from_db) != len(equipment_quantities):
                missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
                raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

            for eq in equipment_from_db:
                qty = equipment_quantities[eq.id]
                calculated_equipment_cost += (eq.price or Decimal('0')) * qty

        task.client_price = calculated_works_cost_for_client + calculated_equipment_cost
        task.montajnik_reward = calculated_works_cost_for_mont
        task.logist_reward = calculated_logist_reward

        task.is_draft = False

        # --- СОЗДАНИЕ СНИМКОВ ОБОРУДОВАНИЯ И ВИДОВ РАБОТ ДЛЯ ИСТОРИИ ---
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
            comment=f"Задача #{task.id} опубликована",
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
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        ))

    else:
        # --- Прямая публикация (без черновика) ---
        contact_person_id = data.get("contact_person_id")
        gos_number = data.get("gos_number")
        district_id = data.get("district_id")

        company_id = None
        contact_person_phone = None
        if contact_person_id:
            cp_res = await db.execute(
                select(ContactPerson)
                .join(ClientCompany)  
                .where(
                    ContactPerson.id == contact_person_id, 
                    ClientCompany.user_company_id == current_user.company_id
                )
            )
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено или не принадлежит вашей компании")
            company_id = contact_person.company_id
            contact_person_phone = contact_person.phone

        work_types_ids_raw = data.get("work_types", [])
        equipment_data_raw = data.get("equipment", [])

        # --- Рассчёт цен для новой задачи ---
        work_type_counts = Counter(work_types_ids_raw)
        work_types_ids_unique = list(work_type_counts.keys())

        calculated_works_cost_for_client = Decimal('0')
        calculated_works_cost_for_mont = Decimal('0')
        calculated_logist_reward = Decimal('0')

        if work_types_ids_unique:
            wt_res = await db.execute(
                select(WorkType).where(WorkType.id.in_(work_types_ids_unique), WorkType.is_active == True, WorkType.user_company_id == current_user.company_id)
            )
            work_types_from_db = wt_res.scalars().all()
            if len(work_types_from_db) != len(work_types_ids_unique):
                missing = set(work_types_ids_unique) - {wt.id for wt in work_types_from_db}
                raise HTTPException(status_code=400, detail=f"Типы работ не найдены или неактивны: {list(missing)}")

            for wt in work_types_from_db:
                count = work_type_counts[wt.id]
                calculated_works_cost_for_client += (wt.client_price or Decimal('0')) * count
                calculated_works_cost_for_mont += (wt.mont_price or Decimal('0')) * count
                calculated_logist_reward += (wt.logist_price or Decimal('0')) * count

        equipment_quantities = {}
        for eq_item in equipment_data_raw:
            eq_id = eq_item.get("equipment_id")
            qty = eq_item.get("quantity", 1)
            equipment_quantities[eq_id] = equipment_quantities.get(eq_id, 0) + qty

        calculated_equipment_cost = Decimal('0')
        
        if equipment_quantities:
            eq_res = await db.execute(
                select(Equipment).where(Equipment.id.in_(list(equipment_quantities.keys())), Equipment.user_company_id == current_user.company_id)
            )
            equipment_from_db = eq_res.scalars().all()
            if len(equipment_from_db) != len(equipment_quantities):
                missing = set(equipment_quantities.keys()) - {eq.id for eq in equipment_from_db}
                raise HTTPException(status_code=400, detail=f"Оборудование не найдено: {list(missing)}")

            for eq in equipment_from_db:
                qty = equipment_quantities[eq.id]
                calculated_equipment_cost += (eq.price or Decimal('0')) * qty

        final_client_price = calculated_works_cost_for_client + calculated_equipment_cost
        final_montajnik_reward = calculated_works_cost_for_mont
        final_logist_reward = calculated_logist_reward

        if district_id is not None:
            district_check = await db.execute(
                select(District).where(
                    District.id == district_id,
                    District.user_company_id == current_user.company_id
                )
            )
            if not district_check.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Район не найден или не принадлежит вашей компании")

        task = Task(
            contact_person_id=contact_person_id,
            company_id=company_id,
            contact_person_phone=contact_person_phone,
            vehicle_info=data.get("vehicle_info"),
            scheduled_at=_parse_datetime(data.get("scheduled_at")),
            location=data.get("location"),
            comment=data.get("comment"),
            status=TaskStatus.assigned if data.get("assigned_user_id") else TaskStatus.new,
            assignment_type=_parse_assignment_type(data.get("assignment_type")),
            assigned_user_id=_normalize_assigned_user_id(data.get("assigned_user_id")),
            logist_contact_id=getattr(current_user, "telegram_id", None),
            client_price=final_client_price,
            montajnik_reward=final_montajnik_reward,
            logist_reward = final_logist_reward,
            is_draft=False,
            photo_required=data.get("photo_required", False),
            created_by=int(current_user.id),
            gos_number=gos_number,
            user_company_id=current_user.company_id,
            district_id=district_id  
        )

        db.add(task)
        await db.flush()

        equipment_snapshot_for_history = []
        for eq_item in equipment_data_raw:
            equipment_id = eq_item.get("equipment_id")
            serial_number = eq_item.get("serial_number")
            quantity = eq_item.get("quantity", 1)

            eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id, Equipment.user_company_id == current_user.company_id))
            equipment_obj = eq_res.scalars().first()
            if not equipment_obj:
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено или не принадлежит вашей компании")

            equipment_snapshot_for_history.append({
                "name": equipment_obj.name,
                "serial_number": serial_number,
                "quantity": quantity
            })

            db.add(TaskEquipment(
                task_id=task.id,
                equipment_id=equipment_id,
                serial_number=serial_number,
                quantity=quantity,
            ))

        work_types_snapshot_for_history = []
        for wt_id, count in work_type_counts.items():
            wt_res = await db.execute(select(WorkType).where(WorkType.id == wt_id, WorkType.user_company_id == current_user.company_id))
            wt = wt_res.scalars().first()
            if not wt:
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден или не принадлежит вашей компании")

            work_types_snapshot_for_history.append({
                "name": wt.name,
                "quantity": count
            })

            db.add(TaskWork(
                task_id=task.id,
                work_type_id=wt_id,
                quantity=count,
            ))

        db.add(TaskHistory(
            task_id=task.id,
            user_id=current_user.id,
            action=task.status,
            event_type=TaskHistoryEventType.created, 
            comment=f"Задача #{task.id} опубликована",
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
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        ))

    await db.commit()
    await db.refresh(task)

    if task.assignment_type == AssignmentType.broadcast:
        if task.district_id:
            montajniks_res = await db.execute(
                select(User.id).where(
                    User.role == Role.montajnik,
                    User.is_active == True,
                    User.company_id == current_user.company_id,
                    User.district_id == task.district_id
                )
            )
        else:
            montajniks_res = await db.execute(
                select(User.id).where(
                    User.role == Role.montajnik,
                    User.is_active == True,
                    User.company_id == current_user.company_id
                )
            )
    else:
        montajniks_res = await db.execute(select(User.id).where(User.id == -1))

    montajnik_ids = [row[0] for row in montajniks_res.fetchall()]
    
    for montajnik_id in montajnik_ids:
        await publish_notification(        
            user_id=montajnik_id,
            message=f"Новая задача #{task.id} опубликована в эфир",
            task_id=task.id,
        )

    if task.assigned_user_id:
        await publish_notification(        
            user_id=task.assigned_user_id,
            message=f"Вам назначена задача #{task.id}",
            task_id=task.id,
        )

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

    _ensure_logist_or_403(current_user)

    result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
        )
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.is_draft:
        raise HTTPException(status_code=400, detail="Нельзя редактировать черновик через этот эндпоинт — используйте /drafts")

    # Загружаем исходные данные для проверки
    original_patch_data = patch.model_dump()
    current_values = {
        "contact_person_id": task.contact_person_id,
        "vehicle_info": task.vehicle_info,
        "scheduled_at": task.scheduled_at,
        "gos_number": task.gos_number,
        "location": task.location,
        "comment": task.comment,
    }

    # Обновляем current_values значениями из patch, если они переданы (включая None)
    for field_name in ["contact_person_id", "vehicle_info", "scheduled_at", "gos_number", "location", "comment"]:
        if field_name in original_patch_data:
            current_values[field_name] = original_patch_data[field_name]

    if "work_types" in original_patch_data:
        work_types_value = original_patch_data["work_types"]
        if work_types_value is not None:
            current_values["work_types"] = len(work_types_value)  # Количество переданных ID
        else:
            current_values["work_types"] = 0
    else:
        # Если не передано, считаем текущее количество
        current_wt_count_res = await db.execute(
            select(func.count(TaskWork.id)).where(TaskWork.task_id == task.id)
        )
        current_values["work_types"] = current_wt_count_res.scalar_one()

    if "equipment" in original_patch_data:
        equipment_value = original_patch_data["equipment"]
        if equipment_value is not None:
            current_values["equipment"] = len(equipment_value)  # Количество переданных элементов
        else:
            current_values["equipment"] = 0
    else:
        # Если не передано, считаем текущее количество
        current_eq_count_res = await db.execute(
            select(func.count(TaskEquipment.id)).where(TaskEquipment.task_id == task.id)
        )
        current_values["equipment"] = current_eq_count_res.scalar_one()


    # Проверяем обязательные поля
    required_fields = {
        "contact_person_id": "Контактное лицо",
        "vehicle_info": "Информация о транспорте", 
        "scheduled_at": "Дата и время",
        "gos_number": "Гос. номер",
        "location": "Местоположение",
        "comment": "Комментарий",
        "work_types": "Виды работ",
    }

    missing_fields = []
    for field_name, field_label in required_fields.items():
        value = current_values.get(field_name)
        if field_name == "work_types":
            if value == 0:  # Если количество равно 0
                missing_fields.append(field_label)
        else:
            if value is None:
                missing_fields.append(field_label)

    if missing_fields:
        raise HTTPException(status_code=400, detail=f"Заполните все поля: {', '.join(missing_fields)}")


    incoming = original_patch_data  # Теперь используем оригинальный словарь

    # --- normalize assigned_user_id ---
    if "assigned_user_id" in incoming:
        incoming["assigned_user_id"] = _normalize_assigned_user_id(incoming["assigned_user_id"])

    equipment_data: List[TaskEquipmentItem] = incoming.pop("equipment", None)
    work_types_data = incoming.pop("work_types", None)
    logger.info(f"equipment_data: {equipment_data}, work_types_data: {work_types_data}")

    changed = []
    # --- Обработка assigned_user_id (может быть null) ---
    assigned_user_id_changed = False
    assignment_type_changed = False
    if "assigned_user_id" in incoming:
        new_assigned_user_id = incoming["assigned_user_id"]

        if new_assigned_user_id is None:
            old_val = task.assigned_user_id
            setattr(task, "assigned_user_id", None)

            if task.assignment_type != AssignmentType.broadcast:
                old_assignment_type_val = task.assignment_type
                setattr(task, "assignment_type", AssignmentType.broadcast)
                assignment_type_changed = True

            
            if task.status != TaskStatus.new:
                task.status = TaskStatus.new

            if old_val is not None:
                changed.append(("assigned_user_id", old_val, None))
                assigned_user_id_changed = True
            if assignment_type_changed:
                changed.append(("assignment_type", old_assignment_type_val, task.assignment_type))

            logger.info("assigned_user_id сброшен → статус возвращен в new")

        else: 
            old_val = task.assigned_user_id
            old_assignment_type_val = task.assignment_type
            setattr(task, "assigned_user_id", new_assigned_user_id)
            setattr(task, "assignment_type", AssignmentType.individual)
            assignment_type_changed = True
            user_id_was_replaced = (old_val is not None and old_val != new_assigned_user_id)

            if task.status == TaskStatus.new:
                task.status = TaskStatus.assigned
            elif user_id_was_replaced:
                if task.status in [TaskStatus.accepted, TaskStatus.on_the_road, TaskStatus.started, TaskStatus.on_site]:
                    task.status = TaskStatus.assigned
            if old_val != new_assigned_user_id:
                changed.append(("assigned_user_id", old_val, new_assigned_user_id))
                assigned_user_id_changed = True
            if old_assignment_type_val != AssignmentType.individual:
                changed.append(("assignment_type", old_assignment_type_val, AssignmentType.individual))
                assignment_type_changed = True
    

    if "assignment_type" in incoming:
        new_assignment_type = incoming["assignment_type"]
        if new_assignment_type == AssignmentType.individual and task.district_id is not None:
            old_district_id = task.district_id
            task.district_id = None
            changed.append(("district_id", old_district_id, None))
            district_id_changed = True  # если используется дальше
            logger.info("Сброс district_id из-за смены типа задачи на 'individual'")


    district_id_changed = False
    if "district_id" in incoming:
        new_district_id = incoming["district_id"]
        old_district_id = task.district_id

        if new_district_id is not None:
            # Проверяем, что район принадлежит компании пользователя
            district_check = await db.execute(
                select(District).where(
                    District.id == new_district_id,
                    District.user_company_id == current_user.company_id
                )
            )
            if not district_check.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Район не найден или не принадлежит вашей компании")
        task.district_id = new_district_id # Присваиваем район задаче
        if old_district_id != new_district_id:
            changed.append(("district_id", old_district_id, new_district_id))
            district_id_changed = True

    # --- Обновление прямых полей ---
    for field, value in incoming.items():
        if field in {"id", "created_at", "created_by", "is_draft", "equipment", "work_types", "district_id"}:
            continue

        old_val = getattr(task, field)
        old_cmp = old_val.value if hasattr(old_val, "value") else old_val
        new_cmp = value.value if hasattr(value, "value") else value

        logger.debug(f"Сравнение поля '{field}': DB={old_cmp}, Payload={new_cmp}")
        # --- СРАВНЕНИЕ: Проверяем, изменилось ли значение ---
        if str(old_cmp) != str(new_cmp):
            if field == "assignment_type" and isinstance(value, str):
                try:
                    value = AssignmentType(value)
                except Exception:
                    raise HTTPException(status_code=400, detail="Invalid assignment_type")
            setattr(task, field, value)
            changed.append((field, old_val, value))
            logger.info(f"Поле '{field}' помечено как изменённое: {old_cmp} -> {new_cmp}")


    # --- Обновление contact_person_id, company_id и contact_person_phone ---
    contact_person_changed = False
    if "contact_person_id" in incoming:
        contact_person_id = incoming["contact_person_id"]
        old_cp_id = task.contact_person_id
        old_co_id = task.company_id
        old_cp_phone = task.contact_person_phone

        if contact_person_id is not None:
            cp_res = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_person_id))
            contact_person = cp_res.scalars().first()
            if not contact_person:
                raise HTTPException(status_code=400, detail=f"Контактное лицо id={contact_person_id} не найдено")

            task.contact_person_id = contact_person_id
            task.company_id = contact_person.company_id
            task.contact_person_phone = contact_person.phone
        else:
            task.contact_person_id = None
            task.company_id = None
            task.contact_person_phone = None

        # --- СРАВНЕНИЕ: Проверяем, изменились ли значения ---
        if old_cp_id != task.contact_person_id or old_co_id != task.company_id or old_cp_phone != task.contact_person_phone:
            changed.append(("contact_person_id", old_cp_id, task.contact_person_id))
            changed.append(("company_id", old_co_id, task.company_id))
            changed.append(("contact_person_phone", old_cp_phone, task.contact_person_phone))
            contact_person_changed = True

        logger.info(f"Поле 'contact_person_id', 'company_id', 'contact_person_phone' обновлены")


    # --- Обновление оборудования ---
    equipment_changed = False
    if equipment_data is not None:
        # 1. Получаем существующие записи TaskEquipment для этой задачи
        existing_te_res = await db.execute(
            select(TaskEquipment).where(TaskEquipment.task_id == task.id)
        )
        existing_te_list = existing_te_res.scalars().all()
        existing_te_map = {te.id: te for te in existing_te_list}

        incoming_te_ids = set()

        # 2. Обрабатываем каждый пришедший элемент
        for item_data_dict in equipment_data:
            item_data: TaskEquipmentItem = item_data_dict if isinstance(item_data_dict, TaskEquipmentItem) else TaskEquipmentItem(**item_data_dict)

            item_id = item_data.id
            equipment_id = item_data.equipment_id
            serial_number = item_data.serial_number
            quantity = item_data.quantity

            eq_res = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
            equipment_obj = eq_res.scalars().first()
            if not equipment_obj:
                raise HTTPException(status_code=400, detail=f"Оборудование id={equipment_id} не найдено")

            if item_id:
                if item_id in existing_te_map:
                    te_record = existing_te_map[item_id]
                    if te_record.task_id != task.id:
                        raise HTTPException(status_code=400, detail=f"Запись оборудования id={item_id} не принадлежит задаче {task.id}")

                    # --- СРАВНЕНИЕ: Проверяем, изменились ли значения ---
                    if te_record.equipment_id != equipment_id or te_record.serial_number != serial_number or te_record.quantity != quantity:
                        te_record.equipment_id = equipment_id
                        te_record.serial_number = serial_number
                        te_record.quantity = quantity
                        equipment_changed = True

                    incoming_te_ids.add(item_id)
                    logger.info(f"Обновлена запись TaskEquipment id={item_id}")
                else:
                    raise HTTPException(status_code=400, detail=f"Запись TaskEquipment id={item_id} не найдена для задачи {task.id}")
            else:
                new_te = TaskEquipment(
                    task_id=task.id,
                    equipment_id=equipment_id,
                    serial_number=serial_number,
                    quantity=quantity
                )
                db.add(new_te)
                await db.flush()
                incoming_te_ids.add(new_te.id)
                equipment_changed = True
                logger.info(f"Создана новая запись TaskEquipment id={new_te.id}")

        # 3. Удаление записей, которых нет во входящих данных
        ids_to_delete = set(existing_te_map.keys()) - incoming_te_ids
        if ids_to_delete:
            delete_stmt = delete(TaskEquipment).where(TaskEquipment.id.in_(ids_to_delete))
            await db.execute(delete_stmt)
            equipment_changed = True
            logger.info(f"Удалены записи TaskEquipment ids={ids_to_delete}")

        if equipment_changed:
            changed.append(("equipment", "old_equipment_set", equipment_data))
            logger.info("Оборудование помечено как изменённое")

    # --- Обновление work_types ---
    work_types_changed = False
    if work_types_data is not None:
        # Подсчитываем количество для каждого типа работ
        work_type_counts = Counter(work_types_data)

        # 1. Удаляем все старые записи TaskWork
        await db.execute(delete(TaskWork).where(TaskWork.task_id == task.id))
        work_types_changed = True

        # 2. Создаем новые записи с учетом количества
        for wt_id, count in work_type_counts.items():
            res = await db.execute(select(WorkType).where(WorkType.id == wt_id))
            wt = res.scalars().first()
            if not wt:
                raise HTTPException(status_code=400, detail=f"Тип работы id={wt_id} не найден")
            db.add(TaskWork(task_id=task.id, work_type_id=wt_id, quantity=count))

        changed.append(("work_types", "old_work_set", work_types_data))
        logger.info("Типы работ помечены как изменённые")


    # --- Сохраняем старые значения для истории ---
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    old_contact_person_phone = task.contact_person.phone if task.contact_person else None
    old_client_price = task.client_price
    old_montajnik_reward = task.montajnik_reward
    old_logist_reward = task.logist_reward
    old_assigned_user_id = task.assigned_user_id
    old_assignment_type = task.assignment_type
    old_district_id = task.district_id

    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name}, contact_person_phone={old_contact_person_phone}, company={old_company_name}")


   
    calculated_client_price = Decimal('0')
    calculated_montajnik_reward = Decimal('0')
    calculated_logist_reward = Decimal('0')

    equipment_res = await db.execute(
        select(TaskEquipment)
        .options(selectinload(TaskEquipment.equipment))
        .where(TaskEquipment.task_id == task.id)
    )
    task_equipment_list = equipment_res.scalars().all()
    for te in task_equipment_list:
        equipment_unit_price = te.equipment.price or Decimal('0')
        calculated_client_price += equipment_unit_price * te.quantity

    work_res = await db.execute(
        select(TaskWork)
        .options(selectinload(TaskWork.work_type))
        .where(TaskWork.task_id == task.id)
    )
    task_work_list = work_res.scalars().all()
    for tw in task_work_list:
        work_client_unit_price = tw.work_type.client_price or Decimal('0') 
        work_mont_unit_price = tw.work_type.mont_price or Decimal('0') 
        work_logist_price = tw.work_type.logist_price or Decimal('0')
        calculated_client_price += work_client_unit_price * tw.quantity
        calculated_montajnik_reward += work_mont_unit_price * tw.quantity
        calculated_logist_reward += work_logist_price * tw.quantity
        


    prices_changed = False
    if task.client_price != calculated_client_price or task.montajnik_reward != calculated_montajnik_reward:
        old_client_price = task.client_price
        old_montajnik_reward = task.montajnik_reward
        old_logist_reward = task.logist_reward
        task.client_price = calculated_client_price
        task.montajnik_reward = calculated_montajnik_reward
        task.logist_reward = calculated_logist_reward
        prices_changed = True
        logger.info(f"Цены пересчитаны: client_price={calculated_client_price}, montajnik_reward={calculated_montajnik_reward}")

    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")

    has_changes = bool(changed)

    if not has_changes and not prices_changed:
        logger.info("Нет изменений (включая цены) для сохранения, возвращаем 'Без изменений'")
        return {"detail": "Без изменений"}
    else:
        logger.info("Обнаружены изменения (или изменились цены), продолжаем выполнение")

    try:
        # --- ПОЛУЧАЕМ НОВЫЕ ЗНАЧЕНИЯ ДЛЯ СНИМКОВ ---
        res_works = await db.execute(
            select(TaskWork)
            .options(selectinload(TaskWork.work_type))
            .where(TaskWork.task_id == task.id)
        )
        full_works_list = res_works.scalars().all()
        new_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in full_works_list]

        res_equip = await db.execute(
            select(TaskEquipment)
            .options(selectinload(TaskEquipment.equipment))
            .where(TaskEquipment.task_id == task.id)
        )
        full_equip_list = res_equip.scalars().all()
        new_equipment_with_sn_qty = [
            (te.equipment.name, te.serial_number, te.quantity) for te in full_equip_list
        ]

        new_contact_person_name = None
        new_company_name = None
        if task.contact_person_id:
            res_cp = await db.execute(
                select(ContactPerson)
                .options(selectinload(ContactPerson.company))
                .where(ContactPerson.id == task.contact_person_id)
            )
            new_contact_person_obj = res_cp.scalars().first()
            if new_contact_person_obj:
                new_contact_person_name = new_contact_person_obj.name
                new_company_name = new_contact_person_obj.company.name if new_contact_person_obj.company else None

        logger.info(f"Новые связи для задачи {task_id}: equipment={new_equipment_with_sn_qty}, work_types={new_works_with_qty}, contact_person={new_contact_person_name}, company={new_company_name}")

        # --- СОБИРАЕМ ВСЕ ИЗМЕНЕНИЯ ---
        all_changes = []
        for f, o, n in changed:
            if f not in ["equipment", "work_types", "contact_person_id", "company_id", "contact_person_phone"]:
                all_changes.append({"field": f, "old": o, "new": n})

        # Проверяем и добавляем изменения equipment
        if equipment_changed:
            all_changes.append({
                "field": "equipment",
                "old": old_equipment_with_sn_qty,
                "new": new_equipment_with_sn_qty
            })

        # Проверяем и добавляем изменения work_types
        if work_types_changed:
            all_changes.append({
                "field": "work_types",
                "old": old_works_with_qty,
                "new": new_works_with_qty
            })

        # Проверяем изменения contact_person и company
        if contact_person_changed:
            old_cp_co = f"{old_contact_person_name} ({old_company_name})" if old_contact_person_name and old_company_name else "—"
            new_cp_co = f"{new_contact_person_name} ({new_company_name})" if new_contact_person_name and new_company_name else "—"
            all_changes.append({"field": "contact_person", "old": old_cp_co, "new": new_cp_co})

        # Проверяем изменения assigned_user_id и assignment_type
        if assigned_user_id_changed:
            all_changes.append({
                "field": "assigned_user_id",
                "old": old_assigned_user_id,
                "new": task.assigned_user_id
            })
        if assignment_type_changed:
            all_changes.append({
                "field": "assignment_type",
                "old": old_assignment_type.value if old_assignment_type else None,
                "new": task.assignment_type.value if task.assignment_type else None
            })

        # Проверяем изменения district_id
        if district_id_changed:
            all_changes.append({
                "field": "district_id",
                "old": old_district_id,
                "new": task.district_id
            })

        # Проверяем изменения цен
        if prices_changed:
            all_changes.append({
                "field": "client_price",
                "old": old_client_price,
                "new": task.client_price
            })
            all_changes.append({
                "field": "montajnik_reward",
                "old": old_montajnik_reward,
                "new": task.montajnik_reward
            })

        logger.info(f"Список 'all_changes' для истории: {all_changes}")

        comment = "Задача обновлена"
        logger.info(f"Комментарий для истории (костыль): {comment}")

        # --- СОЗДАНИЕ СНИМКОВ ДЛЯ ИСТОРИИ ---
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
            event_type=TaskHistoryEventType.updated,
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            gos_number=task.gos_number,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment,
            status=task.status.value if task.status else None,
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price),
            montajnik_reward=str(task.montajnik_reward),
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
            equipment_snapshot=equipment_snapshot_for_history,
            work_types_snapshot=work_types_snapshot_for_history,
        )
        db.add(hist)
        await db.flush()
        logger.info("Запись в TaskHistory добавлена и зафлашена")

        await db.commit()
        logger.info("Транзакция успешно зафиксирована")

    except Exception as e:
        logger.exception("Failed to update task: %s", e)
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to update task")

    if task.assigned_user_id:
        await publish_notification(        
            user_id=task.assigned_user_id,
            message=f"Задача #{task_id} была обновлена",
            task_id=task.id,
        )

        

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

    # load task WITH equipment, work_types and contact_person/company for snapshot and check for tech_supp_required
    t_res = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.contact_person).selectinload(ContactPerson.company),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type)
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

    # Флаг для отслеживания перехода в completed
    task_completed = False

    # set approval based on role
    if getattr(current_user, "role", None) == Role.logist:
        report.approval_logist = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    elif getattr(current_user, "role", None) == Role.tech_supp:
        report.approval_tech = ReportApproval.approved if approval == "approved" else ReportApproval.rejected
    report.review_comment = comment
    report.reviewed_at_logist = datetime.now(timezone.utc)

    if approval == "rejected" and getattr(current_user, "role", None) == Role.logist:
        # Устанавливаем статус задачи как возвращенный при отклонении логистом
        task.status = TaskStatus.returned
        
        # Создаем запись в истории
        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(current_user, "id", None),
            action=TaskStatus.returned,
            event_type=TaskHistoryEventType.report_status_changed,
            comment=f"Отчет отклонен логистом. Комментарий: {comment}" if comment else "Отчет отклонен логистом",
            company_id=task.company_id,
            contact_person_id=task.contact_person_id,
            contact_person_phone=task.contact_person_phone,
            vehicle_info=task.vehicle_info,
            gos_number=task.gos_number,
            scheduled_at=task.scheduled_at,
            location=task.location,
            comment_field=task.comment,
            status=task.status.value if task.status else None,
            assigned_user_id=task.assigned_user_id,
            client_price=str(task.client_price) if task.client_price is not None else None,
            montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
            photo_required=task.photo_required,
            assignment_type=task.assignment_type.value if task.assignment_type else None,
            field_name="status",
            old_value=task.status.value if task.status else None,
            new_value=TaskStatus.returned.value,
            related_entity_id=report.id,
            related_entity_type="report",
            equipment_snapshot=[
                {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
                for te in task.equipment_links
            ],
            work_types_snapshot=[
                {"name": tw.work_type.name, "quantity": tw.quantity}
                for tw in task.works
            ],
        )
        db.add(hist)

    try:
        # if both approved -> finalize task
        if not requires_tech_review and report.approval_logist == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.manager_status = ManagerStatus.invoice_not_issued
            task.logist_performance = LogistPerformance.good
            task.created_by = current_user.id
            task.completed_at = datetime.now(timezone.utc)
            task_completed = True
            

            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=TaskStatus.completed,
                event_type=TaskHistoryEventType.report_status_changed,
                comment="Логист проверил задачу",
                company_id=task.company_id,
                contact_person_id=task.contact_person_id,
                contact_person_phone=task.contact_person_phone,
                vehicle_info=task.vehicle_info,
                gos_number=task.gos_number,
                scheduled_at=task.scheduled_at,
                location=task.location,
                comment_field=task.comment,
                status=task.status.value if task.status else None,
                assigned_user_id=task.assigned_user_id,
                client_price=str(task.client_price) if task.client_price is not None else None,
                montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
                photo_required=task.photo_required,
                assignment_type=task.assignment_type.value if task.assignment_type else None,
                field_name="status",
                old_value=task.status.value if task.status else None,
                new_value=TaskStatus.completed.value,
                related_entity_id=report.id,
                related_entity_type="report",
                equipment_snapshot=[
                    {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
                    for te in task.equipment_links
                ],
                work_types_snapshot=[
                    {"name": tw.work_type.name, "quantity": tw.quantity}
                    for tw in task.works
                ],
            )
            db.add(hist)

        elif requires_tech_review and report.approval_tech == ReportApproval.approved and report.approval_logist == ReportApproval.approved:
            task.status = TaskStatus.completed
            task.manager_status = ManagerStatus.invoice_not_issued
            task.logist_performance = LogistPerformance.good
            task.completed_at = datetime.now(timezone.utc)
            task.created_by = current_user.id
            task_completed = True
            

            hist = TaskHistory(
                task_id=task.id,
                user_id=getattr(current_user, "id", None),
                action=TaskStatus.completed,
                event_type=TaskHistoryEventType.report_status_changed,
                comment="Задача проверена тех.спецом и логистом",
                company_id=task.company_id,
                contact_person_id=task.contact_person_id,
                contact_person_phone=task.contact_person_phone,
                vehicle_info=task.vehicle_info,
                gos_number=task.gos_number,
                scheduled_at=task.scheduled_at,
                location=task.location,
                comment_field=task.comment,
                status=task.status.value if task.status else None,
                assigned_user_id=task.assigned_user_id,
                client_price=str(task.client_price) if task.client_price is not None else None,
                montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
                photo_required=task.photo_required,
                assignment_type=task.assignment_type.value if task.assignment_type else None,
                field_name="status",
                old_value=task.status.value if task.status else None,
                new_value=TaskStatus.completed.value,
                related_entity_id=report.id,
                related_entity_type="report",
                equipment_snapshot=[
                    {"name": te.equipment.name, "serial_number": te.serial_number, "quantity": te.quantity}
                    for te in task.equipment_links
                ],
                work_types_snapshot=[
                    {"name": tw.work_type.name, "quantity": tw.quantity}
                    for tw in task.works
                ],
            )
            db.add(hist)
        else:
            action = TaskStatus.inspection
            task.created_by = current_user.id
            hist_comment = f"Отчет проверен логистом"
            if comment:
                hist_comment += f". Комментарий: {comment}"

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
                action=action,
                event_type=TaskHistoryEventType.report_status_changed,
                comment=hist_comment,
                company_id=task.company_id,
                contact_person_id=task.contact_person_id,
                contact_person_phone=task.contact_person_phone,
                vehicle_info=task.vehicle_info,
                gos_number=task.gos_number,
                scheduled_at=task.scheduled_at,
                location=task.location,
                comment_field=task.comment,
                status=task.status.value if task.status else None,
                assigned_user_id=task.assigned_user_id,
                client_price=str(task.client_price) if task.client_price is not None else None,
                montajnik_reward=str(task.montajnik_reward) if task.montajnik_reward is not None else None,
                photo_required=task.photo_required,
                assignment_type=task.assignment_type.value if task.assignment_type else None,
                field_name="report_approval",
                old_value=f"logist:{old_approval_logist.value if old_approval_logist else 'None'}, tech:{old_approval_tech.value if old_approval_tech else 'None'}",
                new_value=f"logist:{report.approval_logist.value}, tech:{report.approval_tech.value}",
                related_entity_id=report.id,
                related_entity_type="report",
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

    # Уведомление монтажнику
    if task.assigned_user_id:
        both_approved = (report.approval_logist == ReportApproval.approved and 
                        report.approval_tech == ReportApproval.approved)
        
        if both_approved:
            montajnik_msg = f"Работы по задаче {task_id} проверены и выполнены"
        else:
            if approval == "approved":
                status_msg = "принят логистом"
            else:
                status_msg = "отправлен на доработку"
            
            montajnik_msg = f"Отчет по задаче {task_id} {status_msg}"
            if comment:
                montajnik_msg += f". Комментарий: {comment}"
        

        await publish_notification(        
            user_id=task.assigned_user_id,
            message=f"{montajnik_msg}",
            task_id=task.id,
        )

        
    if (
        current_user.role == Role.logist
        and report.approval_tech == ReportApproval.waiting
        and requires_tech_review
    ):
        tech_q = await db.execute(
            select(User).where(
                User.role == Role.tech_supp, 
                User.is_active == True,
                User.company_id == current_user.company_id
            )
        )
        techs = tech_q.scalars().all()
        for tuser in techs:
            await publish_notification(        
            user_id=tuser.id,
            message=f"Отчёт по задаче #{task_id} ожидает вашей проверки.",
            task_id=task.id,
        )

   
    if task_completed:
        managers_q = await db.execute(
            select(User).where(
                User.role == Role.manager,
                User.is_active == True,
                User.company_id == current_user.company_id
            )
        )
        managers = managers_q.scalars().all()
        
       
        for manager in managers:
            await publish_notification(        
                user_id=manager.id,
                message=f"Работы по задаче #{task_id} завершены. Требуется проверка менеджера.",
                task_id=task.id,
            )

            

    return {"detail": "Reviewed", "approval": approval}




@router.get("/tasks/active")
async def logist_active(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    count_query = select(func.count(Task.id)).where(
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
        Task.is_draft == False,
        Task.user_company_id == current_user.company_id  
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    tasks_query = select(Task).where(
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
        Task.is_draft == False,
        Task.created_by == current_user.id,
        Task.user_company_id == current_user.company_id  
    ).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company),
        selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
    )
    res = await db.execute(tasks_query)
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
            "client_name": client_name,  
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

@router.get("/drafts")
async def get_all_dafts(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    q = select(Task).where(
        Task.is_draft == True,
        Task.status != TaskStatus.completed,
        Task.user_company_id == current_user.company_id,
        Task.user_company_id == current_user.company_id  
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

        # Формируем список оборудования
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
            "client_name": client_name,  #   Используем client_name
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "equipment": equipment,  #   Добавляем оборудование
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


@router.get("/tasks_logist/filter", summary="Фильтрация задач")
async def logist_filter_tasks(
    status: Optional[str] = Query(None, description="Статусы через запятую"),
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)  
):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    query = select(Task).where(
        Task.is_draft != True,
        Task.user_company_id == current_user.company_id  
    )

    if status:
        status_list = [TaskStatus(s) for s in status.split(",") if s]
        if status_list:
            query = query.where(Task.status.in_(status_list))
    else:
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

        if search.isdigit():
            conditions.append(Task.id == int(search))

        combined_search_condition = or_(*conditions)
        query = query.where(combined_search_condition)

    status_order = case(
        (Task.status == TaskStatus.inspection, 1),
        (Task.status == TaskStatus.returned, 2),
        (Task.status == TaskStatus.new, 3),
        (Task.status == TaskStatus.assigned, 4),
        (Task.status == TaskStatus.accepted, 5),
        (Task.status == TaskStatus.on_the_road, 6),
        (Task.status == TaskStatus.on_site, 7),
        (Task.status == TaskStatus.started, 8),
        else_=99
    )
    query = query.order_by(status_order)

    query = query.options(
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
            "equipment": equipment,
        })

    return out



@router.get("/completed-tasks/filter", summary="Фильтрация завершенных задач (логист)")
async def logist_filter_completed_tasks(
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = select(Task).where(
        Task.user_company_id == current_user.company_id,
        Task.status == TaskStatus.completed
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

    if task_id is not None:
        query = query.where(Task.id == task_id)

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

        if search.isdigit():
            conditions.append(Task.id == int(search))
        
        combined_search_condition = or_(*conditions)
        query = query.where(combined_search_condition)

    manager_status_order = case(
        (Task.manager_status == ManagerStatus.invoice_not_issued, 1),
        (Task.manager_status == ManagerStatus.invoice_issued, 2),
        (Task.manager_status == ManagerStatus.cash_payment, 3),
        (Task.manager_status == ManagerStatus.warranty, 4),
        else_=99
    )

    query = query.order_by(manager_status_order)

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
            "manager_status": t.manager_status.value if t.manager_status else None,
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


@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_task_full_history(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user) 
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




@router.get("/tasks/{task_id}")
async def task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
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
        .where(Task.id == task_id)
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

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
            "ts": str(h.timestamp)
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
        "reports": reports or None,
        "requires_tech_supp": requires_tech_supp,
        "district_id": district_id, 
        "district_name": district_name 
    }




@router.get("/equipment")
async def get_equipment(db:AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    result = await db.execute(
        select(Equipment)
        .where(Equipment.user_company_id == current_user.company_id)  
    )
    equipment_list = result.scalars().all()
    return [{"id": eq.id, "name": eq.name} for eq in equipment_list]    


@router.get("/work-types")
async def get_work_types(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    result = await db.execute(
        select(WorkType)
        .where(WorkType.user_company_id == current_user.company_id)  
    )
    work_types = result.scalars().all()
    return [{"id": wt.id, "name": wt.name, "client_price": str(wt.client_price) , "mont_price": str(wt.mont_price)} for wt in work_types]
    


@router.get("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin,Role.tech_supp,Role.montajnik,Role.manager))])
async def get_companies(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    res = await db.execute(
        select(ClientCompany)
        .where(ClientCompany.user_company_id == current_user.company_id)  
    )
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def get_contact_persons(company_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ContactPerson).where(ContactPerson.company_id == company_id))
    contacts = res.scalars().all()
    return [{"id": c.id, "name": c.name, "phone": c.phone, "position": c.position, "company_id": c.company_id} for c in contacts]


@router.post("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def add_company(
    payload: dict = Body(...), 
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Название компании обязательно")
    
    company = ClientCompany(
        name=name,
        user_company_id=current_user.company_id  
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return {"id": company.id, "name": company.name}


@router.post("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def add_contact_person(company_id: int, payload: dict = Body(...), db: AsyncSession = Depends(get_db)):
    name = payload.get("name")
    phone = payload.get("phone") 
    position = payload.get("position")


    if not name:
        raise HTTPException(status_code=400, detail="ФИО контактного лица обязательно")
    res = await db.execute(select(ClientCompany).where(ClientCompany.id == company_id))
    company = res.scalars().first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    contact = ContactPerson(company_id=company_id, name=name, phone=phone, position = position) 
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return {"id": contact.id, "name": contact.name, "phone": contact.phone, "position": contact.position} 



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


@router.patch("/companies/{company_id}", dependencies=[Depends(require_roles(Role.logist))])
async def admin_update_company(
    company_id: int,
    payload: UpdateCompanyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ClientCompany).where(ClientCompany.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    if payload.name is not None:
        company.name = payload.name

    await db.commit()
    await db.refresh(company)

    return {
        "id": company.id,
        "name": company.name,
    }

@router.patch("/contact-persons/{contact_id}", dependencies=[Depends(require_roles(Role.logist))])
async def logist_update_contact_person(
    contact_id: int,
    payload: UpdateContactPersonRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContactPerson).where(ContactPerson.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Контактное лицо не найдено")

    if payload.name is not None:
        contact.name = payload.name
    if payload.position is not None:
        contact.position = payload.position
    if payload.phone is not None:
        contact.phone = payload.phone
    if payload.company_id is not None:
        company_result = await db.execute(select(ClientCompany).where(ClientCompany.id == payload.company_id))
        company = company_result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Новая компания не найдена")
        contact.company_id = payload.company_id

    await db.commit()
    await db.refresh(contact)
    result_with_company = await db.execute(
        select(ContactPerson, ClientCompany.name)
        .join(ClientCompany, ContactPerson.company_id == ClientCompany.id)
        .where(ContactPerson.id == contact_id)
    )
    updated_contact, company_name = result_with_company.first()

    return {
        "id": updated_contact.id,
        "name": updated_contact.name,
        "position": updated_contact.position,
        "phone": updated_contact.phone,
        "company_id": updated_contact.company_id,
        "company_name": company_name,
    }


@router.get("/me")
async def logist_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_logist_or_403(current_user)
    q = select(Task).options(
        selectinload(Task.company), 
        selectinload(Task.contact_person) 
    ).where(
        Task.user_company_id == current_user.company_id,
        Task.status == TaskStatus.completed
    ).order_by(desc(Task.id))  
    res = await db.execute(q)
    completed = res.scalars().all()
    
    
    logist_completed_tasks = [t for t in completed if t.created_by == current_user.id]
    
    if logist_completed_tasks:
        good_tasks = [t for t in logist_completed_tasks if t.logist_performance == LogistPerformance.good]
        efficiency = (len(good_tasks) / len(logist_completed_tasks)) * 100
    else:
        efficiency = 0
    
   
    draft_query = select(func.count(Task.id)).where(
        Task.user_company_id == current_user.company_id,
        Task.is_draft == True
    )
    draft_res = await db.execute(draft_query)
    draft_count = draft_res.scalar() or 0
    
    archived_query = select(func.count(Task.id)).where(
        Task.user_company_id == current_user.company_id,
        Task.status == TaskStatus.archived
    )
    archived_res = await db.execute(archived_query)
    archived_count = archived_res.scalar() or 0
    
    total = sum([float(t.client_price or 0) for t in completed])
    
    history = []
    for t in completed: 
        history.append({
            "id": t.id,
            "client": t.company.name if t.company else "—", 
            "contact_person": t.contact_person.name if t.contact_person else "—", 
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        })
    
    return {
        "id": current_user.id,
        "name": current_user.name,
        "lastname": current_user.lastname,
        "role": current_user.role.value if current_user.role else None,
        "completed_count": len(completed),
        "draft_count": draft_count,
        "archived_count": archived_count,
        "total_earned": str(round(total, 2)),
        "efficiency": round(efficiency, 2),  
        "logist_completed_count": len(logist_completed_tasks),  # Количество задач, созданных этим логистом
        "history": history,
    }




@router.get("/completed-tasks/{task_id}")
async def logist_completed_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    _ensure_logist_or_403(current_user) 

    res = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.contact_person).selectinload(ContactPerson.company), #   Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
        )
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id,
            Task.status == TaskStatus.completed
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
        "requires_tech_supp":requires_tech_supp
    }


@router.get("/montajniks", dependencies=[Depends(require_roles(Role.logist, Role.admin,Role.montajnik,Role.tech_supp))])
async def get_active_montajniks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)  
):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Пользователь должен принадлежать компании")
    
    res = await db.execute(
        select(User)
        .where(
            User.role == Role.montajnik, 
            User.is_active == True,
            User.company_id == current_user.company_id  
        ) 
        .order_by(User.name, User.lastname) 
    )
    montajniks = res.scalars().all()
    return [{"id": m.id, "name": m.name, "lastname": m.lastname} for m in montajniks]



@router.patch("/tasks/{task_id}/archive", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def archive_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
  
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
            event_type=TaskHistoryEventType.status_changed, #   Новый тип
            comment=f"Задача перенесена в архив",
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


@router.post("/tasks/{task_id}/unarchive", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def unarchive_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_logist_or_403(current_user)

    res = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.status == TaskStatus.archived) 
  
    )
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена или не архивирована")

    task.is_draft = True
    task.status = TaskStatus.assigned if task.assigned_user_id else TaskStatus.new

    try:
        await db.commit() 
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            logger.exception("rollback failed")
        raise HTTPException(status_code=500, detail="Failed to unarchive task")

    return {"detail": "Unarchived and moved to drafts"}





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
            Task.user_company_id == current_user.company_id
        ).options(
        selectinload(Task.contact_person).selectinload(ContactPerson.company),
        selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
    )
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
            "vehicle_info": t.vehicle_info,
            "gos_number": t.gos_number,
            "client": client_display,
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "client_price": t.client_price,
            "montajnik_reward": t.montajnik_reward,
            "equipment": equipment,
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
            selectinload(Task.contact_person).selectinload(ContactPerson.company), #   Загружаем контактное лицо и компанию
            selectinload(Task.assigned_user)
        )
        .where(
            Task.id == task_id,
            Task.user_company_id == current_user.company_id, 
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


@router.get("/districts/simple", response_model=List[SimpleDistrictResponse], dependencies=[Depends(require_roles(Role.admin, Role.logist))])
async def get_simple_districts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
         raise HTTPException(status_code=403, detail="Пользователь не привязан к компании")

    districts_query = select(District.id, District.name).where(
        District.user_company_id == current_user.company_id
    ).order_by(District.name)

    result = await db.execute(districts_query)
    districts = result.all() #

    return [{"id": d.id, "name": d.name} for d in districts] 



@router.get("/earnings-by-period", summary="Заработок логиста за период")
async def logist_earnings_by_period(
    start_year: Optional[int] = Query(None),
    start_month: Optional[int] = Query(None),
    end_year: Optional[int] = Query(None),
    end_month: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if start_year is None or start_month is None or end_year is None or end_month is None:
        current_date = date.today()
        start_year = current_date.year
        start_month = current_date.month
        end_year = current_date.year
        end_month = current_date.month

    start_date = datetime(start_year, start_month, 1)
    end_day = calendar.monthrange(end_year, end_month)[1]
    end_date_exclusive = datetime(end_year, end_month, end_day) + timedelta(days=1)

    if start_date >= end_date_exclusive:
        raise HTTPException(status_code=400, detail="Начальная дата не может быть позже конечной")

    query = select(func.sum(Task.logist_reward)).where(
        Task.created_by == current_user.id,
        Task.user_company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= start_date,
        Task.completed_at < end_date_exclusive
    )
    result = await db.execute(query)
    total_earned = result.scalar() or 0

    count_query = select(func.count(Task.id)).where(
        Task.created_by == current_user.id,
        Task.user_company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= start_date,
        Task.completed_at < end_date_exclusive
    )
    count_result = await db.execute(count_query)
    task_count = count_result.scalar() or 0

    end_date_display = date(end_year, end_month, end_day)

    return {
        "period": f"{start_year}-{start_month:02d} - {end_year}-{end_month:02d}",
        "total_earned": str(total_earned),
        "task_count": task_count,
        "start_date": start_date.date().isoformat(),
        "end_date": end_date_display.isoformat()
    }