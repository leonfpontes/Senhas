"""Links públicos enviados ao consulente por e-mail.

Um lugar só para o formato das URLs que o frontend (Next.js, Pages Router)
serve em `frontend/src/pages/public/`. Antes cada serviço montava a string por
conta própria e o link "Para resgatar sua senha" apontava para uma rota que
não existia (dava 404 no e-mail de promoção da fila de espera e no reenvio).

Os padrões abaixo espelham os nomes de arquivo do Next:
- PUBLIC_TICKET_ROUTE  → pages/public/[tenant]/ticket/[ticketId].tsx
- PUBLIC_CANCEL_ROUTE  → pages/public/ticket/[ticketId]/cancelar.tsx
- PUBLIC_TENANT_ROUTE  → pages/public/[tenant].tsx (redireciona à próxima gira)

`tests/unit/test_public_links.py` confere que os arquivos existem.
"""

from __future__ import annotations

from uuid import UUID

PUBLIC_TICKET_ROUTE = "/public/{tenant_slug}/ticket/{ticket_id}"
PUBLIC_CANCEL_ROUTE = "/public/ticket/{ticket_id}/cancelar"
PUBLIC_TENANT_ROUTE = "/public/{tenant_slug}"


def _base(frontend_url: str) -> str:
    return frontend_url.rstrip("/")


def public_ticket_link(frontend_url: str, tenant_slug: str, ticket_id: UUID | str) -> str:
    """Página do bilhete: número, gira, data e horário, endereço, agenda, cancelar."""
    return _base(frontend_url) + PUBLIC_TICKET_ROUTE.format(tenant_slug=tenant_slug, ticket_id=ticket_id)


def public_cancel_link(frontend_url: str, ticket_id: UUID | str) -> str:
    return _base(frontend_url) + PUBLIC_CANCEL_ROUTE.format(ticket_id=ticket_id)


def public_tenant_link(frontend_url: str, tenant_slug: str) -> str:
    return _base(frontend_url) + PUBLIC_TENANT_ROUTE.format(tenant_slug=tenant_slug)
