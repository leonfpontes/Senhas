"""Unit tests for mensalidade API endpoints."""
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

TENANT_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000001")
TENANT_B_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000002")
USER_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000010")
MEDIUN_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000050")

MES = "2026-04"


def _admin_user():
    from src.models.users import UserRole
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.ADMIN
    return user


def _operator_user():
    from src.models.users import UserRole
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.OPERATOR
    return user


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_premium_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.PREMIUM
    return sub


def _mock_free_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.FREE
    return sub


def _mock_basic_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.BASIC
    return sub


def _mock_pro_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.PRO
    return sub


# ═══════════════════════════════════════════════════════════
# Premium Gate
# ═══════════════════════════════════════════════════════════

class TestPremiumGate:
    """Verify non-Premium tenants cannot access any mensalidade endpoint."""

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_free_retorna_403(self, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import get_config
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_free_sub()
        MockSubRepo.return_value = sub_inst
        with pytest.raises(HTTPException) as exc:
            await get_config(_admin_user(), _mock_db())
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_basic_retorna_403(self, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import get_config
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_basic_sub()
        MockSubRepo.return_value = sub_inst
        with pytest.raises(HTTPException) as exc:
            await get_config(_admin_user(), _mock_db())
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    async def test_pro_permite_acesso(self, MockMensalidadeRepo, MockSubRepo):
        """get_config é "Accessible to PRO+" (ver docstring do endpoint) —
        diferente dos demais endpoints do módulo, que são Premium-only. PRO
        não deve receber 403 aqui."""
        from src.api.v1.admin.mensalidades import get_config
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_pro_sub()
        MockSubRepo.return_value = sub_inst
        mensalidade_repo_inst = AsyncMock()
        mensalidade_repo_inst.get_config.return_value = None
        MockMensalidadeRepo.return_value = mensalidade_repo_inst

        result = await get_config(_admin_user(), _mock_db())
        assert result is None

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_premium_passes(self, MockSubRepo, MockRepo):
        from src.api.v1.admin.mensalidades import get_config
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_premium_sub()
        MockSubRepo.return_value = sub_inst
        repo_inst = AsyncMock()
        repo_inst.get_config.return_value = None
        MockRepo.return_value = repo_inst
        result = await get_config(_admin_user(), _mock_db())
        assert result is None  # config not set — no 403


# ═══════════════════════════════════════════════════════════
# Role Gate
# ═══════════════════════════════════════════════════════════

class TestRoleGate:
    """Verify OPERATOR cannot write, but can read."""

    def _patch_premium(self, mock_cls):
        inst = AsyncMock()
        inst.get_by_tenant.return_value = _mock_premium_sub()
        mock_cls.return_value = inst

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_operator_get_config_retorna_sucesso(self, MockSubRepo, MockRepo):
        """OPERATOR can read config."""
        from src.api.v1.admin.mensalidades import get_config
        self._patch_premium(MockSubRepo)
        repo_inst = AsyncMock()
        repo_inst.get_config.return_value = None
        MockRepo.return_value = repo_inst
        result = await get_config(_operator_user(), _mock_db())
        assert result is None  # no 403 raised

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_operator_update_config_retorna_403(self, MockSubRepo):
        """OPERATOR cannot write config."""
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import update_config, ConfigUpdate
        self._patch_premium(MockSubRepo)
        body = ConfigUpdate(valor_mensal=50.0, dia_vencimento=10)
        with pytest.raises(HTTPException) as exc:
            await update_config(body, _operator_user(), _mock_db())
        assert exc.value.status_code == 403


# ═══════════════════════════════════════════════════════════
# Tenant Isolation
# ═══════════════════════════════════════════════════════════

class TestTenantIsolation:
    """Verify mediun_id from another tenant returns 404."""

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_mediun_outro_tenant_retorna_404(self, MockSubRepo, MockRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import registrar_pagamento
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_premium_sub()
        MockSubRepo.return_value = sub_inst

        db = _mock_db()
        # Simulate DB returning no matching mediun (belongs to other tenant)
        from unittest.mock import MagicMock as MM
        scalar_none = MM()
        scalar_none.scalar_one_or_none.return_value = None
        db.execute.return_value = scalar_none

        repo_inst = AsyncMock()
        repo_inst.get_config.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(HTTPException) as exc:
            await registrar_pagamento(
                mediun_id=MEDIUN_ID,
                mes=MES,
                pagamento_status="PAGO",
                valor_pago=50.0,
                data_pagamento=None,
                observacao=None,
                comprovante=None,
                current_user=_admin_user(),
                db=db,
            )
        assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════
# Comprovante Validation
# ═══════════════════════════════════════════════════════════

class TestValidacaoComprovante:
    """Verify file type and size restrictions at the endpoint level."""

    def _make_upload(self, content_type: str, size_bytes: int):
        """Build a fake UploadFile-like mock."""
        upload = AsyncMock()
        upload.filename = "test"
        upload.content_type = content_type
        upload.read = AsyncMock(return_value=b"x" * size_bytes)
        return upload

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_tipo_invalido_retorna_422(self, MockSubRepo, MockRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import registrar_pagamento, MAX_COMPROVANTE_BYTES
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_premium_sub()
        MockSubRepo.return_value = sub_inst

        db = _mock_db()
        mediun = MagicMock()
        mediun_result = MagicMock()
        mediun_result.scalar_one_or_none.return_value = mediun
        db.execute.return_value = mediun_result

        repo_inst = AsyncMock()
        repo_inst.get_config.return_value = None
        MockRepo.return_value = repo_inst

        bad_file = self._make_upload("application/x-msdownload", 100)

        with pytest.raises(HTTPException) as exc:
            await registrar_pagamento(
                mediun_id=MEDIUN_ID,
                mes=MES,
                pagamento_status="PAGO",
                valor_pago=50.0,
                data_pagamento=None,
                observacao=None,
                comprovante=bad_file,
                current_user=_admin_user(),
                db=db,
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mensalidades.MensalidadeRepository")
    @patch("src.api.v1.admin.mensalidades.SubscriptionRepository")
    async def test_arquivo_grande_retorna_422(self, MockSubRepo, MockRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import registrar_pagamento, MAX_COMPROVANTE_BYTES
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _mock_premium_sub()
        MockSubRepo.return_value = sub_inst

        db = _mock_db()
        mediun = MagicMock()
        mediun_result = MagicMock()
        mediun_result.scalar_one_or_none.return_value = mediun
        db.execute.return_value = mediun_result

        repo_inst = AsyncMock()
        repo_inst.get_config.return_value = None
        MockRepo.return_value = repo_inst

        oversized = self._make_upload("image/jpeg", MAX_COMPROVANTE_BYTES + 1)

        with pytest.raises(HTTPException) as exc:
            await registrar_pagamento(
                mediun_id=MEDIUN_ID,
                mes=MES,
                pagamento_status="PAGO",
                valor_pago=50.0,
                data_pagamento=None,
                observacao=None,
                comprovante=oversized,
                current_user=_admin_user(),
                db=db,
            )
        assert exc.value.status_code == 422


# ═══════════════════════════════════════════════════════════
# Helper: _parse_mes
# ═══════════════════════════════════════════════════════════

class TestParseMes:
    """Unit test the _parse_mes helper directly."""

    def test_valid_format(self):
        from src.api.v1.admin.mensalidades import _parse_mes
        from datetime import date
        assert _parse_mes("2026-04") == date(2026, 4, 1)

    def test_invalid_format_raises_422(self):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import _parse_mes
        with pytest.raises(HTTPException) as exc:
            _parse_mes("04-2026")
        assert exc.value.status_code == 422

    def test_missing_month_part_raises_422(self):
        from fastapi import HTTPException
        from src.api.v1.admin.mensalidades import _parse_mes
        with pytest.raises(HTTPException) as exc:
            _parse_mes("2026")
        assert exc.value.status_code == 422
