import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import BusinessPerformancePoint, CostBreakdownPoint, DashboardSummary, RevenueTrendPoint
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> DashboardSummary:
    return DashboardService(db).get_summary(current_user, business_id=business_id, branch_id=branch_id)


@router.get("/revenue-trend", response_model=list[RevenueTrendPoint])
def revenue_trend(
    db: DbSession,
    current_user: CurrentUser,
    months: int = 6,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[RevenueTrendPoint]:
    return DashboardService(db).revenue_trend(
        current_user,
        months=months,
        business_id=business_id,
        branch_id=branch_id,
    )


@router.get("/cost-breakdown", response_model=list[CostBreakdownPoint])
def cost_breakdown(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[CostBreakdownPoint]:
    return DashboardService(db).cost_breakdown(current_user, business_id=business_id, branch_id=branch_id)


@router.get("/business-performance", response_model=list[BusinessPerformancePoint])
def business_performance(
    db: DbSession,
    current_user: CurrentUser,
    year: int | None = Query(default=None),
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[BusinessPerformancePoint]:
    return DashboardService(db).business_performance(
        current_user,
        year=year,
        business_id=business_id,
        branch_id=branch_id,
    )
