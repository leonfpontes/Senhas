"""Slugs que nenhum terreiro pode ter (T-01).

O site público do terreiro mora em ``/{slug}`` (``frontend/src/pages/[tenantSlug]``). Toda rota
estática do Next no primeiro segmento (``/planos``, ``/login``...) tem precedência sobre a rota
dinâmica e **encobre** um terreiro com o mesmo slug. Por isso o cadastro pula estes nomes e a
plataforma recusa criá-los.

``tests/unit/test_reserved_slugs.py`` lê ``frontend/src/pages`` e falha se uma página nova de
primeiro nível não estiver aqui — ao criar uma página, acrescente o slug nesta lista.
"""

RESERVED_SLUGS: frozenset[str] = frozenset(
    {
        # Rotas que existem hoje no frontend
        "404",
        "500",
        "admin",
        "cadastro",
        "confirmar-email",
        "descadastro",
        "cookies",
        "escolher-area",
        "forgot-password",
        "login",
        "offline",
        "platform",
        "privacidade",
        "public",
        "reactivate-account",
        "reset-password",
        "status",
        "termos",
        # Páginas de marketing e rotas planejadas (docs/plano-benchmark-2026-10.md)
        "planos",
        "precos",
        "blog",
        "recursos",
        "terreiros",
        "glossario",
        "convite",
        "medium",
        "sitemap",
        "sitemap.xml",
        "sobre",
        "contato",
        "ajuda",
        "suporte",
        "girahub-vs-planilha",
        # Infra / arquivos servidos na raiz
        "api",
        "_next",
        "static",
        "landing",
        "sounds",
        "icons",
        "www",
        "app",
    }
)


def is_reserved_slug(slug: str) -> bool:
    return slug.strip().lower() in RESERVED_SLUGS
