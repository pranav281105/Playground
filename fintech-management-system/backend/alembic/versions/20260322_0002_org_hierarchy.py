"""add org hierarchy and multi-scope user assignments

Revision ID: 20260322_0002
Revises: 20260318_0001
Create Date: 2026-03-22
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260322_0002"
down_revision: str | None = "20260318_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'owner'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'business_manager'")

    if "companies" not in table_names:
        op.create_table(
            "companies",
            sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("company_name", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("company_id"),
            sa.UniqueConstraint("company_name"),
        )
        table_names.add("companies")

    if "businesses" not in table_names:
        op.create_table(
            "businesses",
            sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("business_name", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["company_id"], ["companies.company_id"]),
            sa.PrimaryKeyConstraint("business_id"),
        )
        op.create_index(op.f("ix_businesses_company_id"), "businesses", ["company_id"], unique=False)
        table_names.add("businesses")

    branch_columns = {col["name"] for col in inspector.get_columns("branches")}
    if "business_id" not in branch_columns:
        op.add_column("branches", sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(op.f("ix_branches_business_id"), "branches", ["business_id"], unique=False)
        op.create_foreign_key(
            "fk_branches_business_id_businesses",
            "branches",
            "businesses",
            ["business_id"],
            ["business_id"],
        )

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "company_id" not in user_columns:
        op.add_column("users", sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(op.f("ix_users_company_id"), "users", ["company_id"], unique=False)
        op.create_foreign_key("fk_users_company_id_companies", "users", "companies", ["company_id"], ["company_id"])
    if "business_id" not in user_columns:
        op.add_column("users", sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(op.f("ix_users_business_id"), "users", ["business_id"], unique=False)
        op.create_foreign_key("fk_users_business_id_businesses", "users", "businesses", ["business_id"], ["business_id"])


def downgrade() -> None:
    op.drop_constraint("fk_users_business_id_businesses", "users", type_="foreignkey")
    op.drop_constraint("fk_users_company_id_companies", "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_business_id"), table_name="users")
    op.drop_index(op.f("ix_users_company_id"), table_name="users")
    op.drop_column("users", "business_id")
    op.drop_column("users", "company_id")

    op.drop_constraint("fk_branches_business_id_businesses", "branches", type_="foreignkey")
    op.drop_index(op.f("ix_branches_business_id"), table_name="branches")
    op.drop_column("branches", "business_id")

    op.drop_index(op.f("ix_businesses_company_id"), table_name="businesses")
    op.drop_table("businesses")
    op.drop_table("companies")
