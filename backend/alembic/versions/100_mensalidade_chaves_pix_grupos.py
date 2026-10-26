"""Chave PIX por grupo da corrente, ligada a uma conta bancária.

A casa pode receber a mensalidade em mais de uma conta (TUCCCO: conta PJ e conta
"alternativa"; parte da corrente paga numa, parte na outra).

- `mensalidade_configs.pix_conta_bancaria_id`: conta onde cai a chave do terreiro.
- `mensalidade_chaves_pix`: chaves extras, cada uma com apelido e conta bancária.
- `mensalidade_chave_pix_grupos`: grupo da corrente → chave (um grupo, no máximo uma chave).

Sem dado novo: tudo nasce vazio e a Área continua mostrando a chave do terreiro a todos.

Revision ID: 100_mensalidade_chaves_pix_grupos
Revises: 099_conta_bancaria_data_saldo_inicial
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "100_mensalidade_chaves_pix_grupos"
down_revision: str = "099_conta_bancaria_data_saldo_inicial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mensalidade_configs",
        sa.Column("pix_conta_bancaria_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_mensalidade_configs_pix_conta_bancaria",
        "mensalidade_configs",
        "contas_bancarias",
        ["pix_conta_bancaria_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "mensalidade_chaves_pix",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("apelido", sa.String(60), nullable=False),
        sa.Column("pix_tipo", sa.String(10), nullable=False),
        sa.Column("pix_chave", sa.String(77), nullable=False),
        sa.Column("pix_nome_recebedor", sa.String(25), nullable=False),
        sa.Column("pix_cidade", sa.String(15), nullable=False),
        sa.Column("pix_instrucoes", sa.Text(), nullable=True),
        sa.Column("pix_alterado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "conta_bancaria_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "contas_bancarias.id", ondelete="SET NULL", name="fk_mensalidade_chaves_pix_conta_bancaria"
            ),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')",
            name="ck_mensalidade_chaves_pix_tipo",
        ),
    )
    op.create_index("ix_mensalidade_chaves_pix_tenant_id", "mensalidade_chaves_pix", ["tenant_id"])
    op.create_index(
        "uq_mensalidade_chaves_pix_tenant_apelido",
        "mensalidade_chaves_pix",
        ["tenant_id", sa.text("lower(apelido)")],
        unique=True,
    )

    op.create_table(
        "mensalidade_chave_pix_grupos",
        sa.Column(
            "grupo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("corrente_grupos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "chave_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mensalidade_chaves_pix.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index("ix_mensalidade_chave_pix_grupos_tenant_id", "mensalidade_chave_pix_grupos", ["tenant_id"])
    op.create_index("ix_mensalidade_chave_pix_grupos_chave_id", "mensalidade_chave_pix_grupos", ["chave_id"])


def downgrade() -> None:
    op.drop_index("ix_mensalidade_chave_pix_grupos_chave_id", table_name="mensalidade_chave_pix_grupos")
    op.drop_index("ix_mensalidade_chave_pix_grupos_tenant_id", table_name="mensalidade_chave_pix_grupos")
    op.drop_table("mensalidade_chave_pix_grupos")
    op.drop_index("uq_mensalidade_chaves_pix_tenant_apelido", table_name="mensalidade_chaves_pix")
    op.drop_index("ix_mensalidade_chaves_pix_tenant_id", table_name="mensalidade_chaves_pix")
    op.drop_table("mensalidade_chaves_pix")
    op.drop_constraint("fk_mensalidade_configs_pix_conta_bancaria", "mensalidade_configs", type_="foreignkey")
    op.drop_column("mensalidade_configs", "pix_conta_bancaria_id")
