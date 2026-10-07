"""Comprovante da mensalidade enviado pelo médium e recusa pela casa (AM-11/AM-12).

`mensalidade_pagamentos` ganha o rastro do fluxo "o médium envia, a casa confere"
(docs/plano-area-do-medium.md §7.1, decisão D-25):
- `comprovante_enviado_em` / `comprovante_enviado_por` (FK `users.id`, ON DELETE SET NULL):
  quando e por quem o comprovante chegou pela Área do Médium. Comprovante anexado pelo
  painel (registro manual) não preenche — só o da Área entra na fila "Comprovantes para
  conferir".
- `recusa_motivo` (texto que o médium vê) e `recusado_em`: a casa não confirmou o
  comprovante. O médium pode reenviar; o reenvio limpa os dois.

O status continua PENDENTE até a casa confirmar (sem valor novo no ENUM
`mensalidade_status`): "em conferência" e "não confirmada" são calculados a partir
dessas colunas.

Índice parcial `ix_mensalidade_pagamentos_conferir` (tenant, enviado_em) só nas linhas
pendentes com comprovante enviado — a fila do painel não varre a tabela (que guarda o
BYTEA do comprovante).

Revision ID: 072_mensalidade_comprovante_medium
Revises: 068_area_medium_config_pix
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "072_mensalidade_comprovante_medium"
down_revision: str = "068_area_medium_config_pix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mensalidade_pagamentos",
        sa.Column("comprovante_enviado_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "mensalidade_pagamentos",
        sa.Column(
            "comprovante_enviado_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_mensalidade_pagamentos_comprovante_enviado_por"),
            nullable=True,
        ),
    )
    op.add_column("mensalidade_pagamentos", sa.Column("recusa_motivo", sa.Text(), nullable=True))
    op.add_column("mensalidade_pagamentos", sa.Column("recusado_em", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_mensalidade_pagamentos_conferir",
        "mensalidade_pagamentos",
        ["tenant_id", "comprovante_enviado_em"],
        postgresql_where=sa.text("comprovante_enviado_em IS NOT NULL AND status = 'PENDENTE'"),
    )


def downgrade() -> None:
    op.drop_index("ix_mensalidade_pagamentos_conferir", table_name="mensalidade_pagamentos")
    op.drop_column("mensalidade_pagamentos", "recusado_em")
    op.drop_column("mensalidade_pagamentos", "recusa_motivo")
    op.drop_constraint(
        "fk_mensalidade_pagamentos_comprovante_enviado_por", "mensalidade_pagamentos", type_="foreignkey"
    )
    op.drop_column("mensalidade_pagamentos", "comprovante_enviado_por")
    op.drop_column("mensalidade_pagamentos", "comprovante_enviado_em")
