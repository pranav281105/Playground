import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.entities import Branch, User
from app.models.enums import UserRole, is_owner_role


def branch_scope_predicate(current_user: User, branch_column) -> object | None:
    if is_owner_role(current_user.role):
        return None
    if current_user.role == UserRole.BUSINESS_MANAGER:
        if current_user.business_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user business scope")
        return branch_column.in_(select(Branch.branch_id).where(Branch.business_id == current_user.business_id))
    if current_user.branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user branch scope")
    return branch_column == current_user.branch_id


def apply_branch_scope(query: Select, current_user: User, branch_column) -> Select:
    predicate = branch_scope_predicate(current_user, branch_column)
    if predicate is None:
        return query
    return query.where(predicate)


def apply_scope_filters(
    query: Select,
    *,
    db: Session,
    current_user: User,
    branch_column,
    business_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
) -> Select:
    scoped_query = apply_branch_scope(query, current_user, branch_column)

    if business_id is not None:
        if current_user.role == UserRole.BUSINESS_MANAGER and current_user.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Business access denied")
        if current_user.role == UserRole.BRANCH_MANAGER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch manager cannot filter by business")
        scoped_query = scoped_query.where(
            branch_column.in_(select(Branch.branch_id).where(Branch.business_id == business_id))
        )

    if branch_id is not None:
        if current_user.role == UserRole.BUSINESS_MANAGER:
            if current_user.business_id is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user business scope")
            branch_exists = db.execute(
                select(Branch.branch_id).where(
                    Branch.branch_id == branch_id,
                    Branch.business_id == current_user.business_id,
                )
            ).scalar_one_or_none()
            if branch_exists is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch access denied")
        elif current_user.role == UserRole.BRANCH_MANAGER and current_user.branch_id != branch_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch access denied")
        scoped_query = scoped_query.where(branch_column == branch_id)

    if business_id is not None and branch_id is not None:
        relationship_exists = db.execute(
            select(Branch.branch_id).where(
                Branch.branch_id == branch_id,
                Branch.business_id == business_id,
            )
        ).scalar_one_or_none()
        if relationship_exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="branch_id does not belong to business_id",
            )

    return scoped_query
