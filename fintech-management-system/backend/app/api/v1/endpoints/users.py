import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.models.entities import Branch, Business, Company, User
from app.models.enums import UserRole
from app.schemas.auth import UserResponse
from app.schemas.user_admin import UserScopeUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _normalize_scope(
    db: DbSession,
    *,
    role: UserRole,
    company_id: uuid.UUID | None,
    business_id: uuid.UUID | None,
    branch_id: uuid.UUID | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    business: Business | None = None
    branch: Branch | None = None

    if company_id is not None:
        company = db.execute(select(Company).where(Company.company_id == company_id)).scalar_one_or_none()
        if company is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if business_id is not None:
        business = db.execute(select(Business).where(Business.business_id == business_id)).scalar_one_or_none()
        if business is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
        if company_id is not None and business.company_id != company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Business does not belong to company",
            )

    if branch_id is not None:
        branch = db.execute(select(Branch).where(Branch.branch_id == branch_id)).scalar_one_or_none()
        if branch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
        if business_id is not None and branch.business_id != business_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch does not belong to business",
            )

    normalized_company_id = company_id
    normalized_business_id = business_id
    normalized_branch_id = branch_id

    if normalized_business_id is None and branch is not None and branch.business_id is not None:
        normalized_business_id = branch.business_id

    if normalized_business_id is not None:
        if business is None:
            business = db.execute(select(Business).where(Business.business_id == normalized_business_id)).scalar_one_or_none()
        if business is not None and normalized_company_id is None:
            normalized_company_id = business.company_id

    if role in {UserRole.OWNER, UserRole.ADMIN}:
        normalized_business_id = None
        normalized_branch_id = None
    elif role == UserRole.BUSINESS_MANAGER:
        normalized_branch_id = None
        if normalized_business_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Business manager must be assigned to a business",
            )
    elif role == UserRole.BRANCH_MANAGER and normalized_branch_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch manager must be assigned to a branch",
        )

    return normalized_company_id, normalized_business_id, normalized_branch_id


@router.get("", response_model=list[UserResponse])
def list_users(db: DbSession, _: AdminUser) -> list[UserResponse]:
    users = list(db.execute(select(User).order_by(User.created_at.desc())).scalars().all())
    return [UserResponse.model_validate(user) for user in users]


@router.patch("/{user_id}/scope", response_model=UserResponse)
def update_user_scope(
    user_id: uuid.UUID,
    payload: UserScopeUpdate,
    db: DbSession,
    _: AdminUser,
) -> UserResponse:
    user = db.execute(select(User).where(User.user_id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    company_id = user.company_id
    business_id = user.business_id
    branch_id = user.branch_id

    if "company_id" in payload.model_fields_set:
        company_id = payload.company_id
    if "business_id" in payload.model_fields_set:
        business_id = payload.business_id
    if "branch_id" in payload.model_fields_set:
        branch_id = payload.branch_id

    (
        normalized_company_id,
        normalized_business_id,
        normalized_branch_id,
    ) = _normalize_scope(
        db,
        role=user.role,
        company_id=company_id,
        business_id=business_id,
        branch_id=branch_id,
    )

    user.company_id = normalized_company_id
    user.business_id = normalized_business_id
    user.branch_id = normalized_branch_id

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
