"""Add site builder tables (tenant_sites, tenant_site_sections, site_images, site_versions).

Revision ID: 036_site_builder
Revises: 035_password_reset
Create Date: 2026-04-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, BYTEA, JSONB

revision = "036_site_builder"
down_revision = "035_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create ENUMs idempotently (DROP IF EXISTS + CREATE)
    op.execute("DROP TYPE IF EXISTS site_status")
    op.execute("CREATE TYPE site_status AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')")

    op.execute("DROP TYPE IF EXISTS site_section_type")
    op.execute(
        "CREATE TYPE site_section_type AS ENUM ("
        "'HERO', 'ABOUT', 'VIDEO_EMBED', 'GIRAS_CALENDAR', "
        "'SPONSOR', 'LOCATION', 'CONTACT', 'CUSTOM_TEXT')"
    )

    # 2. tenant_sites (1:1 per tenant)
    op.create_table(
        "tenant_sites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "PUBLISHED", "UNPUBLISHED", name="site_status", create_type=False),
            nullable=False,
            server_default="DRAFT",
        ),
        sa.Column("template", sa.String(50), nullable=False, server_default="moderno"),
        sa.Column("meta_title", sa.String(200), nullable=True),
        sa.Column("meta_description", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_tenant_sites_slug", "tenant_sites", ["slug"])
    op.create_index("ix_tenant_sites_tenant_id", "tenant_sites", ["tenant_id"])
    op.create_index("ix_tenant_sites_slug", "tenant_sites", ["slug"])

    # 3. tenant_site_sections
    op.create_table(
        "tenant_site_sections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "section_type",
            sa.Enum(
                "HERO", "ABOUT", "VIDEO_EMBED", "GIRAS_CALENDAR",
                "SPONSOR", "LOCATION", "CONTACT", "CUSTOM_TEXT",
                name="site_section_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("config", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tenant_site_sections_site_id", "tenant_site_sections", ["site_id"])
    op.create_index("ix_tenant_site_sections_tenant_id", "tenant_site_sections", ["tenant_id"])

    # 4. site_images
    op.create_table(
        "site_images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mimetype", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("data", BYTEA, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_site_images_site_id", "site_images", ["site_id"])
    op.create_index("ix_site_images_tenant_id", "site_images", ["tenant_id"])

    # 5. site_versions
    op.create_table(
        "site_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_site_versions_site_id", "site_versions", ["site_id"])
    op.create_index("ix_site_versions_tenant_id", "site_versions", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("site_versions")
    op.drop_table("site_images")
    op.drop_table("tenant_site_sections")
    op.drop_table("tenant_sites")
    op.execute("DROP TYPE IF EXISTS site_section_type")
    op.execute("DROP TYPE IF EXISTS site_status")
