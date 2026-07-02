"""Tests for SQLAlchemy ORM models."""
import uuid
from datetime import datetime, timezone

import pytest

from src.models.base import TimestampedModel, SoftDeleteModel
from src.models.tenants import Tenant
from src.models.users import User, UserRole
from src.models.tickets import Ticket, TicketStatus
from src.models.giras import Gira
from src.models.consulentes import Consulente
from src.models.senha_controls import SenhaControl
from src.models.audit_logs import AuditLog, AuditAction


class TestUserRole:
    """Tests for UserRole enum."""

    def test_super_admin_value(self):
        assert UserRole.SUPER_ADMIN.value == "super_admin"

    def test_admin_value(self):
        assert UserRole.ADMIN.value == "admin"

    def test_operator_value(self):
        assert UserRole.OPERATOR.value == "operator"

    def test_is_string_enum(self):
        assert isinstance(UserRole.ADMIN, str)
        assert UserRole.ADMIN == "admin"


class TestTicketStatus:
    """Tests for TicketStatus enum."""

    def test_all_statuses(self):
        expected = {"emitted", "called", "completed", "cancelled", "no_show"}
        actual = {s.value for s in TicketStatus}
        assert actual == expected

    def test_is_string_enum(self):
        assert isinstance(TicketStatus.EMITTED, str)
        assert TicketStatus.EMITTED == "emitted"


class TestAuditAction:
    """Tests for AuditAction enum."""

    def test_all_actions(self):
        expected = {
            "create", "read", "update", "delete", "login", "logout", "token_refresh",
            "TENANT_DELETED", "TENANT_DEACTIVATED", "TENANT_REACTIVATED",
        }
        actual = {a.value for a in AuditAction}
        assert actual == expected


class TestUserModel:
    """Tests for User model properties."""

    def test_is_super_admin(self, super_admin_user):
        assert super_admin_user.is_super_admin is True

    def test_is_not_super_admin(self, admin_user):
        assert admin_user.is_super_admin is False

    def test_operator_is_not_super_admin(self, operator_user):
        assert operator_user.is_super_admin is False

    def test_is_admin_for_super(self, super_admin_user):
        assert super_admin_user.is_admin is True

    def test_is_admin_for_admin(self, admin_user):
        assert admin_user.is_admin is True

    def test_is_admin_false_for_operator(self, operator_user):
        assert operator_user.is_admin is False

    def test_repr(self, admin_user):
        r = repr(admin_user)
        assert "User" in r
        assert admin_user.email in r


class TestTicketModel:
    """Tests for Ticket model properties."""

    def test_emitted_is_active(self, ticket):
        ticket.status = TicketStatus.EMITTED
        assert ticket.is_active is True

    def test_called_is_active(self, ticket):
        ticket.status = TicketStatus.CALLED
        assert ticket.is_active is True

    def test_completed_is_not_active(self, ticket):
        ticket.status = TicketStatus.COMPLETED
        assert ticket.is_active is False

    def test_cancelled_is_not_active(self, ticket):
        ticket.status = TicketStatus.CANCELLED
        assert ticket.is_active is False

    def test_no_show_is_not_active(self, ticket):
        ticket.status = TicketStatus.NO_SHOW
        assert ticket.is_active is False

    def test_repr(self, ticket):
        r = repr(ticket)
        assert "Ticket" in r
        assert str(ticket.numero) in r


class TestTenantModel:
    """Tests for Tenant model."""

    def test_repr(self, tenant):
        r = repr(tenant)
        assert "Tenant" in r
        assert tenant.name in r
        assert tenant.slug in r

    def test_default_active(self, tenant):
        assert tenant.is_active is True


class TestGiraModel:
    """Tests for Gira model."""

    def test_repr(self, gira):
        r = repr(gira)
        assert "Gira" in r
        assert gira.nome in r


class TestConsulenteModel:
    """Tests for Consulente model."""

    def test_repr(self, consulente):
        r = repr(consulente)
        assert "Consulente" in r
        assert consulente.nome in r


class TestSenhaControlModel:
    """Tests for SenhaControl model."""

    def test_repr(self):
        sc = SenhaControl()
        sc.tenant_id = uuid.uuid4()
        sc.gira_id = uuid.uuid4()
        sc.proximo_numero = 5
        r = repr(sc)
        assert "SenhaControl" in r
        assert "5" in r


class TestAuditLogModel:
    """Tests for AuditLog model."""

    def test_repr(self):
        al = AuditLog()
        al.id = uuid.uuid4()
        al.action = AuditAction.CREATE
        al.resource_type = "Ticket"
        al.tenant_id = uuid.uuid4()
        r = repr(al)
        assert "AuditLog" in r
        assert "create" in r
        assert "Ticket" in r


class TestSoftDeleteModel:
    """Tests for SoftDeleteModel base mixin."""

    def test_soft_delete_sets_deleted_at(self, tenant):
        assert tenant.deleted_at is None
        tenant.soft_delete()
        assert tenant.deleted_at is not None
        assert isinstance(tenant.deleted_at, datetime)
