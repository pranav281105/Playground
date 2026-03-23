import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.vendor_payment import (
    VendorPaymentCreate,
    VendorPaymentResponse,
    VendorPaymentUpdate,
)
from app.services.audit_service import AuditService
from app.services.vendor_payment_service import VendorPaymentService

router = APIRouter(prefix="/vendor-payments", tags=["vendor-payments"])


@router.get("", response_model=list[VendorPaymentResponse])
def list_vendor_payments(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[VendorPaymentResponse]:
    items = VendorPaymentService(db).list_vendor_payments(
        current_user,
        business_id=business_id,
        branch_id=branch_id,
    )
    return [VendorPaymentResponse.model_validate(item) for item in items]


@router.post("", response_model=VendorPaymentResponse)
def create_vendor_payment(
    payload: VendorPaymentCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> VendorPaymentResponse:
    payment = VendorPaymentService(db).create_vendor_payment(payload, current_user)
    AuditService(db).log(
        user=current_user,
        action="CREATE",
        entity="vendor_payment",
        entity_id=payment.vendor_payment_id,
        new_value=VendorPaymentResponse.model_validate(payment).model_dump(mode="json"),
    )
    db.commit()
    return VendorPaymentResponse.model_validate(payment)


@router.put("/{vendor_payment_id}", response_model=VendorPaymentResponse)
def update_vendor_payment(
    vendor_payment_id: uuid.UUID,
    payload: VendorPaymentUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> VendorPaymentResponse:
    payment = VendorPaymentService(db).update_vendor_payment(vendor_payment_id, payload, current_user)
    AuditService(db).log(
        user=current_user,
        action="UPDATE",
        entity="vendor_payment",
        entity_id=payment.vendor_payment_id,
        new_value=VendorPaymentResponse.model_validate(payment).model_dump(mode="json"),
    )
    db.commit()
    return VendorPaymentResponse.model_validate(payment)
