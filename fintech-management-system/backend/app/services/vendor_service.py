import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Vendor
from app.schemas.vendor import VendorCreate, VendorUpdate


class VendorService:
    def __init__(self, db: Session):
        self.db = db

    def list_vendors(self) -> list[Vendor]:
        query = select(Vendor).order_by(Vendor.vendor_name.asc())
        return list(self.db.execute(query).scalars().all())

    def create_vendor(self, payload: VendorCreate) -> Vendor:
        vendor = Vendor(
            vendor_name=payload.vendor_name,
            contact_person=payload.contact_person,
            email=payload.email,
            phone=payload.phone,
            bank_details=payload.bank_details,
            status=payload.status,
        )
        self.db.add(vendor)
        self.db.commit()
        self.db.refresh(vendor)
        return vendor

    def update_vendor(self, vendor_id: uuid.UUID, payload: VendorUpdate) -> Vendor:
        vendor = self.db.execute(select(Vendor).where(Vendor.vendor_id == vendor_id)).scalar_one_or_none()
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(vendor, field, value)

        self.db.commit()
        self.db.refresh(vendor)
        return vendor
