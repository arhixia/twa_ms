from datetime import datetime, timezone
import enum
import json
from fastapi import APIRouter, Body,Depends,HTTPException,status
from sqlalchemy import select, update, delete
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

    # Загружаем задачу с контактным лицом и компанией
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
    logger.info(f"Старые связи для задачи {task_id}: equipment={old_equipment_with_sn_qty}, work_types={old_works_with_qty}, contact_person={old_contact_person_name}, contact_person_phone={old_contact_person_phone}, company={old_company_name}")

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
         # from collections import Counter # Уже импортирован выше
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
        # Обновляем *основные* поля задачи и связи, которые были изменены напрямую
        # refresh после обновления связей, но до получения новых значений для истории
        # await db.refresh(task, attribute_names=['works', 'equipment_links', 'contact_person']) # <- Это может быть недостаточно

        # Вместо refresh, выполним явные запросы для получения полных данных связей
        # 1. Получить полные данные по работам (включая work_type.name)
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

        # 3. Получить обновленные данные по контактному лицу и компании
        # Так как contact_person_id и company_id были установлены вручную,
        # и, возможно, task.contact_person и task.company обновлены в сессии,
        # мы можем получить их напрямую, но если связь lazy, это снова вызовет ошибку.
        # Лучше получить через отдельный запрос, используя новое task.contact_person_id
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

        # contact_person_phone уже в task.contact_person_phone
        logger.info(f"Новые связи для задачи {task_id}: equipment={new_equipment_with_sn_qty}, work_types={new_works_with_qty}, contact_person={new_contact_person_name}, contact_person_phone={task.contact_person_phone}, company={new_company_name}")

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
            
        # Проверяем изменения contact_person и company
        old_cp_co = f"{old_contact_person_name} ({old_company_name})" if old_contact_person_name and old_company_name else "—"
        new_cp_co = f"{new_contact_person_name} ({new_company_name})" if new_contact_person_name and new_company_name else "—"
        if old_cp_co != new_cp_co:
            all_changes.append({"field": "contact_person", "old": old_cp_co, "new": new_cp_co})

        # --- Добавляем изменение телефона в all_changes, если оно было ---
        # Найдём изменение телефона в списке changed
        cp_phone_change = next((item for item in changed if item[0] == "contact_person_phone"), None)
        if cp_phone_change:
            all_changes.append({"field": "contact_person_phone", "old": str(cp_phone_change[1]), "new": str(cp_phone_change[2])})

        logger.info(f"Список 'all_changes' для истории: {all_changes}")
        # Создаём комментарий с *всеми* изменениями
        comment = json.dumps(all_changes, ensure_ascii=False)
        logger.info(f"Комментарий для истории (JSON): {comment}")
        hist = TaskHistory(
            task_id=task.id,
            user_id=getattr(admin_user, "id", None),
            action=task.status,
            comment=comment,
            event_type=TaskHistoryEventType.updated, # ✅ Новый тип
            # --- Сохраняем все основные поля задачи ---
            company_id=task.company_id,  # ✅ Заменено
            contact_person_id=task.contact_person_id,  # ✅ Заменено
            contact_person_phone=task.contact_person_phone, # <--- Сохранение телефона в историю
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
        .where(Task.is_draft != True,Task.status != TaskStatus.completed)
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
        "location": task.location or None,
        "assigned_user": {
            "id": task.assigned_user.id,
            "name": task.assigned_user.name,
            "lastname": task.assigned_user.lastname,
        } if task.assigned_user else None,
        "comment": task.comment or None,
        "photo_required": task.photo_required,
        "client_price": str(task.client_price) if task.client_price else None,
        "montajnik_reward": str(task.montajnik_reward) if task.montajnik_reward else None,
        "equipment": equipment,
        "work_types": work_types,
        "history": history,
        "reports": reports or None
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
    return {"id": contact.id, "name": contact.name, "phone": contact.phone} # 