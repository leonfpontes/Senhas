"""Fix user email unique constraint to be tenant-scoped

Revision ID: 039_email_unique
Revises: 038_priority_category
Create Date: 2026-05-12

Problem: uq_users_email constraint is global (email only), which prevents two
different tenants from having users with the same email address. In a
multi-tenant SaaS this is wrong — each tenant should have independent user
namespaces.

Fix:
  - Drop global uq_users_email UNIQUE(email)
  - Create uq_users_tenant_email UNIQUE(tenant_id, email) for tenant users
  - Create partial unique index uq_users_email_superadmin on (email)
    WHERE tenant_id IS NULL, so super-admin emails remain globally unique
"""
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = "039_email_unique"
down_revision = "038_priority_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = Inspector.from_engine(bind)

    existing_constraints = {uc["name"] for uc in insp.get_unique_constraints("users")}
    existing_indexes = {idx["name"] for idx in insp.get_indexes("users")}

    # 1. Drop the global email constraint if it exists
    if "uq_users_email" in existing_constraints:
        op.drop_constraint("uq_users_email", "users", type_="unique")

    # 2. Create tenant-scoped unique constraint (tenant_id, email)
    if "uq_users_tenant_email" not in existing_constraints:
        op.create_unique_constraint("uq_users_tenant_email", "users", ["tenant_id", "email"])

    # 3. Create partial unique index for super admins (tenant_id IS NULL)
    if "uq_users_email_superadmin" not in existing_indexes:
        op.create_index(
            "uq_users_email_superadmin",
            "users",
            ["email"],
            unique=True,
            postgresql_where="tenant_id IS NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = Inspector.from_engine(bind)

    existing_constraints = {uc["name"] for uc in insp.get_unique_constraints("users")}
    existing_indexes = {idx["name"] for idx in insp.get_indexes("users")}

    # Remove partial index for super admins
    if "uq_users_email_superadmin" in existing_indexes:
        op.drop_index("uq_users_email_superadmin", table_name="users")

    # Remove tenant-scoped constraint
    if "uq_users_tenant_email" in existing_constraints:
        op.drop_constraint("uq_users_tenant_email", "users", type_="unique")

    # Restore global constraint (best-effort; may fail if duplicates exist across tenants)
    if "uq_users_email" not in existing_constraints:
        op.create_unique_constraint("uq_users_email", "users", ["email"])
