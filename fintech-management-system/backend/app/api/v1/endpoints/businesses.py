import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.models.entities import Business
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
