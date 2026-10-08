"""Feature de permissão `escalas` ("Atividades e escalas") — passo 1 de 2 (AM-08).

Tipos de atividade, funções da corrente, atividades internas e, nos próximos cards, escalas,
confirmações e lista de chamada ganham grupo de permissão próprio
(`PermissionFeature.ESCALAS`, docs/plano-area-do-medium.md §6.7): quem organiza a corrente não
precisa de `MEDIUNS:edit` (telefone, endereço e nascimento de todo mundo) nem de `GIRAS`.

Esta migração só acrescenta o valor ao tipo ENUM. O Postgres não deixa usar um valor novo de
enum na mesma transação em que ele foi criado, e o `env.py` roda todas as migrações numa
transação só — por isso o `ALTER TYPE` vai num `autocommit_block()` e o acesso nos grupos
padrão fica na 078 (junto com as tabelas).

Downgrade: no-op. O Postgres não remove valor de ENUM; o valor fica sem uso — as linhas que o
usam são apagadas no downgrade da 078, e um novo upgrade usa `ADD VALUE IF NOT EXISTS`.

Revision ID: 077_permissao_escalas_enum
Revises: 075_corrente_grupos
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "077_permissao_escalas_enum"
down_revision: str = "075_corrente_grupos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE permission_feature ADD VALUE IF NOT EXISTS 'escalas'")


def downgrade() -> None:
    # Valor de ENUM não pode ser removido no Postgres (ver docstring).
    pass
