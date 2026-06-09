"""create_permission_groups

Revision ID: b6d4a9b749d5
Revises: 1e7ce5910716
Create Date: 2026-06-09 18:18:06.768284

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers used by Alembic.
revision = 'b6d4a9b749d5'
down_revision = '1e7ce5910716'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create permission_groups table
    op.create_table('permission_groups',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_permission_groups_tenant_id', 'permission_groups', ['tenant_id'], unique=False)

    # 2. Create group_permissions table
    op.create_table('group_permissions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('feature', sa.Enum('giras', 'tickets', 'mediuns', 'estoque', 'financeiro', 'associados', 'usuarios', 'configuracoes', 'auditoria', 'analytics', 'relatorio_gira', 'cursos_presenciais', 'porta', name='permission_feature'), nullable=False),
    sa.Column('can_view', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('can_insert', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('can_edit', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('can_delete', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['group_id'], ['permission_groups.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'feature', name='uq_group_permissions_group_feature')
    )
    op.create_index('ix_group_permissions_group_id', 'group_permissions', ['group_id'], unique=False)

    # 3. Create user_group_memberships table
    op.create_table('user_group_memberships',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['group_id'], ['permission_groups.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'user_id', name='uq_user_group_memberships_group_user')
    )
    op.create_index('ix_user_group_memberships_group_id', 'user_group_memberships', ['group_id'], unique=False)
    op.create_index('ix_user_group_memberships_tenant_id', 'user_group_memberships', ['tenant_id'], unique=False)
    op.create_index('ix_user_group_memberships_user_id', 'user_group_memberships', ['user_id'], unique=False)


def downgrade() -> None:
    # Clear tables first
    op.execute("DELETE FROM user_group_memberships")
    op.execute("DELETE FROM group_permissions")
    op.execute("DELETE FROM permission_groups")

    # Drop memberships
    op.drop_index('ix_user_group_memberships_user_id', table_name='user_group_memberships')
    op.drop_index('ix_user_group_memberships_tenant_id', table_name='user_group_memberships')
    op.drop_index('ix_user_group_memberships_group_id', table_name='user_group_memberships')
    op.drop_table('user_group_memberships')

    # Drop permissions
    op.drop_index('ix_group_permissions_group_id', table_name='group_permissions')
    op.drop_table('group_permissions')

    # Drop groups
    op.drop_index('ix_permission_groups_tenant_id', table_name='permission_groups')
    op.drop_table('permission_groups')

    # Drop enum type permission_feature explicitly
    op.execute("DROP TYPE IF EXISTS permission_feature")
