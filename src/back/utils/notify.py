# back/utils/notify.py

import asyncio
from typing import Optional
from sqlalchemy import select
from back.db.models import Notification, User
from back.db.database import SessionLocal  # используем SessionLocal для фоновых тасков

# real implementation should call Bot API asynchronously
async def send_telegram_message(chat_id: int, text: str) -> bool:
    return True


async def get_user_telegram_in_new_session(user_id: int) -> Optional[int]:
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        u = result.scalars().first()
        return u.telegram_id if u else None


async def notify_user(user_id: int, message: str, task_id: Optional[int] = None) -> bool:
    """
    Фоновая задача: открывает собственную сессию, сохраняет Notification и пытается отправить телеграм.
    Возвращает bool — был ли успешно отправлен.
    """
    async with SessionLocal() as session:
        # создаём запись уведомления в своей сессии
        n = Notification(user_id=user_id, task_id=task_id, message=message)
        session.add(n)
        await session.flush()

        try:
            chat_id = await get_user_telegram_in_new_session(user_id)
            sent = await send_telegram_message(chat_id=chat_id, text=message)
        except Exception:
            sent = False

        n.is_sent = bool(sent)
        await session.flush()
        return n.is_sent


#уведомления сделать, убрать модель лишнюю 
