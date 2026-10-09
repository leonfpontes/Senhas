"""Plano pago por PIX mês a mês — card $-04 (decisão do dono, 2026-10-09).

A conta Stripe BR só aceita Pix como pagamento avulso (Pix Automático não existe na conta BR,
e Pix não entra em assinaturas/faturas). Por isso o "PIX mês a mês" não é assinatura da
Stripe: cada Checkout `mode=payment` pago libera 30 dias do plano.

Tabela nova `assinatura_pix_pagamentos` (um registro por pagamento confirmado):
- `checkout_session_id` ÚNICO — idempotência: o mesmo pagamento nunca libera dois meses;
- `payment_intent_id`, `plan`, `amount_cents`, `paid_at` — referência para suporte/histórico;
- `period_start` / `period_end` — o mês que o pagamento liberou (NULL quando `aplicado=false`:
  pagamento confirmado que não virou mês de plano, ex. o terreiro assinou com cartão no meio).

Nada muda em `subscriptions`: o estado vigente reaproveita `collection_method = 'pix_mensal'`
(coluna da 085) e `current_period_end` (pago até). Lembretes de vencimento usam a marca
persistente de `tenant_configs.custom_settings` (scheduler_guard.claim_once).

Downgrade: apaga a tabela (o histórico de pagamentos PIX se perde; a Stripe mantém os
pagamentos no Dashboard).

Revision ID: 090_assinatura_pix_mensal
Revises: 089_ficha_espiritual
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "090_assinatura_pix_mensal"
down_revision: str = "089_ficha_espiritual"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assinatura_pix_pagamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("checkout_session_id", sa.String(length=255), nullable=False),
        sa.Column("payment_intent_id", sa.String(length=255), nullable=True),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("aplicado", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("checkout_session_id", name="uq_assinatura_pix_pagamentos_checkout_session_id"),
    )
    op.create_index("ix_assinatura_pix_pagamentos_tenant_id", "assinatura_pix_pagamentos", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_assinatura_pix_pagamentos_tenant_id", table_name="assinatura_pix_pagamentos")
    op.drop_table("assinatura_pix_pagamentos")
