from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.entities import FailureCost, FixedCost, VariableCost
from app.models.enums import UserRole
from app.schemas.cost import (
    FailureCostCreate,
    FailureCostResponse,
    FixedCostCreate,
    FixedCostResponse,
    VariableCostCreate,
    VariableCostResponse,
)
from app.services.audit_service import AuditService
from app.services.cost_service import CostService

router = APIRouter(prefix="/costs", tags=["costs"])


def _ensure_branch_user(user: CurrentUser) -> None:
    if user.role == UserRole.BRANCH_MANAGER and user.branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch assignment is required")


@router.post("/fixed", response_model=FixedCostResponse)
def create_fixed_cost(payload: FixedCostCreate, db: DbSession, current_user: CurrentUser) -> FixedCostResponse:
    _ensure_branch_user(current_user)
    cost = CostService(db).create_fixed_cost(payload, current_user)
    AuditService(db).log(user=current_user, action="CREATE", entity="fixed_cost", entity_id=cost.fixed_cost_id)
    db.commit()
    return FixedCostResponse.model_validate(cost)


@router.post("/variable", response_model=VariableCostResponse)
def create_variable_cost(payload: VariableCostCreate, db: DbSession, current_user: CurrentUser) -> VariableCostResponse:
    _ensure_branch_user(current_user)
    cost = CostService(db).create_variable_cost(payload, current_user)
    AuditService(db).log(user=current_user, action="CREATE", entity="variable_cost", entity_id=cost.variable_cost_id)
    db.commit()
    return VariableCostResponse.model_validate(cost)


@router.post("/failure", response_model=FailureCostResponse)
def create_failure_cost(payload: FailureCostCreate, db: DbSession, current_user: CurrentUser) -> FailureCostResponse:
    _ensure_branch_user(current_user)
    cost = CostService(db).create_failure_cost(payload, current_user)
    AuditService(db).log(user=current_user, action="CREATE", entity="failure_cost", entity_id=cost.failure_cost_id)
    db.commit()
    return FailureCostResponse.model_validate(cost)


@router.get("", response_model=dict[str, list])
def list_costs(db: DbSession, current_user: CurrentUser) -> dict[str, list]:
    fixed_query = select(FixedCost)
    variable_query = select(VariableCost)
    failure_query = select(FailureCost)

    if current_user.role != UserRole.ADMIN:
        fixed_query = fixed_query.where(FixedCost.branch_id == current_user.branch_id)
        variable_query = variable_query.where(VariableCost.branch_id == current_user.branch_id)
        failure_query = failure_query.where(FailureCost.branch_id == current_user.branch_id)

    fixed = list(db.execute(fixed_query).scalars().all())
    variable = list(db.execute(variable_query).scalars().all())
    failure = list(db.execute(failure_query).scalars().all())

    return {
        "fixed": [FixedCostResponse.model_validate(item).model_dump(mode="json") for item in fixed],
        "variable": [VariableCostResponse.model_validate(item).model_dump(mode="json") for item in variable],
        "failure": [FailureCostResponse.model_validate(item).model_dump(mode="json") for item in failure],
    }
