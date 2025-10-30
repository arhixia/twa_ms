from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict, Any
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal
from fastapi import Depends, HTTPException
from back.db.models import Role, User
from back.auth.auth import get_current_user

def require_roles(*allowed_roles: Role):
    async def _checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user
    return _checker
    
Money = Annotated[Decimal, Field(max_digits=10, decimal_places=2)]

class ReportAttachmentIn(BaseModel):
    photos: List[str]  

class EquipmentItem(BaseModel):
    equipment_id: int
    quantity: int


class AssignmentType(str, Enum):
    individual = "individual"
    broadcast = "broadcast"

class TaskStatus(str, Enum):
    new = "new"
    accepted = "accepted"
    started = "started"
    completed = "completed"
    inspection = "inspection"
    returned = "returned"

class TaskUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    contact_person_id: Optional[int] = None 
    vehicle_info: Optional[str] = None
    comment: Optional[str] = None
    # client_price и montajnik_reward — не принимаем, только возвращаем
    is_draft: Optional[bool] = None
    photo_required: Optional[bool] = None
    assignment_type: Optional[AssignmentType] = None
    assigned_user_id: Optional[int] = None
    attachments_add: Optional[List[str]] = None
    attachments_remove: Optional[List[int]] = None

    model_config = ConfigDict(from_attributes=True)


class DraftIn(BaseModel):
    contact_person_id: Optional[int] = None  
    vehicle_info: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    equipment: Optional[List[EquipmentItem]] = None
    work_types: Optional[List[int]] = None
    assignment_type: Optional[AssignmentType] = None
    assigned_user_id: Optional[int] = None
    comment: Optional[str] = None
    photo_required: Optional[bool] = False
    attachments_add: Optional[List[str]] = None
    attachments_remove: Optional[List[int]] = None

    @field_validator("*", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    model_config = ConfigDict(from_attributes=True)


class DraftOut(BaseModel):
    draft_id: int
    saved_at: datetime
    data: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class PublishIn(BaseModel):
    draft_id: Optional[int] = None
    contact_person_id: Optional[int] = None  
    vehicle_info: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    assignment_type: Optional[AssignmentType] = None
    assigned_user_id: Optional[int] = None
    comment: Optional[str] = None
    equipment: List[EquipmentItem] = Field(default_factory=list)
    work_types: List[int] = Field(default_factory=list)
    photo_required: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True)



class TaskPatch(BaseModel):
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    contact_person_id: Optional[int] = None 
    vehicle_info: Optional[str] = None
    comment: Optional[str] = None
    # client_price и montajnik_reward — не принимаем
    is_draft: Optional[bool] = None
    photo_required: Optional[bool] = None
    assignment_type: Optional[AssignmentType] = None
    assigned_user_id: Optional[int] = None
    attachments_add: Optional[List[str]] = None
    attachments_remove: Optional[List[int]] = None
    equipment: Optional[List[EquipmentItem]] = None
    work_types: Optional[List[int]] = None 

    model_config = ConfigDict(from_attributes=True)


class TaskHistoryItem(BaseModel):
    id: int
    task_id: int
    timestamp: datetime
    user_id: Optional[int] = None
    action: Optional[str] = None
    event_type: Optional[str] = None
    comment: Optional[str] = None
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    related_entity_id: Optional[int] = None
    related_entity_type: Optional[str] = None

    company_id: Optional[int] = None  
    contact_person_id: Optional[int] = None
    vehicle_info: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    comment_field: Optional[str] = None
    status: Optional[str] = None
    assigned_user_id: Optional[int] = None
    client_price: Optional[Money] = None
    montajnik_reward: Optional[Money] = None
    photo_required: Optional[bool] = None
    assignment_type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ReportReviewIn(BaseModel):
    approval: Literal["approved", "rejected"]
    comment: Optional[str] = None
    photos: Optional[List[str]] = None
    

    model_config = ConfigDict(from_attributes=True)

class SimpleMsg(BaseModel):
    detail: str

    model_config = ConfigDict(from_attributes=True)



class MontajnikReportReview(BaseModel):
    report_id: int
    task_id: int
    review_comment: Optional[str] = None
    review_photos: List[str]  # Список URL фото
    reviewer_role: str  # 'logist' или 'tech_supp'
    approval_status: str  # 'approved', 'rejected', 'waiting'
    reviewed_at: Optional[datetime] = None
    original_report_text: Optional[str] = None
    original_report_photos: List[str]  # Список URL фото из оригинального отчёта

    model_config = ConfigDict(from_attributes=True)