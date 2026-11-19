"""Cadastro único das chaves PIX: a principal entra na lista das chaves (11/2026).

Até aqui a chave principal ficava em `mensalidade_configs.pix_*` e as outras em
`mensalidade_chaves_pix`, em duas telas. Agora todas ficam em `mensalidade_chaves_pix` e a direção
marca qual é a principal (`principal`, no máximo uma por terreiro). `mensalidade_configs.pix_*`
continua como espelho da principal, para quem já lê de lá.

Dados: cada terreiro com chave em `mensalidade_configs` ganha uma linha principal com os mesmos
campos (apelido "Chave principal"; se o nome já existir, "Chave principal da casa"). Nada é apagado.

Revision ID: 112_chaves_pix_cadastro_unico
Revises: 111_reemissao_apos_fila_expirada
Create Date: 2026-11-19
"""

import sqlalchemy as sa
from alembic import op

revision: str = "112_chaves_pix_cadastro_unico"
down_revision: str = "111_reemissao_apos_fila_expirada"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mensalidade_chaves_pix",
        sa.Column("principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_mensalidade_chaves_pix_tenant_principal",
        "mensalidade_chaves_pix",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("principal"),
    )
    op.execute(
        """
        INSERT INTO mensalidade_chaves_pix (
            id, tenant_id, apelido, pix_tipo, pix_chave, pix_nome_recebedor, pix_cidade,
            pix_instrucoes, pix_alterado_em, conta_bancaria_id, principal, created_at, updated_at
        )
        SELECT gen_random_uuid(), c.tenant_id,
               CASE WHEN EXISTS (
                   SELECT 1 FROM mensalidade_chaves_pix k
                    WHERE k.tenant_id = c.tenant_id AND lower(k.apelido) = 'chave principal'
               ) THEN 'Chave principal da casa' ELSE 'Chave principal' END,
               c.pix_tipo, c.pix_chave, COALESCE(c.pix_nome_recebedor, ''), COALESCE(c.pix_cidade, ''),
               c.pix_instrucoes, c.pix_alterado_em, c.pix_conta_bancaria_id, true,
               COALESCE(c.created_at, now()), now()
          FROM mensalidade_configs c
         WHERE c.pix_chave IS NOT NULL AND btrim(c.pix_chave) <> '' AND c.pix_tipo IS NOT NULL
        """
    )


def downgrade() -> None:
    # A principal volta a existir só em mensalidade_configs (que sempre teve o espelho).
    op.execute("DELETE FROM mensalidade_chaves_pix WHERE principal")
    op.drop_index("uq_mensalidade_chaves_pix_tenant_principal", table_name="mensalidade_chaves_pix")
    op.drop_column("mensalidade_chaves_pix", "principal")
