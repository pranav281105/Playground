import uuid

from fastapi import HTTPException, status

from app.models.entities import User
from app.models.enums import UserRole, is_owner_role


def ensure_branch_access(current_user: User, branch_id: uuid.UUID) -> None:
    if is_owner_role(current_user.role):
        return
    if current_user.role == UserRole.BUSINESS_MANAGER:
        # Branch-level checks for business manager are applied in query-scoping services.
        return
    if current_user.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-branch access is not allowed",
        )


def ensure_admin(current_user: User) -> None:
    if not is_owner_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
