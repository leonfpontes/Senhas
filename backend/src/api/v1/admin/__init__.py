"""Admin API routes package."""
from fastapi import APIRouter, Depends

from src.api.dependencies import require_backoffice

from .giras_crud import router as giras_router
from .gira_time_slots import router as gira_time_slots_router
from .tickets_list import router as tickets_router
from .tickets_bulk import router as bulk_router
from .email_resend import router as email_router
from .config import router as config_router
from .audit_trail import router as audit_router
from .analytics import router as analytics_router
from .users import router as users_router
from .exports import router as exports_router
from .validate_bulk import router as validate_router
from .health import router as health_router
from .door_control import router as door_control_router
from .associados import router as associados_router
from .subscription_info import router as subscription_info_router
from .billing_stripe import router as billing_stripe_router
from .estoque import router as estoque_router
from .dashboard_summary import router as dashboard_summary_router
from .mediuns import router as mediuns_router
from .mediuns_acesso import router as mediuns_acesso_router
from .ficha_espiritual import router as ficha_espiritual_router
from .mensalidades import router as mensalidades_router
from .sites import router as sites_router
from .cursos_presenciais import router as cursos_presenciais_router
from .permission_groups import router as permission_groups_router
from .contas_financeiras import router as contas_financeiras_router
from .support_chat import router as support_chat_router
from .area_medium_config import router as area_medium_config_router
from .mensalidade_pix import router as mensalidade_pix_router
from .mensalidade_comprovantes import router as mensalidade_comprovantes_router
from .comunicados import router as comunicados_router
from .corrente_grupos import router as corrente_grupos_router
from .atividades_assiduidade import router as atividades_assiduidade_router
from .atividades import router as atividades_router
from .atividades_presenca import router as atividades_presenca_router
from .atividades_escala import router as atividades_escala_router
from .escala_planos import router as escala_planos_router

# Combine all admin routers.
# require_backoffice (AM-02): o papel `medium` (Área do Médium) leva 403 em TODA
# rota /api/v1/admin/* — inclusive as que só usam get_current_user. Rota admin
# nova entra aqui, nunca direto no app (tests/unit/test_area_medium_rotas.py
# varre o app e falha se um médium passar em qualquer rota admin/platform).
admin_router = APIRouter(dependencies=[Depends(require_backoffice)])
admin_router.include_router(giras_router)
admin_router.include_router(gira_time_slots_router)
admin_router.include_router(tickets_router)
admin_router.include_router(bulk_router)
admin_router.include_router(email_router)
admin_router.include_router(config_router)
admin_router.include_router(audit_router)
admin_router.include_router(analytics_router)
admin_router.include_router(users_router)
admin_router.include_router(exports_router)
admin_router.include_router(validate_router)
admin_router.include_router(health_router)
admin_router.include_router(door_control_router)
admin_router.include_router(associados_router)
admin_router.include_router(subscription_info_router)
admin_router.include_router(billing_stripe_router)
admin_router.include_router(estoque_router)
admin_router.include_router(dashboard_summary_router)
admin_router.include_router(mediuns_router)
admin_router.include_router(mediuns_acesso_router)
admin_router.include_router(ficha_espiritual_router)
admin_router.include_router(mensalidades_router)
admin_router.include_router(sites_router)
admin_router.include_router(cursos_presenciais_router)
admin_router.include_router(permission_groups_router)
admin_router.include_router(contas_financeiras_router)
admin_router.include_router(support_chat_router)
admin_router.include_router(area_medium_config_router)
admin_router.include_router(mensalidade_pix_router)
admin_router.include_router(mensalidade_comprovantes_router)
admin_router.include_router(comunicados_router)
admin_router.include_router(corrente_grupos_router)
# Antes do `atividades_router`: `/assiduidade` não pode cair no `GET /{atividade_id}` (AM-26).
admin_router.include_router(atividades_assiduidade_router)
admin_router.include_router(atividades_router)
admin_router.include_router(atividades_presenca_router)
admin_router.include_router(atividades_escala_router)
admin_router.include_router(escala_planos_router)

__all__ = ["admin_router"]
