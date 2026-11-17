"""Seções novas do site do terreiro (beta "Novo construtor do site").

Acrescenta ao tipo `site_section_type` os valores GALLERY (fotos), LINHAS (linhas de trabalho),
ROTINA (dias e horários fixos), FAQ (perguntas frequentes), SOCIAL (redes sociais) e AJUDAR
(como ajudar a casa). O conteúdo de cada seção continua no JSONB `config`; nada mais muda.

O env.py roda todas as migrações numa transação só: o ADD VALUE vai num autocommit_block para
o valor existir (commitado) se outra migração do mesmo `upgrade head` precisar dele.

Downgrade: o Postgres não remove valor de ENUM. As seções desses tipos são apagadas da tabela de
seções para o código antigo não receber um tipo que não conhece; o valor fica no tipo. Versões
salvas no histórico (snapshot JSON) não são tocadas.

Revision ID: 107_site_secoes_novo_construtor
Revises: 106_site_cores_padrao_antigas
Create Date: 2026-11-17
"""

from __future__ import annotations

from alembic import op

revision = "107_site_secoes_novo_construtor"
down_revision = "106_site_cores_padrao_antigas"
branch_labels = None
depends_on = None

NOVOS = ("GALLERY", "LINHAS", "ROTINA", "FAQ", "SOCIAL", "AJUDAR")


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for valor in NOVOS:
            op.execute(f"ALTER TYPE site_section_type ADD VALUE IF NOT EXISTS '{valor}'")


def downgrade() -> None:
    lista = ", ".join(f"'{v}'" for v in NOVOS)
    op.execute(f"DELETE FROM tenant_site_sections WHERE section_type::text IN ({lista})")
