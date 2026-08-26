"""Purge soft-deleted gira_time_slots que ocupam a unique constraint.

A versão pré-a6d20cd de replace_slots_for_gira soft-deletava os horários
substituídos em vez de hard-deletar. Essas linhas continuam ocupando a tupla
(tenant_id, gira_id, horario) na uq_gira_time_slot_tenant_gira_horario (a
constraint não é parcial), então readicionar um horário que colide com uma
sobra soft-deletada estoura UniqueViolationError → 500 no editor de horários
(Sentry PYTHON-FASTAPI-S / PYTHON-FASTAPI-R).

Hard-delete é seguro: tickets que referenciam esses slots caem para
time_slot_id=NULL via ondelete=SET NULL (mesmo comportamento do fluxo atual
de remoção de horário), e nenhuma query de emissão/listagem enxerga linhas
soft-deletadas — são dado morto.

Revision ID: 054_purge_soft_deleted_gira_time_slots
Revises: 053_support_chat
Create Date: 2026-08-26
"""
from alembic import op

# revision identifiers
revision: str = "054_purge_soft_deleted_gira_time_slots"
down_revision: str = "053_support_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM gira_time_slots WHERE deleted_at IS NOT NULL")


def downgrade() -> None:
    # Data-only cleanup — as linhas removidas eram lixo irrecuperável; nada a restaurar.
    pass
