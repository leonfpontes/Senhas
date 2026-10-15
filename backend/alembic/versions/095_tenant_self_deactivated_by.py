"""Quem desativou o terreiro (pentest H1, 2026-10-15).

O /reactivate-account reativava o terreiro para qualquer usuário dele com e-mail e senha
válidos. Como o /deactivate-account só exige que o admin seja o único usuário *ativo*, um
colaborador suspenso recuperava o acesso sozinho. Agora a desativação grava o autor em
`tenants.self_deactivated_by` e só ele reativa.

Sem backfill: terreiros já desativados ficam com NULL e a reativação self-service é
recusada (403 REACTIVATION_NOT_ALLOWED) — reativação desses só pelo suporte.

Downgrade: remove a coluna (a reativação volta a aceitar qualquer usuário do terreiro).

Revision ID: 095_tenant_self_deactivated_by
Revises: 094_cobranca_tolerancia_cartao
Create Date: 2026-10-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "095_tenant_self_deactivated_by"
down_revision: str = "094_cobranca_tolerancia_cartao"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "self_deactivated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_tenants_self_deactivated_by_users"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tenants", "self_deactivated_by")
