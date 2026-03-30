import asyncio
import random
from datetime import datetime, timedelta
import logging
import os
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.models import Task, TaskStatus, User
from back.db.database import DATABASE_URL
from back.db.config import TOKEN, VK_GROUP_TOKEN  
import httpx

logger = logging.getLogger(__name__)

engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ──────────────────────────────────────────
# Telegram
# ──────────────────────────────────────────

async def send_telegram_message(chat_id: int, text: str) -> bool:
    if not chat_id:
        return False
    if not TOKEN:
        logger.warning("Telegram bot token не настроен")
        return False

    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                url,
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
            )
            result = response.json()
            if response.status_code == 200 and result.get("ok"):
                logger.info(f"TG: сообщение отправлено в чат {chat_id}")
                return True
            logger.error(f"Ошибка Telegram API: {result.get('description')}")
            return False
        except Exception as e:
            logger.error(f"Ошибка при отправке в Telegram: {e}")
            return False


# ──────────────────────────────────────────
# VK
# ──────────────────────────────────────────

async def send_vk_message(vk_user_id: int, text: str) -> bool:
    if not vk_user_id:
        return False
    if not VK_GROUP_TOKEN:
        logger.warning("VK_GROUP_TOKEN не настроен")
        return False

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                "https://api.vk.com/method/messages.send",
                data={
                    "user_id": vk_user_id,
                    "message": text,
                    "random_id": random.randint(1, 2**31),
                    "access_token": VK_GROUP_TOKEN,
                    "v": "5.199"
                }
            )
            result = response.json()
            if "error" in result:
                logger.error(f"Ошибка VK API: {result['error']}")
                return False
            logger.info(f"VK: сообщение отправлено пользователю {vk_user_id}")
            return True
        except Exception as e:
            logger.error(f"Ошибка при отправке в VK: {e}")
            return False


# ──────────────────────────────────────────
# Получение контактов юзера из БД
# ──────────────────────────────────────────

async def get_user_contacts(user_id: int) -> dict:
    """
    Возвращает {'telegram_id': int|None, 'vk_id': int|None}
    """
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User.telegram_id, User.vk_id).where(User.id == user_id)
            )
            row = result.first()
            if row:
                return {"telegram_id": row[0], "vk_id": row[1]}
            return {"telegram_id": None, "vk_id": None}
        except Exception as e:
            logger.error(f"Ошибка при получении контактов пользователя {user_id}: {e}")
            return {"telegram_id": None, "vk_id": None}


# ──────────────────────────────────────────
# Главная функция отправки
# ──────────────────────────────────────────

async def notify_user(user_id: int, message: str, task_id: Optional[int] = None) -> bool:
    """
    Отправляет уведомление пользователю.
    - Есть оба ID → шлём в оба
    - Есть только один → шлём туда
    - Нет ни одного → не шлём
    """
    contacts = await get_user_contacts(user_id)
    telegram_id = contacts.get("telegram_id")
    vk_id = contacts.get("vk_id")

    if not telegram_id and not vk_id:
        logger.warning(f"Нет ни Telegram ID, ни VK ID для пользователя {user_id}")
        return False

    results = []

    if telegram_id:
        ok = await send_telegram_message(telegram_id, message)
        results.append(ok)

    if vk_id:
        ok = await send_vk_message(vk_id, message)
        results.append(ok)

    return any(results)


# ──────────────────────────────────────────
# Остальные функции — без изменений
# ──────────────────────────────────────────

async def notify_multiple_users(user_ids: list[int], message: str, task_id: Optional[int] = None) -> dict:
    results = {}
    for user_id in user_ids:
        success = await notify_user(user_id, message, task_id)
        results[user_id] = success
        await asyncio.sleep(0.1)
    return results


async def notify_task_assignment(task_id: int, assigned_user_id: int) -> bool:
    message = f"Вам назначена задача #{task_id}"
    return await notify_user(assigned_user_id, message, task_id)


async def notify_task_update(task_id: int, user_ids: list[int]) -> dict:
    message = f"Задача #{task_id} была обновлена"
    return await notify_multiple_users(user_ids, message, task_id)


async def notify_broadcast_task(task_id: int, exclude_user_id: Optional[int] = None) -> dict:
    async with AsyncSessionLocal() as session:
        try:
            query = select(User.id).where(
                User.role == 'montajnik',
                User.is_active == True
            )
            if exclude_user_id:
                query = query.where(User.id != exclude_user_id)
            result = await session.execute(query)
            user_ids = [row[0] for row in result.fetchall()]
            message = f"Новая задача для бригады #{task_id} (рассылка)"
            return await notify_multiple_users(user_ids, message, task_id)
        except Exception as e:
            logger.error(f"Ошибка при рассылке задачи {task_id}: {e}")
            return {}


async def notify_montajniks_of_upcoming_tasks():
    logger.info("Запуск проверки задач для уведомления монтажников за час до начала.")
    now = datetime.now()
    one_hour_later = now + timedelta(hours=1)
    buffer_minutes = 5
    lower_bound = one_hour_later - timedelta(minutes=buffer_minutes)
    upper_bound = one_hour_later + timedelta(minutes=buffer_minutes)

    async with AsyncSessionLocal() as session:
        try:
            query = select(Task).where(
                Task.scheduled_at >= lower_bound,
                Task.scheduled_at <= upper_bound,
                Task.status == TaskStatus.accepted,
                Task.assigned_user_id.isnot(None)
            )
            result = await session.execute(query)
            upcoming_tasks = result.scalars().all()
            logger.info(f"Найдено {len(upcoming_tasks)} задач для уведомления.")

            for task in upcoming_tasks:
                user_id = task.assigned_user_id
                message = (
                    f"Задача #{task.id} начнется примерно через час. "
                    f"Время начала: {task.scheduled_at.strftime('%d.%m.%Y %H:%M')}."
                )
                success = await notify_user(user_id, message, task.id)
                if not success:
                    logger.warning(f"Не удалось отправить уведомление о задаче #{task.id} монтажнику {user_id}.")

        except Exception as e:
            logger.error(f"Ошибка при проверке и отправке уведомлений: {e}")


async def periodic_notification_task():
    while True:
        try:
            await notify_montajniks_of_upcoming_tasks()
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче уведомлений: {e}")
        await asyncio.sleep(5 * 60)