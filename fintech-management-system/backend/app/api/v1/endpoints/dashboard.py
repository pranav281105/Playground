from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(db: DbSession, current_user: CurrentUser) -> DashboardSummary:
    return DashboardService(db).get_summary(current_user)


@router.get("/revenue-trend", response_model=dict[str, list])
def revenue_trend() -> dict[str, list]:
    return {"message": ["Pending implementation in next sprint"]}


@router.get("/cost-breakdown", response_model=dict[str, list])
def cost_breakdown() -> dict[str, list]:
    return {"message": ["Pending implementation in next sprint"]}
