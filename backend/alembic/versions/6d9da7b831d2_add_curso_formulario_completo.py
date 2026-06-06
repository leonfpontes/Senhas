"""add_curso_formulario_completo

Revision ID: 6d9da7b831d2
Revises: 05d6d6f34f84
Create Date: 2026-06-06 16:44:43.830286

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers used by Alembic.
revision = '6d9da7b831d2'
down_revision = '05d6d6f34f84'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adiciona a coluna de tipo_formulario na tabela cursos_presenciais
    op.add_column("cursos_presenciais", sa.Column("tipo_formulario", sa.String(20), server_default="simples", nullable=False))

    # Adiciona as colunas extras na tabela curso_participantes
    op.add_column("curso_participantes", sa.Column("genero", sa.String(50), nullable=True))
    op.add_column("curso_participantes", sa.Column("emergencia_contato", sa.String(255), nullable=True))
    op.add_column("curso_participantes", sa.Column("emergencia_fone", sa.String(20), nullable=True))
    op.add_column("curso_participantes", sa.Column("cep", sa.String(9), nullable=True))
    op.add_column("curso_participantes", sa.Column("logradouro", sa.String(255), nullable=True))
    op.add_column("curso_participantes", sa.Column("numero", sa.String(20), nullable=True))
    op.add_column("curso_participantes", sa.Column("complemento", sa.String(100), nullable=True))
    op.add_column("curso_participantes", sa.Column("bairro", sa.String(100), nullable=True))
    op.add_column("curso_participantes", sa.Column("cidade", sa.String(100), nullable=True))
    op.add_column("curso_participantes", sa.Column("estado", sa.String(2), nullable=True))
    op.add_column("curso_participantes", sa.Column("tem_plano_saude", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("plano_saude_nome", sa.String(100), nullable=True))
    op.add_column("curso_participantes", sa.Column("toma_medicamento", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("medicamentos_nome", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("tem_doenca_tratamento", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("doenca_tratamento_nome", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("tem_diabetes", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("outras_doencas", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("aceita_uso_dados_saude", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    # Remove as colunas adicionadas da tabela curso_participantes
    op.drop_column("curso_participantes", "aceita_uso_dados_saude")
    op.drop_column("curso_participantes", "outras_doencas")
    op.drop_column("curso_participantes", "tem_diabetes")
    op.drop_column("curso_participantes", "doenca_tratamento_nome")
    op.drop_column("curso_participantes", "tem_doenca_tratamento")
    op.drop_column("curso_participantes", "medicamentos_nome")
    op.drop_column("curso_participantes", "toma_medicamento")
    op.drop_column("curso_participantes", "plano_saude_nome")
    op.drop_column("curso_participantes", "tem_plano_saude")
    op.drop_column("curso_participantes", "estado")
    op.drop_column("curso_participantes", "cidade")
    op.drop_column("curso_participantes", "bairro")
    op.drop_column("curso_participantes", "complemento")
    op.drop_column("curso_participantes", "numero")
    op.drop_column("curso_participantes", "logradouro")
    op.drop_column("curso_participantes", "cep")
    op.drop_column("curso_participantes", "emergencia_fone")
    op.drop_column("curso_participantes", "emergencia_contato")
    op.drop_column("curso_participantes", "genero")

    # Remove a coluna tipo_formulario da tabela cursos_presenciais
    op.drop_column("cursos_presenciais", "tipo_formulario")
