"""drop unique payment per invoice to support partial receivables

Revision ID: 20260323_0004
Revises: 20260323_0003
Create Date: 2026-03-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260323_0004"
down_revision: str | None = "20260323_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("payments")}
    if "uq_payments_invoice_id" in unique_names:
        op.drop_constraint("uq_payments_invoice_id", "payments", type_="unique")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("payments")}
    if "uq_payments_invoice_id" not in unique_names:
        op.create_unique_constraint("uq_payments_invoice_id", "payments", ["invoice_id"])
