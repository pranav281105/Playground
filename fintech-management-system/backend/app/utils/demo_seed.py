from __future__ import annotations

import argparse
from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from sqlalchemy import text

from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.entities import (
    AuditLog,
    Branch,
    Business,
    Company,
    Customer,
    FailureCost,
    FixedCost,
    Invoice,
    Payment,
    User,
    Vendor,
    VendorPayment,
    VariableCost,
)
from app.models.enums import FailureType, InvoiceStatus, PaymentMethod, RecordStatus, UserRole


DEMO_PASSWORD = "Demo@12345"


def money(value: str | int | float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def wipe_database() -> None:
    Base.metadata.create_all(bind=engine)
    table_names = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))


def create_user(
    *,
    name: str,
    email: str,
    role: UserRole,
    company_id=None,
    business_id=None,
    branch_id=None,
) -> User:
    return User(
        name=name,
        email=email,
        password_hash=get_password_hash(DEMO_PASSWORD),
        role=role,
        company_id=company_id,
        business_id=business_id,
        branch_id=branch_id,
    )


def seed_demo_data() -> dict[str, list[str]]:
    wipe_database()

    credentials: dict[str, list[str]] = {
        "owner": [],
        "business_managers": [],
        "branch_managers": [],
    }

    with SessionLocal() as session:
        company = Company(company_name="ABC Holdings Pte Ltd")
        session.add(company)
        session.flush()

        business_definitions = [
            {
                "name": "Business X",
                "manager_email": "manager.businessx@abc.demo",
                "branches": [
                    ("Business X Downtown", "Downtown Core"),
                    ("Business X Orchard", "Orchard Road"),
                    ("Business X Harbour", "Harbourfront"),
                ],
            },
            {
                "name": "Business Y",
                "manager_email": "manager.businessy@abc.demo",
                "branches": [
                    ("Business Y Jurong", "Jurong East"),
                    ("Business Y Tampines", "Tampines North"),
                    ("Business Y Woodlands", "Woodlands Central"),
                ],
            },
            {
                "name": "Business Z",
                "manager_email": "manager.businessz@abc.demo",
                "branches": [
                    ("Business Z East Coast", "East Coast"),
                    ("Business Z Changi", "Changi Business Park"),
                    ("Business Z Punggol", "Punggol Digital District"),
                ],
            },
        ]

        owner = create_user(
            name="Owner",
            email="owner@abc.demo",
            role=UserRole.OWNER,
            company_id=company.company_id,
        )
        session.add(owner)
        session.flush()
        credentials["owner"].append(f"owner@abc.demo / {DEMO_PASSWORD}")

        vendors = [
            Vendor(
                vendor_name="North Star Supplies",
                contact_person="Nina Tan",
                email="accounts@northstar.demo",
                phone="+65 6123 4567",
                bank_details="UEN 20260001A | OCBC 123-456-789",
                status=RecordStatus.ACTIVE,
            ),
            Vendor(
                vendor_name="Metro Logistics",
                contact_person="Marcus Lim",
                email="billing@metrologistics.demo",
                phone="+65 6234 5678",
                bank_details="UEN 20260002B | DBS 987-654-321",
                status=RecordStatus.ACTIVE,
            ),
            Vendor(
                vendor_name="Prime Services Group",
                contact_person="Priya Rao",
                email="finance@primeservices.demo",
                phone="+65 6345 6789",
                bank_details="UEN 20260003C | UOB 246-810-121",
                status=RecordStatus.ACTIVE,
            ),
        ]
        session.add_all(vendors)
        session.flush()

        branch_counter = 0
        invoice_counter = 1
        created_business_names: list[str] = []
        created_branch_names: list[str] = []

        for business_index, business_definition in enumerate(business_definitions, start=1):
            business = Business(company_id=company.company_id, business_name=business_definition["name"])
            session.add(business)
            session.flush()
            created_business_names.append(business.business_name)

            manager_email = business_definition["manager_email"]
            business_manager = create_user(
                name=f"{business.business_name} Manager",
                email=manager_email,
                role=UserRole.BUSINESS_MANAGER,
                company_id=company.company_id,
                business_id=business.business_id,
            )
            session.add(business_manager)
            session.flush()
            credentials["business_managers"].append(f"{manager_email} / {DEMO_PASSWORD}")

            for branch_index, (branch_name, location) in enumerate(business_definition["branches"], start=1):
                branch_counter += 1
                branch = Branch(business_id=business.business_id, branch_name=branch_name, location=location)
                session.add(branch)
                session.flush()
                created_branch_names.append(branch.branch_name)

                branch_manager_email = f"bm.{business_index}.{branch_index}@abc.demo"
                branch_manager = create_user(
                    name=f"{branch.branch_name} Manager",
                    email=branch_manager_email,
                    role=UserRole.BRANCH_MANAGER,
                    company_id=company.company_id,
                    business_id=business.business_id,
                    branch_id=branch.branch_id,
                )
                session.add(branch_manager)
                session.flush()
                credentials["branch_managers"].append(f"{branch_manager_email} / {DEMO_PASSWORD}")

                customer = Customer(
                    branch_id=branch.branch_id,
                    customer_name=f"{branch.branch_name} Retail Customer",
                    contact_person=f"Contact {branch_counter}",
                    email=f"customer.{business_index}.{branch_index}@abc.demo",
                    phone=f"+65 65{business_index}{branch_index} 000{branch_index}",
                    address=f"{location}, Singapore",
                    payment_terms="30 days",
                    status=RecordStatus.ACTIVE,
                )
                session.add(customer)
                session.flush()

                invoice_rows = [
                    {
                        "invoice_number": f"INV-{business_index}{branch_index}01",
                        "invoice_date": date(2026, 1 + branch_index, 5 + business_index),
                        "sales_amount": money(12000 + business_index * 2200 + branch_index * 700),
                        "gross_profit": money(4300 + business_index * 900 + branch_index * 250),
                        "status": InvoiceStatus.FINALIZED,
                    },
                    {
                        "invoice_number": f"INV-{business_index}{branch_index}02",
                        "invoice_date": date(2026, 2 + branch_index, 12 + business_index),
                        "sales_amount": money(15800 + business_index * 2400 + branch_index * 900),
                        "gross_profit": money(5900 + business_index * 1000 + branch_index * 280),
                        "status": InvoiceStatus.FINALIZED,
                    },
                ]

                invoices: list[Invoice] = []
                for row_index, row in enumerate(invoice_rows, start=1):
                    invoice = Invoice(
                        invoice_number=row["invoice_number"],
                        branch_id=branch.branch_id,
                        customer_id=customer.customer_id,
                        invoice_date=row["invoice_date"],
                        sales_amount=row["sales_amount"],
                        gross_profit=row["gross_profit"],
                        status=row["status"],
                        remarks=f"Demo invoice {row_index} for {branch.branch_name}",
                        created_by=branch_manager.user_id,
                    )
                    session.add(invoice)
                    session.flush()
                    invoices.append(invoice)
                    session.add(
                        Payment(
                            invoice_id=invoice.invoice_id,
                            payment_date=row["invoice_date"],
                            payment_method=PaymentMethod.BANK_TRANSFER if row_index == 1 else PaymentMethod.PAYNOW,
                            amount=money(row["sales_amount"] * Decimal("0.60") if row_index == 1 else row["sales_amount"]),
                            reference_number=f"PAY-{business_index}{branch_index}{row_index}",
                            created_by=branch_manager.user_id,
                        )
                    )

                session.add_all(
                    [
                        FixedCost(
                            branch_id=branch.branch_id,
                            category="Rent",
                            amount=money(2200 + business_index * 250 + branch_index * 120),
                            date=date(2026, 3, 10 + branch_index),
                            description=f"Monthly rent for {branch.branch_name}",
                            created_by=branch_manager.user_id,
                        ),
                        VariableCost(
                            branch_id=branch.branch_id,
                            category="Marketing",
                            amount=money(850 + business_index * 100 + branch_index * 75),
                            date=date(2026, 3, 15 + branch_index),
                            description=f"Promo campaign for {branch.branch_name}",
                            created_by=branch_manager.user_id,
                        ),
                        FailureCost(
                            branch_id=branch.branch_id,
                            related_invoice=invoices[0].invoice_id,
                            failure_type=FailureType.CUSTOMER_RETURN,
                            amount=money(180 + business_index * 20 + branch_index * 15),
                            root_cause="Small batch customer return during demo period",
                            corrective_action="Replaced items and reviewed packing process",
                            date=date(2026, 3, 20 + branch_index),
                            created_by=branch_manager.user_id,
                        ),
                        VendorPayment(
                            vendor_id=vendors[(business_index - 1) % len(vendors)].vendor_id,
                            branch_id=branch.branch_id,
                            bill_number=f"BILL-{business_index}{branch_index}01",
                            amount=money(1450 + business_index * 180 + branch_index * 95),
                            payment_date=date(2026, 3, 22 + branch_index),
                            payment_method=PaymentMethod.BANK_TRANSFER,
                            created_by=branch_manager.user_id,
                        ),
                    ]
                )

                session.add(
                    AuditLog(
                        user_id=branch_manager.user_id,
                        branch_id=branch.branch_id,
                        action="seed_demo",
                        entity="branch",
                        entity_id=branch.branch_id,
                        old_value=None,
                        new_value={
                            "branch_name": branch.branch_name,
                            "location": branch.location,
                            "invoice_count": len(invoices),
                        },
                    )
                )

            session.add(
                AuditLog(
                    user_id=business_manager.user_id,
                    branch_id=None,
                    action="seed_demo",
                    entity="business",
                    entity_id=business.business_id,
                    old_value=None,
                    new_value={"business_name": business.business_name, "branch_count": len(business_definition["branches"])},
                )
            )

        session.add(
            AuditLog(
                user_id=owner.user_id,
                branch_id=None,
                action="seed_demo",
                entity="company",
                entity_id=company.company_id,
                old_value=None,
                new_value={"company_name": company.company_name, "business_count": len(business_definitions)},
            )
        )

        session.commit()

    return {
        "owner": credentials["owner"],
        "business_managers": credentials["business_managers"],
        "branch_managers": credentials["branch_managers"],
        "businesses": created_business_names,
        "branches": created_branch_names,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed demo data for the FinTech Management System")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset all existing tables before seeding demo data",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.reset or True:
        seeded = seed_demo_data()
    else:
        seeded = seed_demo_data()

    print("Demo data seeded successfully.")
    print("Credentials:")
    for label, values in seeded.items():
        if label in {"businesses", "branches"}:
            continue
        print(f"- {label}:")
        for value in values:
            print(f"  - {value}")
    print(f"Businesses seeded: {', '.join(seeded['businesses'])}")
    print(f"Branches seeded: {', '.join(seeded['branches'])}")


if __name__ == "__main__":
    main()