import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod


class PaymentCreate(BaseModel):
    invoice_id: uuid.UUID
    payment_date: date
    payment_method: PaymentMethod
    amount: Decimal = Field(gt=Decimal("0"))
    reference_number: str | None = Field(default=None, max_length=128)


class PaymentResponse(BaseModel):
    payment_id: uuid.UUID
    invoice_id: uuid.UUID
    payment_date: date
    payment_method: PaymentMethod
    amount: Decimal
    reference_number: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
