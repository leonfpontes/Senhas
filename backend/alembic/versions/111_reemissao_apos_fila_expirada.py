"""Senha com prazo da fila expirado não bloqueia nova emissão (bug Tuccco, nov/2026).

Quem perde o prazo de confirmação da fila de espera fica com a senha em
`waitlist_expired`. O índice único parcial da 056 (e a checagem de duplicata
no código) só ignorava `cancelled`, então a pessoa não conseguia pedir a senha
de novo: o sistema respondia "Este e-mail já possui uma senha emitida para esta
gira". Recria o índice ignorando também `waitlist_expired` — mesmo predicado de
`TicketRepository.check_duplicate_in_gira`.

Revision ID: 111_reemissao_apos_fila_expirada
Revises: 108_tenant_ia_site_liberada
Create Date: 2026-11-19
"""

from alembic import op

revision: str = "111_reemissao_apos_fila_expirada"
down_revision: str = "108_tenant_ia_site_liberada"
branch_labels = None
depends_on = None

PREDICADO_NOVO = (
    "is_acompanhante = false AND status NOT IN ('cancelled', 'waitlist_expired') "
    "AND deleted_at IS NULL"
)
PREDICADO_ANTIGO = "is_acompanhante = false AND status <> 'cancelled' AND deleted_at IS NULL"


def _recriar(predicado: str) -> None:
    op.execute("DROP INDEX IF EXISTS uq_tickets_gira_consulente_ativo")
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_tickets_gira_consulente_ativo
            ON tickets (gira_id, consulente_id, is_sponsor)
         WHERE {predicado}
        """
    )


def upgrade() -> None:
    _recriar(PREDICADO_NOVO)


def downgrade() -> None:
    # Uma reemissão feita depois do upgrade deixa o consulente com duas senhas
    # (a expirada e a nova) e o índice antigo não sobe. Cancela a expirada
    # nesses casos — ela já não vale para a gira.
    op.execute(
        """
        UPDATE tickets t
           SET status = 'cancelled', updated_at = now()
         WHERE t.status = 'waitlist_expired'
           AND t.is_acompanhante = false
           AND t.deleted_at IS NULL
           AND EXISTS (
               SELECT 1 FROM tickets o
                WHERE o.gira_id = t.gira_id
                  AND o.consulente_id = t.consulente_id
                  AND o.is_sponsor = t.is_sponsor
                  AND o.id <> t.id
                  AND o.is_acompanhante = false
                  AND o.deleted_at IS NULL
                  AND o.status NOT IN ('cancelled', 'waitlist_expired')
           )
        """
    )
    _recriar(PREDICADO_ANTIGO)
