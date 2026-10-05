"""Valores aceitos nas perguntas do cadastro self-service (onboarding).

Fonte única para o schema do POST /api/v1/public/onboarding e para quem lê
as respostas depois (dashboard-summary). As respostas ficam em
`tenant_configs.custom_settings` (JSON), sem coluna própria.

Espelhado no frontend em `frontend/src/constants/onboarding.ts` — mudou aqui,
mude lá (o teste `test_onboarding_signup.py` confere os valores).
"""

COMO_CONHECEU_VALUES: tuple[str, ...] = ("google", "instagram", "indicacao", "outro")

# Maior dor que o terreiro quer resolver com o GiraHub. Define a trilha do
# tour de boas-vindas no primeiro login (frontend/src/tours/welcomeTour.tsx).
PRINCIPAL_DOR_VALUES: tuple[str, ...] = (
    "senhas",       # organizar as senhas e a fila das giras
    "mediuns",      # organizar médiuns e a corrente
    "financeiro",   # mensalidades e financeiro
    "divulgacao",   # site do terreiro e cursos
    "estoque",      # estoque de materiais
    "outro",        # ainda conhecendo
)


def read_principal_dor(custom_settings: dict | None) -> str | None:
    """Lê a dor gravada no cadastro, ignorando valores fora da lista."""
    if not isinstance(custom_settings, dict):
        return None
    value = custom_settings.get("principal_dor")
    return value if value in PRINCIPAL_DOR_VALUES else None
