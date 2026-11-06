"""Beta "Retorno do consulente na porta" — tabela `consulente_retornos`.

Pedido da Mãe Rai (06/11/2026): quem registra o atendimento marca que o consulente precisa voltar
(com um médium ou com uma entidade) e, nas giras seguintes, a Porta mostra o recado na senha dessa
pessoa até alguém marcar como resolvido. Ver `src/models/consulente_retornos.py` e
`docs/betas/beta_retorno_consulente.md`.

Aditiva. Downgrade: remove a tabela (os recados de retorno se perdem; as senhas guardam o
atendimento como antes).

Revision ID: 105_consulente_retornos
Revises: 104_lembrete_dia_gira
Create Date: 2026-11-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "105_consulente_retornos"
down_revision: str = "104_lembrete_dia_gira"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consulente_retornos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("consulente_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("consulentes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gira_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("giras.id", ondelete="SET NULL"), nullable=True),
        sa.Column("medium_nome", sa.String(255), nullable=True),
        sa.Column("entidade", sa.String(255), nullable=True),
        sa.Column("recado", sa.Text(), nullable=True),
        sa.Column("criado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolvido_na_gira_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("giras.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "medium_nome IS NOT NULL OR entidade IS NOT NULL OR recado IS NOT NULL",
            name="ck_consulente_retornos_algum_dado",
        ),
    )
    op.create_index("ix_consulente_retornos_tenant_id", "consulente_retornos", ["tenant_id"])
    op.create_index("ix_consulente_retornos_consulente_id", "consulente_retornos", ["consulente_id"])
    op.create_index(
        "ix_consulente_retornos_abertos",
        "consulente_retornos",
        ["tenant_id", "consulente_id"],
        postgresql_where=sa.text("resolvido_em IS NULL"),
    )
    op.create_index(
        "uq_consulente_retornos_ticket",
        "consulente_retornos",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("ticket_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_consulente_retornos_ticket", table_name="consulente_retornos")
    op.drop_index("ix_consulente_retornos_abertos", table_name="consulente_retornos")
    op.drop_index("ix_consulente_retornos_consulente_id", table_name="consulente_retornos")
    op.drop_index("ix_consulente_retornos_tenant_id", table_name="consulente_retornos")
    op.drop_table("consulente_retornos")
