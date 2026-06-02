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


class ReceivableStatusResponse(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    customer_name: str
    invoice_date: date
    due_date: date
    sales_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    payment_status: str
    days_overdue: int
    aging_bucket: str
