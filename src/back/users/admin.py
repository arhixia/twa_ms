from datetime import datetime, timezone
from decimal import Decimal
import enum
import json
from fastapi import APIRouter, Body,Depends,HTTPException, Query,status
from sqlalchemy import and_, func, or_, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from back.db.database import get_db
from back.db.models import AssignmentType, ClientCompany, ContactPerson, Equipment, FileType, TaskAttachment, TaskEquipment, TaskHistory, TaskHistoryEventType, TaskReport, TaskStatus, TaskWork, User,Role as RoleEnum,Task, WorkType,Role
from back.auth.auth import get_current_user,create_user as auth_create_user
from back.auth.auth_schemas import UserCreate,UserResponse,UserBase,RoleChange
from back.users.users_schemas import SimpleMsg, TaskEquipmentItem, TaskHistoryItem, TaskPatch, TaskUpdate, require_roles
from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from typing import Any, Counter, Dict, Optional
from sqlalchemy.orm import selectinload

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

    # Сохраняем *старые* значения связей для истории
    # ✅ Обновляем получение старых данных с учетом quantity
    old_works_with_qty = [(tw.work_type.name, tw.quantity) for tw in task.works]
    # ✅ Обновляем получение старых данных оборудования с serial_number и quantity
    old_equipment_with_sn_qty = [
        (te.equipment.name, te.serial_number, te.quantity) for te in task.equipment_links
    ]
    old_contact_person_name = task.contact_person.name if task.contact_person else None
    old_company_name = task.contact_person.company.name if task.contact_person and task.contact_person.company else None
    # ✅ Сохраняем старый телефон
    old_contact_person_phone = task.contact_person.phone if task.contact_person else None
    # ✅ Сохраняем старые цены для проверки изменений
    old_client_price = task.client_price
    old_montajnik_reward = task.montajnik_reward
    old_assigned_user_id = task.assigned_user_id # <--- Добавлено
    old_assignment_type = task.assignment_type
    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name}, contact_person_phone={old_contact_person_phone}, company={old_company_name}, client_price={old_client_price}, montajnik_reward={old_montajnik_reward}")

    incoming = {k: v for k, v in patch.model_dump().items() if v is not None}
    logger.info(f"Полный incoming dict: {incoming}")
    changed = []

    # --- normalize assigned_user_id ---
    if "assigned_user_id" in incoming:
        incoming["assigned_user_id"] = _normalize_assigned_user_id(incoming["assigned_user_id"])

    # --- извлекаем equipment/work_types (если пришли) ---
    equipment_data: List[TaskEquipmentItem] = incoming.pop("equipment", None)
    # ✅ work_types_data - список ID
    work_types_data = incoming.pop("work_types", None)
    assigned_user_id_from_payload = incoming.pop("assigned_user_id", None)
    logger.info(f"equipment_data: {equipment_data}, work_types_data: {work_types_data}")

    assigned_user_id_changed = False
    assignment_type_changed = False

# Проверяем, пришло ли поле вообще
    if "assigned_user_id" in patch.model_dump():
        new_assigned_user_id = patch.assigned_user_id
        old_assigned_user_id_in_task = task.assigned_user_id
        old_assignment_type_in_task = task.assignment_type

        if new_assigned_user_id is None:
            # Сброс монтажника
            setattr(task, "assigned_user_id", None)
            assigned_user_id_changed = True
            changed.append(("assigned_user_id", old_assigned_user_id_in_task, None))
            logger.info(f"assigned_user_id сброшен: {old_assigned_user_id_in_task} -> None")

            # Если тип назначения индивидуальный — меняем на broadcast
            if task.assignment_type == AssignmentType.individual:
                old_assignment_type_val = task.assignment_type
                task.assignment_type = AssignmentType.broadcast
                assignment_type_changed = True
                changed.append(("assignment_type", old_assignment_type_val, task.assignment_type))
                logger.info(f"assignment_type изменён с {old_assignment_type_val.value} на {task.assignment_type.value}")
        else:
            # Назначаем нового монтажника
            setattr(task, "assigned_user_id", new_assigned_user_id)
            assigned_user_id_changed = True
            changed.append(("assigned_user_id", old_assigned_user_id_in_task, new_assigned_user_id))
            logger.info(f"assigned_user_id изменён: {old_assigned_user_id_in_task} -> {new_assigned_user_id}")         
    
    assigned_user_id_changed = True # <--- Добавлено
    changed.append(("assigned_user_id", old_assigned_user_id_in_task, new_assigned_user_id)) # <--- Добавлено в changed для истории
    logger.info(f"assigned_user_id изменён: {old_assigned_user_id_in_task} -> {new_assigned_user_id}, assigned_user_id_changed={assigned_user_id_changed}")
    
    # --- Обновление основных полей задачи ---
    for field, value in incoming.items():
        if field in {"id", "created_at", "created_by", "is_draft", "equipment", "work_types", "assigned_user_id"}: # <--- assigned_user_id добавлено в исключения
            continue
        old = getattr(task, field)
        old_cmp = old.value if hasattr(old, "value") else old
        new_cmp = value.value if hasattr(value, "value") else value
        logger.debug(f"Сравнение поля '{field}': DB={old_cmp}, Payload={new_cmp}")
        if str(old_cmp) != str(new_cmp):
            # конвертация assignment_type из строки (если не было обработано выше)
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
            old_cp_phone = task.contact_person_phone # <--- Сохраняем старый телефон
            setattr(task, "contact_person_id", contact_person_id)
            setattr(task, "company_id", contact_person.company_id)
            setattr(task, "contact_person_phone", contact_person.phone) # <--- Установка телефона из CP
            changed.append(("contact_person_id", old_cp_id, contact_person_id))
            changed.append(("company_id", old_co_id, contact_person.company_id))
            changed.append(("contact_person_phone", old_cp_phone, contact_person.phone)) # <--- Добавляем телефон в изменения
            logger.info(f"Поле 'contact_person_id', 'company_id', 'contact_person_phone' помечены как изменённые: {old_cp_id}->{contact_person_id}, {old_co_id}->{contact_person.company_id}, {old_cp_phone}->{contact_person.phone}")
        else:
            old_cp_id = task.contact_person_id
            old_co_id = task.company_id
            old_cp_phone = task.contact_person_phone # <--- Сохраняем старый телефон
            setattr(task, "contact_person_id", None)
            setattr(task, "company_id", None)
            setattr(task, "contact_person_phone", None) # <--- Сброс телефона
            changed.append(("contact_person_id", old_cp_id, None))
            changed.append(("company_id", old_co_id, None))
            changed.append(("contact_person_phone", old_cp_phone, None)) # <--- Добавляем телефон в изменения
            logger.info(f"Поле 'contact_person_id', 'company_id', 'contact_person_phone' сброшены: {old_cp_id}->{None}, {old_co_id}->{None}, {old_cp_phone}->{None}")

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
        equipment_unit_price = te.equipment.price or Decimal('0') # 
        calculated_client_price += equipment_unit_price * te.quantity

    work_res = await db.execute(
        select(TaskWork)
        .options(selectinload(TaskWork.work_type)) 
        .where(TaskWork.task_id == task.id)
    )
    task_work_list = work_res.scalars().all()
    for tw in task_work_list:
        work_unit_price = tw.work_type.price or Decimal('0') # 
        calculated_client_price += work_unit_price * tw.quantity
        calculated_montajnik_reward += work_unit_price * tw.quantity

        
    task.client_price = calculated_client_price
    task.montajnik_reward = calculated_montajnik_reward
    logger.info(f"Рассчитанные цены: client_price={calculated_client_price}, montajnik_reward={calculated_montajnik_reward}")

    logger.info(f"Список 'changed' после обновления полей и связей: {changed}")
    has_changes = bool(changed)
    logger.info(f"'has_changes' рассчитано как: {has_changes}")

    # Проверяем, изменились ли цены (даже если другие поля не изменились)
    prices_changed = (task.client_price != old_client_price) or (task.montajnik_reward != old_montajnik_reward)

    if not has_changes and not prices_changed:
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
            if f not in ["equipment", "work_types", "contact_person_id", "company_id", "contact_person_phone","assigned_user_id","assignment_type"]:
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
        
        # Обработка изменения contact_person_phone отдельно, если оно произошло
        cp_phone_change = next((item for item in changed if item[0] == "contact_person_phone"), None)
        if cp_phone_change:
            all_changes.append({"field": "contact_person_phone", "old": str(cp_phone_change[1]), "new": str(cp_phone_change[2])})

        if assigned_user_id_changed: # <--- Добавлено
            all_changes.append({
                "field": "assigned_user_id",
                "old": str(old_assigned_user_id), # Используем старое значение из начала функции
                "new": str(task.assigned_user_id)
            })
        
        # ✅ Проверяем и добавляем изменения assignment_type
        if assignment_type_changed: # <--- Добавлено
            all_changes.append({
                "field": "assignment_type",
                "old": old_assignment_type.value if old_assignment_type else None, # Используем старое значение из начала функции
                "new": task.assignment_type.value if task.assignment_type else None
            })

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
            user_id=getattr(admin_user, "id", None),
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



@router.get("/tasks", summary="Получить все задачи (только админ), кроме черновиков")
async def admin_list_tasks(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
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
    return out



@router.get("/tasks/filter", summary="Фильтрация задач (только админ)")
async def admin_filter_tasks(
    status: Optional[str] = Query(None, description="Статусы через запятую"),
    company_id: Optional[int] = Query(None, description="ID компании"),
    assigned_user_id: Optional[int] = Query(None, description="ID монтажника"),
    work_type_id: Optional[int] = Query(None, description="ID типа работы"),
    task_id: Optional[int] = Query(None, description="ID задачи"),
    equipment_id: Optional[int] = Query(None, description="ID оборудования"),
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
            TaskStatus.inspection, TaskStatus.returned
        ]
        query = query.where(Task.status.in_(open_statuses))

    if company_id is not None:
        query = query.where(Task.company_id == company_id)

    if assigned_user_id is not None:
        query = query.where(Task.assigned_user_id == assigned_user_id)

    if task_id is not None:
        query = query.where(Task.id == task_id)

    if work_type_id is not None:
        query = query.join(Task.works).where(TaskWork.work_type_id == work_type_id)

    if equipment_id is not None:
        query = query.where(Task.equipment_links.any(TaskEquipment.equipment_id == equipment_id))

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

        combined_search_condition = or_(
            *task_field_conditions,
            company_exists,
            contact_exists,
            work_type_exists,
            equipment_exists,
            assigned_user_exists,
            creator_exists
        )
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
    return [{"id": c.id, "name": c.name} for c in contacts]


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
    return {"id": contact.id, "name": contact.name, "phone": contact.phone} 



@router.get("/equipment", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_equipment_list(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Equipment).order_by(Equipment.name)) 
    equipment_list = res.scalars().all()
    return [{"id": e.id, "name": e.name, "category": e.category, "price": str(e.price)} for e in equipment_list]


@router.get("/work-types", dependencies=[Depends(require_roles(Role.logist, Role.admin))])
async def admin_get_work_types_list(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(WorkType).where(WorkType.is_active == True).order_by(WorkType.name)) 
    work_types_list = res.scalars().all()
    return [{"id": wt.id, "name": wt.name, "price": str(wt.price)} for wt in work_types_list] 


@router.post("/work-types", dependencies=[Depends(require_roles(Role.admin,Role.logist))])
async def admin_add_work_type_no_schema(
    payload: dict = Body(...),  # вместо схемы
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    name = payload.get("name")
    price = payload.get("price")

    if not name or price is None:
        raise HTTPException(status_code=400, detail="Не все поля переданы")

    work_type = WorkType(
        name=name,
        price=price
    )
    db.add(work_type)
    await db.flush()
    await db.commit()
    await db.refresh(work_type)

    return {"id": work_type.id, "name": work_type.name, "price": str(work_type.price)}


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

