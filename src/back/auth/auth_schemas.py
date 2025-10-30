from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from back.db.models import Role


class Role(str, Enum):
    admin = "admin"
    logist = "logist"
    montajnik = "montajnik"
    tech_supp = "tech_supp"



# Схемы для работы с пользователем

class LoginWithTelegramRequest(BaseModel):
    username: str
    password: str
    telegram_id: Optional[int]



class UserBase(BaseModel):
    telegram_id: Optional[int] = Field(None, description="Telegram user ID")
    name:       str = Field(..., description="Имя пользователя")
    lastname:   str = Field(..., description="Фамилия пользователя")
    role:       Role = Field(..., description="Роль пользователя")
    is_active:  bool = Field(True, description="Активность пользователя")

    model_config = ConfigDict(from_attributes=True)


class UserCreate(UserBase):
    login: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=6)


class UserResponse(UserBase):
    id: int
    login: str
    
    model_config = ConfigDict(from_attributes=True)


# Схемы для работы с JWT

class Token(BaseModel):
    """
    Ответ при получении access_token.
    """
    access_token: str = Field(..., description="JWT токен доступа")
    token_type: str = Field("bearer", description="Тип токена")
    user_id: int = Field(..., description="ID авторизованного пользователя")
    role: str = Field(..., description="Роль пользователя")  
    fullname: str = Field(..., description="Полное имя пользователя")


class TokenVerificationResponse(BaseModel):
    """
    Ответ при проверке токена (можно дергать на фронте при reload).
    """
    user_id: int = Field(..., description="ID пользователя, к которому привязан токен")


class LogoutResponse(BaseModel):
    """
    Ответ на /logout.
    """
    message: str = Field(..., description="Сообщение о результате выхода")


class RoleChange(BaseModel):
    role: Role


class VerifyWebAppRequest(BaseModel):
    init_data: str  

class VerifyWebAppResponse(BaseModel):
    ok: bool
    payload: dict

class LinkTelegramRequest(BaseModel):
    init_data: str

