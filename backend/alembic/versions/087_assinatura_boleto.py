"""Assinatura do plano paga por boleto (fatura por e-mail) — card $-04.

Colunas novas em `subscriptions` (todas opcionais; linhas existentes ficam como estão):
- `collection_method`: como a assinatura Stripe ligada ao terreiro é cobrada —
  `charge_automatically` (cartão) ou `send_invoice` (fatura por e-mail paga com boleto).
  NULL = assinatura antiga/sem Stripe (tratada como cartão).
- `pending_stripe_subscription_id`: assinatura por boleto criada mas cuja PRIMEIRA fatura
  ainda não foi paga. Fica separada de `stripe_subscription_id` de propósito: enquanto não
  pagar, o terreiro não ganha o plano, e as regras de acesso/métricas/trial (que olham
  `stripe_subscription_id`) seguem valendo sem exceção.
- `pending_invoice_id` / `pending_invoice_url` / `pending_invoice_due_at`: fatura em aberto
  (primeira ou renovação) com o link da página de pagamento da Stripe, para o painel mostrar
  "Aguardando pagamento" e o botão "Pagar agora".

Downgrade: apaga as colunas (o vínculo com faturas pendentes se perde; a Stripe continua
mandando as faturas por e-mail).

Revision ID: 087_assinatura_boleto
Revises: 081_lembretes
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op

revision: str = "087_assinatura_boleto"
down_revision: str = "081_lembretes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("collection_method", sa.String(length=32), nullable=True))
    op.add_column("subscriptions", sa.Column("pending_stripe_subscription_id", sa.String(length=255), nullable=True))
    op.add_column("subscriptions", sa.Column("pending_invoice_id", sa.String(length=255), nullable=True))
    op.add_column("subscriptions", sa.Column("pending_invoice_url", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("pending_invoice_due_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint(
        "uq_subscriptions_pending_stripe_subscription_id", "subscriptions", ["pending_stripe_subscription_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_subscriptions_pending_stripe_subscription_id", "subscriptions", type_="unique")
    op.drop_column("subscriptions", "pending_invoice_due_at")
    op.drop_column("subscriptions", "pending_invoice_url")
    op.drop_column("subscriptions", "pending_invoice_id")
    op.drop_column("subscriptions", "pending_stripe_subscription_id")
    op.drop_column("subscriptions", "collection_method")
