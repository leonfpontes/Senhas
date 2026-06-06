"""add_campos_formulario_completo_e_pix

Revision ID: 1e7ce5910716
Revises: 6d9da7b831d2
Create Date: 2026-06-06 18:28:54.797220

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers used by Alembic.
revision = '1e7ce5910716'
down_revision = '6d9da7b831d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Cursos Presenciais
    op.add_column("cursos_presenciais", sa.Column("chave_pix", sa.String(length=100), nullable=True))

    # Curso Participantes
    op.add_column("curso_participantes", sa.Column("cpf", sa.String(length=14), nullable=True))
    op.add_column("curso_participantes", sa.Column("rg", sa.String(length=20), nullable=True))
    op.add_column("curso_participantes", sa.Column("estado_civil", sa.String(length=50), nullable=True))
    op.add_column("curso_participantes", sa.Column("profissao", sa.String(length=100), nullable=True))
    op.add_column("curso_participantes", sa.Column("experiencia_umbanda", sa.String(length=100), nullable=True))
    op.add_column("curso_participantes", sa.Column("contato_contexto_espiritual", sa.String(length=100), nullable=True))
    op.add_column("curso_participantes", sa.Column("motivo_busca_desenvolvimento", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("interesse_aprendizado", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("ja_conhece_terreiro", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("como_conheceu_terreiro", sa.String(length=255), nullable=True))
    op.add_column("curso_participantes", sa.Column("tratamento_psiquiatrico", sa.Boolean(), nullable=True))
    op.add_column("curso_participantes", sa.Column("tratamento_psiquiatrico_detalhes", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("restricoes_saude", sa.Text(), nullable=True))
    op.add_column("curso_participantes", sa.Column("aceita_uso_dados", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("curso_participantes", sa.Column("aceita_uso_imagem", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("curso_participantes", sa.Column("comprovante_inscricao_data", sa.LargeBinary(), nullable=True))
    op.add_column("curso_participantes", sa.Column("comprovante_inscricao_filename", sa.String(length=255), nullable=True))
    op.add_column("curso_participantes", sa.Column("comprovante_inscricao_mime", sa.String(length=50), nullable=True))


def downgrade() -> None:
    # Curso Participantes
    op.drop_column("curso_participantes", "comprovante_inscricao_mime")
    op.drop_column("curso_participantes", "comprovante_inscricao_filename")
    op.drop_column("curso_participantes", "comprovante_inscricao_data")
    op.drop_column("curso_participantes", "aceita_uso_imagem")
    op.drop_column("curso_participantes", "aceita_uso_dados")
    op.drop_column("curso_participantes", "restricoes_saude")
    op.drop_column("curso_participantes", "tratamento_psiquiatrico_detalhes")
    op.drop_column("curso_participantes", "tratamento_psiquiatrico")
    op.drop_column("curso_participantes", "como_conheceu_terreiro")
    op.drop_column("curso_participantes", "ja_conhece_terreiro")
    op.drop_column("curso_participantes", "interesse_aprendizado")
    op.drop_column("curso_participantes", "motivo_busca_desenvolvimento")
    op.drop_column("curso_participantes", "contato_contexto_espiritual")
    op.drop_column("curso_participantes", "experiencia_umbanda")
    op.drop_column("curso_participantes", "profissao")
    op.drop_column("curso_participantes", "estado_civil")
    op.drop_column("curso_participantes", "rg")
    op.drop_column("curso_participantes", "cpf")

    # Cursos Presenciais
    op.drop_column("cursos_presenciais", "chave_pix")
