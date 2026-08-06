"""Dedupe consulente rows sharing tenant_id+email_normalized, enforce uniqueness.

Historical data has consulente rows sharing (tenant_id, email_normalized) —
migration 004 only ever added a plain index, nothing enforced uniqueness.
ConsulenteRepository.get_by_email used scalar_one_or_none(), which raises
MultipleResultsFound and 500s ticket emission for whoever hits a duplicate
(incident: tenant tenda-de-umbanda-caboclo-cobra-coral-tuccco, consulente
with a duplicated email — every emission attempt failed, every other
consulente in the same gira succeeded normally). The application-level fix
(query resolves to the oldest active row instead of crashing) already
shipped; this migration fixes the underlying data and closes the gap so new
duplicates can't be created going forward.

Merge step, per (tenant_id, email_normalized) group of active
(deleted_at IS NULL) rows sharing the same email:
- Keep the oldest row (most likely to carry prior ticket history).
- Repoint every Ticket.consulente_id from the other rows onto the keeper.
- Soft-delete the other rows (tickets.consulente_id has ondelete=CASCADE —
  hard-deleting would destroy those repointed tickets' foreign key target
  history is fine now since they were repointed first, but soft-delete
  keeps the audit trail and matches this model's LGPD-erasure convention).

Then create a partial unique index on (tenant_id, email_normalized) scoped
to active rows with a non-null email, so this can't recur.

Revision ID: 052_dedupe_consulentes_unique_email
Revises: 051_gira_time_slots
Create Date: 2026-08-06
"""

import sqlalchemy as sa
from alembic import op

revision: str = "052_dedupe_consulentes_unique_email"
down_revision: str = "051_gira_time_slots"
branch_labels = None
depends_on = None

_INDEX_NAME = "uq_consulentes_tenant_email_active"


def upgrade() -> None:
    connection = op.get_bind()

    duplicate_groups = connection.execute(
        sa.text(
            """
            SELECT tenant_id, email_normalized,
                   array_agg(id ORDER BY created_at ASC) AS ids
            FROM consulentes
            WHERE email_normalized IS NOT NULL
              AND deleted_at IS NULL
            GROUP BY tenant_id, email_normalized
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()

    for tenant_id, email_normalized, ids in duplicate_groups:
        keeper_id = ids[0]
        duplicate_ids = ids[1:]

        connection.execute(
            sa.text(
                "UPDATE tickets SET consulente_id = :keeper_id "
                "WHERE consulente_id = ANY(:duplicate_ids)"
            ),
            {"keeper_id": keeper_id, "duplicate_ids": duplicate_ids},
        )
        connection.execute(
            sa.text(
                "UPDATE consulentes SET deleted_at = now() "
                "WHERE id = ANY(:duplicate_ids)"
            ),
            {"duplicate_ids": duplicate_ids},
        )

    op.create_index(
        _INDEX_NAME,
        "consulentes",
        ["tenant_id", "email_normalized"],
        unique=True,
        postgresql_where=sa.text("email_normalized IS NOT NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(_INDEX_NAME, table_name="consulentes")
    # Merged/soft-deleted rows are not restored — that merge reflects real
    # data cleanup (tickets were repointed to the surviving consulente), not
    # a reversible schema change.
