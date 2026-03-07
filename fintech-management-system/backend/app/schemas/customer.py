import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import RecordStatus


class CustomerCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    contact_person: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = None
    payment_terms: str | None = Field(default=None, max_length=64)
    status: RecordStatus = RecordStatus.ACTIVE


class CustomerUpdate(BaseModel):
    customer_name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_person: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = None
    payment_terms: str | None = Field(default=None, max_length=64)
    status: RecordStatus | None = None


class CustomerResponse(BaseModel):
    customer_id: uuid.UUID
    branch_id: uuid.UUID
    customer_name: str
    contact_person: str | None
    email: EmailStr | None
    phone: str | None
    address: str | None
    payment_terms: str | None
    status: RecordStatus
    created_at: datetime

    model_config = {"from_attributes": True}
