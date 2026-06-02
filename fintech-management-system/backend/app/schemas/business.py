import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class BusinessCreate(BaseModel):
    company_id: uuid.UUID
    business_name: str = Field(min_length=1, max_length=255)


class BusinessResponse(BaseModel):
    business_id: uuid.UUID
    company_id: uuid.UUID
    business_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
