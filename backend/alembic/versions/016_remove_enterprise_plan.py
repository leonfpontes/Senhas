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
    # Target enum: {FREE, BASIC, PRO, PREMIUM}
    # Production may have {BASIC, PRO, PREMIUM, ENTERPRISE, FREE} (no lowercase 'free')
    # Dev may have {BASIC, PRO, PREMIUM, ENTERPRISE, free, FREE} (mixed case)
    # Strategy: convert column to TEXT first, normalise, then recreate enum.

    # 1) Remove default (it references the enum type and blocks DROP TYPE)
    op.execute("ALTER TABLE subscriptions ALTER COLUMN plan DROP DEFAULT")

    # 2) Convert column to plain TEXT so we can drop the old enum
    op.execute(
        "ALTER TABLE subscriptions "
        "ALTER COLUMN plan TYPE TEXT USING plan::text"
    )
    op.execute("DROP TYPE plan_type")

    # 3) Normalise all values as TEXT (no enum validation issues)
    op.execute("UPDATE subscriptions SET plan = UPPER(plan)")
    op.execute(
        "UPDATE subscriptions SET plan = 'PREMIUM' WHERE plan = 'ENTERPRISE'"
    )

    # 4) Create clean enum, cast back, restore default
    op.execute("CREATE TYPE plan_type AS ENUM ('FREE', 'BASIC', 'PRO', 'PREMIUM')")
    op.execute(
        "ALTER TABLE subscriptions "
        "ALTER COLUMN plan TYPE plan_type USING plan::plan_type"
    )
    op.execute(
        "ALTER TABLE subscriptions "
        "ALTER COLUMN plan SET DEFAULT 'FREE'"
    )


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
