import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import User, Vendor, VendorPayment
from app.models.enums import UserRole
from app.schemas.vendor_payment import VendorPaymentCreate, VendorPaymentUpdate
from app.services.financial_engine import quantize_money


class VendorPaymentService:
    def __init__(self, db: Session):
        self.db = db

    def create_vendor_payment(self, payload: VendorPaymentCreate, current_user: User) -> VendorPayment:
        if current_user.branch_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")

        vendor = self.db.execute(select(Vendor).where(Vendor.vendor_id == payload.vendor_id)).scalar_one_or_none()
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

        payment = VendorPayment(
            vendor_id=payload.vendor_id,
            branch_id=current_user.branch_id,
            bill_number=payload.bill_number,
            amount=quantize_money(payload.amount),
            payment_date=payload.payment_date,
            payment_method=payload.payment_method,
            created_by=current_user.user_id,
        )
        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def list_vendor_payments(self, current_user: User) -> list[VendorPayment]:
        query = select(VendorPayment).order_by(VendorPayment.created_at.desc())
        if current_user.role != UserRole.ADMIN:
            query = query.where(VendorPayment.branch_id == current_user.branch_id)
        return list(self.db.execute(query).scalars().all())

    def update_vendor_payment(
        self,
        vendor_payment_id: uuid.UUID,
        payload: VendorPaymentUpdate,
        current_user: User,
    ) -> VendorPayment:
        payment = self.db.execute(
            select(VendorPayment).where(VendorPayment.vendor_payment_id == vendor_payment_id)
        ).scalar_one_or_none()
        if not payment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor payment not found")

        if current_user.role != UserRole.ADMIN and payment.branch_id != current_user.branch_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-branch access denied")

        update_data = payload.model_dump(exclude_unset=True)
        if "amount" in update_data and update_data["amount"] is not None:
            update_data["amount"] = quantize_money(update_data["amount"])

        for field, value in update_data.items():
            setattr(payment, field, value)

        self.db.commit()
        self.db.refresh(payment)
        return payment
