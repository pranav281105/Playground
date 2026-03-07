import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class BranchCreate(BaseModel):
    branch_name: str = Field(min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=255)


class BranchResponse(BaseModel):
    branch_id: uuid.UUID
    branch_name: str
    location: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
