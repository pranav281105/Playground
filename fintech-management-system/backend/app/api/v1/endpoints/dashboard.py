from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import CostBreakdownPoint, DashboardSummary, RevenueTrendPoint
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(db: DbSession, current_user: CurrentUser) -> DashboardSummary:
    return DashboardService(db).get_summary(current_user)


@router.get("/revenue-trend", response_model=list[RevenueTrendPoint])
def revenue_trend(db: DbSession, current_user: CurrentUser, months: int = 6) -> list[RevenueTrendPoint]:
    return DashboardService(db).revenue_trend(current_user, months=months)


@router.get("/cost-breakdown", response_model=list[CostBreakdownPoint])
def cost_breakdown(db: DbSession, current_user: CurrentUser) -> list[CostBreakdownPoint]:
    return DashboardService(db).cost_breakdown(current_user)
