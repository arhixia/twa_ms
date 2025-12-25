# back/bot_worker.py
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from back.db.config import TOKEN as BOT_TOKEN
from back.db.config import WEB_APP_URL

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(Command(commands=["start"]))
async def handle_start(message: types.Message):
    if not WEB_APP_URL:
        await message.reply("WebApp URL not configured on server")
        return
    kb = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="Open", web_app=types.WebAppInfo(url=WEB_APP_URL))]
    ])
    await message.reply("Нажмите Open чтобы открыть мини‑приложение", reply_markup=kb)

async def start_polling():
    try:
        await dp.start_polling(bot)
    except asyncio.CancelledError:
        pass
    finally:
        await bot.session.close()
