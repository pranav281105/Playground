from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ORMBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str


class TimestampMixin(BaseModel):
    created_at: datetime
