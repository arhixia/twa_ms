import asyncio
import json
import logging
import aio_pika
from back.messaging.connection import RABBITMQ_URL, QUEUE_NAME
from back.utils.notify import notify_user

logger = logging.getLogger(__name__)

async def handle_message(message: aio_pika.IncomingMessage):
    async with message.process():
        try:
            payload = json.loads(message.body.decode())
            logger.info(f"Получено уведомление из очереди: {payload}")

            user_id = payload["user_id"]
            text = payload["message"]
            task_id = payload.get("task_id")

            success = await notify_user(user_id,text,task_id)

            if not success:
                logger.warning(f"Уведомление для {user_id} не доставлено")

        except Exception as e:
            logger.error(f"Ошибка при отправле уведомления: {e}")


async def start_consumer():
    logger.info("Start consumer")
    connection = await aio_pika.connect_robust(RABBITMQ_URL)

    async with connection:
        channel = await connection.channel()

        await channel.set_qos(prefetch_count=1)

        queue = await channel.declare_queue(QUEUE_NAME,durable=True)
        logger.info(f"Слушаю очередь {QUEUE_NAME}")

        await queue.consume(handle_message)
        
        await asyncio.Future()




