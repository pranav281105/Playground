import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import FailureType


class CostBase(BaseModel):
    category: str = Field(min_length=1, max_length=128)
    amount: Decimal = Field(gt=Decimal("0"))
    date: date
    description: str | None = None


class FixedCostCreate(CostBase):
    pass


class VariableCostCreate(CostBase):
    pass


class FailureCostCreate(BaseModel):
    related_invoice: uuid.UUID | None = None
    failure_type: FailureType
    amount: Decimal = Field(gt=Decimal("0"))
    root_cause: str | None = None
    corrective_action: str | None = None
    date: date


class FixedCostResponse(BaseModel):
    fixed_cost_id: uuid.UUID
    branch_id: uuid.UUID
    category: str
    amount: Decimal
    date: date
    description: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class VariableCostResponse(BaseModel):
    variable_cost_id: uuid.UUID
    branch_id: uuid.UUID
    category: str
    amount: Decimal
    date: date
    description: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class FailureCostResponse(BaseModel):
    failure_cost_id: uuid.UUID
    branch_id: uuid.UUID
    related_invoice: uuid.UUID | None
    failure_type: FailureType
    amount: Decimal
    root_cause: str | None
    corrective_action: str | None
    date: date
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
