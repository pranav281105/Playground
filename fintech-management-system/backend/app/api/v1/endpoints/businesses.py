import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.models.entities import Branch, Business, User
from app.schemas.business import BusinessCreate, BusinessResponse

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.post("", response_model=BusinessResponse)
def create_business(payload: BusinessCreate, db: DbSession, _: AdminUser) -> BusinessResponse:
    business = Business(
        company_id=payload.company_id,
        business_name=payload.business_name,
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return BusinessResponse.model_validate(business)


@router.get("", response_model=list[BusinessResponse])
def list_businesses(
    db: DbSession,
    _: AdminUser,
    company_id: uuid.UUID | None = Query(default=None),
) -> list[BusinessResponse]:
    query = select(Business)
    if company_id is not None:
        query = query.where(Business.company_id == company_id)
    businesses = list(db.execute(query.order_by(Business.created_at.desc())).scalars().all())
    return [BusinessResponse.model_validate(business) for business in businesses]


@router.delete("/{business_id}")
def delete_business(business_id: uuid.UUID, db: DbSession, _: AdminUser) -> dict[str, str]:
    business = db.execute(select(Business).where(Business.business_id == business_id)).scalar_one_or_none()
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    has_branches = db.execute(select(Branch.branch_id).where(Branch.business_id == business_id).limit(1)).scalar_one_or_none()
    if has_branches is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete business with existing branches",
        )

    has_users = db.execute(select(User.user_id).where(User.business_id == business_id).limit(1)).scalar_one_or_none()
    if has_users is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete business with assigned users",
        )

    db.delete(business)
    db.commit()
    return {"message": "Business deleted"}
