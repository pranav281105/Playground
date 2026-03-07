from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.report import IncomeStatementReport
from app.services.reporting_service import ReportingService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/income-statement", response_model=IncomeStatementReport)
def income_statement(db: DbSession, current_user: CurrentUser) -> IncomeStatementReport:
    return ReportingService(db).income_statement(current_user)


@router.get("/revenue-summary", response_model=dict[str, str])
def revenue_summary() -> dict[str, str]:
    return {"message": "Pending implementation in next sprint"}


@router.get("/cash-flow", response_model=dict[str, str])
def cash_flow() -> dict[str, str]:
    return {"message": "Pending implementation in next sprint"}
