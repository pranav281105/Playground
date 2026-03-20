import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import RecordStatus


class VendorCreate(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=255)
    contact_person: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    bank_details: str | None = None
    status: RecordStatus = RecordStatus.ACTIVE


class VendorUpdate(BaseModel):
    vendor_name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_person: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    bank_details: str | None = None
    status: RecordStatus | None = None


class VendorResponse(BaseModel):
    vendor_id: uuid.UUID
    vendor_name: str
    contact_person: str | None
    email: EmailStr | None
    phone: str | None
    bank_details: str | None
    status: RecordStatus
    created_at: datetime

    model_config = {"from_attributes": True}
