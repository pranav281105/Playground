from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.models.entities import Branch
from app.schemas.branch import BranchCreate, BranchResponse

router = APIRouter(prefix="/branches", tags=["branches"])


@router.post("", response_model=BranchResponse)
def create_branch(
    payload: BranchCreate,
    db: DbSession,
    _: AdminUser,
) -> BranchResponse:
    branch = Branch(branch_name=payload.branch_name, location=payload.location)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return BranchResponse.model_validate(branch)


@router.get("", response_model=list[BranchResponse])
def list_branches(db: DbSession, _: AdminUser) -> list[BranchResponse]:
    branches = list(db.execute(select(Branch).order_by(Branch.created_at.desc())).scalars().all())
    return [BranchResponse.model_validate(branch) for branch in branches]
