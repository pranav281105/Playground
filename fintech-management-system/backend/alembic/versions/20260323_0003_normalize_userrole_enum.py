"""normalize userrole enum labels

Revision ID: 20260323_0003
Revises: 20260322_0002
Create Date: 2026-03-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260323_0003"
down_revision: str | None = "20260322_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum_labels(bind: sa.Connection, enum_name: str) -> set[str]:
    rows = bind.execute(
        sa.text(
            """
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = :enum_name
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    return {row[0] for row in rows}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    labels = _enum_labels(bind, "userrole")

    if "owner" in labels:
        if "OWNER" in labels:
            op.execute("UPDATE users SET role = 'OWNER' WHERE role = 'owner'")
        else:
            op.execute("ALTER TYPE userrole RENAME VALUE 'owner' TO 'OWNER'")

    if "business_manager" in labels:
        if "BUSINESS_MANAGER" in labels:
            op.execute("UPDATE users SET role = 'BUSINESS_MANAGER' WHERE role = 'business_manager'")
        else:
            op.execute("ALTER TYPE userrole RENAME VALUE 'business_manager' TO 'BUSINESS_MANAGER'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    labels = _enum_labels(bind, "userrole")

    if "OWNER" in labels and "owner" not in labels:
        op.execute("ALTER TYPE userrole RENAME VALUE 'OWNER' TO 'owner'")
    if "BUSINESS_MANAGER" in labels and "business_manager" not in labels:
        op.execute("ALTER TYPE userrole RENAME VALUE 'BUSINESS_MANAGER' TO 'business_manager'")
