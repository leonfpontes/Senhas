"""Add Stripe billing fields to subscriptions.

Revision ID: 026_stripe_billing
Revises: 025_remove_webhooks
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "026_stripe_billing"
down_revision = "025_remove_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("subscriptions", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.add_column("subscriptions", sa.Column("stripe_price_id", sa.String(255), nullable=True))
    op.add_column("subscriptions", sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("subscriptions", sa.Column("is_bonus", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.create_unique_constraint("uq_subscriptions_stripe_customer_id", "subscriptions", ["stripe_customer_id"])
    op.create_unique_constraint("uq_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

    # Fix currency default from USD to BRL (existing rows stay as-is; only new rows get BRL)
    op.alter_column("subscriptions", "currency", server_default="BRL")


def downgrade() -> None:
    op.alter_column("subscriptions", "currency", server_default="USD")
    op.drop_constraint("uq_subscriptions_stripe_subscription_id", "subscriptions", type_="unique")
    op.drop_constraint("uq_subscriptions_stripe_customer_id", "subscriptions", type_="unique")
    op.drop_column("subscriptions", "is_bonus")
    op.drop_column("subscriptions", "cancel_at_period_end")
    op.drop_column("subscriptions", "current_period_end")
    op.drop_column("subscriptions", "stripe_price_id")
    op.drop_column("subscriptions", "stripe_subscription_id")
    op.drop_column("subscriptions", "stripe_customer_id")
