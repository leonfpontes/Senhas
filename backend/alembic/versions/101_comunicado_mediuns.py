"""Aviso para médiuns específicos — `comunicado_mediuns` e o público `mediuns` nos avisos.

- `comunicado_mediuns`: PK (`comunicado_id`, `medium_id`), `tenant_id` — avisos com
  `publico = 'mediuns'` (um ou mais médiuns escolhidos um a um, além de "toda a corrente" e
  "grupos da corrente").
- `ck_comunicados_publico` passa a aceitar `mediuns`.

Sem feature nova de permissão: continua `COMUNICADOS`.

Downgrade: avisos com público `mediuns` são arquivados (soft delete) e voltam a `todos` só para
caber no CHECK antigo — nunca ficam visíveis para a corrente inteira; depois a tabela sai.

Revision ID: 101_comunicado_mediuns
Revises: 100_mensalidade_chaves_pix_grupos
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "101_comunicado_mediuns"
down_revision: str = "100_mensalidade_chaves_pix_grupos"
branch_labels = None
depends_on = None


def _uuid_fk(nome: str, alvo: str, **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete="CASCADE"), **kw)


def upgrade() -> None:
    op.create_table(
        "comunicado_mediuns",
        _uuid_fk("comunicado_id", "comunicados.id", primary_key=True),
        _uuid_fk("medium_id", "mediuns.id", primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
    )
    op.create_index("ix_comunicado_mediuns_tenant_id", "comunicado_mediuns", ["tenant_id"])
    op.create_index("ix_comunicado_mediuns_medium_id", "comunicado_mediuns", ["medium_id"])

    op.drop_constraint("ck_comunicados_publico", "comunicados", type_="check")
    op.create_check_constraint(
        "ck_comunicados_publico",
        "comunicados",
        "publico IN ('todos', 'atendimento', 'cambones', 'grupos', 'mediuns')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE comunicados SET deleted_at = COALESCE(deleted_at, now()), publico = 'todos' WHERE publico = 'mediuns'"
    )
    op.drop_constraint("ck_comunicados_publico", "comunicados", type_="check")
    op.create_check_constraint(
        "ck_comunicados_publico", "comunicados", "publico IN ('todos', 'atendimento', 'cambones', 'grupos')"
    )
    op.drop_index("ix_comunicado_mediuns_medium_id", table_name="comunicado_mediuns")
    op.drop_index("ix_comunicado_mediuns_tenant_id", table_name="comunicado_mediuns")
    op.drop_table("comunicado_mediuns")
