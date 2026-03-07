import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.enums import UserRole
from app.services.access_control import ensure_admin, ensure_branch_access


def test_branch_manager_cross_branch_denied() -> None:
    user = SimpleNamespace(role=UserRole.BRANCH_MANAGER, branch_id=uuid.uuid4())
    with pytest.raises(HTTPException):
        ensure_branch_access(user, uuid.uuid4())


def test_branch_manager_same_branch_allowed() -> None:
    branch_id = uuid.uuid4()
    user = SimpleNamespace(role=UserRole.BRANCH_MANAGER, branch_id=branch_id)
    ensure_branch_access(user, branch_id)


def test_admin_has_unrestricted_branch_access() -> None:
    user = SimpleNamespace(role=UserRole.ADMIN, branch_id=None)
    ensure_branch_access(user, uuid.uuid4())


def test_ensure_admin_blocks_branch_manager() -> None:
    user = SimpleNamespace(role=UserRole.BRANCH_MANAGER)
    with pytest.raises(HTTPException):
        ensure_admin(user)
