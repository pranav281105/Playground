from collections.abc import Generator
from datetime import date

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import deps
from app.db.base import Base
from app.main import app
from app.models import entities  # noqa: F401


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient, payload: dict[str, object]) -> tuple[str, dict]:
    register_response = client.post("/api/v1/auth/register", json=payload)
    assert register_response.status_code == 200

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return token, register_response.json()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[deps.get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_end_to_end_financial_workflow(client: TestClient) -> None:
    admin_token, _ = _register_and_login(
        client,
        {
            "name": "Admin",
            "email": "admin@example.com",
            "password": "password123",
            "role": "admin",
            "branch_id": None,
        },
    )

    branch_response = client.post(
        "/api/v1/branches",
        json={"branch_name": "Singapore HQ", "location": "SG"},
        headers=_auth_header(admin_token),
    )
    assert branch_response.status_code == 200
    branch_id = branch_response.json()["branch_id"]

    manager_token, _ = _register_and_login(
        client,
        {
            "name": "Manager",
            "email": "manager@example.com",
            "password": "password123",
            "role": "branch_manager",
            "branch_id": branch_id,
        },
    )

    customer_response = client.post(
        "/api/v1/customers",
        json={"customer_name": "Lazada Buyer"},
        headers=_auth_header(manager_token),
    )
    assert customer_response.status_code == 200
    customer_id = customer_response.json()["customer_id"]

    invoice_response = client.post(
        "/api/v1/invoices",
        json={
            "invoice_number": "INV-1001",
            "customer_id": customer_id,
            "invoice_date": date.today().isoformat(),
            "sales_amount": "1000.00",
            "gross_profit": "200.00",
        },
        headers=_auth_header(manager_token),
    )
    assert invoice_response.status_code == 200
    invoice_id = invoice_response.json()["invoice_id"]

    finalize_response = client.post(
        f"/api/v1/invoices/{invoice_id}/finalize",
        json={"reason": "Ready"},
        headers=_auth_header(manager_token),
    )
    assert finalize_response.status_code == 200
    assert finalize_response.json()["status"] == "FINALIZED"

    payment_response = client.post(
        "/api/v1/payments",
        json={
            "invoice_id": invoice_id,
            "payment_date": date.today().isoformat(),
            "payment_method": "bank_transfer",
            "amount": "1000.00",
        },
        headers=_auth_header(manager_token),
    )
    assert payment_response.status_code == 200

    for route, payload in [
        ("/api/v1/costs/fixed", {"category": "Rent", "amount": "100.00", "date": date.today().isoformat()}),
        ("/api/v1/costs/variable", {"category": "Shipping", "amount": "50.00", "date": date.today().isoformat()}),
        (
            "/api/v1/costs/failure",
            {
                "failure_type": "shipping_error",
                "amount": "25.00",
                "date": date.today().isoformat(),
            },
        ),
    ]:
        response = client.post(route, json=payload, headers=_auth_header(manager_token))
        assert response.status_code == 200

    vendor_response = client.post(
        "/api/v1/vendors",
        json={"vendor_name": "Vendor One"},
        headers=_auth_header(manager_token),
    )
    assert vendor_response.status_code == 200
    vendor_id = vendor_response.json()["vendor_id"]

    vendor_payment_response = client.post(
        "/api/v1/vendor-payments",
        json={
            "vendor_id": vendor_id,
            "amount": "120.00",
            "payment_date": date.today().isoformat(),
            "payment_method": "bank_transfer",
        },
        headers=_auth_header(manager_token),
    )
    assert vendor_payment_response.status_code == 200

    summary_response = client.get("/api/v1/dashboard/summary", headers=_auth_header(manager_token))
    assert summary_response.status_code == 200
    assert summary_response.json()["total_revenue"] == "1000.00"

    trend_response = client.get(
        "/api/v1/dashboard/revenue-trend",
        params={"months": 6},
        headers=_auth_header(manager_token),
    )
    assert trend_response.status_code == 200
    assert len(trend_response.json()) >= 1

    cash_flow_response = client.get(
        "/api/v1/reports/cash-flow",
        params={"opening_balance": "0.00"},
        headers=_auth_header(manager_token),
    )
    assert cash_flow_response.status_code == 200

    audit_response = client.get("/api/v1/audit-logs", headers=_auth_header(admin_token))
    assert audit_response.status_code == 200
    assert len(audit_response.json()) >= 1

    audit_forbidden = client.get("/api/v1/audit-logs", headers=_auth_header(manager_token))
    assert audit_forbidden.status_code == 403


def test_report_exports_return_csv(client: TestClient) -> None:
    admin_token, _ = _register_and_login(
        client,
        {
            "name": "Admin 2",
            "email": "admin2@example.com",
            "password": "password123",
            "role": "admin",
            "branch_id": None,
        },
    )

    for route in [
        "/api/v1/reports/income-statement/export",
        "/api/v1/reports/revenue-summary/export",
        "/api/v1/reports/cash-flow/export",
    ]:
        response = client.get(route, headers=_auth_header(admin_token))
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "," in response.text
