"""add_curso_mensalidade_pagamento

Revision ID: 05d6d6f34f84
Revises: d9fafadd9261
Create Date: 2026-06-03 14:08:27.944019

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers used by Alembic.
revision = '05d6d6f34f84'
down_revision = 'd9fafadd9261'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Adicionar coluna gerar_mensalidade na tabela cursos_presenciais
    op.add_column(
        "cursos_presenciais",
        sa.Column("gerar_mensalidade", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 2. Criar tabela curso_participante_pagamentos
    op.create_table(
        "curso_participante_pagamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participante_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("curso_participantes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mes_referencia", sa.Date(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("PENDENTE", "PAGO", "ISENTO", name="mensalidade_status", create_type=False),
            nullable=False,
            server_default="PENDENTE",
        ),
        sa.Column("data_pagamento", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valor_vigente", sa.Numeric(10, 2), nullable=True),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
        sa.Column("comprovante_data", postgresql.BYTEA(), nullable=True),
        sa.Column("comprovante_filename", sa.String(255), nullable=True),
        sa.Column("comprovante_mime", sa.String(50), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column(
            "registrado_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("participante_id", "mes_referencia", name="uq_curso_participante_mes"),
    )

    # 3. Criar índices
    op.create_index(
        "ix_curso_participante_pagamentos_tenant_mes",
        "curso_participante_pagamentos",
        ["tenant_id", "mes_referencia"],
    )
    op.create_index(
        "ix_curso_participante_pagamentos_participante_id",
        "curso_participante_pagamentos",
        ["participante_id"],
    )


def downgrade() -> None:
    # 1. Remover índices
    op.drop_index(
        "ix_curso_participante_pagamentos_participante_id",
        table_name="curso_participante_pagamentos",
    )
    op.drop_index(
        "ix_curso_participante_pagamentos_tenant_mes",
        table_name="curso_participante_pagamentos",
    )

    # 2. Remover tabela
    op.drop_table("curso_participante_pagamentos")

    # 3. Remover coluna gerar_mensalidade de cursos_presenciais
    op.drop_column("cursos_presenciais", "gerar_mensalidade")
