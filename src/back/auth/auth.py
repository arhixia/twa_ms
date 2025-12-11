import json
import logging
from datetime import datetime, timedelta,timezone
from typing import Any, Dict, Optional


from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.config import SECRET_KEY,TOKEN as BOT_TOKEN
from back.db.database import get_db
from back.db.models import  User,Role
from back.auth.auth_schemas import  LoginWithTelegramRequest,  UserCreate,UserResponse,Token,TokenVerificationResponse,LogoutResponse
from typing import Optional
from fastapi import Request
from back.utils.redis_client import redis_client


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
access_token_expire_minutes = 60*24*10


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/token",
    description="JWT Токен",
)


router = APIRouter(
)


#
# Утилитарные функции
#


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user: User,  # передаём объект пользователя
    expires_delta: Optional[timedelta] = None
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=access_token_expire_minutes)
    )
    to_encode = {
        "sub": str(user.id),
        "role": user.role.value,
        "full_name": f"{user.name} {user.lastname}",
        "telegram_id": user.telegram_id,  # если есть
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)



#
# Оснавная логика авторизации
#


async def create_user(db: AsyncSession, user_in: UserCreate) -> User:
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        login=user_in.login,
        telegram_id=user_in.telegram_id,   
        name=user_in.name,
        lastname=user_in.lastname,
        role=Role(user_in.role) if isinstance(user_in.role, str) else user_in.role,
        is_active=user_in.is_active,
        hashed_password=hashed_password
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def authenticate_user(db: AsyncSession, login: str, password: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.login == login))
    user = result.scalars().first()
    if not user or not verify_password(password, user.hashed_password) or not user.is_active:
        return None
    return user


async def verify_token(token: str) -> int:
    try:
        # если Redis недоступен — пропускаем
        if await redis_client.sismember("token_blacklist", token):
            logger.info(f"Token {token} is blacklisted")
            raise HTTPException(status_code=403, detail="Токен отозван")
    except Exception as e:
        logger.warning(f"Redis недоступен, пропускаем blacklist check: {e}")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=403, detail="Не удалось извлечь ID из токена")
        return int(user_id)
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        raise HTTPException(status_code=403, detail="Неверный токен или истек срок действия")



async def get_current_user(
        db: AsyncSession = Depends(get_db),
        token: str = Depends(oauth2_scheme)
) -> User:
    """
    Зависимость для получения текущего пользователя по JWT.
    Также проверяет, активен ли пользователь.
    """
    user_id = await verify_token(token)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт пользователя деактивирован")
    return user


#
#API-ендпоинты
#


@router.post(
    "/register",
    response_model=UserResponse,
    summary="Регистрация нового пользователя",
    description="Администратор создаёт пользователя с паролем."
)
async def register_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Только админ может регистрировать новых пользователей
    if current_user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    # Проверяем, что telegram_id ещё не занят
    result = await db.execute(select(User).where(User.telegram_id == user_in.telegram_id))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    new_user = await create_user(db, user_in)
    return UserResponse.model_validate(new_user)

@router.post("/token", response_model=Token)
async def login_for_access(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    login = form_data.username
    password = form_data.password
    user = await authenticate_user(db, login, password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

    access_token = create_access_token(user)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role.value,
        "fullname": f"{user.name} {user.lastname}"
    }


@router.get(
    "/verify-token/{token}",
    response_model=TokenVerificationResponse,
    summary="Проверка JWT токена"
)
async def verify_user_token(token: str):
    user_id = await verify_token(token)
    return TokenVerificationResponse(user_id=user_id)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Выход и отзыв токена"
)
async def logout(token: str = Depends(oauth2_scheme)):
    await redis_client.sadd("token_blacklist", token)
    logger.info(f"Token {token} успешно отозван")
    return LogoutResponse(message="Вы успешно вышли из системы")


@router.post("/token_with_tg", response_model=Token)
async def login_for_access_with_telegram(
    login_data: LoginWithTelegramRequest, # Принимаем нашу новую схему
    db: AsyncSession = Depends(get_db)
):
    login = login_data.username
    password = login_data.password
    telegram_id = login_data.telegram_id

    user = await authenticate_user(db, login, password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

    if telegram_id is not None:
        # Проверим, не занят ли этот telegram_id другим пользователем
        existing_user_with_tg_id = await db.execute(select(User).where(User.telegram_id == telegram_id))
        existing_user_with_tg_id = existing_user_with_tg_id.scalars().first()
        if existing_user_with_tg_id and existing_user_with_tg_id.id != user.id:
            logger.info(f"Telegram ID {telegram_id} был перезаписан с пользователя {existing_user_with_tg_id.id} на {user.id}")

        # Обновляем telegram_id и, возможно, chat_id у текущего пользователя
        user.telegram_id = telegram_id

        await db.commit()
        await db.refresh(user) # Обновляем объект, чтобы убедиться, что telegram_id установлен
        logger.info(f"Telegram ID {telegram_id} успешно привязан к пользователю {user.id}")


    access_token = create_access_token(user)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role.value,
        "fullname": f"{user.name} {user.lastname}"
    }