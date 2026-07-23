"""Add 1-month Premium trial support.

Adds Tenant.documento (CPF/CNPJ, digits-only) and the trial_grants ledger
table used to check trial eligibility (one trial per CPF/CNPJ and per
e-mail). trial_grants deliberately has no FK to tenants — it must survive
tenant hard-delete (see 031_tenant_hard_delete_support.py) so a deleted
tenant can't be recreated to farm another free trial.

Revision ID: 050_trial_premium
Revises: 049_ticket_waitlist
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "050_trial_premium"
down_revision: str = "049_ticket_waitlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("documento", sa.String(length=14), nullable=True))

    op.create_table(
        "trial_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("documento_hash", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_trial_grants_documento_hash", "trial_grants", ["documento_hash"], unique=True)
    op.create_index("ix_trial_grants_email", "trial_grants", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_trial_grants_email", table_name="trial_grants")
    op.drop_index("ix_trial_grants_documento_hash", table_name="trial_grants")
    op.drop_table("trial_grants")
    op.drop_column("tenants", "documento")
