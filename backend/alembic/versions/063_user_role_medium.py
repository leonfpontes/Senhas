"""Papel `medium` no tipo `user_role` — Área do Médium, passo 1 de 2 (AM-02).

Quem é só médium (sem acesso ao painel do terreiro) ganha uma conta com o papel
novo `medium`. Ele não passa em nenhuma rota `/api/v1/admin/*` (dependência
`require_backoffice` no `admin_router`) e só enxerga `/api/v1/medium/*` quando
há vínculo `mediuns.user_id` (migração 064) e o plano tem `area_medium`.

Esta migração só acrescenta o valor ao tipo ENUM. O Postgres não deixa usar um
valor novo de enum na mesma transação em que ele foi criado, e o `env.py` roda
todas as migrações numa transação só — por isso o `ALTER TYPE` vai num
`autocommit_block()` (mesmo padrão da 061) e fica sozinho nesta revisão.

Downgrade: no-op. O Postgres não remove valor de ENUM (`ALTER TYPE ... DROP
VALUE` não existe). O valor `medium` fica no tipo sem uso; um novo upgrade usa
`ADD VALUE IF NOT EXISTS`.

Revision ID: 063_user_role_medium
Revises: 062_permissao_site_copia
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "063_user_role_medium"
down_revision: str = "062_permissao_site_copia"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'medium'")


def downgrade() -> None:
    # Valor de ENUM não pode ser removido no Postgres (ver docstring).
    pass
