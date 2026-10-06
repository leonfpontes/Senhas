"""Reestruturação de planos (out/2026): novos limites de giras/mês e médiuns.

Migração SÓ de dados. Os limites numéricos ficam em `PLAN_LIMITS`
(`src/repositories/subscription_repo.py`), mas são COPIADOS para a linha de
`subscriptions` quando o plano muda (checkout, webhook, bônus, reset para o
FREE). A checagem em runtime (`effective_limit`) lê a linha — então, sem esta
migração, as assinaturas existentes continuariam com os números antigos.

| Plano | giras/mês (antes → depois) | médiuns (antes → depois) |
|-------|----------------------------|--------------------------|
| FREE  | 4 → 2                      | 0 → 0                    |
| BASIC | 10 → 3                     | 50 → 15                  |
| PRO   | 15 → 4                     | 150 → 30                 |

PREMIUM não é tocado (segue "ilimitado"). Assinaturas bônus seguem o plano
concedido (mesma regra de `platform/subscriptions.py`), então mudam junto.
`max_users` e preços não mudam. Dados já criados (giras do mês, médiuns
cadastrados acima do novo limite) não são apagados: só a criação de novos
fica bloqueada até o terreiro voltar para baixo do limite ou mudar de plano.

Integração: outra branch pode trazer uma 058; nesse caso, ao integrar,
re-encadear esta revisão depois dela (down_revision) — não criar duas heads.

Revision ID: 059_planos_limites_out_2026
Revises: 057_rbac_grupo_padrao
Create Date: 2026-10-06
"""

from alembic import op

revision: str = "059_planos_limites_out_2026"
down_revision: str = "057_rbac_grupo_padrao"
branch_labels = None
depends_on = None

# plano -> (max_giras_per_month, max_mediuns)
NOVOS = {
    "FREE": (2, 0),
    "BASIC": (3, 15),
    "PRO": (4, 30),
}
ANTIGOS = {
    "FREE": (4, 0),
    "BASIC": (10, 50),
    "PRO": (15, 150),
}


def _aplicar(limites: dict) -> None:
    for plano, (giras, mediuns) in limites.items():
        op.execute(
            f"UPDATE subscriptions SET max_giras_per_month = {int(giras)}, max_mediuns = {int(mediuns)}, "
            f"updated_at = now() WHERE plan::text = '{plano}'"
        )


def upgrade() -> None:
    _aplicar(NOVOS)


def downgrade() -> None:
    _aplicar(ANTIGOS)
