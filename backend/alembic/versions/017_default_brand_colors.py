"""017: Update default tenant branding colors from black/white to indigo

Revision ID: 017_default_brand_colors
Revises: 016_remove_enterprise_plan
"""
from alembic import op

# revision identifiers
revision: str = "017_default_brand_colors"
down_revision: str = "016_remove_enterprise_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update tenants still on the old black/white defaults
    op.execute(
        "UPDATE tenant_configs "
        "SET primary_color = '#4f46e5', secondary_color = '#818cf8' "
        "WHERE primary_color = '#000000' AND secondary_color = '#FFFFFF'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE tenant_configs "
        "SET primary_color = '#000000', secondary_color = '#FFFFFF' "
        "WHERE primary_color = '#4f46e5' AND secondary_color = '#818cf8'"
    )
