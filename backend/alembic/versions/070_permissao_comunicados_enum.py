"""Feature de permissão `comunicados` ("Avisos da Área") — passo 1 de 2 (AM-09).

Os avisos da casa para a corrente (Área do Médium) ganham grupo de permissão próprio
(`PermissionFeature.COMUNICADOS`, docs/plano-area-do-medium.md §6.7): publicar = `insert`,
editar = `edit`, arquivar = `delete`, ver a lista e quem leu = `view`.

Esta migração só acrescenta o valor ao tipo ENUM. O Postgres não deixa usar um valor novo de
enum na mesma transação em que ele foi criado, e o `env.py` roda todas as migrações numa
transação só — por isso o `ALTER TYPE` vai num `autocommit_block()` e o acesso nos grupos
padrão fica na 071 (junto com as tabelas).

Downgrade: no-op. O Postgres não remove valor de ENUM (`ALTER TYPE ... DROP VALUE` não existe);
o valor fica sem uso — as linhas que o usam são apagadas no downgrade da 071, e um novo upgrade
usa `ADD VALUE IF NOT EXISTS`.

Revision ID: 070_permissao_comunicados_enum
Revises: 068_area_medium_config_pix
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "070_permissao_comunicados_enum"
down_revision: str = "068_area_medium_config_pix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE permission_feature ADD VALUE IF NOT EXISTS 'comunicados'")


def downgrade() -> None:
    # Valor de ENUM não pode ser removido no Postgres (ver docstring).
    pass
