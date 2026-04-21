from contextlib import asynccontextmanager
import logging
import os
import time
from fastapi import BackgroundTasks, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from sqlalchemy import select
from back.auth.auth import router as auth_router
from back.users.admin import router as admin_router
from back.users.logist import router as logist_router
from back.users.montajnik import router as montajnik_router
from back.users.tech_supp import router as tech_supp_router
from back.files.attachments import router as attachments_router
from back.users.super_admin import router as super_admin_router
from back.users.manager import router as manager_router
from back.db.config import TOKEN as BOT_TOKEN,WEB_APP_URL
from back.db.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.models import  User
from back.messaging.connection import get_channel,close_connection
from back.messaging.consumer import start_consumer
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio
from aiogram import Bot, Dispatcher, types



from back.bot_worker import start_polling
from back.utils.notify import periodic_notification_task

logger = logging.getLogger(__name__)



class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        request_id = f"{int(start_time)}-{hash(str(request.url)) % 10000}"
        
        # Логируем начало запроса
        logger.info(f"[{request_id}] REQUEST STARTED - Method: {request.method}, URL: {request.url.path}")
        
        # Логируем заголовки, которые могут содержать информацию о размере
        content_length = request.headers.get('content-length')
        content_type = request.headers.get('content-type')
        logger.info(f"[{request_id}] Headers - Content-Length: {content_length}, Content-Type: {content_type}")
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            logger.info(f"[{request_id}] REQUEST COMPLETED - Status: {response.status_code}, Time: {process_time:.2f}s")
            return response
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(f"[{request_id}] REQUEST FAILED - Error: {str(e)}, Time: {process_time:.2f}s")
            raise



@asynccontextmanager
async def lifespan(app: FastAPI):

    aiogram_task = None
    notification_task = None
    consumer_task = None

    if BOT_TOKEN:
        aiogram_task = asyncio.create_task(start_polling())
        await asyncio.sleep(0.1)


    logger.info("Подключение к RabbitMQ...")
    await get_channel()
    
    consumer_task = asyncio.create_task(start_consumer())
    await asyncio.sleep(0.1)


    logger.info("Запуск фоновой задачи уведомлений о предстоящих задачах...")
    notification_task = asyncio.create_task(periodic_notification_task())
    await asyncio.sleep(0.1)
    

    try:
        yield
    finally:

        logger.info("Остановка фоновых задач...")
        if aiogram_task:
            aiogram_task.cancel()
            try:
                await aiogram_task
            except Exception:
                logger.exception("Ошибка при остановке polling задачи") 

        if consumer_task:
            consumer_task.cancel()
            try:
                await consumer_task
            except asyncio.CancelledError:
                logger.info("Consumer остановлен")
            except Exception as e:
                logger.exception(f"Ошибка при сотановке брокера: {e}")

        if notification_task:
            logger.info("Отмена задачи уведомлений...")
            notification_task.cancel()
            try:
                await notification_task
            except asyncio.CancelledError:
                logger.info("Задача уведомлений успешно отменена.")
            except Exception:
                logger.exception("Ошибка при остановке задачи уведомлений") 

        await close_connection()


app = FastAPI(
    title="Telegam mini app backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)





app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(logist_router,prefix="/api/v1/logist",tags=["Logist"])
app.include_router(montajnik_router,prefix="/api/v1/montajnik",tags=["Montajnik"])
app.include_router(tech_supp_router,prefix="/api/v1/tech_supp",tags=["Tech Support"])
app.include_router(attachments_router,prefix="/api/v1/attachments",tags=["Attachments"])
app.include_router(super_admin_router,prefix="/api/v1/super_admin",tags=["Super Admin"])
app.include_router(manager_router,prefix="/api/v1/manager",tags=["Manager"])

