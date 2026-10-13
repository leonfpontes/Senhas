"""Tolerância na cobrança do cartão (dunning, 2026-10-13).

Pedido do dono depois que um cliente foi suspenso na primeira recusa da renovação (saldo
insuficiente) — a Stripe tenta de novo alguns dias depois e a nova tentativa costuma passar.
Agora a recusa do cartão NÃO suspende: o plano segue liberado, o painel mostra "Pagamento
pendente" com "Atualizar cartão" e os administradores recebem um e-mail. A suspensão só vem
quando a Stripe desiste (assinatura `unpaid`) ou, como rede de segurança, 10 dias depois da
primeira recusa sem pagamento (rodada diária).

Colunas novas em `subscriptions` (nulas = sem pagamento pendente):
- `pagamento_pendente_desde`: quando a primeira cobrança do cartão foi recusada;
- `pagamento_pendente_invoice_id`: fatura da Stripe recusada (escopo do e-mail "uma vez por fatura").

Downgrade: só remove as colunas (quem estiver em tolerância segue ACTIVE; a regra antiga volta).

Revision ID: 094_cobranca_tolerancia_cartao
Revises: 093_sessao_contas_verificadas
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op

revision: str = "094_cobranca_tolerancia_cartao"
down_revision: str = "093_sessao_contas_verificadas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("pagamento_pendente_desde", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("pagamento_pendente_invoice_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "pagamento_pendente_invoice_id")
    op.drop_column("subscriptions", "pagamento_pendente_desde")
