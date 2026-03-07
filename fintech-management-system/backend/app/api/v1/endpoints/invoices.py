import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.invoice import InvoiceCreate, InvoiceLifecycleAction, InvoiceResponse, InvoiceUpdateDraft
from app.services.audit_service import AuditService
from app.services.invoice_service import InvoiceService

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceResponse)
def create_invoice(payload: InvoiceCreate, db: DbSession, current_user: CurrentUser) -> InvoiceResponse:
    invoice = InvoiceService(db).create_invoice(payload, current_user)
    AuditService(db).log(
        user=current_user,
        action="CREATE",
        entity="invoice",
        entity_id=invoice.invoice_id,
        new_value=InvoiceResponse.model_validate(invoice).model_dump(mode="json"),
    )
    db.commit()
    return InvoiceResponse.model_validate(invoice)


@router.get("", response_model=list[InvoiceResponse])
def list_invoices(db: DbSession, current_user: CurrentUser) -> list[InvoiceResponse]:
    invoices = InvoiceService(db).list_invoices(current_user)
    return [InvoiceResponse.model_validate(invoice) for invoice in invoices]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> InvoiceResponse:
    invoice = InvoiceService(db).get_invoice(invoice_id, current_user)
    return InvoiceResponse.model_validate(invoice)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_draft_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceUpdateDraft,
    db: DbSession,
    current_user: CurrentUser,
) -> InvoiceResponse:
    service = InvoiceService(db)
    before = service.get_invoice(invoice_id, current_user)
    old_state = InvoiceResponse.model_validate(before).model_dump(mode="json")
    invoice = service.update_draft_invoice(invoice_id, payload, current_user)
    AuditService(db).log(
        user=current_user,
        action="UPDATE",
        entity="invoice",
        entity_id=invoice.invoice_id,
        old_value=old_state,
        new_value=InvoiceResponse.model_validate(invoice).model_dump(mode="json"),
    )
    db.commit()
    return InvoiceResponse.model_validate(invoice)


@router.post("/{invoice_id}/finalize", response_model=InvoiceResponse)
def finalize_invoice(
    invoice_id: uuid.UUID,
    _: InvoiceLifecycleAction,
    db: DbSession,
    current_user: CurrentUser,
) -> InvoiceResponse:
    invoice = InvoiceService(db).finalize_invoice(invoice_id, current_user)
    AuditService(db).log(
        user=current_user,
        action="FINALIZE",
        entity="invoice",
        entity_id=invoice.invoice_id,
        new_value={"status": invoice.status.value},
    )
    db.commit()
    return InvoiceResponse.model_validate(invoice)


@router.post("/{invoice_id}/void", response_model=InvoiceResponse)
def void_invoice(
    invoice_id: uuid.UUID,
    _: InvoiceLifecycleAction,
    db: DbSession,
    current_user: CurrentUser,
) -> InvoiceResponse:
    invoice = InvoiceService(db).void_invoice(invoice_id, current_user)
    AuditService(db).log(
        user=current_user,
        action="VOID",
        entity="invoice",
        entity_id=invoice.invoice_id,
        new_value={"status": invoice.status.value},
    )
    db.commit()
    return InvoiceResponse.model_validate(invoice)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> dict[str, str]:
    InvoiceService(db).delete_draft(invoice_id, current_user)
    AuditService(db).log(
        user=current_user,
        action="DELETE",
        entity="invoice",
        entity_id=invoice_id,
    )
    db.commit()
    return {"message": "Draft invoice deleted"}
