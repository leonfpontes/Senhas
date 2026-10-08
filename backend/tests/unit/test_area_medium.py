"""AM-02 — `areas` calculadas no servidor (login, /auth/me, /auth/profile).

Cenários do card: admin puro, operador ligado a médium (as duas áreas), médium puro e médium
cujo terreiro não tem `area_medium` no plano. Com Postgres real, os mesmos cenários passam
pelo HTTP em integration_pg/test_area_medium.py.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from src.models import Medium, PlanType, SubscriptionStatus, User, UserRole
from src.services.medium_area import compute_areas

TENANT_ID = uuid.uuid4()


def _user(role):
    u = User()
    u.id = uuid.uuid4()
    u.tenant_id = None if role == UserRole.SUPER_ADMIN else TENANT_ID
    u.email = f"{role.value}@example.com"
    u.username = role.value
    u.role = role
    u.is_active = True
    u.deleted_at = None
    u.created_at = datetime.now(timezone.utc)
    return u


def _medium():
    m = Medium()
    m.id = uuid.uuid4()
    m.tenant_id = TENANT_ID
    m.nome = "João de Ogum"
    m.is_active = True
    return m


def _sub(plan):
    return MagicMock(plan=plan, status=SubscriptionStatus.ACTIVE, is_trial=False, is_bonus=False,
                     stripe_subscription_id=None, trial_ends_at=None)


async def _areas(user, medium=None, plan=PlanType.BASIC):
    repo = MagicMock(get_by_tenant=AsyncMock(return_value=_sub(plan)))
    with patch("src.services.medium_area.get_linked_medium", AsyncMock(return_value=medium)), \
            patch("src.services.medium_area.SubscriptionRepository", return_value=repo):
        return await compute_areas(AsyncMock(), user)


async def test_admin_puro_so_tem_o_painel():
    assert await _areas(_user(UserRole.ADMIN)) == {"admin": True, "medium": None}


async def test_operador_ligado_a_medium_tem_as_duas_areas():
    m = _medium()
    assert await _areas(_user(UserRole.OPERATOR), m) == {
        "admin": True,
        "medium": {"medium_id": str(m.id), "nome": "João de Ogum"},
    }


async def test_medium_puro_so_tem_a_area_do_medium():
    m = _medium()
    assert await _areas(_user(UserRole.MEDIUM), m) == {
        "admin": False,
        "medium": {"medium_id": str(m.id), "nome": "João de Ogum"},
    }


async def test_medium_cujo_plano_nao_tem_area_medium_fica_sem_area():
    """Sem nenhuma área: a tela (AM-04) mostra o aviso neutro, sem oferta de upgrade."""
    assert await _areas(_user(UserRole.MEDIUM), _medium(), plan=PlanType.FREE) == {"admin": False, "medium": None}


async def test_assinatura_suspensa_tira_a_area_do_medium():
    repo = MagicMock(get_by_tenant=AsyncMock(return_value=MagicMock(
        plan=PlanType.PREMIUM, status=SubscriptionStatus.SUSPENDED)))
    with patch("src.services.medium_area.get_linked_medium", AsyncMock(return_value=_medium())), \
            patch("src.services.medium_area.SubscriptionRepository", return_value=repo):
        assert await compute_areas(AsyncMock(), _user(UserRole.OPERATOR)) == {"admin": True, "medium": None}


async def test_super_admin_nao_tem_area_de_tenant():
    lookup = AsyncMock()
    with patch("src.services.medium_area.get_linked_medium", lookup):
        assert await compute_areas(AsyncMock(), _user(UserRole.SUPER_ADMIN)) == {"admin": False, "medium": None}
    lookup.assert_not_awaited()


async def test_auth_me_e_profile_devolvem_areas():
    from src.api.v1.auth.login import get_me
    from src.api.v1.auth.profile import get_profile

    areas = {"admin": False, "medium": {"medium_id": "x", "nome": "Ana"}}
    user = _user(UserRole.MEDIUM)
    user.full_name = "Ana"
    user.phone = None
    user.profile_photo_url = None
    user.profile_photo_data = None
    request = MagicMock(base_url="http://testserver/")
    with patch("src.api.v1.auth.login.compute_areas", AsyncMock(return_value=areas)), \
            patch("src.api.v1.auth.profile.compute_areas", AsyncMock(return_value=areas)):
        me = await get_me(user, AsyncMock())
        profile = await get_profile(request, user, AsyncMock())
    assert me["areas"] == areas and me["role"] == "medium"
    assert profile["areas"] == areas and profile["email"] == user.email
