import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.entities import AuditLog, User
from app.models.enums import UserRole


class AuditQueryService:
    def __init__(self, db: Session):
        self.db = db

    def list_audit_logs(self, current_user: User, entity: str | None = None) -> list[AuditLog]:
        query: Select[tuple[AuditLog]] = select(AuditLog).order_by(AuditLog.timestamp.desc())
        if current_user.role != UserRole.ADMIN:
            query = query.where(AuditLog.branch_id == current_user.branch_id)
        if entity:
            query = query.where(AuditLog.entity == entity)
        return list(self.db.execute(query).scalars().all())

    def get_by_id(self, audit_id: uuid.UUID, current_user: User) -> AuditLog | None:
        query = select(AuditLog).where(AuditLog.audit_id == audit_id)
        if current_user.role != UserRole.ADMIN:
            query = query.where(AuditLog.branch_id == current_user.branch_id)
        return self.db.execute(query).scalar_one_or_none()
