"""Remove ENTERPRISE plan type, consolidate into PREMIUM.

Revision ID: 016_remove_enterprise_plan
Create Date: 2026-03-21

All tenants previously on ENTERPRISE are migrated to PREMIUM.
The ENTERPRISE value is then removed from the plan_type enum.
Also normalises the duplicate 'free'/'FREE' values to just 'FREE'.
"""

from alembic import op

# revision identifiers
revision: str = "016_remove_enterprise_plan"
down_revision: str = "015_widen_invoice_number"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Current DB enum values: {BASIC, PRO, PREMIUM, ENTERPRISE, free, FREE}
    # Target: {FREE, BASIC, PRO, PREMIUM}

    # 1) Move ENTERPRISE subscriptions to PREMIUM
    op.execute(
        "UPDATE subscriptions SET plan = 'PREMIUM' WHERE plan = 'ENTERPRISE'"
    )

    # 2) Normalise any lowercase 'free' to 'FREE'
    op.execute(
        "UPDATE subscriptions SET plan = 'FREE' WHERE plan = 'free'"
    )

    # 3) Recreate enum without ENTERPRISE and without the duplicate lowercase 'free'
    op.execute("ALTER TYPE plan_type RENAME TO plan_type_old")
    op.execute("CREATE TYPE plan_type AS ENUM ('FREE', 'BASIC', 'PRO', 'PREMIUM')")
    op.execute(
        "ALTER TABLE subscriptions "
        "ALTER COLUMN plan TYPE plan_type "
        "USING plan::text::plan_type"
    )
    op.execute("DROP TYPE plan_type_old")


def downgrade() -> None:
    op.execute("ALTER TYPE plan_type RENAME TO plan_type_old")
    op.execute(
        "CREATE TYPE plan_type AS ENUM ('FREE', 'BASIC', 'PRO', 'PREMIUM', 'ENTERPRISE')"
    )
    op.execute(
        "ALTER TABLE subscriptions "
        "ALTER COLUMN plan TYPE plan_type USING plan::text::plan_type"
    )
    op.execute("DROP TYPE plan_type_old")
