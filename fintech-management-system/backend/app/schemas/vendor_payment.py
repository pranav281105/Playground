import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod


class VendorPaymentCreate(BaseModel):
    vendor_id: uuid.UUID
    bill_number: str | None = Field(default=None, max_length=64)
    amount: Decimal = Field(gt=Decimal("0"))
    payment_date: date
    payment_method: PaymentMethod


class VendorPaymentUpdate(BaseModel):
    bill_number: str | None = Field(default=None, max_length=64)
    amount: Decimal | None = Field(default=None, gt=Decimal("0"))
    payment_date: date | None = None
    payment_method: PaymentMethod | None = None


class VendorPaymentResponse(BaseModel):
    vendor_payment_id: uuid.UUID
    vendor_id: uuid.UUID
    branch_id: uuid.UUID
    bill_number: str | None
    amount: Decimal
    payment_date: date
    payment_method: PaymentMethod
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
