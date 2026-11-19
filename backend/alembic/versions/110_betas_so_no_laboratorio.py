"""Área do Médium e Textos do site com IA passam a ser betas do Laboratório da casa.

Decisão do dono (19/11/2026): terreiro beta tester não tem chave por funcionalidade no backoffice. A
plataforma só marca "Beta tester"; a casa liga ou desliga cada novidade em Configurações › Laboratório.

O que muda nos dados, sem mudar o que cada casa vê hoje:
- Quem tinha `area_medium_liberada = true` vira beta tester e ganha a beta `beta_area_medium` ligada
  (feature_flags). A Área continua funcionando igual para essas casas (ex.: TUCCCO).
- `beta_textos_ia_site` ligada numa casa que a plataforma não tinha liberado (`ia_site_liberada =
  false`) é desligada: ela não valia antes e continua sem valer até a casa ligar no Laboratório.
- As colunas `tenants.area_medium_liberada` e `tenants.ia_site_liberada` saem.

O downgrade recria as colunas a partir das betas ligadas e apaga as linhas `beta_area_medium`.

Revision ID: 110_betas_so_no_laboratorio
Revises: 109_ordem_atendimento_fila
Create Date: 2026-11-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "110_betas_so_no_laboratorio"
down_revision = "109_ordem_atendimento_fila"  # thread "ordem de atendimento" (lote de 19/11)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Área do Médium: liberada → beta tester + beta ligada.
    op.execute("UPDATE tenants SET beta_tester = true WHERE area_medium_liberada")
    op.execute(
        """
        UPDATE feature_flags f SET enabled = true, updated_at = now()
          FROM tenants t
         WHERE f.tenant_id = t.id AND f.feature = 'beta_area_medium' AND t.area_medium_liberada
        """
    )
    op.execute(
        """
        INSERT INTO feature_flags (id, tenant_id, feature, enabled, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, 'beta_area_medium', true, now(), now()
          FROM tenants t
         WHERE t.area_medium_liberada
           AND NOT EXISTS (SELECT 1 FROM feature_flags f WHERE f.tenant_id = t.id AND f.feature = 'beta_area_medium')
        """
    )
    # 2. Textos com IA: o que não valia (sem liberação) fica desligado.
    op.execute(
        """
        UPDATE feature_flags f SET enabled = false, updated_at = now()
          FROM tenants t
         WHERE f.tenant_id = t.id AND f.feature = 'beta_textos_ia_site' AND f.enabled AND NOT t.ia_site_liberada
        """
    )
    # 3. As chaves por funcionalidade saem do backoffice.
    op.drop_column("tenants", "area_medium_liberada")
    op.drop_column("tenants", "ia_site_liberada")


def downgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("area_medium_liberada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenants",
        sa.Column("ia_site_liberada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        """
        UPDATE tenants t SET area_medium_liberada = true
         WHERE t.beta_tester AND EXISTS (
               SELECT 1 FROM feature_flags f
                WHERE f.tenant_id = t.id AND f.feature = 'beta_area_medium' AND f.enabled)
        """
    )
    op.execute(
        """
        UPDATE tenants t SET ia_site_liberada = true
         WHERE t.beta_tester AND EXISTS (
               SELECT 1 FROM feature_flags f
                WHERE f.tenant_id = t.id AND f.feature = 'beta_textos_ia_site' AND f.enabled)
        """
    )
    op.execute("DELETE FROM feature_flags WHERE feature = 'beta_area_medium'")
