import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AuditLog, User


class AuditService:
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        *,
        user: User,
        action: str,
        entity: str,
        entity_id: uuid.UUID | None,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
    ) -> None:
        record = AuditLog(
            user_id=user.user_id,
            branch_id=user.branch_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
        )
        self.db.add(record)
        self.db.flush()
