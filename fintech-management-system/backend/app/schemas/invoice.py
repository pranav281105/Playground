import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import InvoiceStatus


class InvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=64)
    lazada_order_id: str | None = Field(default=None, max_length=128)
    customer_id: uuid.UUID
    invoice_date: date
    sales_amount: Decimal = Field(gt=Decimal("0"))
    gross_profit: Decimal = Field(ge=Decimal("0"))
    remarks: str | None = None

    @model_validator(mode="after")
    def validate_financials(self) -> "InvoiceCreate":
        if self.gross_profit > self.sales_amount:
            raise ValueError("gross_profit must be less than or equal to sales_amount")
        return self


class InvoiceUpdateDraft(BaseModel):
    invoice_date: date | None = None
    sales_amount: Decimal | None = None
    gross_profit: Decimal | None = None
    remarks: str | None = None

    @model_validator(mode="after")
    def validate_financials(self) -> "InvoiceUpdateDraft":
        if (
            self.sales_amount is not None
            and self.gross_profit is not None
            and self.gross_profit > self.sales_amount
        ):
            raise ValueError("gross_profit must be less than or equal to sales_amount")
        return self


class InvoiceResponse(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    lazada_order_id: str | None
    branch_id: uuid.UUID
    customer_id: uuid.UUID
    invoice_date: date
    sales_amount: Decimal
    gross_profit: Decimal
    cogs: Decimal
    status: InvoiceStatus
    remarks: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceLifecycleAction(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
