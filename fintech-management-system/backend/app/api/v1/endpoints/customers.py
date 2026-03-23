import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import BranchOperatorUser, CurrentUser, DbSession
from app.models.entities import Branch, Customer
from app.models.enums import UserRole
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.services.scope_service import apply_branch_scope

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("", response_model=CustomerResponse)
def create_customer(
    payload: CustomerCreate,
    db: DbSession,
    current_user: BranchOperatorUser,
    branch_id: uuid.UUID | None = Query(default=None),
) -> CustomerResponse:
    selected_branch = current_user.branch_id
    if current_user.role != UserRole.BRANCH_MANAGER:
        if branch_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
        branch_query = apply_branch_scope(
            select(Branch).where(Branch.branch_id == branch_id),
            current_user,
            Branch.branch_id,
        )
        branch = db.execute(branch_query).scalar_one_or_none()
        if branch is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-branch access denied")
        selected_branch = branch_id
    elif selected_branch is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch assignment is required")

    customer = Customer(
        branch_id=selected_branch,
        customer_name=payload.customer_name,
        contact_person=payload.contact_person,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        payment_terms=payload.payment_terms,
        status=payload.status,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.get("", response_model=list[CustomerResponse])
def list_customers(db: DbSession, current_user: CurrentUser) -> list[CustomerResponse]:
    query = apply_branch_scope(select(Customer), current_user, Customer.branch_id)
    customers = list(db.execute(query.order_by(Customer.created_at.desc())).scalars().all())
    return [CustomerResponse.model_validate(customer) for customer in customers]


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> CustomerResponse:
    customer_query = apply_branch_scope(
        select(Customer).where(Customer.customer_id == customer_id),
        current_user,
        Customer.branch_id,
    )
    customer = db.execute(customer_query).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}")
def delete_customer(customer_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> dict[str, str]:
    customer_query = apply_branch_scope(
        select(Customer).where(Customer.customer_id == customer_id),
        current_user,
        Customer.branch_id,
    )
    customer = db.execute(customer_query).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted"}
