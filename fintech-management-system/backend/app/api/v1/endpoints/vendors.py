import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.vendor import VendorCreate, VendorResponse, VendorUpdate
from app.services.audit_service import AuditService
from app.services.vendor_service import VendorService

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorResponse])
def list_vendors(db: DbSession, _: CurrentUser) -> list[VendorResponse]:
    vendors = VendorService(db).list_vendors()
    return [VendorResponse.model_validate(vendor) for vendor in vendors]


@router.post("", response_model=VendorResponse)
def create_vendor(payload: VendorCreate, db: DbSession, current_user: CurrentUser) -> VendorResponse:
    vendor = VendorService(db).create_vendor(payload)
    AuditService(db).log(
        user=current_user,
        action="CREATE",
        entity="vendor",
        entity_id=vendor.vendor_id,
        new_value=VendorResponse.model_validate(vendor).model_dump(mode="json"),
    )
    db.commit()
    return VendorResponse.model_validate(vendor)


@router.put("/{vendor_id}", response_model=VendorResponse)
def update_vendor(
    vendor_id: uuid.UUID,
    payload: VendorUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> VendorResponse:
    vendor = VendorService(db).update_vendor(vendor_id, payload)
    AuditService(db).log(
        user=current_user,
        action="UPDATE",
        entity="vendor",
        entity_id=vendor.vendor_id,
        new_value=VendorResponse.model_validate(vendor).model_dump(mode="json"),
    )
    db.commit()
    return VendorResponse.model_validate(vendor)
