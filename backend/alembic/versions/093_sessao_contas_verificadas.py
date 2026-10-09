"""Trocar de terreiro sem sair (pedido do dono, 2026-10-09) — contas conferidas na sessão.

Coluna nova `user_sessions.verified_accounts` (JSONB, nula): mapa
`{"<user_id>": "<ISO 8601 UTC>"}` das contas com o mesmo e-mail cuja senha foi conferida
neste login (AM-05: as que a senha abriu) e quando. Fica na linha da sessão (servidor), nunca
no cliente: `POST /auth/trocar-terreiro` só entra sem pedir senha numa conta deste mapa, e só
se a senha dela não mudou depois (`users.sessions_revoked_at` < instante conferido). A sessão
aberta pela troca herda o mapa, para ir e voltar.

Nula = sessão aberta antes desta migração (ou por cadastro/convite antigo): nenhuma conta
conferida além da própria — toda troca pede a senha da conta de destino.

Downgrade: só remove a coluna (as sessões continuam valendo; a troca volta a não existir).

Revision ID: 093_sessao_contas_verificadas
Revises: 092_mensalidade_comprovantes
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "093_sessao_contas_verificadas"
down_revision: str = "092_mensalidade_comprovantes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("verified_accounts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "verified_accounts")
