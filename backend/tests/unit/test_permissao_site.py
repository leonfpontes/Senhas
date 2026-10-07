"""T-06 — "Site do terreiro" usa a feature de permissão própria `SITE`.

Sem subir o app: lê as dependencies dos routers (a feature fica na closure de
`require_group_permission`) e confere o mapeamento de plano do PermissionService.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from src.models import PermissionFeature
from src.models.subscriptions import PlanType
from tests.plan_gate_helpers import make_sub, plan_gate_features


def _features(dependencies) -> set:
    out = set()
    for d in dependencies:
        for cell in getattr(d.dependency, "__closure__", None) or ():
            if isinstance(cell.cell_contents, PermissionFeature):
                out.add(cell.cell_contents)
    return out


def _rotas(router):
    return [r for r in router.routes if getattr(r, "methods", None)]


def test_enum_tem_site_separado_de_cursos():
    assert PermissionFeature.SITE.value == "site"
    assert PermissionFeature.SITE is not PermissionFeature.CURSOS_PRESENCIAIS


def test_todas_as_rotas_do_site_usam_a_feature_site_e_seguem_no_plano_site_builder():
    from src.api.v1.admin.sites import router

    assert _features(router.dependencies) == {PermissionFeature.SITE}
    assert plan_gate_features(router) == ["site_builder"]
    rotas = _rotas(router)
    assert rotas
    for rota in rotas:
        # Cada rota tem o próprio guard (view/insert/edit/delete) — e nenhum é de Cursos.
        assert _features(rota.dependencies) == {PermissionFeature.SITE}, rota.path


def test_cursos_continuam_no_grupo_de_cursos():
    from src.api.v1.admin.cursos_presenciais import router

    features = _features(router.dependencies)
    for rota in _rotas(router):
        features |= _features(rota.dependencies)
    assert PermissionFeature.CURSOS_PRESENCIAIS in features
    assert PermissionFeature.SITE not in features


@pytest.mark.parametrize(
    "plan,esperado",
    [(PlanType.FREE, False), (PlanType.BASIC, False), (PlanType.PRO, True), (PlanType.PREMIUM, True)],
)
async def test_operador_so_tem_site_no_plano_com_site_builder(plan, esperado):
    from src.services.permission_service import PermissionService

    with patch("src.services.permission_service.SubscriptionRepository") as Repo:
        Repo.return_value.get_by_tenant = AsyncMock(return_value=make_sub(plan))
        service = PermissionService(AsyncMock())
        assert await service.is_feature_enabled_for_plan(uuid.uuid4(), PermissionFeature.SITE) is esperado
