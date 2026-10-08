"""Escala de faxina (AM-25) — planejador do mês por grupos da corrente.

- `escala_planos` (§8.3 do plano da Área do Médium): um plano por tipo de atividade (modo
  "grupos por dia") e mês — `mes` sempre o 1º dia (CHECK), `status` `rascunho` | `publicado`
  (texto com CHECK, minúsculo), quem publicou e quando. Único por (`tenant_id`, `tipo_id`, `mes`).
- `escala_plano_dias`: um grupo num dia, com horário (`hora_fim` opcional, depois do início).
  Um dia pode ter mais de um grupo; único por (`plano_id`, `data`, `grupo_id`). `atividade_id`
  (FK `atividades`, ON DELETE SET NULL) é preenchido ao publicar. `removido`: dia tirado do
  rascunho depois de publicado — a próxima publicação cancela/reaproveita a atividade e apaga a
  linha.
- `atividades.escala_plano_dia_id` (do AM-08) continua SEM FK de propósito: o vínculo com FK é o
  `escala_plano_dias.atividade_id` (FK nos dois sentidos seria um ciclo).

Nada de permissão nova: o planejador usa a feature `ESCALAS` (migração 077) e o plano `escalas`.

Downgrade: apaga as duas tabelas (os planos se perdem; as atividades geradas ficam).

Revision ID: 080_escala_planos
Revises: 079_presenca
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "080_escala_planos"
down_revision: str = "079_presenca"
branch_labels = None
depends_on = None

STATUS = ("rascunho", "publicado")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete="CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def upgrade() -> None:
    op.create_table(
        "escala_planos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("tipo_id", "atividade_tipos.id", nullable=False),
        sa.Column("mes", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="rascunho"),
        sa.Column("publicado_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("publicado_por", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "tipo_id", "mes", name="uq_escala_planos_tenant_tipo_mes"),
        sa.CheckConstraint(_in("status", STATUS), name="ck_escala_planos_status"),
        sa.CheckConstraint("EXTRACT(DAY FROM mes) = 1", name="ck_escala_planos_mes_dia_1"),
    )
    op.create_index("ix_escala_planos_tenant_id", "escala_planos", ["tenant_id"])

    op.create_table(
        "escala_plano_dias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("plano_id", "escala_planos.id", nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        _uuid_fk("grupo_id", "corrente_grupos.id", nullable=False),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fim", sa.Time(), nullable=True),
        _uuid_fk("atividade_id", "atividades.id", ondelete="SET NULL", nullable=True),
        sa.Column("removido", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("plano_id", "data", "grupo_id", name="uq_escala_plano_dias_plano_data_grupo"),
        sa.CheckConstraint("hora_fim IS NULL OR hora_fim > hora_inicio", name="ck_escala_plano_dias_horario"),
    )
    op.create_index("ix_escala_plano_dias_tenant_id", "escala_plano_dias", ["tenant_id"])
    op.create_index("ix_escala_plano_dias_atividade_id", "escala_plano_dias", ["atividade_id"])


def downgrade() -> None:
    op.drop_index("ix_escala_plano_dias_atividade_id", table_name="escala_plano_dias")
    op.drop_index("ix_escala_plano_dias_tenant_id", table_name="escala_plano_dias")
    op.drop_table("escala_plano_dias")
    op.drop_index("ix_escala_planos_tenant_id", table_name="escala_planos")
    op.drop_table("escala_planos")
