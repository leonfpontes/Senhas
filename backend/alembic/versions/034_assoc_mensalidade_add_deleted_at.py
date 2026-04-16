"""Add missing deleted_at column to associado_mensalidade_pagamentos.

The table was created in migration 033 without the deleted_at column
that TimestampedModel defines, causing a ProgrammingError on every query.

Revision ID: 034_assoc_pag_deleted_at
Revises: 033_mensalidade_associado
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa

revision = "034_assoc_pag_deleted_at"
down_revision = "033_mensalidade_associado"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("associado_mensalidade_pagamentos")}
    if "deleted_at" not in cols:
        op.add_column(
            "associado_mensalidade_pagamentos",
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("associado_mensalidade_pagamentos")}
    if "deleted_at" in cols:
        op.drop_column("associado_mensalidade_pagamentos", "deleted_at")
