from contextlib import asynccontextmanager
import os
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
from back.db.config import TOKEN as BOT_TOKEN,WEB_APP_URL
from back.db.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.models import  User
import asyncio
from aiogram import Bot, Dispatcher, types


from back.bot_worker import start_polling

@asynccontextmanager
async def lifespan(app):
    # startup
    aiogram_task = None
    if BOT_TOKEN:
        aiogram_task = asyncio.create_task(start_polling())
        # даём небольшую паузу, чтобы polling стартовал и ошибки сразу вылезли в логи
        await asyncio.sleep(0.1)
    try:
        yield
    finally:
        # shutdown
        if aiogram_task:
            aiogram_task.cancel()
            try:
                await aiogram_task
            except Exception:
                pass

app = FastAPI(
    title="Telegam mini app backend",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # добавь свой домен
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




