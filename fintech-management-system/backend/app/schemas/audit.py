import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    audit_id: uuid.UUID
    user_id: uuid.UUID
    branch_id: uuid.UUID | None
    action: str
    entity: str
    entity_id: uuid.UUID | None
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    timestamp: datetime

    model_config = {"from_attributes": True}
