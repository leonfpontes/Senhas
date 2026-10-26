"""Data do saldo inicial da conta bancária (`contas_bancarias.data_saldo_inicial`).

O saldo inicial é "o saldo da conta nesse dia". Antes não tinha data e o Fluxo de caixa somava
por cima dele TUDO que já tinha sido pago — inclusive mensalidades e lançamentos anteriores ao
saldo informado, que já estavam dentro dele (contava em dobro). Com a data, só entra o que foi
pago a partir dela (e o que foi pago antes é descontado ao olhar meses anteriores).

As contas existentes ficam com a data do cadastro, que era a regra que a tela já mostrava
("saldo da conta no momento do cadastro").

Revision ID: 099_conta_bancaria_data_saldo_inicial
Revises: 098_waitlist_confirmation_minutes
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision: str = "099_conta_bancaria_data_saldo_inicial"
down_revision: str = "098_waitlist_confirmation_minutes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contas_bancarias", sa.Column("data_saldo_inicial", sa.Date(), nullable=True))
    op.execute(
        "UPDATE contas_bancarias "
        "SET data_saldo_inicial = DATE(created_at AT TIME ZONE 'America/Sao_Paulo')"
    )
    op.alter_column(
        "contas_bancarias",
        "data_saldo_inicial",
        nullable=False,
        server_default=sa.text("CURRENT_DATE"),
    )


def downgrade() -> None:
    op.drop_column("contas_bancarias", "data_saldo_inicial")
