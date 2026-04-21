import aio_pika 
import asyncio
import logging
from back.db.config import RABBITMQ_URL


logger = logging.getLogger(__name__)
QUEUE_NAME = "notifications"

_connection = None
_channel = None


async def get_connection():
    global _connection
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(RABBITMQ_URL)
        logger.info("Подключились к rabbit")
    return _connection


async def get_channel():
    global _channel
    conn = await get_connection()
    if _channel is None or _channel.is_closed:
        _channel = await conn.channel()
        await _channel.declare_queue(QUEUE_NAME,durable=True)
        logger.info(f"Канал и очередь{QUEUE_NAME} готовы")
    return _channel


async def close_connection():
    global _connection,_channel
    if _channel is not None and not  _channel.is_closed:
        await _channel.close()
    if _connection is not None and not _connection.is_closed:
        await _connection.close()
    logger.info("Соединение закрыто")


