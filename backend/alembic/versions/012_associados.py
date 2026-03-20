"""Create associados table and add validate_associado_on_emit to tenant_configs.

Revision ID: 012_associados
Revises: 011_tenant_endereco
Create Date: 2026-03-20 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import UUID


revision = "012_associados"
down_revision = "011_tenant_endereco"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # --- associados table ---
    if "associados" not in inspector.get_table_names():
        op.create_table(
            "associados",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("nome", sa.String(255), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("email_normalized", sa.String(255), nullable=False),
            sa.Column("telefone", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("tenant_id", "email_normalized", name="uq_associados_tenant_email"),
        )
        op.create_index("ix_associados_tenant_id", "associados", ["tenant_id"])
        op.create_index("ix_associados_email_normalized", "associados", ["email_normalized"])

    # --- tenant_configs: validate_associado_on_emit ---
    tc_columns = {col["name"] for col in inspector.get_columns("tenant_configs")}
    if "validate_associado_on_emit" not in tc_columns:
        op.add_column(
            "tenant_configs",
            sa.Column("validate_associado_on_emit", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tc_columns = {col["name"] for col in inspector.get_columns("tenant_configs")}
    if "validate_associado_on_emit" in tc_columns:
        op.drop_column("tenant_configs", "validate_associado_on_emit")

    if "associados" in inspector.get_table_names():
        op.drop_index("ix_associados_email_normalized", table_name="associados")
        op.drop_index("ix_associados_tenant_id", table_name="associados")
        op.drop_table("associados")
