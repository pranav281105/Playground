import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.payment import PaymentCreate, PaymentResponse, ReceivableStatusResponse
from app.services.audit_service import AuditService
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("", response_model=PaymentResponse)
def create_payment(payload: PaymentCreate, db: DbSession, current_user: CurrentUser) -> PaymentResponse:
    payment = PaymentService(db).create_payment(payload, current_user)
    AuditService(db).log(
        user=current_user,
        action="CREATE",
        entity="payment",
        entity_id=payment.payment_id,
        new_value=PaymentResponse.model_validate(payment).model_dump(mode="json"),
    )
    db.commit()
    return PaymentResponse.model_validate(payment)


@router.get("", response_model=list[PaymentResponse])
def list_payments(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[PaymentResponse]:
    payments = PaymentService(db).list_payments(current_user, business_id=business_id, branch_id=branch_id)
    return [PaymentResponse.model_validate(payment) for payment in payments]


@router.get("/receivables", response_model=list[ReceivableStatusResponse])
def list_receivables(
    db: DbSession,
    current_user: CurrentUser,
    business_id: uuid.UUID | None = Query(default=None),
    branch_id: uuid.UUID | None = Query(default=None),
) -> list[ReceivableStatusResponse]:
    return PaymentService(db).list_receivables(
        current_user,
        business_id=business_id,
        branch_id=branch_id,
    )
