from datetime import date, timedelta
from decimal import Decimal
import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Customer, Invoice, Payment, User
from app.models.enums import InvoiceStatus
from app.schemas.payment import PaymentCreate, ReceivableStatusResponse
from app.services.financial_engine import quantize_money
from app.services.scope_service import apply_branch_scope, apply_scope_filters


def _payment_term_days(payment_terms: str | None) -> int:
    if not payment_terms:
        return 30
    normalized = payment_terms.strip().lower()
    if normalized == "cod":
        return 0
    match = re.search(r"(\d+)", normalized)
    if not match:
        return 30
    return max(0, int(match.group(1)))


class PaymentService:
    def __init__(self, db: Session):
        self.db = db

    def create_payment(self, payload: PaymentCreate, current_user: User) -> Payment:
        invoice_query = apply_branch_scope(
            select(Invoice).where(Invoice.invoice_id == payload.invoice_id),
            current_user,
            Invoice.branch_id,
        )
        invoice = self.db.execute(invoice_query).scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

        if invoice.status != InvoiceStatus.FINALIZED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment can only be recorded for FINALIZED invoices",
            )

        paid_total_raw = self.db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == invoice.invoice_id)
        ).scalar_one()
        paid_total = quantize_money(Decimal(str(paid_total_raw)))
        invoice_total = quantize_money(Decimal(str(invoice.sales_amount)))
        remaining = quantize_money(invoice_total - paid_total)
        if remaining <= Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice is already fully paid")
        amount = quantize_money(payload.amount)
        if amount > remaining:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount exceeds outstanding balance ({remaining})",
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

    def list_payments(
        self,
        current_user: User,
        *,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[Payment]:
        query = apply_scope_filters(
            select(Payment).join(Invoice, Payment.invoice_id == Invoice.invoice_id),
            db=self.db,
            current_user=current_user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        return list(self.db.execute(query.order_by(Payment.created_at.desc())).scalars().all())

    def list_receivables(
        self,
        current_user: User,
        *,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[ReceivableStatusResponse]:
        query = (
            select(
                Invoice.invoice_id.label("invoice_id"),
                Invoice.invoice_number.label("invoice_number"),
                Customer.customer_name.label("customer_name"),
                Customer.payment_terms.label("payment_terms"),
                Invoice.invoice_date.label("invoice_date"),
                Invoice.sales_amount.label("sales_amount"),
                func.coalesce(func.sum(Payment.amount), 0).label("paid_amount"),
            )
            .join(Customer, Customer.customer_id == Invoice.customer_id)
            .outerjoin(Payment, Payment.invoice_id == Invoice.invoice_id)
            .where(Invoice.status == InvoiceStatus.FINALIZED)
            .group_by(
                Invoice.invoice_id,
                Invoice.invoice_number,
                Customer.customer_name,
                Customer.payment_terms,
                Invoice.invoice_date,
                Invoice.sales_amount,
            )
        )
        query = apply_scope_filters(
            query,
            db=self.db,
            current_user=current_user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        query = query.order_by(Invoice.invoice_date.desc(), Invoice.invoice_number.desc())

        today = date.today()
        rows = self.db.execute(query).all()
        result: list[ReceivableStatusResponse] = []
        for row in rows:
            sales = quantize_money(Decimal(str(row.sales_amount)))
            paid = quantize_money(Decimal(str(row.paid_amount)))
            balance = quantize_money(sales - paid)
            if balance <= Decimal("0.00"):
                status_label = "Paid"
                days_overdue = 0
                aging_bucket = "Paid"
            elif paid > Decimal("0.00"):
                status_label = "Partial"
                term_days = _payment_term_days(row.payment_terms)
                due_date = row.invoice_date + timedelta(days=term_days)
                days_overdue = max((today - due_date).days, 0)
                aging_bucket = self._aging_bucket(days_overdue)
                result.append(
                    ReceivableStatusResponse(
                        invoice_id=row.invoice_id,
                        invoice_number=row.invoice_number,
                        customer_name=row.customer_name,
                        invoice_date=row.invoice_date,
                        due_date=due_date,
                        sales_amount=sales,
                        paid_amount=paid,
                        balance_amount=balance,
                        payment_status=status_label,
                        days_overdue=days_overdue,
                        aging_bucket=aging_bucket,
                    )
                )
                continue
            else:
                status_label = "Pending"
                term_days = _payment_term_days(row.payment_terms)
                due_date = row.invoice_date + timedelta(days=term_days)
                days_overdue = max((today - due_date).days, 0)
                aging_bucket = self._aging_bucket(days_overdue)
                result.append(
                    ReceivableStatusResponse(
                        invoice_id=row.invoice_id,
                        invoice_number=row.invoice_number,
                        customer_name=row.customer_name,
                        invoice_date=row.invoice_date,
                        due_date=due_date,
                        sales_amount=sales,
                        paid_amount=paid,
                        balance_amount=balance,
                        payment_status=status_label,
                        days_overdue=days_overdue,
                        aging_bucket=aging_bucket,
                    )
                )
                continue

            term_days = _payment_term_days(row.payment_terms)
            due_date = row.invoice_date + timedelta(days=term_days)
            result.append(
                ReceivableStatusResponse(
                    invoice_id=row.invoice_id,
                    invoice_number=row.invoice_number,
                    customer_name=row.customer_name,
                    invoice_date=row.invoice_date,
                    due_date=due_date,
                    sales_amount=sales,
                    paid_amount=paid,
                    balance_amount=max(balance, Decimal("0.00")),
                    payment_status=status_label,
                    days_overdue=days_overdue,
                    aging_bucket=aging_bucket,
                )
            )

        return result

    @staticmethod
    def _aging_bucket(days_overdue: int) -> str:
        if days_overdue <= 30:
            return "0-30"
        if days_overdue <= 60:
            return "31-60"
        if days_overdue <= 90:
            return "61-90"
        return "90+"
