"""Orientações da gira para a corrente (AM-07).

`giras.orientacoes_corrente` (Text, nullable): o que levar, roupa, horário de chegada
da corrente. Só aparece na Área do Médium (`/api/v1/medium/agenda/*` e no Início) —
diferente de `recados`, que vai para o consulente (e-mail e bilhete da senha). Nunca
sai em rota pública, site, e-mail ou bilhete.

Criada como 069 enquanto os cards da Área corriam em paralelo e renumerada para 073 no merge,
depois da 072 (AM-11/AM-12), que entrou antes — a produção já tinha passado da 069.

Revision ID: 073_giras_orientacoes_corrente
Revises: 072_mensalidade_comprovante_medium
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "073_giras_orientacoes_corrente"
down_revision: str = "072_mensalidade_comprovante_medium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("giras", sa.Column("orientacoes_corrente", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("giras", "orientacoes_corrente")
