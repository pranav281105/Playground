import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models.entities import Branch
from app.schemas.branch import BranchCreate, BranchResponse
from app.services.scope_service import apply_scope_filters

router = APIRouter(prefix="/branches", tags=["branches"])


@router.post("", response_model=BranchResponse)
def create_branch(
    payload: BranchCreate,
    db: DbSession,
    _: AdminUser,
) -> BranchResponse:
    branch = Branch(
        business_id=payload.business_id,
        branch_name=payload.branch_name,
        location=payload.location,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return BranchResponse.model_validate(branch)


@router.get("", response_model=list[BranchResponse])
def list_branches(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
) -> list[BranchResponse]:
    query = apply_scope_filters(
        select(Branch),
        db=db,
        current_user=current_user,
        branch_column=Branch.branch_id,
        business_id=business_id,
    )
    branches = list(db.execute(query.order_by(Branch.created_at.desc())).scalars().all())
    return [BranchResponse.model_validate(branch) for branch in branches]
