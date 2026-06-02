import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)


class CompanyResponse(BaseModel):
    company_id: uuid.UUID
    company_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
