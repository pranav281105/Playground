import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.entities import Customer, Invoice, User
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.invoice import InvoiceCreate, InvoiceUpdateDraft
from app.services.access_control import ensure_branch_access
from app.services.financial_engine import quantize_money


def validate_lifecycle_transition(
    current_status: InvoiceStatus,
    target_status: InvoiceStatus,
    user_role: UserRole,
) -> None:
    if target_status == InvoiceStatus.FINALIZED:
        if current_status != InvoiceStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only DRAFT invoices can be finalized",
            )
        return

    if target_status == InvoiceStatus.VOID:
        if user_role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admin can void invoices")
        if current_status != InvoiceStatus.FINALIZED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only FINALIZED invoices can be voided",
            )
        return

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported invoice transition")


class InvoiceService:
    def __init__(self, db: Session):
        self.db = db

    def _invoice_query_for_user(self, current_user: User) -> Select[tuple[Invoice]]:
        query: Select[tuple[Invoice]] = select(Invoice)
        if current_user.role == UserRole.ADMIN:
            return query
        return query.where(Invoice.branch_id == current_user.branch_id)

    def list_invoices(self, current_user: User) -> list[Invoice]:
        query = self._invoice_query_for_user(current_user).order_by(Invoice.created_at.desc())
        return list(self.db.execute(query).scalars().all())

    def get_invoice(self, invoice_id: uuid.UUID, current_user: User) -> Invoice:
        invoice = self.db.execute(
            self._invoice_query_for_user(current_user).where(Invoice.invoice_id == invoice_id)
        ).scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return invoice

    def create_invoice(self, payload: InvoiceCreate, current_user: User) -> Invoice:
        branch_id = current_user.branch_id
        if current_user.role == UserRole.ADMIN:
            customer = self.db.execute(
                select(Customer).where(Customer.customer_id == payload.customer_id)
            ).scalar_one_or_none()
        else:
            if branch_id is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user branch")
            customer = self.db.execute(
                select(Customer).where(
                    Customer.customer_id == payload.customer_id,
                    Customer.branch_id == branch_id,
                )
            ).scalar_one_or_none()

        if not customer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer is invalid for the selected branch",
            )

        selected_branch_id = customer.branch_id
        ensure_branch_access(current_user, selected_branch_id)

        existing = self.db.execute(
            select(Invoice).where(Invoice.invoice_number == payload.invoice_number)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice number already exists")

        invoice = Invoice(
            invoice_number=payload.invoice_number,
            lazada_order_id=payload.lazada_order_id,
            branch_id=selected_branch_id,
            customer_id=payload.customer_id,
            invoice_date=payload.invoice_date,
            sales_amount=quantize_money(payload.sales_amount),
            gross_profit=quantize_money(payload.gross_profit),
            remarks=payload.remarks,
            status=InvoiceStatus.DRAFT,
            created_by=current_user.user_id,
        )
        self.db.add(invoice)
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def update_draft_invoice(
        self,
        invoice_id: uuid.UUID,
        payload: InvoiceUpdateDraft,
        current_user: User,
    ) -> Invoice:
        invoice = self.get_invoice(invoice_id, current_user)
        if invoice.status != InvoiceStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only DRAFT invoices can be edited",
            )

        if payload.invoice_date is not None:
            invoice.invoice_date = payload.invoice_date
        if payload.sales_amount is not None:
            if payload.sales_amount <= Decimal("0"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sales_amount must be > 0")
            invoice.sales_amount = quantize_money(payload.sales_amount)
        if payload.gross_profit is not None:
            invoice.gross_profit = quantize_money(payload.gross_profit)
        if payload.remarks is not None:
            invoice.remarks = payload.remarks

        if invoice.gross_profit > invoice.sales_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="gross_profit must be <= sales_amount",
            )

        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def finalize_invoice(self, invoice_id: uuid.UUID, current_user: User) -> Invoice:
        invoice = self.get_invoice(invoice_id, current_user)
        validate_lifecycle_transition(invoice.status, InvoiceStatus.FINALIZED, current_user.role)
        invoice.status = InvoiceStatus.FINALIZED
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def void_invoice(self, invoice_id: uuid.UUID, current_user: User) -> Invoice:
        invoice = self.get_invoice(invoice_id, current_user)
        validate_lifecycle_transition(invoice.status, InvoiceStatus.VOID, current_user.role)
        invoice.status = InvoiceStatus.VOID
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def delete_draft(self, invoice_id: uuid.UUID, current_user: User) -> None:
        invoice = self.get_invoice(invoice_id, current_user)
        if invoice.status != InvoiceStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only DRAFT invoices can be deleted",
            )
        self.db.delete(invoice)
        self.db.commit()
