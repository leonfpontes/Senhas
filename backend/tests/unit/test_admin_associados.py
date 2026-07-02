"""Tests for admin associados CRUD endpoints."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.api.v1.admin.associados import (
    AssociadoCreate, AssociadoUpdate, AssociadoResponse,
    create_associado, list_associados, get_associado,
    update_associado, delete_associado, count_associados,
)
from src.core.errors import InsufficientPermissionsError, NotFoundError
from tests.conftest import TENANT_ID, USER_ID

ASSOCIADO_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")


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


def _mock_associado():
    a = MagicMock()
    a.id = ASSOCIADO_ID
    a.tenant_id = TENANT_ID
    a.nome = "Maria Silva"
    a.email = "maria@example.com"
    a.email_normalized = "maria@example.com"
    a.telefone = "(11) 99999-0000"
    a.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a.deleted_at = None
    return a


class TestCreateAssociado:
    @patch("src.api.v1.admin.associados.AuditService")
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_email.return_value = None
        repo_inst.create_associado.return_value = _mock_associado()
        MockRepo.return_value = repo_inst
        audit_inst = AsyncMock()
        MockAudit.return_value = audit_inst

        data = AssociadoCreate(nome="Maria Silva", email="maria@example.com")
        result = await create_associado(data, _admin_user(), db)
        assert result.nome == "Maria Silva"
        assert result.email == "maria@example.com"
        repo_inst.create_associado.assert_called_once()
        audit_inst.log_create.assert_called_once()
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_duplicate_email_409(self, MockRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_email.return_value = _mock_associado()
        MockRepo.return_value = repo_inst

        data = AssociadoCreate(nome="Outro Nome", email="maria@example.com")
        with pytest.raises(HTTPException) as exc:
            await create_associado(data, _admin_user(), db)
        assert exc.value.status_code == 409

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await create_associado(
                AssociadoCreate(nome="X", email="x@x.com"),
                _operator_user(),
                AsyncMock(),
            )


class TestListAssociados:
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.list_by_tenant.return_value = [_mock_associado()]
        MockRepo.return_value = repo_inst

        result = await list_associados(0, 50, _admin_user(), AsyncMock())
        assert len(result) == 1

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await list_associados(0, 50, _operator_user(), AsyncMock())


class TestCountAssociados:
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.count_by_tenant.return_value = 5
        MockRepo.return_value = repo_inst

        result = await count_associados(_admin_user(), AsyncMock())
        assert result == {"count": 5}

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await count_associados(_operator_user(), AsyncMock())


class TestGetAssociado:
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_associado()
        MockRepo.return_value = repo_inst

        result = await get_associado(ASSOCIADO_ID, _admin_user(), AsyncMock())
        assert result.id == ASSOCIADO_ID

    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await get_associado(ASSOCIADO_ID, _admin_user(), AsyncMock())

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await get_associado(ASSOCIADO_ID, _operator_user(), AsyncMock())


class TestUpdateAssociado:
    @patch("src.api.v1.admin.associados.AuditService")
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        updated = _mock_associado()
        updated.nome = "Maria Santos"
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = _mock_associado()
        repo_inst.update_associado.return_value = updated
        MockRepo.return_value = repo_inst
        audit_inst = AsyncMock()
        MockAudit.return_value = audit_inst

        data = AssociadoUpdate(nome="Maria Santos")
        result = await update_associado(data, ASSOCIADO_ID, _admin_user(), db)
        assert result.nome == "Maria Santos"
        repo_inst.update_associado.assert_called_once()
        audit_inst.log_update.assert_called_once()
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = None
        MockRepo.return_value = repo_inst

        data = AssociadoUpdate(nome="X")
        with pytest.raises(NotFoundError):
            await update_associado(data, ASSOCIADO_ID, _admin_user(), AsyncMock())

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await update_associado(
                AssociadoUpdate(nome="X"),
                ASSOCIADO_ID,
                _operator_user(),
                AsyncMock(),
            )


class TestDeleteAssociado:
    @patch("src.api.v1.admin.associados.AuditService")
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.delete.return_value = True
        MockRepo.return_value = repo_inst
        audit_inst = AsyncMock()
        MockAudit.return_value = audit_inst

        result = await delete_associado(ASSOCIADO_ID, _admin_user(), db)
        assert result is None  # 204 no content
        repo_inst.delete.assert_called_once()
        audit_inst.log_delete.assert_called_once()
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_not_found(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.delete.return_value = False
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await delete_associado(ASSOCIADO_ID, _admin_user(), AsyncMock())

    async def test_non_admin_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await delete_associado(ASSOCIADO_ID, _operator_user(), AsyncMock())
