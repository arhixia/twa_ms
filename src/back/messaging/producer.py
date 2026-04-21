from back.messaging.connection import get_channel,QUEUE_NAME
import json
import aio_pika
import logging


logger = logging.getLogger(__name__)


async def publish_notification(
        user_id: int,
        message:str,
        task_id: int | None = None,
        notification_type: str = "direct"
):
    payload = {
        "user_id": user_id,
        "message": message,
        "task_id": task_id,
        "notification_type": notification_type,
    }

    try:
        channel = await get_channel()

        await channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(payload).encode(),
                delivery_mode= aio_pika.DeliveryMode.PERSISTENT
            ),
            routing_key=QUEUE_NAME
        )

        logger.info(f"Уведомление для user_id={user_id} направлено в очередь")

    except Exception as e:
        logger.error(f"Ошибка добавления в очередь: {e}")
        from back.utils.notify import notify_user 
        await notify_user(user_id,message,task_id)