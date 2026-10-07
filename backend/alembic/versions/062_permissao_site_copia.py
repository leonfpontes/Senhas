"""Feature de permissão `site` — passo 2 de 2: copia as permissões de Cursos (T-06).

Até aqui o site do terreiro era protegido pelo grupo `cursos_presenciais`. Para
ninguém perder (nem ganhar) acesso na virada, todo grupo que tem linha de
`cursos_presenciais` em `group_permissions` ganha uma linha `site` com os mesmos
`can_view`/`can_insert`/`can_edit`/`can_delete` — inclusive os grupos padrão
"Acesso total" (e os que o admin restringiu, que ficam restritos igual).

Idempotente: `ON CONFLICT (group_id, feature) DO NOTHING` (constraint
`uq_group_permissions_group_feature`) — grupo que já tem linha `site` não muda.
Grupos excluídos (soft delete) também recebem a cópia: a linha não dá acesso a
ninguém enquanto o grupo estiver excluído e mantém o grupo coerente se for
restaurado.

Downgrade: apaga as linhas `site` (o valor do ENUM fica — ver 061).

Revision ID: 062_permissao_site_copia
Revises: 061_permissao_site_enum
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "062_permissao_site_copia"
down_revision: str = "061_permissao_site_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO group_permissions (id, group_id, feature, can_view, can_insert, can_edit, can_delete, created_at, updated_at)
        SELECT gen_random_uuid(), gp.group_id, 'site'::permission_feature,
               gp.can_view, gp.can_insert, gp.can_edit, gp.can_delete, now(), now()
          FROM group_permissions gp
         WHERE gp.feature = 'cursos_presenciais'
        ON CONFLICT (group_id, feature) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM group_permissions WHERE feature = 'site'")
