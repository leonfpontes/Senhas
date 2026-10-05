"""Uma senha ativa por consulente/gira/tipo — dedup no banco (item Q-03).

O dedup de ticket era só check-then-act no código (`check_duplicate_in_gira`):
duas requisições simultâneas do mesmo consulente podiam criar duas senhas, e o
walk-in da Porta nem checava (produção tinha 1 par duplicado: dois walk-ins do
mesmo consulente com 92s de diferença — clique duplo).

O índice único parcial espelha exatamente a regra do código:
- mesma gira, mesmo consulente, mesmo tipo (comum × associado/`is_sponsor`);
- acompanhantes não contam (compartilham consulente_id com o titular);
- senhas canceladas não contam (podem ser reemitidas);
- soft-deleted não contam.

Antes de criar o índice, duplicatas existentes são resolvidas mantendo a senha
mais antiga de cada grupo e cancelando as demais (status = 'cancelled').
`observacoes` não é tocado: guarda JSON que o código lê.

Revision ID: 056_dedupe_tickets_unique_ativo
Revises: 055_gira_acompanhantes
Create Date: 2026-10-05
"""

from alembic import op

revision: str = "056_dedupe_tickets_unique_ativo"
down_revision: str = "055_gira_acompanhantes"
branch_labels = None
depends_on = None

PREDICADO = "is_acompanhante = false AND status <> 'cancelled' AND deleted_at IS NULL"


def upgrade() -> None:
    op.execute(
        f"""
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY gira_id, consulente_id, is_sponsor
                       ORDER BY created_at, id
                   ) AS rn
            FROM tickets
            WHERE {PREDICADO}
        )
        UPDATE tickets
           SET status = 'cancelled', updated_at = now()
          FROM ranked
         WHERE tickets.id = ranked.id AND ranked.rn > 1
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_tickets_gira_consulente_ativo
            ON tickets (gira_id, consulente_id, is_sponsor)
         WHERE {PREDICADO}
        """
    )


def downgrade() -> None:
    # As duplicatas canceladas no upgrade não são restauradas (sem como saber
    # qual delas o terreiro queria manter).
    op.execute("DROP INDEX IF EXISTS uq_tickets_gira_consulente_ativo")
