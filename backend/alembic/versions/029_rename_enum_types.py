"""Rename enum types to match SQLAlchemy model name= parameters.

SQLAlchemy auto-generates enum type names by lowercasing the class name with no
separator (e.g. SubscriptionStatus -> subscriptionstatus).  The models were
defined with explicit underscored names via name="subscription_status", etc.  On
existing databases the enums were created without the underscore, causing
asyncpg to fail when it injects ::type_name casts in prepared statements.

This migration renames the four affected enums so DB and ORM agree.

Revision ID: 029_rename_enum_types
Revises: 028_mensalidade_email_flag
Create Date: 2026-04-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029_rename_enum_types"
down_revision: str = "028_mensalidade_email_flag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RENAMES = [
    ("subscriptionstatus", "subscription_status"),
    ("ticketstatus", "ticket_status"),
    ("invoicestatus", "invoice_status"),
    ("auditaction", "audit_action"),
    # userrole -> user_role was handled separately but guard here too
    ("userrole", "user_role"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for old_name, new_name in _RENAMES:
        result = bind.execute(
            sa.text(
                "SELECT typname FROM pg_type WHERE typtype = 'e' AND typname = :name"
            ),
            {"name": old_name},
        )
        if result.fetchone():
            op.execute(f"ALTER TYPE {old_name} RENAME TO {new_name}")


def downgrade() -> None:
    bind = op.get_bind()
    for old_name, new_name in _RENAMES:
        result = bind.execute(
            sa.text(
                "SELECT typname FROM pg_type WHERE typtype = 'e' AND typname = :name"
            ),
            {"name": new_name},
        )
        if result.fetchone():
            op.execute(f"ALTER TYPE {new_name} RENAME TO {old_name}")
