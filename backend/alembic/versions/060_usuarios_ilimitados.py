"""Usuários ilimitados em todos os planos (decisão do dono do produto, out/2026).

Migração SÓ de dados. `PLAN_LIMITS` passou a ter `max_users = 99999` (o mesmo
sentinela de "ilimitado" que o Premium já usava) em todos os planos, inclusive
o Gratuito, e a checagem de limite de usuários saiu de `admin/users.py` (criar e
reativar). Os limites são copiados para a linha de `subscriptions` na troca de
plano, então esta migração iguala as assinaturas existentes — inclusive as
linhas antigas com `-1` (que já eram "ilimitado").

Motivo: quem opera a plataforma (muitas vezes um filho da casa, não o dirigente
que assinou) é quem sente falta dos recursos novos; mais usuários = mais
promotores internos do upgrade.

Downgrade: volta ao limite por plano de antes (FREE 1, BASIC 3, PRO 10,
PREMIUM 99999). Linhas que eram `-1` voltam como 99999 (mesmo significado).

Revision ID: 060_usuarios_ilimitados
Revises: 059_planos_limites_out_2026
Create Date: 2026-10-07
"""

from alembic import op

revision: str = "060_usuarios_ilimitados"
down_revision: str = "059_planos_limites_out_2026"
branch_labels = None
depends_on = None

UNLIMITED_USERS = 99999
ANTIGOS = {"FREE": 1, "BASIC": 3, "PRO": 10, "PREMIUM": UNLIMITED_USERS}


def upgrade() -> None:
    op.execute(f"UPDATE subscriptions SET max_users = {UNLIMITED_USERS}, updated_at = now()")


def downgrade() -> None:
    for plano, usuarios in ANTIGOS.items():
        op.execute(
            f"UPDATE subscriptions SET max_users = {int(usuarios)}, updated_at = now() WHERE plan::text = '{plano}'"
        )
