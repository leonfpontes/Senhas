"""Área do Médium — /api/v1/medium/* (AM-02).

Toda rota daqui passa por `require_medium` (dependência do router): usuário
logado, médium ativo ligado a ele (`mediuns.user_id`) no mesmo tenant e plano
com `area_medium`. Regras (docs/plano-area-do-medium.md §6.6):

- **Nada de `medium_id` na URL ou no corpo.** As rotas são "minhas": o médium
  vem de `ctx.medium` e o tenant de `ctx.tenant_id` (`MediumContext`).
- Query em modelo multi-tenant filtra por `ctx.tenant_id`; query em modelo com
  FK para `mediuns` filtra também por `ctx.medium.id`
  (`scripts/audit_tenant_isolation.py`, modo "medium").
- Rotas da Área são isentas de grupo de permissão (o médium não tem grupo);
  `scripts/audit_permission_guards.py` exige o `require_medium` neste router.
- Escrita sob impersonação é recusada: `Depends(require_not_impersonated)`.
- Campos internos (`observacoes`, comprovantes de outros, `registrado_por`)
  nunca saem por aqui.

Router novo da Área: crie o arquivo aqui e inclua em `medium_router` abaixo.
"""
from fastapi import APIRouter, Depends

from src.api.dependencies import require_medium

from .avisos import router as avisos_router
from .inicio import router as inicio_router
from .me import router as me_router
from .mensalidades import router as mensalidades_router

medium_router = APIRouter(
    prefix="/api/v1/medium",
    tags=["medium"],
    dependencies=[Depends(require_medium)],
)
medium_router.include_router(me_router)
medium_router.include_router(inicio_router)
medium_router.include_router(mensalidades_router)
medium_router.include_router(avisos_router)

__all__ = ["medium_router"]
