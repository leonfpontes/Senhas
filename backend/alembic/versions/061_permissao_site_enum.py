"""Feature de permissão `site` ("Site do terreiro") — passo 1 de 2 (T-06).

O "Meu Site" (`/api/v1/admin/sites`) usava o grupo de Cursos Presenciais: quem
podia mexer em cursos editava o site do terreiro e vice-versa. A feature passa
a ser separada (`PermissionFeature.SITE`).

Esta migração só acrescenta o valor ao tipo ENUM. O Postgres não deixa usar um
valor novo de enum na mesma transação em que ele foi criado, e o `env.py` roda
todas as migrações numa transação só — por isso o `ALTER TYPE` vai num
`autocommit_block()` e a cópia das permissões fica na 062.

Downgrade: no-op. O Postgres não remove valor de ENUM (`ALTER TYPE ... DROP
VALUE` não existe); recriar o tipo inteiro só para isso não compensa. O valor
`site` fica no tipo sem uso — as linhas que o usam são apagadas no downgrade da
062, e um novo upgrade usa `ADD VALUE IF NOT EXISTS`.

Revision ID: 061_permissao_site_enum
Revises: 060_usuarios_ilimitados
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "061_permissao_site_enum"
down_revision: str = "060_usuarios_ilimitados"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE permission_feature ADD VALUE IF NOT EXISTS 'site'")


def downgrade() -> None:
    # Valor de ENUM não pode ser removido no Postgres (ver docstring).
    pass
