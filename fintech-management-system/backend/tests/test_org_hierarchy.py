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


def _create_invoice_workflow(client: TestClient, token: str, invoice_number: str, sales_amount: str) -> None:
    customer_response = client.post(
        "/api/v1/customers",
        json={"customer_name": f"Customer {invoice_number}"},
        headers=_auth_header(token),
    )
    assert customer_response.status_code == 200
    customer_id = customer_response.json()["customer_id"]

    invoice_response = client.post(
        "/api/v1/invoices",
        json={
            "invoice_number": invoice_number,
            "customer_id": customer_id,
            "invoice_date": date.today().isoformat(),
            "sales_amount": sales_amount,
            "gross_profit": "100.00",
        },
        headers=_auth_header(token),
    )
    assert invoice_response.status_code == 200
    invoice_id = invoice_response.json()["invoice_id"]

    finalize_response = client.post(
        f"/api/v1/invoices/{invoice_id}/finalize",
        json={"reason": "Ready"},
        headers=_auth_header(token),
    )
    assert finalize_response.status_code == 200


def test_business_manager_scope_is_aggregated_by_business(client: TestClient) -> None:
    owner_token, _ = _register_and_login(
        client,
        {
            "name": "Owner",
            "email": "owner@example.com",
            "password": "password123",
            "role": "owner",
            "branch_id": None,
            "business_id": None,
            "company_id": None,
        },
    )

    company_response = client.post(
        "/api/v1/companies",
        json={"company_name": "ABC"},
        headers=_auth_header(owner_token),
    )
    assert company_response.status_code == 200
    company_id = company_response.json()["company_id"]

    biz_x_response = client.post(
        "/api/v1/businesses",
        json={"company_id": company_id, "business_name": "Business X"},
        headers=_auth_header(owner_token),
    )
    assert biz_x_response.status_code == 200
    business_x_id = biz_x_response.json()["business_id"]

    biz_y_response = client.post(
        "/api/v1/businesses",
        json={"company_id": company_id, "business_name": "Business Y"},
        headers=_auth_header(owner_token),
    )
    assert biz_y_response.status_code == 200
    business_y_id = biz_y_response.json()["business_id"]

    branch_x1 = client.post(
        "/api/v1/branches",
        json={"business_id": business_x_id, "branch_name": "X1", "location": "SG"},
        headers=_auth_header(owner_token),
    )
    assert branch_x1.status_code == 200
    branch_x1_id = branch_x1.json()["branch_id"]

    branch_x2 = client.post(
        "/api/v1/branches",
        json={"business_id": business_x_id, "branch_name": "X2", "location": "SG"},
        headers=_auth_header(owner_token),
    )
    assert branch_x2.status_code == 200
    branch_x2_id = branch_x2.json()["branch_id"]

    branch_y1 = client.post(
        "/api/v1/branches",
        json={"business_id": business_y_id, "branch_name": "Y1", "location": "SG"},
        headers=_auth_header(owner_token),
    )
    assert branch_y1.status_code == 200
    branch_y1_id = branch_y1.json()["branch_id"]

    manager_x1_token, _ = _register_and_login(
        client,
        {
            "name": "X1 Manager",
            "email": "x1.manager@example.com",
            "password": "password123",
            "role": "branch_manager",
            "branch_id": branch_x1_id,
            "business_id": None,
            "company_id": None,
        },
    )
    manager_x2_token, _ = _register_and_login(
        client,
        {
            "name": "X2 Manager",
            "email": "x2.manager@example.com",
            "password": "password123",
            "role": "branch_manager",
            "branch_id": branch_x2_id,
            "business_id": None,
            "company_id": None,
        },
    )
    manager_y1_token, _ = _register_and_login(
        client,
        {
            "name": "Y1 Manager",
            "email": "y1.manager@example.com",
            "password": "password123",
            "role": "branch_manager",
            "branch_id": branch_y1_id,
            "business_id": None,
            "company_id": None,
        },
    )

    _create_invoice_workflow(client, manager_x1_token, "INV-X1-001", "300.00")
    _create_invoice_workflow(client, manager_x2_token, "INV-X2-001", "500.00")
    _create_invoice_workflow(client, manager_y1_token, "INV-Y1-001", "700.00")

    owner_summary = client.get("/api/v1/dashboard/summary", headers=_auth_header(owner_token))
    assert owner_summary.status_code == 200
    assert owner_summary.json()["total_revenue"] == "1500.00"

    owner_business_performance = client.get("/api/v1/dashboard/business-performance", headers=_auth_header(owner_token))
    assert owner_business_performance.status_code == 200
    owner_rows = owner_business_performance.json()
    assert len(owner_rows) == 2
    owner_by_name = {row["business_name"]: row for row in owner_rows}
    assert owner_by_name["Business X"]["revenue"] == "800.00"
    assert owner_by_name["Business X"]["gross_profit"] == "200.00"
    assert owner_by_name["Business Y"]["revenue"] == "700.00"
    assert owner_by_name["Business Y"]["gross_profit"] == "100.00"

    owner_business_x_summary = client.get(
        "/api/v1/dashboard/summary",
        params={"business_id": business_x_id},
        headers=_auth_header(owner_token),
    )
    assert owner_business_x_summary.status_code == 200
    assert owner_business_x_summary.json()["total_revenue"] == "800.00"

    business_manager_token, _ = _register_and_login(
        client,
        {
            "name": "Business X Manager",
            "email": "biz.x.manager@example.com",
            "password": "password123",
            "role": "business_manager",
            "business_id": business_x_id,
            "branch_id": None,
            "company_id": company_id,
        },
    )

    summary_response = client.get("/api/v1/dashboard/summary", headers=_auth_header(business_manager_token))
    assert summary_response.status_code == 200
    assert summary_response.json()["total_revenue"] == "800.00"

    business_performance_response = client.get(
        "/api/v1/dashboard/business-performance",
        headers=_auth_header(business_manager_token),
    )
    assert business_performance_response.status_code == 200
    business_rows = business_performance_response.json()
    assert len(business_rows) == 1
    assert business_rows[0]["business_name"] == "Business X"
    assert business_rows[0]["revenue"] == "800.00"

    branch_filter_response = client.get(
        "/api/v1/dashboard/summary",
        params={"branch_id": branch_x1_id},
        headers=_auth_header(business_manager_token),
    )
    assert branch_filter_response.status_code == 200
    assert branch_filter_response.json()["total_revenue"] == "300.00"

    forbidden_business_filter = client.get(
        "/api/v1/dashboard/summary",
        params={"business_id": business_y_id},
        headers=_auth_header(business_manager_token),
    )
    assert forbidden_business_filter.status_code == 403

    visible_branches_response = client.get("/api/v1/branches", headers=_auth_header(business_manager_token))
    assert visible_branches_response.status_code == 200
    visible_ids = {item["branch_id"] for item in visible_branches_response.json()}
    assert visible_ids == {str(branch_x1_id), str(branch_x2_id)}
