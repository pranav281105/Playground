import uuid

from fastapi import HTTPException, status

from app.models.entities import User
from app.models.enums import UserRole


def ensure_branch_access(current_user: User, branch_id: uuid.UUID) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-branch access is not allowed",
        )


def ensure_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
