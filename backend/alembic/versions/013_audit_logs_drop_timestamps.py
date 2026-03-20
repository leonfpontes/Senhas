"""Drop updated_at and deleted_at from audit_logs (immutable table).

Audit logs are immutable records — they should only have created_at.
The updated_at and deleted_at columns were inherited from TimestampedModel
in the original migration but the model was later corrected to use Base.

Revision ID: 013_audit_logs_drop_timestamps
Revises: 012_associados
Create Date: 2026-03-20 15:00:00.000000
"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "013_audit_logs_drop_timestamps"
down_revision = "012_associados"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("audit_logs")]
    if "updated_at" in columns:
        op.drop_column("audit_logs", "updated_at")
    if "deleted_at" in columns:
        op.drop_column("audit_logs", "deleted_at")


def downgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Remove the server_default after backfill
    op.alter_column("audit_logs", "updated_at", server_default=None)
