"""Orientações da gira para a corrente (AM-07).

`giras.orientacoes_corrente` (Text, nullable): o que levar, roupa, horário de chegada
da corrente. Só aparece na Área do Médium (`/api/v1/medium/agenda/*` e no Início) —
diferente de `recados`, que vai para o consulente (e-mail e bilhete da senha). Nunca
sai em rota pública, site, e-mail ou bilhete.

Revision ID: 069_giras_orientacoes_corrente
Revises: 068_area_medium_config_pix
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "069_giras_orientacoes_corrente"
down_revision: str = "068_area_medium_config_pix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("giras", sa.Column("orientacoes_corrente", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("giras", "orientacoes_corrente")
