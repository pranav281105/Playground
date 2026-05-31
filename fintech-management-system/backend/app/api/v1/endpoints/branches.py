import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models.entities import (
    AuditLog,
    Branch,
    Customer,
    FailureCost,
    FixedCost,
    Invoice,
    User,
    VariableCost,
    VendorPayment,
)
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


@router.delete("/{branch_id}")
def delete_branch(branch_id: uuid.UUID, db: DbSession, _: AdminUser) -> dict[str, str]:
    branch = db.execute(select(Branch).where(Branch.branch_id == branch_id)).scalar_one_or_none()
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    if db.execute(select(Customer.customer_id).where(Customer.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing customers")
    if db.execute(select(Invoice.invoice_id).where(Invoice.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing invoices")
    if db.execute(select(FixedCost.fixed_cost_id).where(FixedCost.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing fixed costs")
    if db.execute(
        select(VariableCost.variable_cost_id).where(VariableCost.branch_id == branch_id).limit(1),
    ).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing variable costs")
    if db.execute(select(FailureCost.failure_cost_id).where(FailureCost.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing failure costs")
    if db.execute(
        select(VendorPayment.vendor_payment_id).where(VendorPayment.branch_id == branch_id).limit(1),
    ).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing vendor payments")
    if db.execute(select(AuditLog.audit_id).where(AuditLog.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with existing audit logs")
    if db.execute(select(User.user_id).where(User.branch_id == branch_id).limit(1)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete branch with assigned users")

    db.delete(branch)
    db.commit()
    return {"message": "Branch deleted"}
