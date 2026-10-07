"""Tests for API dependencies (auth, RBAC, tenant access)."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    MediumContext,
    get_current_user,
    get_tenant_from_request,
    require_backoffice,
    require_medium,
    require_not_impersonated,
    require_role,
    validate_tenant_access,
)
from src.core.errors import (
    ForbiddenError,
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
)
from src.models import Medium, PlanType, SubscriptionStatus, User, UserRole
from src.services.medium_area import get_linked_medium
from tests.conftest import TENANT_ID, TENANT_B_ID, USER_ID, ADMIN_USER_ID, SUPER_ADMIN_ID


# ── get_current_user ─────────────────────────────────────────────────────────

class TestGetCurrentUser:
    async def test_returns_user_when_found(self, operator_user, mock_db_session):
        request = MagicMock()
        request.state.user_id = USER_ID
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        user = await get_current_user(request, mock_db_session)
        assert user.id == USER_ID
        assert user.email == "operator@test.com"

    async def test_raises_when_no_user_id(self, mock_db_session):
        request = MagicMock()
        request.state = MagicMock(spec=[])
        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_user_not_found(self, mock_db_session):
        request = MagicMock()
        request.state.user_id = uuid.uuid4()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_user_inactive(self, mock_db_session):
        inactive_user = User()
        inactive_user.id = USER_ID
        inactive_user.is_active = False

        request = MagicMock()
        request.state.user_id = USER_ID
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = inactive_user
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_token_issued_before_sessions_revoked(self, operator_user, mock_db_session):
        """Password change / logout-all-devices bumps sessions_revoked_at — any
        token minted before that instant must be rejected immediately, even if
        it hasn't hit its own exp yet."""
        operator_user.sessions_revoked_at = datetime.now(timezone.utc) - timedelta(minutes=1)

        request = MagicMock()
        request.state.user_id = USER_ID
        request.state.token = MagicMock(iat=datetime.now(timezone.utc) - timedelta(hours=1))
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_allows_token_issued_after_sessions_revoked(self, operator_user, mock_db_session):
        """A fresh login performed *after* sessions_revoked_at must keep working."""
        operator_user.sessions_revoked_at = datetime.now(timezone.utc) - timedelta(hours=1)

        request = MagicMock()
        request.state.user_id = USER_ID
        request.state.token = MagicMock(iat=datetime.now(timezone.utc) - timedelta(minutes=1))
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        user = await get_current_user(request, mock_db_session)
        assert user.id == USER_ID


# ── get_tenant_from_request ──────────────────────────────────────────────────

class TestGetTenantFromRequest:
    async def test_returns_tenant_id(self):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await get_tenant_from_request(request)
        assert result == TENANT_ID

    async def test_raises_when_missing(self):
        request = MagicMock()
        request.state.tenant_id = None
        with pytest.raises(MultiTenantViolationError):
            await get_tenant_from_request(request)


# ── require_role ─────────────────────────────────────────────────────────────

class TestRequireRole:
    async def test_super_admin_accesses_everything(self, super_admin_user):
        checker = await require_role(UserRole.ADMIN)
        # Super admin should not raise
        result = await checker(user=super_admin_user)
        assert result is None

    async def test_admin_accesses_admin_role(self, admin_user):
        checker = await require_role(UserRole.ADMIN)
        result = await checker(user=admin_user)
        assert result is None

    async def test_operator_accesses_operator_role(self, operator_user):
        checker = await require_role(UserRole.OPERATOR)
        result = await checker(user=operator_user)
        assert result is None

    async def test_operator_cannot_access_admin_role(self, operator_user):
        checker = await require_role(UserRole.ADMIN)
        with pytest.raises(InsufficientPermissionsError):
            await checker(user=operator_user)


# ── validate_tenant_access ───────────────────────────────────────────────────

class TestValidateTenantAccess:
    async def test_super_admin_accesses_any_tenant(self, super_admin_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await validate_tenant_access(request, super_admin_user)
        assert result == TENANT_ID

    async def test_user_accesses_own_tenant(self, operator_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await validate_tenant_access(request, operator_user)
        assert result == TENANT_ID

    async def test_user_cannot_access_other_tenant(self, operator_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_B_ID
        with pytest.raises(MultiTenantViolationError):
            await validate_tenant_access(request, operator_user)

    async def test_admin_cannot_access_other_tenant(self, admin_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_B_ID
        with pytest.raises(MultiTenantViolationError):
            await validate_tenant_access(request, admin_user)


# ── Área do Médium (AM-02): require_backoffice / require_medium ─────────────


def _medium_user(role=UserRole.MEDIUM, tenant_id=TENANT_ID):
    u = User()
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id
    u.email = "medium@test.com"
    u.username = "medium"
    u.role = role
    u.is_active = True
    u.deleted_at = None
    return u


def _medium(tenant_id=TENANT_ID, **kw):
    m = Medium()
    m.id = uuid.uuid4()
    m.tenant_id = tenant_id
    m.nome = "Maria de Oxum"
    m.is_active = True
    m.deleted_at = None
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def _sub(plan=PlanType.BASIC, status=SubscriptionStatus.ACTIVE):
    return MagicMock(plan=plan, status=status, is_trial=False, is_bonus=False,
                     stripe_subscription_id=None, trial_ends_at=None)


def _req(impersonated_by=None):
    request = MagicMock()
    request.state.token = MagicMock(impersonated_by=impersonated_by)
    return request


class TestRequireBackoffice:
    @pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.OPERATOR, UserRole.SUPER_ADMIN])
    async def test_papeis_do_painel_passam(self, role):
        assert await require_backoffice(user=_medium_user(role=role)) is None

    async def test_papel_medium_leva_403(self):
        with pytest.raises(ForbiddenError) as exc:
            await require_backoffice(user=_medium_user())
        assert exc.value.status_code == 403
        assert exc.value.details["error_code"] == "BACKOFFICE_REQUIRED"

    async def test_medium_fora_da_hierarquia_de_require_role(self):
        checker = await require_role(UserRole.OPERATOR)
        with pytest.raises(InsufficientPermissionsError):
            await checker(user=_medium_user())

    def test_medium_nao_e_operador_nem_admin(self):
        u = _medium_user()
        assert u.is_operator_or_admin is False
        assert u.is_admin is False
        assert u.is_medium_only is True


class TestRequireMedium:
    """Passos 1–4 da §6.6 do plano. O filtro da query (tenant, ativo, não excluído) é
    conferido aqui no SQL e, com Postgres real, em integration_pg/test_area_medium.py."""

    async def test_sem_vinculo_leva_403(self, mock_db_session):
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=None)):
            with pytest.raises(ForbiddenError) as exc:
                await require_medium(_req(), _medium_user(), mock_db_session)
        assert exc.value.details["error_code"] == "MEDIUM_AREA_UNAVAILABLE"

    async def test_busca_o_medium_pelo_usuario_e_pelo_tenant_do_proprio_usuario(self, mock_db_session):
        user = _medium_user()
        lookup = AsyncMock(return_value=None)
        with patch("src.api.dependencies.get_linked_medium", lookup):
            with pytest.raises(ForbiddenError):
                await require_medium(_req(), user, mock_db_session)
        lookup.assert_awaited_once_with(mock_db_session, TENANT_ID, user.id)

    async def test_query_exige_mesmo_tenant_ativo_e_nao_excluido(self):
        """Médium inativo, excluído ou de outro tenant não resolve: o filtro está no SQL."""
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        assert await get_linked_medium(db, TENANT_ID, uuid.uuid4()) is None
        stmt = db.execute.await_args.args[0]
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        for trecho in (
            "mediuns.user_id =",
            "mediuns.tenant_id =",
            "mediuns.deleted_at IS NULL",
            "mediuns.is_active IS true",
        ):
            assert trecho in sql, sql

    async def test_super_admin_sem_tenant_leva_403(self, mock_db_session):
        lookup = AsyncMock()
        with patch("src.api.dependencies.get_linked_medium", lookup):
            with pytest.raises(ForbiddenError):
                await require_medium(
                    _req(), _medium_user(role=UserRole.SUPER_ADMIN, tenant_id=None), mock_db_session
                )
        lookup.assert_not_awaited()

    async def test_usuario_excluido_leva_403(self, mock_db_session):
        user = _medium_user()
        user.deleted_at = datetime.now(timezone.utc)
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=_medium())):
            with pytest.raises(ForbiddenError):
                await require_medium(_req(), user, mock_db_session)

    async def test_plano_sem_area_medium_leva_403(self, mock_db_session):
        repo = MagicMock(get_by_tenant=AsyncMock(return_value=_sub(plan=PlanType.FREE)))
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=_medium())), \
                patch("src.api.dependencies.SubscriptionRepository", return_value=repo):
            with pytest.raises(HTTPException) as exc:
                await require_medium(_req(), _medium_user(), mock_db_session)
        assert exc.value.status_code == 403
        assert "Área do Médium disponível a partir do plano Basic" in exc.value.detail

    async def test_assinatura_suspensa_leva_402(self, mock_db_session):
        repo = MagicMock(get_by_tenant=AsyncMock(return_value=_sub(status=SubscriptionStatus.SUSPENDED)))
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=_medium())), \
                patch("src.api.dependencies.SubscriptionRepository", return_value=repo):
            with pytest.raises(HTTPException) as exc:
                await require_medium(_req(), _medium_user(), mock_db_session)
        assert exc.value.status_code == 402

    async def test_area_desligada_na_configuracao_leva_403(self, mock_db_session):
        """Gancho do AM-10: hoje sempre ligada; quando desligar, recusa."""
        repo = MagicMock(get_by_tenant=AsyncMock(return_value=_sub()))
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=_medium())), \
                patch("src.api.dependencies.SubscriptionRepository", return_value=repo), \
                patch("src.api.dependencies.area_medium_enabled_by_tenant", AsyncMock(return_value=False)):
            with pytest.raises(ForbiddenError):
                await require_medium(_req(), _medium_user(), mock_db_session)

    @pytest.mark.parametrize("role", [UserRole.MEDIUM, UserRole.OPERATOR, UserRole.ADMIN])
    async def test_vinculo_ativo_com_plano_devolve_o_contexto(self, role, mock_db_session):
        user = _medium_user(role=role)
        medium = _medium()
        repo = MagicMock(get_by_tenant=AsyncMock(return_value=_sub()))
        request = _req()
        with patch("src.api.dependencies.get_linked_medium", AsyncMock(return_value=medium)), \
                patch("src.api.dependencies.SubscriptionRepository", return_value=repo):
            ctx = await require_medium(request, user, mock_db_session)
        assert isinstance(ctx, MediumContext)
        assert (ctx.user, ctx.tenant_id, ctx.medium) == (user, TENANT_ID, medium)
        assert ctx.token is request.state.token
        assert ctx.is_impersonated is False


class TestRequireNotImpersonated:
    async def test_sessao_normal_passa(self):
        assert await require_not_impersonated(_req()) is None

    async def test_impersonacao_leva_403(self):
        with pytest.raises(InsufficientPermissionsError):
            await require_not_impersonated(_req(impersonated_by=str(uuid.uuid4())))
