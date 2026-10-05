"""RBAC fail-closed: grupo padrão "Acesso total" por tenant (item Q-05).

Até aqui, operador sem nenhum grupo tinha acesso total ("compatibilidade
retroativa"). O código passa a negar tudo a quem não tem grupo. Para que
nenhum operador perca acesso na virada, esta migração:

1. adiciona `permission_groups.is_default` e o índice único parcial que
   garante um grupo padrão ativo por tenant;
2. cria em todo tenant o grupo "Acesso total", com ver/criar/editar/excluir
   em todas as features (o plano continua limitando por cima, como antes);
3. coloca nele todo operador ativo que hoje não está em nenhum grupo ativo.

Operadores que já estão em algum grupo não mudam. Admins não entram em grupo
(fazem bypass). A lista de features abaixo é a do enum `permission_feature`
nesta revisão; feature nova precisa de migração que a acrescente ao grupo
padrão (ver CLAUDE.md, "Adicionando nova feature").

Revision ID: 057_rbac_grupo_padrao
Revises: 056_dedupe_tickets_unique_ativo
Create Date: 2026-10-05
"""

import sqlalchemy as sa
from alembic import op

revision: str = "057_rbac_grupo_padrao"
down_revision: str = "056_dedupe_tickets_unique_ativo"
branch_labels = None
depends_on = None

FEATURES = (
    "giras", "tickets", "mediuns", "estoque", "financeiro", "associados", "usuarios",
    "configuracoes", "auditoria", "analytics", "relatorio_gira", "cursos_presenciais",
    "porta", "contas_financeiras",
)
NOME = "Acesso total"
DESCRICAO = "Grupo padrão: acesso a todos os módulos do plano. Operadores novos entram aqui."


def upgrade() -> None:
    op.add_column(
        "permission_groups",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_permission_groups_tenant_default",
        "permission_groups",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND deleted_at IS NULL"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO permission_groups (id, tenant_id, name, description, version, is_default, created_at, updated_at)
            SELECT gen_random_uuid(), t.id, :nome, :descricao, 1, true, now(), now()
              FROM tenants t
            """
        ).bindparams(nome=NOME, descricao=DESCRICAO)
    )
    valores = ", ".join(f"('{f}')" for f in FEATURES)
    op.execute(
        f"""
        INSERT INTO group_permissions (id, group_id, feature, can_view, can_insert, can_edit, can_delete, created_at, updated_at)
        SELECT gen_random_uuid(), g.id, f.feature::permission_feature, true, true, true, true, now(), now()
          FROM permission_groups g
         CROSS JOIN (VALUES {valores}) AS f(feature)
         WHERE g.is_default AND g.deleted_at IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO user_group_memberships (id, group_id, user_id, tenant_id, created_at, updated_at)
        SELECT gen_random_uuid(), g.id, u.id, u.tenant_id, now(), now()
          FROM users u
          JOIN permission_groups g ON g.tenant_id = u.tenant_id AND g.is_default AND g.deleted_at IS NULL
         WHERE u.role = 'operator'
           AND u.deleted_at IS NULL
           AND NOT EXISTS (
                 SELECT 1
                   FROM user_group_memberships m
                   JOIN permission_groups pg ON pg.id = m.group_id AND pg.deleted_at IS NULL
                  WHERE m.user_id = u.id
           )
        """
    )


def downgrade() -> None:
    # Apagar o grupo padrão cascateia permissões e vínculos. Quem estava nele
    # volta a não ter grupo — o que, no código antigo, é acesso total.
    op.execute("DELETE FROM permission_groups WHERE is_default")
    op.drop_index("uq_permission_groups_tenant_default", table_name="permission_groups")
    op.drop_column("permission_groups", "is_default")
