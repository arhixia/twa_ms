from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from back.db.database import get_db
from back.db.models import User, UserCompany, Role
from back.auth.auth_schemas import UserResponse,SuperAdminUpdateUserRequest,SuperAdminUserCreate
from back.auth.auth import create_user, get_current_user
from back.auth.auth import get_password_hash

router = APIRouter()

    

def require_super_admin(current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", None) != Role.super_admin:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return current_user

@router.get("/users", response_model=list[UserResponse], summary="Получить всех пользователей (супер админ)")
async def super_admin_get_all_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    result = await db.execute(
        select(User)
        .order_by(User.is_active.desc(),User.company_id, User.role, User.id)
    )
    users = result.scalars().all()
    return [UserResponse.model_validate(user) for user in users]

@router.post("/users", response_model=UserResponse, summary="Создать пользователя (супер админ)")
async def super_admin_create_user(
    user_in: SuperAdminUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    result = await db.execute(
        select(UserCompany).where(UserCompany.id == user_in.company_id)
    )
    company = result.scalars().first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    
    # Проверяем, что логин не занят
    result = await db.execute(
        select(User).where(User.login == user_in.login)
    )
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Login уже занят")
    
    # Проверяем, что telegram_id не занят
    if user_in.telegram_id is not None:
        result = await db.execute(
            select(User).where(User.telegram_id == user_in.telegram_id)
        )
        existing_user = result.scalars().first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Telegram ID уже используется")
    
    # Создаём пользователя
    new_user = await create_user(db=db, user_in=user_in)
    await db.refresh(new_user)
    
    return UserResponse.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserResponse, summary="Редактировать пользователя (супер админ)")
async def super_admin_update_user(
    user_id: int,
    payload: SuperAdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Проверяем, что логин не занят другим пользователем
    if payload.login is not None and payload.login != user.login:
        existing_user_result = await db.execute(select(User).where(User.login == payload.login))
        existing_user = existing_user_result.scalars().first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Логин уже занят другим пользователем.")
    
    # Проверяем, что компания существует (если указана)
    if payload.company_id is not None:
        company_result = await db.execute(select(UserCompany).where(UserCompany.id == payload.company_id))
        company = company_result.scalars().first()
        if not company:
            raise HTTPException(status_code=404, detail="Компания не найдена")
    
    # Обновляем поля
    if payload.name is not None:
        user.name = payload.name
    if payload.lastname is not None:
        user.lastname = payload.lastname
    if payload.login is not None:
        user.login = payload.login
    if payload.password is not None:
        user.hashed_password = get_password_hash(payload.password)
    if payload.role is not None:
        try:
            new_role = Role(payload.role)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверная роль.")
        user.role = new_role
    if payload.company_id is not None:
        user.company_id = payload.company_id
    if payload.is_active is not None:
        user.is_active = payload.is_active

    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)

@router.post("/companies", summary="Создать новую компанию (супер админ)")
async def super_admin_create_company(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Название компании обязательно")

    result = await db.execute(
        select(UserCompany).where(UserCompany.name == name)
    )
    existing_company = result.scalars().first()
    if existing_company:
        raise HTTPException(status_code=400, detail="Компания с таким названием уже существует")
    
    company = UserCompany(name=name)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    
    return {"id": company.id, "name": company.name}

@router.get("/companies", summary="Получить все компании (супер админ)")
async def super_admin_get_all_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    result = await db.execute(
        select(UserCompany)
        .order_by(UserCompany.name)
    )
    companies = result.scalars().all()
    return [{"id": company.id, "name": company.name} for company in companies]