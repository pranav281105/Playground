from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.models.entities import Company
from app.schemas.company import CompanyCreate, CompanyResponse

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=CompanyResponse)
def create_company(payload: CompanyCreate, db: DbSession, _: AdminUser) -> CompanyResponse:
    company = Company(company_name=payload.company_name)
    db.add(company)
    db.commit()
    db.refresh(company)
    return CompanyResponse.model_validate(company)


@router.get("", response_model=list[CompanyResponse])
def list_companies(db: DbSession, _: AdminUser) -> list[CompanyResponse]:
    companies = list(db.execute(select(Company).order_by(Company.created_at.desc())).scalars().all())
    return [CompanyResponse.model_validate(company) for company in companies]
