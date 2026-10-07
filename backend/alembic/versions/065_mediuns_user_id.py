"""Vínculo médium ↔ usuário e consentimento da Área do Médium — passo 2 de 2 (AM-02).

- `mediuns.user_id`: FK para `users.id` (ON DELETE SET NULL, nullable). É o
  vínculo que dá a Área do Médium a quem tem conta: o papel não decide nada
  (operador/admin que também é médium continua operador/admin e ganha a segunda
  área pelo vínculo). Nasce vazio: o vínculo só é criado no aceite do convite
  (AM-03), com prova de posse do e-mail.
- `uq_mediuns_user_id_ativo`: um usuário fica ligado a no máximo UM médium não
  excluído (índice único parcial; médium excluído libera o usuário).
- `area_consentimento_em` / `area_consentimento_versao`: aceite do texto de
  consentimento (LGPD art. 11 — ser médium revela convicção religiosa), gravado
  no aceite do convite (AM-03).

Downgrade: remove índice e colunas (perde os vínculos e o registro de consentimento).

Revision ID: 065_mediuns_user_id
Revises: 064_user_role_medium
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "065_mediuns_user_id"
down_revision: str = "064_user_role_medium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mediuns",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("mediuns", sa.Column("area_consentimento_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mediuns", sa.Column("area_consentimento_versao", sa.String(length=20), nullable=True))
    op.create_index(
        "uq_mediuns_user_id_ativo",
        "mediuns",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_mediuns_user_id_ativo", table_name="mediuns")
    op.drop_column("mediuns", "area_consentimento_versao")
    op.drop_column("mediuns", "area_consentimento_em")
    op.drop_column("mediuns", "user_id")
