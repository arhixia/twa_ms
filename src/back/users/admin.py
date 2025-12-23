from datetime import datetime, timezone
from decimal import Decimal
import enum
import json
from fastapi import APIRouter, Body,Depends,HTTPException, Query,status
from sqlalchemy import and_, desc, func, or_, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from back.db.database import get_db
from back.db.models import AssignmentType, ClientCompany, ContactPerson, Equipment, FileType, TaskAttachment, TaskEquipment, TaskHistory, TaskHistoryEventType, TaskReport, TaskStatus, TaskWork, User,Role as RoleEnum,Task, WorkType,Role
from back.auth.auth import get_current_user,create_user as auth_create_user, get_password_hash
from back.auth.auth_schemas import UserCreate,UserResponse,UserBase,RoleChange
from back.users.users_schemas import SimpleMsg, TaskEquipmentItem, TaskHistoryItem, TaskPatch, TaskUpdate, require_roles, UpdateEquipmentRequest,UpdateWorkTypeRequest,UpdateCompanyRequest,UpdateContactPersonRequest, UpdateUserRequest
from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from typing import Any, Counter, Dict, Optional
from sqlalchemy.orm import selectinload
from back.users.logist import FIELD_TRANSLATIONS_RU,format_value_rus,build_changes_summary_ru
import logging
from typing import Any, Dict, List

from back.utils.notify import notify_user
from back.files.handlers import delete_object_from_s3, validate_and_process_attachment
from back.users.logist import _attach_storage_keys_to_task, _normalize_assigned_user_id

logger = logging.getLogger(__name__)
router = APIRouter()



def _ensure_admin_or_403(user: User):
    if getattr(user, "role", None) != Role.admin:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    

@router.get("/me")
async def admin_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Личный кабинет администратора:
    - ID, имя, фамилия, роль
    """
    _ensure_admin_or_403(current_user) # Убедимся, что пользователь - админ

    return {
        "id": current_user.id,
        "name": current_user.name,
        "lastname": current_user.lastname,
        "role": current_user.role.value if current_user.role else None,
        # Дополнительные поля можно добавить сюда при необходимости
    }




async def require_admin(current_user:User=Depends(get_current_user)) -> User:
    if current_user.role != RoleEnum.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,detail="Недастаточно прав пользователя")
    return current_user



@router.get("/users", response_model=List[UserResponse], summary="Список всех пользователей (только админ)")
async def admin_list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    q = await db.execute(select(User))
    users = q.scalars().all()
    return [UserResponse.model_validate(u) for u in users]



@router.post("/users",response_model=UserResponse,status_code=status.HTTP_201_CREATED,summary="Создать пользователя (только админ)")
async def admin_create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin)
):
    # Проверка уникальности login
    q = await db.execute(select(User).where(User.login == user_in.login))
    if q.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Login уже занят")
    
    # Проверка уникальности telegram_id, если он указан
    if user_in.telegram_id is not None:
        q = await db.execute(select(User).where(User.telegram_id == user_in.telegram_id))
        if q.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telegram ID уже используется")
    
    new_user = await auth_create_user(db=db,user_in=user_in)

    await db.refresh(new_user)
    return UserResponse.model_validate(new_user)

@router.patch("/users/{user_id}", dependencies=[Depends(require_roles(Role.admin))])
async def admin_update_user(
    user_id: int,
    payload: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Проверка прав
    if current_user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if payload.login is not None and payload.login != user.login:
        existing_user_result = await db.execute(select(User).where(User.login == payload.login))
        existing_user = existing_user_result.scalars().first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Логин уже занят другим пользователем.")
        
    if payload.name is not None:
        user.name = payload.name
    if payload.lastname is not None:
        user.lastname = payload.lastname
    if payload.login is not None:
        user.login = payload.login
    if payload.password is not None:
        # Хэшируем новый пароль
        user.hashed_password = get_password_hash(payload.password)
    if payload.role is not None:
        # Проверим, что роль валидна
        try:
            new_role = Role(payload.role)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверная роль.")
        user.role = new_role

    await db.commit()
    await db.refresh(user)

    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "name": user.name,
        "lastname": user.lastname,
        "role": user.role.value,
        "is_active": user.is_active,
        "login": user.login,
    }

@router.delete(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Удалить пользователя (только админ)"
)
async def admin_delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin)
):
    q = await db.execute(select(User).where(User.id == user_id))
    user = q.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    
    await db.delete(user)
    db.commit()
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}/deactivate", dependencies=[Depends(require_roles(Role.admin))])
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Деактивировать пользователя (установить is_active = False).
    """
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Нельзя деактивировать самого себя
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя изменить статус себе")

    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return UserBase.model_validate(user)


@router.patch("/users/{user_id}/activate", dependencies=[Depends(require_roles(Role.admin))])
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Активировать пользователя (установить is_active = True).
    """
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Нельзя активировать самого себя (скорее всего не нужно, но для консистентности)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя изменить статус себе")

    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return UserBase.model_validate(user)

@router.patch(
    "/users/{user_id}/role",
    response_model=UserResponse,
    summary="Изменить роль пользователя (только админ)"
)
async def admin_change_role(
    user_id: int,
    role_in: RoleChange,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = await db.execute(select(User).where(User.id == user_id))
    user = q.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    # Присваиваем роль, сохраняя тип RoleEnum
    try:
        user.role = RoleEnum(role_in.role.value) if hasattr(role_in.role, "value") else RoleEnum(role_in.role)
    except Exception:
        # fallback: если role_in.role уже является строкой
        user.role = RoleEnum(role_in.role)

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/tasks/{task_id}", summary="Админ может изменить поля заявки (включая оборудование, виды работ, вложения)")
async def admin_update_task(
    background_tasks: BackgroundTasks,
    task_id: int,
    patch: TaskPatch = Body(...),
    db: AsyncSession = Depends(get_db),
    admin_user=Depends(require_admin),
):
    logger.info(f"admin_update_task вызван для задачи ID: {task_id}")

    # Загружаем задачу с контактным лицом, компанией, оборудованием и видами работ для истории
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.contact_person).selectinload(ContactPerson.company) # ✅ Загружаем контактное лицо и компанию
        )
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.is_draft:
        raise HTTPException(status_code=400, detail="Нельзя редактировать черновик через этот эндпоинт — используйте /drafts")

    # --- СОХРАНЯЕМ СТАРЫЕ ЗНАЧЕНИЯ ---
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    old_contact_person_phone = task.contact_person.phone if task.contact_person else None
    old_client_price = task.client_price
    old_montajnik_reward = task.montajnik_reward
    old_assigned_user_id = task.assigned_user_id
    old_assignment_type = task.assignment_type

    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name}, contact_person_phone={old_contact_person_phone}, company={old_company_name}")

    incoming = {k: v for k, v in patch.model_dump().items() if v is not None}
    logger.info(f"Полный incoming dict: {incoming}")

    # --- normalize assigned_user_id ---
    if "assigned_user_id" in incoming:
        incoming["assigned_user_id"] = _normalize_assigned_user_id(incoming["assigned_user_id"])

    equipment_data: List[TaskEquipmentItem] = incoming.pop("equipment", None)
    work_types_data = incoming.pop("work_types", None)
    logger.info(f"equipment_data: {equipment_data}, work_types_data: {work_types_data}")

    payload_dict = patch.model_dump() # Это включает null-значения

    incoming_with_nulls = {}
    for k, v in payload_dict.items():
        if k not in {"equipment", "work_types"}:
            incoming_with_nulls[k] = v
            
    changed = [] # <--- Список изменений
    # --- Обработка assigned_user_id (может быть null) ---
    assigned_user_id_changed = False
    assignment_type_changed = False
    if "assigned_user_id" in incoming_with_nulls:
        new_assigned_user_id = incoming_with_nulls["assigned_user_id"]

        if new_assigned_user_id is None:
            old_val = task.assigned_user_id
            setattr(task, "assigned_user_id", None)

            if task.assignment_type != AssignmentType.broadcast:
                old_assignment_type_val = task.assignment_type
                setattr(task, "assignment_type", AssignmentType.broadcast)
                assignment_type_changed = True

            # статус assigned → new
            if task.status == TaskStatus.assigned:
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

            # статус new → assigned
            if task.status == TaskStatus.new:
                task.status = TaskStatus.assigned

            if old_val != new_assigned_user_id:
                changed.append(("assigned_user_id", old_val, new_assigned_user_id))
                assigned_user_id_changed = True
            if old_assignment_type_val != AssignmentType.individual:
                changed.append(("assignment_type", old_assignment_type_val, AssignmentType.individual))
                assignment_type_changed = True

            logger.info("Назначен монтажник → статус переведен в assigned")

    incoming_with_nulls.pop("assigned_user_id", None)

    

    for field, value in incoming.items():
        if field in {"id", "created_at", "created_by", "is_draft", "equipment", "work_types"}:
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
    if "contact_person_id" in incoming_with_nulls:
        contact_person_id = incoming_with_nulls["contact_person_id"]
        old_cp_id = task.contact_person_id
        old_co_id = task.company_id
        old_cp_phone = task.contact_person_phone

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

    calculated_client_price = Decimal('0')
    calculated_montajnik_reward = Decimal('0')

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
        calculated_client_price += work_client_unit_price * tw.quantity
        calculated_montajnik_reward += work_mont_unit_price * tw.quantity

    prices_changed = False
    if task.client_price != calculated_client_price or task.montajnik_reward != calculated_montajnik_reward:
        old_client_price = task.client_price
        old_montajnik_reward = task.montajnik_reward
        task.client_price = calculated_client_price
        task.montajnik_reward = calculated_montajnik_reward
        prices_changed = True
        logger.info(f"Цены пересчитаны: client_price={calculated_client_price}, montajnik_reward={calculated_montajnik_reward}")

    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")

    # --- ПРОВЕРКА: Были ли изменения? ---
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

        # --- ФОРМИРУЕМ РУССКИЙ КОММЕНТАРИЙ ---
        changes_summary_ru = build_changes_summary_ru(all_changes)
        comment = changes_summary_ru
        logger.info(f"Комментарий для истории (русский): {comment}")

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
            user_id=getattr(admin_user, "id", None),
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
        background_tasks.add_task(
            notify_user,
            task.assigned_user_id,
            f"Задача #{task_id} была обновлена"
        )

    return {"detail": "Updated"}


@router.get("/tasks", summary="Получить все задачи (только админ), кроме черновиков")
async def admin_list_tasks(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    # Сначала получаем количество задач
    count_query = select(func.count(Task.id)).where(
        Task.is_draft != True,
        Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    # Загружаем задачи с контактным лицом и компанией
    q = await db.execute(
        select(Task)
        .where(
            Task.is_draft != True,
            Task.status.not_in([TaskStatus.completed, TaskStatus.archived]),
            )
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company)) # ✅ Загружаем контактное лицо и компанию
    )
    tasks = q.scalars().all()
    
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
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "location": t.location,
            "vehicle_info": t.vehicle_info,
            "comment": t.comment,
            "assignment_type": t.assignment_type.value if t.assignment_type else None,
            "assigned_user_id": t.assigned_user_id,
            "client_price": str(t.client_price) if t.client_price else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward else None,
            "is_draft": t.is_draft,
            "photo_required": t.photo_required,
        })
    return {
        "tasks": out,
        "total_count": total_count
    }



@router.get("/tasks/filter", summary="Фильтрация задач (только админ)")
async def admin_filter_tasks(
    status: Optional[str] = Query(None, description="Статусы через запятую"),
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    query = select(Task).where(Task.is_draft != True)

    if status:
        status_list = [TaskStatus(s) for s in status.split(",") if s]
        if status_list:
            query = query.where(Task.status.in_(status_list))
    else:
        open_statuses = [
            TaskStatus.new, TaskStatus.accepted, TaskStatus.on_the_road,
            TaskStatus.on_site, TaskStatus.started, TaskStatus.assigned,
            TaskStatus.inspection, TaskStatus.returned,TaskStatus.completed
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
        
        if search.isdigit():
            conditions.append(Task.id == int(search))
        
        combined_search_condition = or_(*conditions)
        query = query.where(combined_search_condition)

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



@router.get("/tasks/{task_id}", summary="Получить задачу по ID (только админ), если не черновик")
async def admin_get_task_by_id(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    # Загружаем задачу с контактным лицом, компанией и другими связями
    q = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment_links).selectinload(TaskEquipment.equipment),
            selectinload(Task.works).selectinload(TaskWork.work_type),
            selectinload(Task.history),
            selectinload(Task.reports),
            selectinload(Task.assigned_user),
            selectinload(Task.contact_person).selectinload(ContactPerson.company)  # ✅ Загружаем контактное лицо и компанию
        )
        .where(Task.id == task_id, Task.is_draft != True)
    )
    task = q.scalars().first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена или является черновиком")


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
    company_id = task.contact_person.company.id if task.contact_person and task.contact_person.company else None
    contact_person_id = task.contact_person.id if task.contact_person else None

    assigned_user_name = task.assigned_user.name if task.assigned_user else None
    assigned_user_lastname = task.assigned_user.lastname if task.assigned_user else None
    assigned_user_full_name = f"{assigned_user_name} {assigned_user_lastname}".strip() if assigned_user_name or assigned_user_lastname else None


    return {
        "id": task.id,
        "company_id" : company_id,
        "contact_person_id": contact_person_id,
        "company_name": company_name,  # ✅ Новое
        "contact_person_name": contact_person_name,  # ✅ Новое
        "contact_person_phone": task.contact_person_phone,
        "vehicle_info": task.vehicle_info or None,
        "gos_number": task.gos_number or None,
        "scheduled_at": str(task.scheduled_at) if task.scheduled_at else None,
        "status": task.status.value if task.status else None,
        "assigned_user_id": task.assigned_user_id or None,
        "assigned_user_name": assigned_user_full_name,
        "location": task.location or None,
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


@router.delete(
    "/tasks/{task_id}",
    summary="Удалить задачу (только админ)",
    response_model=SimpleMsg  # или TaskResponse, если хочешь вернуть удалённую задачу
)
async def admin_delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    # Проверяем, существует ли задача
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Удаляем задачу
    await db.delete(task)
    await db.commit()

    return {"detail": "Задача успешно удалена"}


@router.get("/tasks/{task_id}/history", response_model=List[TaskHistoryItem], dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_task_full_history(
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


@router.get("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_companies(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ClientCompany))
    companies = res.scalars().all()
    return [{"id": c.id, "name": c.name} for c in companies]


@router.get("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_contact_persons(company_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ContactPerson).where(ContactPerson.company_id == company_id))
    contacts = res.scalars().all()
    return [{"id": c.id, "name": c.name, "phone": c.phone, "position": c.position, "company_id": c.company_id} for c in contacts]


@router.get("/contact-persons/{contact_person_id}/phone", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_contact_person_phone(
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


@router.post("/companies", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_add_company(payload: dict = Body(...), db: AsyncSession = Depends(get_db)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Название компании обязательно")
    company = ClientCompany(name=name)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return {"id": company.id, "name": company.name}


@router.post("/companies/{company_id}/contacts", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_add_contact_person(company_id: int, payload: dict = Body(...), db: AsyncSession = Depends(get_db)):
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



@router.get("/equipment", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_equipment_list(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Equipment).order_by(Equipment.name)) 
    equipment_list = res.scalars().all()
    return [{"id": e.id, "name": e.name, "category": e.category, "price": str(e.price)} for e in equipment_list]


@router.get("/work-types", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_work_types_list(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(WorkType).where(WorkType.is_active == True).order_by(WorkType.name))
    work_types_list = res.scalars().all()
    # Возвращаем старый формат, но добавляем category
    return [{"id": wt.id, "name": wt.name, "client_price": str(wt.client_price), "mont_price": str(wt.mont_price),"tech_supp_require": wt.tech_supp_require, "category": wt.category} for wt in work_types_list]


@router.post("/work-types", dependencies=[Depends(require_roles(Role.admin,Role.logist))])
async def admin_add_work_type_no_schema(
    payload: dict = Body(...),  # вместо схемы
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Проверка ролей
    if current_user.role not in [Role.admin, Role.logist]:
        raise HTTPException(status_code=403, detail="Forbidden")

    name = payload.get("name")
    # Получаем новые цены
    client_price = payload.get("client_price")
    mont_price = payload.get("mont_price")
    tech_supp_require = payload.get("tech_supp_require", False) # По умолчанию False
    category = payload.get("category", None) # <--- НОВОЕ: Получаем категорию

    if not name or client_price is None or mont_price is None:
        raise HTTPException(status_code=400, detail="Не все поля переданы (name, client_price, mont_price обязательны)")

    # Преобразуем tech_supp_require в boolean
    if not isinstance(tech_supp_require, bool):
        if isinstance(tech_supp_require, str):
            tech_supp_require = tech_supp_require.lower() in ('true', '1', 'yes', 'on')
        else:
            tech_supp_require = False

    try:
        client_price_decimal = Decimal(client_price)
        mont_price_decimal = Decimal(mont_price)
    except Exception:
        raise HTTPException(status_code=400, detail="Цены должны быть числами")

    work_type = WorkType(
        name=name,
        client_price=client_price_decimal,
        mont_price=mont_price_decimal,
        tech_supp_require=tech_supp_require,
        category=category # <--- НОВОЕ: Устанавливаем категорию
    )
    db.add(work_type)
    await db.flush()
    await db.commit()
    await db.refresh(work_type)

    # Возвращаем ответ с новыми полями, включая category
    return {
        "id": work_type.id,
        "name": work_type.name,
        "client_price": str(work_type.client_price),
        "mont_price": str(work_type.mont_price),
        "tech_supp_require": work_type.tech_supp_require,
        "category": work_type.category # <--- НОВОЕ: Возвращаем категорию
    }


@router.post("/equipment", dependencies=[Depends(require_roles(Role.admin,Role.logist))])
async def admin_add_equipment_no_schema(
    payload: dict = Body(...),  # вместо схемы
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # проверка роли
    if current_user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    name = payload.get("name")
    category = payload.get("category")
    price = payload.get("price")

    if not name or not category or price is None:
        raise HTTPException(status_code=400, detail="Не все поля переданы")

    equipment = Equipment(
        name=name,
        category=category,
        price=price
    )
    db.add(equipment)
    await db.flush()  # чтобы получить id
    await db.commit()
    await db.refresh(equipment)

    return {"id": equipment.id, "name": equipment.name, "category": equipment.category, "price": str(equipment.price)}

@router.patch("/work-types/{work_type_id}", dependencies=[Depends(require_roles(Role.admin))])
async def admin_update_work_type(
    work_type_id: int,
    payload: UpdateWorkTypeRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WorkType).where(WorkType.id == work_type_id))
    work_type = result.scalar_one_or_none()
    if not work_type:
        raise HTTPException(status_code=404, detail="Тип работы не найден")

    if payload.name is not None:
        work_type.name = payload.name
    if payload.client_price is not None:
        work_type.client_price = Decimal(str(payload.client_price))
    if payload.mont_price is not None:
        work_type.mont_price = Decimal(str(payload.mont_price))
    if payload.category is not None:
        work_type.category = payload.category
    if payload.tech_supp_require is not None:
        work_type.tech_supp_require = payload.tech_supp_require

    await db.commit()
    await db.refresh(work_type)

    return {
        "id": work_type.id,
        "name": work_type.name,
        "client_price": str(work_type.client_price),
        "mont_price": str(work_type.mont_price),
        "category": work_type.category,
        "tech_supp_require": work_type.tech_supp_require,
        "is_active": work_type.is_active
    }

@router.patch("/equipment/{equipment_id}", dependencies=[Depends(require_roles(Role.admin, Role.logist))])
async def admin_update_equipment(
    equipment_id: int,
    payload: UpdateEquipmentRequest,
    db: AsyncSession = Depends(get_db),
):

    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")

    if payload.name is not None:
        equipment.name = payload.name
    if payload.category is not None:
        equipment.category = payload.category
    if payload.price is not None:
        equipment.price = Decimal(str(payload.price))

    await db.commit()
    await db.refresh(equipment)

    return {
        "id": equipment.id,
        "name": equipment.name,
        "category": equipment.category,
        "price": str(equipment.price)
    }


@router.patch("/companies/{company_id}", dependencies=[Depends(require_roles(Role.admin))])
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

@router.patch("/contact-persons/{contact_id}", dependencies=[Depends(require_roles(Role.admin))])
async def admin_update_contact_person(
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

@router.get("/tasks/completed_admin", summary="Получить все завершенные задачи (только админ)")
async def admin_list_completed_tasks(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    # Сначала получаем количество задач
    count_query = select(func.count(Task.id)).where(
        Task.status == TaskStatus.completed,
    )
    count_res = await db.execute(count_query)
    total_count = count_res.scalar() or 0

    # Загружаем задачи с контактным лицом и компанией
    q = await db.execute(
        select(Task)
        .where(Task.status == TaskStatus.completed)
        .options(selectinload(Task.contact_person).selectinload(ContactPerson.company)) # ✅ Загружаем контактное лицо и компанию
    )
    tasks = q.scalars().all()
    
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
            "status": t.status.value if t.status else None,
            "scheduled_at": str(t.scheduled_at) if t.scheduled_at else None,
            "location": t.location,
            "vehicle_info": t.vehicle_info,
            "comment": t.comment,
            "assignment_type": t.assignment_type.value if t.assignment_type else None,
            "assigned_user_id": t.assigned_user_id,
            "client_price": str(t.client_price) if t.client_price else None,
            "montajnik_reward": str(t.montajnik_reward) if t.montajnik_reward else None,
            "is_draft": t.is_draft,
            "photo_required": t.photo_required,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        })
    return {
        "tasks": out,
        "total_count": total_count
    }


@router.get("/tasks/completed_admin/filter", summary="Фильтрация завершенных задач (только админ)")
async def admin_filter_completed_tasks(
    company_id: Optional[str] = Query(None, description="ID компаний через запятую"),
    assigned_user_id: Optional[str] = Query(None, description="ID монтажников через запятую"),
    work_type_id: Optional[str] = Query(None, description="ID типов работ через запятую"),
    equipment_id: Optional[str] = Query(None, description="ID оборудования через запятую"),
    search: Optional[str] = Query(None, description="Умный поиск по всем полям"),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    query = select(Task).where(Task.status == TaskStatus.completed)

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


@router.get("/admin_completed-tasks/{task_id}")
async def admin_completed_task_detail(
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
            selectinload(Task.contact_person).selectinload(ContactPerson.company), # ✅ Загружаем контактное лицо и компанию
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
        "requires_tech_supp":requires_tech_supp
    }