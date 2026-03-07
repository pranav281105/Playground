import pytest
from fastapi import HTTPException

from app.models.enums import InvoiceStatus, UserRole
from app.services.invoice_service import validate_lifecycle_transition


def test_draft_can_finalize() -> None:
    validate_lifecycle_transition(InvoiceStatus.DRAFT, InvoiceStatus.FINALIZED, UserRole.BRANCH_MANAGER)


def test_finalized_cannot_finalize_again() -> None:
    with pytest.raises(HTTPException):
        validate_lifecycle_transition(InvoiceStatus.FINALIZED, InvoiceStatus.FINALIZED, UserRole.ADMIN)


def test_only_admin_can_void() -> None:
    with pytest.raises(HTTPException):
        validate_lifecycle_transition(InvoiceStatus.FINALIZED, InvoiceStatus.VOID, UserRole.BRANCH_MANAGER)


def test_admin_can_void_finalized() -> None:
    validate_lifecycle_transition(InvoiceStatus.FINALIZED, InvoiceStatus.VOID, UserRole.ADMIN)


def test_admin_cannot_void_draft() -> None:
    with pytest.raises(HTTPException):
        validate_lifecycle_transition(InvoiceStatus.DRAFT, InvoiceStatus.VOID, UserRole.ADMIN)
