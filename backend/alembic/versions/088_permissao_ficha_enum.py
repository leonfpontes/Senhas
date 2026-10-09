"""Feature de permissão `ficha_espiritual` ("Ficha espiritual") — passo 1 de 2 (F-05).

A ficha espiritual do médium (orixá de cabeça, guia de frente, batismo, obrigações...) é dado
religioso (LGPD art. 11) e ganha grupo de permissão próprio, separado de `MEDIUNS`
(`PermissionFeature.FICHA_ESPIRITUAL`, docs/plano-benchmark-2026-10.md §F-05).

Esta migração só acrescenta o valor ao tipo ENUM, num `autocommit_block()` (o `env.py` roda todas
as migrações numa transação só e o Postgres não deixa usar um valor novo de enum antes do commit).

**Exceção consciente ao roteiro do CLAUDE.md:** NÃO há a segunda migração que dá acesso total
nos grupos padrão "Acesso total". Dado religioso só é visto por quem a casa escolher, de propósito:
admin vê (bypass dos grupos) e o operador precisa de um grupo com a feature marcada à mão.
A 089 cria as tabelas.

Downgrade: no-op. O Postgres não remove valor de ENUM; o valor fica sem uso (as linhas que o usam
são apagadas no downgrade da 089) e um novo upgrade usa `ADD VALUE IF NOT EXISTS`.

Revision ID: 088_permissao_ficha_enum
Revises: 087_materiais_corrente
Create Date: 2026-10-08
"""

from alembic import op

revision: str = "088_permissao_ficha_enum"
down_revision: str = "087_materiais_corrente"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE permission_feature ADD VALUE IF NOT EXISTS 'ficha_espiritual'")


def downgrade() -> None:
    # Valor de ENUM não pode ser removido no Postgres (ver docstring).
    pass
