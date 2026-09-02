"""Tests for admin giras CRUD endpoints."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.v1.admin.giras_crud import (
    GiraCreate, GiraUpdate, GiraResponse,
    create_gira, list_giras, get_gira, update_gira, delete_gira,
)
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models.subscriptions import SubscriptionStatus
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _operator_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = False
    user.is_operator_or_admin = False
    return user


def _mock_gira(recados=None):
    g = MagicMock()
    g.id = GIRA_ID
    g.tenant_id = TENANT_ID
    g.nome = "Gira de Maio"
    g.descricao = "Desc"
    g.data_inicio = datetime(2026, 5, 1, tzinfo=timezone.utc)
    g.data_fim = datetime(2026, 5, 2, tzinfo=timezone.utc)
    g.local = "Centro"
    g.is_active = True
    g.recados = recados
    g.allow_acompanhantes = False
    g.max_acompanhantes = None
    g.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    g.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return g


class TestCreateGira:
    @patch("src.api.v1.admin.giras_crud.SubscriptionRepository")
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_success(self, MockRepo, MockAudit, MockSubRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.create.return_value = _mock_gira()
        MockRepo.return_value = repo_inst
        audit_inst = AsyncMock()
        MockAudit.return_value = audit_inst
        # Mock an active subscription with unlimited giras
        sub_repo_inst = AsyncMock()
        sub = MagicMock()
        sub.status = SubscriptionStatus.ACTIVE
        sub.max_giras_per_month = -1
        sub_repo_inst.get_by_tenant.return_value = sub
        MockSubRepo.return_value = sub_repo_inst

        gira_data = GiraCreate(
            nome="Gira de Maio",
            data_inicio=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        result = await create_gira(gira_data, _admin_user(), db)
        assert result.nome == "Gira de Maio"
        repo_inst.create.assert_called_once()
        audit_inst.log_create.assert_called_once()
        db.commit.assert_called_once()

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await create_gira(
                GiraCreate(nome="X", data_inicio=datetime.now(timezone.utc)),
                _operator_user(),
                AsyncMock(),
            )

    @patch("src.api.v1.admin.giras_crud.SubscriptionRepository")
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_forwards_recados_to_repository(self, MockRepo, MockAudit, MockSubRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.create.return_value = _mock_gira(recados="Investimento: R$ 20.")
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()
        sub_repo_inst = AsyncMock()
        sub = MagicMock()
        sub.status = SubscriptionStatus.ACTIVE
        sub.max_giras_per_month = -1
        sub_repo_inst.get_by_tenant.return_value = sub
        MockSubRepo.return_value = sub_repo_inst

        gira_data = GiraCreate(
            nome="Gira de Maio",
            data_inicio=datetime(2026, 5, 1, tzinfo=timezone.utc),
            recados="Investimento: R$ 20.",
        )
        result = await create_gira(gira_data, _admin_user(), db)

        assert repo_inst.create.call_args.kwargs["recados"] == "Investimento: R$ 20."
        assert result.recados == "Investimento: R$ 20."

    async def test_recados_defaults_to_none(self):
        gira_data = GiraCreate(nome="X", data_inicio=datetime.now(timezone.utc))
        assert gira_data.recados is None


class TestListGiras:
    async def test_success(self):
        db = AsyncMock()
        query_result = MagicMock()
        query_result.scalars.return_value.all.return_value = [_mock_gira()]
        db.execute.return_value = query_result

        result = await list_giras(
            skip=0, limit=50, is_active=None, date_from=None, date_to=None,
            current_user=_admin_user(), db=db,
        )
        assert len(result) == 1

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await list_giras(
                skip=0, limit=50, is_active=None, date_from=None, date_to=None,
                current_user=_operator_user(), db=AsyncMock(),
            )


class TestGetGira:
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_gira()
        MockRepo.return_value = repo_inst

        result = await get_gira(GIRA_ID, _admin_user(), AsyncMock())
        assert result.id == GIRA_ID

    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await get_gira(GIRA_ID, _admin_user(), AsyncMock())

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await get_gira(GIRA_ID, _operator_user(), AsyncMock())


class TestUpdateGira:
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_gira()
        updated = _mock_gira()
        updated.nome = "Updated"
        repo_inst.update.return_value = updated
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        result = await update_gira(GIRA_ID, GiraUpdate(nome="Updated"), _admin_user(), db)
        assert result.nome == "Updated"
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await update_gira(GIRA_ID, GiraUpdate(nome="X"), _admin_user(), AsyncMock())

    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_forwards_recados_to_repository(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_gira()
        repo_inst.update.return_value = _mock_gira(recados="Trazer vela branca.")
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        result = await update_gira(
            GIRA_ID, GiraUpdate(recados="Trazer vela branca."), _admin_user(), db,
        )

        assert repo_inst.update.call_args.kwargs["recados"] == "Trazer vela branca."
        assert result.recados == "Trazer vela branca."

    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_clearing_recados_sends_empty_string(self, MockRepo, MockAudit):
        """exclude_unset=True still forwards an explicit '' — clearing the
        field must be possible, not just adding to it."""
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_gira(recados="Antigo recado.")
        repo_inst.update.return_value = _mock_gira(recados="")
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        await update_gira(GIRA_ID, GiraUpdate(recados=""), _admin_user(), db)

        assert repo_inst.update.call_args.kwargs["recados"] == ""


class TestDeleteGira:
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.delete_soft.return_value = True
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        await delete_gira(GIRA_ID, _admin_user(), db)
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.delete_soft.return_value = False
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await delete_gira(GIRA_ID, _admin_user(), AsyncMock())
