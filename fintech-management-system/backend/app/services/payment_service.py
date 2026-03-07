from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Invoice, Payment, User
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.payment import PaymentCreate
from app.services.access_control import ensure_branch_access
from app.services.financial_engine import quantize_money


class PaymentService:
    def __init__(self, db: Session):
        self.db = db

    def create_payment(self, payload: PaymentCreate, current_user: User) -> Payment:
        invoice = self.db.execute(select(Invoice).where(Invoice.invoice_id == payload.invoice_id)).scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

        ensure_branch_access(current_user, invoice.branch_id)

        if invoice.status != InvoiceStatus.FINALIZED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment can only be recorded for FINALIZED invoices",
            )

        existing = self.db.execute(select(Payment).where(Payment.invoice_id == invoice.invoice_id)).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment already recorded for this invoice",
            )

        amount = quantize_money(payload.amount)
        if amount != quantize_money(Decimal(str(invoice.sales_amount))):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount must match invoice sales_amount",
            )

        payment = Payment(
            invoice_id=payload.invoice_id,
            payment_date=payload.payment_date,
            payment_method=payload.payment_method,
            amount=amount,
            reference_number=payload.reference_number,
            created_by=current_user.user_id,
        )
        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def list_payments(self, current_user: User) -> list[Payment]:
        query = select(Payment).join(Invoice, Payment.invoice_id == Invoice.invoice_id)
        if current_user.branch_id is not None and current_user.role != UserRole.ADMIN:
            query = query.where(Invoice.branch_id == current_user.branch_id)
        return list(self.db.execute(query.order_by(Payment.created_at.desc())).scalars().all())
