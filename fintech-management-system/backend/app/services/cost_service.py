from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import FailureCost, FixedCost, Invoice, User, VariableCost
from app.schemas.cost import FailureCostCreate, FixedCostCreate, VariableCostCreate
from app.services.financial_engine import quantize_money


class CostService:
    def __init__(self, db: Session):
        self.db = db

    def create_fixed_cost(self, payload: FixedCostCreate, current_user: User) -> FixedCost:
        if current_user.branch_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
        cost = FixedCost(
            branch_id=current_user.branch_id,
            category=payload.category,
            amount=quantize_money(payload.amount),
            date=payload.date,
            description=payload.description,
            created_by=current_user.user_id,
        )
        self.db.add(cost)
        self.db.commit()
        self.db.refresh(cost)
        return cost

    def create_variable_cost(self, payload: VariableCostCreate, current_user: User) -> VariableCost:
        if current_user.branch_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
        cost = VariableCost(
            branch_id=current_user.branch_id,
            category=payload.category,
            amount=quantize_money(payload.amount),
            date=payload.date,
            description=payload.description,
            created_by=current_user.user_id,
        )
        self.db.add(cost)
        self.db.commit()
        self.db.refresh(cost)
        return cost

    def create_failure_cost(self, payload: FailureCostCreate, current_user: User) -> FailureCost:
        if current_user.branch_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
        if payload.related_invoice is not None:
            invoice = self.db.execute(
                select(Invoice).where(Invoice.invoice_id == payload.related_invoice)
            ).scalar_one_or_none()
            if not invoice:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="related_invoice does not exist",
                )

        cost = FailureCost(
            branch_id=current_user.branch_id,
            related_invoice=payload.related_invoice,
            failure_type=payload.failure_type,
            amount=quantize_money(payload.amount),
            root_cause=payload.root_cause,
            corrective_action=payload.corrective_action,
            date=payload.date,
            created_by=current_user.user_id,
        )
        self.db.add(cost)
        self.db.commit()
        self.db.refresh(cost)
        return cost
