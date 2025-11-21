import asyncio
import logging
import os
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.models import User
from back.db.database import DATABASE_URL
from back.db.config import TOKEN  # предполагаем, что тут есть TOKEN
import httpx

logger = logging.getLogger(__name__)


engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def send_telegram_message(chat_id: int, text: str) -> bool:
    """
    Отправка сообщения в Telegram через Bot API
    """
    if not chat_id:
        logger.warning(f"Нет Telegram ID для отправки сообщения: {text}")
        return False
    
    bot_token = TOKEN  
    if not bot_token:
        logger.warning("Telegram bot token не настроен")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML"
                }
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("ok"):
                    logger.info(f"Сообщение отправлено в чат {chat_id}: {text}")
                    return True
                else:
                    logger.error(f"Ошибка Telegram API: {result.get('description')}")
                    return False
            else:
                logger.error(f"HTTP ошибка при отправке в Telegram: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Ошибка при отправке сообщения в Telegram: {e}")
            return False


async def get_user_telegram_in_new_session(user_id: int) -> Optional[int]:
    """
    Получение Telegram ID пользователя в отдельной сессии
    """
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User.telegram_id).where(User.id == user_id)
            )
            user_data = result.scalar_one_or_none()
            return user_data
        except Exception as e:
            logger.error(f"Ошибка при получении Telegram ID для пользователя {user_id}: {e}")
            return None


async def notify_user(user_id: int, message: str, task_id: Optional[int] = None) -> bool:
    """
    Фоновая задача: отправка уведомления пользователю
    """
    chat_id = await get_user_telegram_in_new_session(user_id)
    if not chat_id:
        logger.warning(f"Нет Telegram ID для пользователя {user_id}")
        return False
    
    return await send_telegram_message(chat_id, message)


async def notify_multiple_users(user_ids: list[int], message: str, task_id: Optional[int] = None) -> dict:
    """
    Отправка уведомлений нескольким пользователям
    Возвращает словарь с результатами {user_id: success}
    """
    results = {}
    for user_id in user_ids:
        success = await notify_user(user_id, message, task_id)
        results[user_id] = success
        await asyncio.sleep(0.1)  # небольшая задержка между сообщениями
    
    return results


async def notify_task_assignment(task_id: int, assigned_user_id: int) -> bool:
    """
    Уведомление монтажника о назначении задачи
    """
    message = f"Вам назначена задача #{task_id}"
    return await notify_user(assigned_user_id, message, task_id)


async def notify_task_update(task_id: int, user_ids: list[int]) -> dict:
    """
    Уведомление пользователей об обновлении задачи
    """
    message = f"Задача #{task_id} была обновлена"
    return await notify_multiple_users(user_ids, message, task_id)


async def notify_broadcast_task(task_id: int, exclude_user_id: Optional[int] = None) -> dict:
    """
    Уведомление всех активных монтажников о новой задаче (рассылка)
    """
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