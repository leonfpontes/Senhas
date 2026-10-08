"""Meus dados (encerrar acesso) e aniversariantes da corrente na Área do Médium (AM-14/AM-20).

- `mediuns.area_consentimento_revogado_em` + `area_consentimento_revogado_versao` (AM-14): quando
  o médium encerra o próprio acesso, a revogação do consentimento da Área fica registrada com a
  data e a versão do texto revogado. O aceite (`area_consentimento_em/_versao`) continua gravado:
  é o histórico. Um convite aceito depois grava um aceite novo (mais recente que a revogação).
- `mediuns.aniversario_visivel` (AM-20, padrão `false`): opt-in "Mostrar meu aniversário para a
  corrente" (só dia e mês, nunca o ano). Encerrar o acesso desliga.
- `tenant_configs.area_medium_aniversario_mensagem` (AM-20, até 200): texto da casa no Início do
  aniversariante; vazio = "A <terreiro> deseja um feliz aniversário, <primeiro nome>! Axé!".

Downgrade: apaga as quatro colunas (a revogação registrada e os opt-ins se perdem).

Revision ID: 083_meus_dados_aniversarios
Revises: 081_lembretes
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op

revision: str = "083_meus_dados_aniversarios"
down_revision: str = "081_lembretes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mediuns", sa.Column("area_consentimento_revogado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mediuns", sa.Column("area_consentimento_revogado_versao", sa.String(20), nullable=True))
    op.add_column(
        "mediuns", sa.Column("aniversario_visivel", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.add_column("tenant_configs", sa.Column("area_medium_aniversario_mensagem", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_configs", "area_medium_aniversario_mensagem")
    op.drop_column("mediuns", "aniversario_visivel")
    op.drop_column("mediuns", "area_consentimento_revogado_versao")
    op.drop_column("mediuns", "area_consentimento_revogado_em")
