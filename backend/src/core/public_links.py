"""Links públicos enviados ao consulente por e-mail.

Um lugar só para o formato das URLs que o frontend (Next.js, Pages Router)
serve em `frontend/src/pages/public/`. Antes cada serviço montava a string por
conta própria e o link "Para resgatar sua senha" apontava para uma rota que
não existia (dava 404 no e-mail de promoção da fila de espera e no reenvio).

Os padrões abaixo espelham os nomes de arquivo do Next:
- PUBLIC_TICKET_ROUTE  → pages/public/[tenant]/ticket/[ticketId].tsx
- PUBLIC_CANCEL_ROUTE  → pages/public/ticket/[ticketId]/cancelar.tsx
- PUBLIC_TENANT_ROUTE  → pages/public/[tenant].tsx (redireciona à próxima gira)
- MEDIUM_CONVITE_ROUTE → pages/convite/[token].tsx (convite da casa para a Área do Médium, AM-03)
- CONFIRMAR_EMAIL_ROUTE → pages/confirmar-email/[token].tsx (troca do e-mail de login, AM-13)
- DESCADASTRO_ROUTE    → pages/descadastro/[token].tsx (desligar avisos por e-mail da Área, AM-15)

`tests/unit/test_public_links.py` confere que os arquivos existem.
"""

from __future__ import annotations

from uuid import UUID

PUBLIC_TICKET_ROUTE = "/public/{tenant_slug}/ticket/{ticket_id}"
PUBLIC_CANCEL_ROUTE = "/public/ticket/{ticket_id}/cancelar"
PUBLIC_TENANT_ROUTE = "/public/{tenant_slug}"
MEDIUM_CONVITE_ROUTE = "/convite/{token}"
CONFIRMAR_EMAIL_ROUTE = "/confirmar-email/{token}"
DESCADASTRO_ROUTE = "/descadastro/{token}"


def _base(frontend_url: str) -> str:
    return frontend_url.rstrip("/")


def public_ticket_link(frontend_url: str, tenant_slug: str, ticket_id: UUID | str) -> str:
    """Página do bilhete: número, gira, data e horário, endereço, agenda, cancelar."""
    return _base(frontend_url) + PUBLIC_TICKET_ROUTE.format(tenant_slug=tenant_slug, ticket_id=ticket_id)


def public_cancel_link(frontend_url: str, ticket_id: UUID | str) -> str:
    return _base(frontend_url) + PUBLIC_CANCEL_ROUTE.format(ticket_id=ticket_id)


def public_tenant_link(frontend_url: str, tenant_slug: str) -> str:
    return _base(frontend_url) + PUBLIC_TENANT_ROUTE.format(tenant_slug=tenant_slug)


def medium_convite_link(frontend_url: str, token: str) -> str:
    """Convite da casa para a Área do Médium: o token opaco vai em claro só aqui."""
    return _base(frontend_url) + MEDIUM_CONVITE_ROUTE.format(token=token)


def confirmar_email_link(frontend_url: str, token: str) -> str:
    """Confirmação do novo e-mail de login (AM-13): vai só para o endereço novo."""
    return _base(frontend_url) + CONFIRMAR_EMAIL_ROUTE.format(token=token)


def descadastro_link(frontend_url: str, token: str, tipo: str) -> str:
    """Rodapé dos lembretes da Área (AM-15): `tipo` = preferência (`mensalidade`...) ou `todos`.
    A página só desliga no toque em "Desligar" (leitor de link não desliga nada sozinho)."""
    return _base(frontend_url) + DESCADASTRO_ROUTE.format(token=token) + f"?tipo={tipo}"


def area_medium_link(frontend_url: str, caminho: str = "") -> str:
    """Página da Área do Médium (`/medium...`) — o login leva de volta para ela."""
    return _base(frontend_url) + "/medium" + caminho


def public_tenant_logo_url(frontend_url: str, tenant_config) -> str | None:
    """URL pública da logo do terreiro.

    O upload grava a imagem em `tenant_configs.logo_data` (BYTEA) e limpa o
    `logo_url` legado (admin/config.py) — por isso quem só lia `logo_url` nunca
    mostrava a logo enviada. Ordem: binário servido por
    GET /api/v1/public/tenant/{tenant_id}/logo; senão a URL legada; senão None.
    """
    if tenant_config is None:
        return None
    if tenant_config.logo_data:
        return f"{_base(frontend_url)}/api/v1/public/tenant/{tenant_config.tenant_id}/logo"
    return tenant_config.logo_url or None
