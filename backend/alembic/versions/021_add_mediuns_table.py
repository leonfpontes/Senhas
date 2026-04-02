"""Add mediuns table."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "021_add_mediuns_table"
down_revision = "020_add_ticket_email_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mediuns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column(
            "is_atendimento",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_mediuns_tenant_id", "mediuns", ["tenant_id"])
    op.create_index("ix_mediuns_is_active", "mediuns", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_mediuns_is_active", table_name="mediuns")
    op.drop_index("ix_mediuns_tenant_id", table_name="mediuns")
    op.drop_table("mediuns")
