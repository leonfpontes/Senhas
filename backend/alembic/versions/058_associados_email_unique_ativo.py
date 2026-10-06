"""Associados: e-mail único só entre os ativos (permite recadastrar excluído).

A constraint `uq_associados_tenant_email` (migração 012) cobria
(tenant_id, email_normalized) em TODAS as linhas, inclusive as soft-deletadas.
A API checa duplicidade só entre os ativos (`get_by_email` filtra
`deleted_at IS NULL`), então excluir um associado e cadastrá-lo de novo com o
mesmo e-mail passava pela checagem e estourava IntegrityError no INSERT → 500.

Troca a constraint por um índice único parcial `WHERE deleted_at IS NULL`
(mesmo padrão da 052 em consulentes). Não há dado a corrigir: a constraint
antiga é mais restritiva que o índice novo.

Médiuns não têm constraint de unicidade (nome/e-mail livres) — nada a fazer lá.

Downgrade recria a constraint total; falha se já houver um ativo e um
excluído com o mesmo e-mail no tenant (o caso que esta migração libera).

Revision ID: 058_associados_email_unique_ativo
Revises: 057_rbac_grupo_padrao
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op

revision: str = "058_associados_email_unique_ativo"
down_revision: str = "057_rbac_grupo_padrao"
branch_labels = None
depends_on = None

_OLD_CONSTRAINT = "uq_associados_tenant_email"
_INDEX_NAME = "uq_associados_tenant_email_ativo"


def upgrade() -> None:
    op.drop_constraint(_OLD_CONSTRAINT, "associados", type_="unique")
    op.create_index(
        _INDEX_NAME,
        "associados",
        ["tenant_id", "email_normalized"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(_INDEX_NAME, table_name="associados")
    op.create_unique_constraint(_OLD_CONSTRAINT, "associados", ["tenant_id", "email_normalized"])
