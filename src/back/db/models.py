from sqlalchemy import (
    JSON, Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, Numeric, BigInteger, func
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncAttrs
from back.db.database import Base
from datetime import datetime
import enum
from zoneinfo import ZoneInfo

UTC_PLUS_5 = ZoneInfo("Asia/Yekaterinburg")

def now_ekb():
    return datetime.now(UTC_PLUS_5)


class FileType(enum.Enum):
    photo = "photo"
    document = "document"
    video = "video"

#USERS

class AssignmentType(enum.Enum):
    individual = "individual"  # Назначение конкретному монтажнику
    broadcast = "broadcast"  # Рассылка всем монтажникам


class Role(enum.Enum):
    admin = "admin"
    logist = "logist"
    montajnik = "montajnik"
    tech_supp = "tech_supp"


class TaskStatus(enum.Enum):
    new = "new"  # Создана
    accepted = "accepted"  # Принята монтажником
    on_the_road = "on_the_road" #выехал на работу 
    started = "started"  # В процессе выполнения
    on_site = "on_site"  #прибыл на место 
    completed = "completed"  # Завершена
    inspection = "inspection"  # На проверке логистом/тех поддержкой
    returned = "returned"  # Возвращена на доработку


class ReportApproval(enum.Enum):
    waiting = "waiting" # Ожидает проверки
    approved = "approved" # Проверено и принято
    rejected = "rejected" # Отклонено, требуется доработка
    

class User(AsyncAttrs, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=False, index=True, nullable=True) #помнеь на unique 
    name = Column(String,nullable = False) #имя 
    lastname = Column(String,nullable = False) #фамилия
    role = Column(Enum(Role),nullable = False, index = True) #роль
    is_active = Column(Boolean, default=True) #можно отключить юзера -> не приходит рассылка 
    login = Column(String(30),unique=True,index = True,nullable=False) 
    hashed_password = Column(String, nullable=False)

    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="assigned_user", foreign_keys="[Task.assigned_user_id]")
    reports = relationship("TaskReport", back_populates="author", cascade="all, delete-orphan")
    

class TelegramMapping(Base):
    __tablename__ = "telegram_mappings"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, index=True, nullable=False)
    chat_id = Column(BigInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_ekb(), nullable=False)
    consumed = Column(Boolean, default=False, nullable=False)
    linked_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # relation to user (optional)
    linked_user = relationship("User", backref="telegram_mappings", foreign_keys=[linked_user_id])

# TASKS


class Task(AsyncAttrs, Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=now_ekb)
    scheduled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    location = Column(String, nullable=True)
    contact_person_id = Column(Integer, ForeignKey("contact_persons.id", ondelete="SET NULL"), index=True, nullable=True)
    company_id = Column(Integer, ForeignKey("client_companies.id", ondelete="SET NULL"), index=True, nullable=True)
    vehicle_info = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.new, index=True)
    assignment_type = Column(Enum(AssignmentType), nullable=True, index=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    logist_contact_id = Column(BigInteger, nullable=True)
    client_price = Column(Numeric(10,2), nullable=True)
    montajnik_reward = Column(Numeric(10,2), nullable=True)

    # owner of draft / creator of the task
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # infrastructure flags
    is_draft = Column(Boolean, default=True, index=True)
    photo_required = Column(Boolean, default=False)

    # optional optimistic locking
    version = Column(Integer, default=1, nullable=False)

    accepted_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    assigned_user = relationship("User", back_populates="tasks", foreign_keys=[assigned_user_id])
    creator = relationship("User", foreign_keys=[created_by])
    contact_person = relationship("ContactPerson", back_populates="tasks")
    company = relationship("ClientCompany")
    works = relationship("TaskWork", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")
    history = relationship("TaskHistory", back_populates="task", cascade="all, delete-orphan", order_by="TaskHistory.timestamp")
    reports = relationship("TaskReport", back_populates="task", cascade="all, delete-orphan")
    broadcast_responses = relationship("BroadcastResponse", back_populates="task", cascade="all, delete-orphan")
    equipment_links = relationship("TaskEquipment", back_populates="task", cascade="all, delete-orphan")



class WorkType(AsyncAttrs, Base):
    __tablename__ = "work_types"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)                      # Название работы (АТ, тахография и т.д.)
    created_at = Column(DateTime(timezone=True), default=now_ekb)
    client_price = Column(Numeric(10, 2), nullable=True)         # Стоимость работы (цена клиента)
    montajnik_price = Column(Numeric(10, 2), nullable=True)    # Цена монтажнику (если отличается)
    is_active = Column(Boolean, default=True)                  # Активен ли тип работы

    task_works = relationship("TaskWork", back_populates="work_type", cascade="all, delete-orphan")



class TaskWork(AsyncAttrs, Base):
    __tablename__ = "task_works"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=now_ekb)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)           # Задача
    work_type_id = Column(Integer, ForeignKey("work_types.id", ondelete="CASCADE"), index=True, nullable=False) # Тип работы
    confirmed_by_montajnik = Column(Boolean, default=False)                 # Отметил ли монтажник выполнение

    task = relationship("Task", back_populates="works")
    work_type = relationship("WorkType", back_populates="task_works")


class TaskAttachment(AsyncAttrs, Base):
    __tablename__ = "task_attachments"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    report_id = Column(Integer, ForeignKey("task_reports.id", ondelete="SET NULL"), index=True, nullable=True)

    storage_key = Column(String, nullable=False, index=True)         # ключ в S3 (обязателен)
    file_type = Column(Enum(FileType), nullable=False)               # photo | video
    original_name = Column(String, nullable=True)                    # исходное имя файла
    mime_type = Column(String, nullable=True)
    size = Column(BigInteger, nullable=True)                         # байты, до 10 GiB

    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    uploader_role = Column(String, nullable=True)                    # хранить как строку: logist/montajnik/tech_supp/admin

    checksum = Column(String(128), nullable=True)                    # sha256
    processed = Column(Boolean, default=False, nullable=False)       # фон.обработка прошла успешно
    error_text = Column(Text, nullable=True)                         # текст ошибки обработки, если есть

    thumb_key = Column(String, nullable=True)                        # ключ превью/thumbnail в S3
    uploaded_at = Column(DateTime(timezone=True), default=now_ekb)
    deleted_at = Column(DateTime(timezone=True), nullable=True)      # soft delete

    task = relationship("Task", back_populates="attachments")
    report = relationship("TaskReport")
    uploader = relationship("User")


class ClientCompany(AsyncAttrs, Base):
    __tablename__ = "client_companies"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)  # Название компании/ИП

    contact_persons = relationship("ContactPerson", back_populates="company", cascade="all, delete-orphan")


class ContactPerson(AsyncAttrs, Base):
    __tablename__ = "contact_persons"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("client_companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    

    company = relationship("ClientCompany", back_populates="contact_persons")
    tasks = relationship("Task", back_populates="contact_person")


class TaskReport(AsyncAttrs, Base):
    __tablename__ = "task_reports"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    text = Column(Text, nullable=True)                # текст отчёта от монтажника/техспец
    photos_json = Column(Text, nullable=True)         # JSON array of storage_keys / telegram_file_ids
    created_at = Column(DateTime(timezone=True), default=now_ekb)

    # проверки (логист / тех.спец)
    approval_logist = Column(Enum(ReportApproval), default=ReportApproval.waiting, nullable=False)
    approval_tech = Column(Enum(ReportApproval), default=ReportApproval.waiting, nullable=False)
    review_comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    attachments = relationship("TaskAttachment", back_populates="report")

    task = relationship("Task", back_populates="reports")
    author = relationship("User", back_populates="reports")


class TaskHistoryEventType(enum.Enum):
    field_changed = "field_changed"
    status_changed = "status_changed"
    report_status_changed = "report_status_changed" # Для логиста/теха
    report_submitted = "report_submitted"
    attachment_added = "attachment_added"
    attachment_removed = "attachment_removed"
    assigned = "assigned"
    unassigned = "unassigned"
    created = "created" 
    published = "published" 
    updated = "updated"

    
class TaskHistory(AsyncAttrs, Base):
    __tablename__ = "task_history"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=func.now(), nullable=False) # Убедиться, что есть
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    
    # action - статус задачи на момент события (как раньше)
    action = Column(Enum(TaskStatus), nullable=True) 
    
    # Новый тип события
    event_type = Column(Enum(TaskHistoryEventType), nullable=True) 
    
    # comment - текстовое описание или JSON, как раньше
    comment = Column(Text, nullable=True) 

    # --- НОВЫЕ ПОЛЯ ДЛЯ СТРУКТУРИРОВАННЫХ ДАННЫХ ---
    # Имя поля, которое изменилось (например, "client", "scheduled_at")
    field_name = Column(String, nullable=True) 
    
    # Старое значение поля (в виде строки)
    old_value = Column(Text, nullable=True) 
    
    # Новое значение поля (в виде строки)
    new_value = Column(Text, nullable=True) 

    # ID связанной сущности (например, ID отчета или вложения)
    related_entity_id = Column(Integer, nullable=True) 
    
    # Тип связанной сущности (например, "report", "attachment")
    related_entity_type = Column(String, nullable=True) 

    # --- ПОЛНЫЕ ПОЛЯ ЗАДАЧИ НА МОМЕНТ СОБЫТИЯ ---
    contact_person_id = Column(Integer, ForeignKey("contact_persons.id", ondelete="SET NULL"), index=True, nullable=True)
    company_id = Column(Integer, ForeignKey("client_companies.id", ondelete="SET NULL"), index=True, nullable=True)
    vehicle_info = Column(String, nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=True)
    comment_field = Column(Text, nullable=True) # избегаем конфликта с полем comment
    status = Column(Enum(TaskStatus), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    client_price = Column(Numeric(10,2), nullable=True)
    montajnik_reward = Column(Numeric(10,2), nullable=True)
    photo_required = Column(Boolean, default=False)
    assignment_type = Column(Enum(AssignmentType), nullable=True)
    

    

    # --- Отношения ---
    company = relationship("ClientCompany")
    contact_person = relationship("ContactPerson")
    task = relationship("Task", back_populates="history")
    user = relationship("User", foreign_keys=[user_id]) 

    def __repr__(self):
        return f"<TaskHistory(id={self.id}, task_id={self.task_id}, event_type={self.event_type}, field_name={self.field_name}, timestamp={self.timestamp})>"




class BroadcastResponse(AsyncAttrs, Base):
    __tablename__ = "broadcast_responses"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=now_ekb)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)         # Задача
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)    # Откликнувшийся монтажник
    responded_at = Column(DateTime(timezone=True), default=now_ekb)  # Время отклика (UTC+5)
    is_first = Column(Boolean, default=False)           # Первый отклик (за кем закрепилась задача)
    
    task = relationship("Task")
    user = relationship("User")


class Equipment(AsyncAttrs,Base):
    __tablename__ = "equipment"
    
    id = Column(Integer, primary_key=True)
    name = Column(String,nullable=False) #Название оборудования
    category = Column(String,nullable=False)
    price = Column(Numeric(10,2),nullable=False) #Цена за единицу

    tasks = relationship("TaskEquipment", back_populates="equipment", cascade="all, delete-orphan")

class TaskEquipment(AsyncAttrs,Base):
    __tablename__ = "task_equipment" 

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False) #Задача
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), index=True, nullable=False) #Оборудование
    quantity = Column(Integer,nullable=False) #Количество

    task =relationship("Task",back_populates="equipment_links")
    equipment = relationship("Equipment",back_populates="tasks")


class Notification(AsyncAttrs,Base):
    __tablename__ = "notifications"

    id = Column(Integer,primary_key = True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    message = Column(Text,nullable=False)
    created_at = Column(DateTime(timezone=True),default=now_ekb)
    is_sent = Column(Boolean,default=False)

    user = relationship("User", back_populates="notifications")
    task = relationship("Task")

    


    



