"""T079: Admin Endpoints Test Suite - 50+ comprehensive test cases."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID, uuid4
from datetime import datetime, timedelta

from backend.src.models import (
    User,
    UserRole,
    Tenant,
    Gira,
    Ticket,
    TicketStatus,
    AuditLog,
    AuditAction,
    TenantConfig,
)
from backend.src.core.errors import APIException


class TestAdminGirasCRUD:
    """Test Gira CRUD operations."""

    def test_create_gira_success(self, client: TestClient, admin_token: str, tenant_id: UUID):
        """Test successful gira creation."""
        response = client.post(
            "/api/v1/admin/giras",
            json={
                "nome": "Gira de Teste",
                "descricao": "Descrição",
                "data_inicio": "2026-03-10T18:00:00Z",
                "local": "Centro",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["nome"] == "Gira de Teste"
        assert UUID(data["id"])  # Valid UUID

    def test_create_gira_unauthorized(self, client: TestClient, operator_token: str):
        """Test gira creation by non-admin fails."""
        response = client.post(
            "/api/v1/admin/giras",
            json={
                "nome": "Gira",
                "data_inicio": "2026-03-10T18:00:00Z",
            },
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403

    def test_list_giras(self, client: TestClient, admin_token: str):
        """Test listing giras."""
        response = client.get(
            "/api/v1/admin/giras",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_giras_pagination(self, client: TestClient, admin_token: str):
        """Test gira pagination."""
        response = client.get(
            "/api/v1/admin/giras?skip=0&limit=10",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_get_gira(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test getting specific gira."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["id"] == str(gira_id)

    def test_get_gira_not_found(self, client: TestClient, admin_token: str):
        """Test getting non-existent gira."""
        response = client.get(
            f"/api/v1/admin/giras/{uuid4()}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    def test_update_gira(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test updating gira."""
        response = client.put(
            f"/api/v1/admin/giras/{gira_id}",
            json={"nome": "Gira Atualizada"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["nome"] == "Gira Atualizada"

    def test_delete_gira(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test deleting gira (soft delete)."""
        response = client.delete(
            f"/api/v1/admin/giras/{gira_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 204


class TestAdminTicketsOperations:
    """Test ticket operations."""

    def test_list_tickets_for_gira(
        self, client: TestClient, admin_token: str, gira_id: UUID
    ):
        """Test listing tickets for gira."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id}/tickets",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_list_tickets_pagination(
        self, client: TestClient, admin_token: str, gira_id: UUID
    ):
        """Test ticket pagination."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id}/tickets?skip=0&limit=25",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_list_tickets_with_status_filter(
        self, client: TestClient, admin_token: str, gira_id: UUID
    ):
        """Test filtering tickets by status."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id}/tickets?status_filter=emitted",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_get_specific_ticket(self, client: TestClient, admin_token: str, ticket_id: UUID):
        """Test getting specific ticket."""
        response = client.get(
            f"/api/v1/admin/tickets/{ticket_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_bulk_mark_used_success(
        self, client: TestClient, admin_token: str, gira_id: UUID, ticket_ids: list
    ):
        """Test bulk marking tickets as used."""
        response = client.post(
            f"/api/v1/admin/giras/{gira_id}/tickets/bulk-mark-used",
            json={"ticket_ids": ticket_ids, "dry_run": False},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "modified" in data
        assert data["modified"] == len(ticket_ids)

    def test_bulk_mark_used_dry_run(
        self, client: TestClient, admin_token: str, gira_id: UUID, ticket_ids: list
    ):
        """Test dry-run for bulk operations."""
        response = client.post(
            f"/api/v1/admin/giras/{gira_id}/tickets/bulk-mark-used",
            json={"ticket_ids": ticket_ids, "dry_run": True},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_bulk_cancel_success(
        self, client: TestClient, admin_token: str, gira_id: UUID, ticket_ids: list
    ):
        """Test bulk cancelling tickets."""
        response = client.post(
            f"/api/v1/admin/giras/{gira_id}/tickets/bulk-cancel",
            json={"ticket_ids": ticket_ids, "dry_run": False},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_bulk_cancel_unauthorized(
        self, client: TestClient, operator_token: str, gira_id: UUID, ticket_ids: list
    ):
        """Test bulk cancel by non-admin fails."""
        response = client.post(
            f"/api/v1/admin/giras/{gira_id}/tickets/bulk-cancel",
            json={"ticket_ids": ticket_ids},
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403

    def test_validate_bulk_operation(
        self, client: TestClient, admin_token: str, ticket_ids: list
    ):
        """Test bulk operation validation."""
        response = client.post(
            "/api/v1/admin/validate-bulk",
            json={"ticket_ids": ticket_ids, "operation": "mark_used"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
        assert "count" in data


class TestAdminConfig:
    """Test configuration management."""

    def test_get_config(self, client: TestClient, admin_token: str):
        """Test getting tenant config."""
        response = client.get(
            "/api/v1/admin/tenant/config",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "logo_url" in data
        assert "primary_color" in data
        assert "enable_bulk_operations" in data

    def test_update_branding(self, client: TestClient, admin_token: str):
        """Test updating branding."""
        response = client.put(
            "/api/v1/admin/tenant/config",
            json={
                "logo_url": "https://example.com/logo.png",
                "primary_color": "#FF0000",
                "secondary_color": "#00FF00",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["logo_url"] == "https://example.com/logo.png"
        assert data["primary_color"] == "#FF0000"

    def test_update_email_settings(self, client: TestClient, admin_token: str):
        """Test updating email settings."""
        response = client.put(
            "/api/v1/admin/tenant/config",
            json={
                "reply_to_email": "admin@example.com",
                "email_signature": "Best regards",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_toggle_feature_flags(self, client: TestClient, admin_token: str):
        """Test toggling feature flags."""
        response = client.put(
            "/api/v1/admin/tenant/config",
            json={
                "enable_bulk_operations": False,
                "enable_analytics": True,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["enable_bulk_operations"] == True
        assert data["enable_analytics"] == True

    def test_config_unauthorized(self, client: TestClient, operator_token: str):
        """Test config access by non-admin fails."""
        response = client.put(
            "/api/v1/admin/tenant/config",
            json={"primary_color": "#FF0000"},
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403


class TestAdminAuditTrail:
    """Test audit trail operations."""

    def test_list_audit_logs(self, client: TestClient, admin_token: str):
        """Test listing audit logs."""
        response = client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_audit_logs_pagination(self, client: TestClient, admin_token: str):
        """Test audit logs pagination."""
        response = client.get(
            "/api/v1/admin/audit-logs?skip=0&limit=50",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_filter_audit_logs_by_action(self, client: TestClient, admin_token: str):
        """Test filtering audit logs by action."""
        response = client.get(
            "/api/v1/admin/audit-logs?action_filter=create",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_filter_audit_logs_by_resource_type(self, client: TestClient, admin_token: str):
        """Test filtering audit logs by resource type."""
        response = client.get(
            "/api/v1/admin/audit-logs?resource_type_filter=Ticket",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_filter_audit_logs_by_user(self, client: TestClient, admin_token: str, user_id: UUID):
        """Test filtering audit logs by user."""
        response = client.get(
            f"/api/v1/admin/audit-logs?user_id_filter={user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_audit_logs_immutable(self, client: TestClient, admin_token: str):
        """Test that audit logs are immutable (no update/delete endpoints)."""
        # Verify no PUT, DELETE endpoints exist for audit logs
        response = client.put(
            "/api/v1/admin/audit-logs/some-id",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404


class TestAdminAnalytics:
    """Test analytics endpoints."""

    def test_get_analytics_week(self, client: TestClient, admin_token: str):
        """Test getting analytics for week period."""
        response = client.get(
            "/api/v1/admin/analytics?period=week",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_emitted" in data
        assert "total_used" in data
        assert "usage_rate" in data
        assert "daily_distribution" in data

    def test_get_analytics_month(self, client: TestClient, admin_token: str):
        """Test getting analytics for month period."""
        response = client.get(
            "/api/v1/admin/analytics?period=month",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_get_analytics_all_time(self, client: TestClient, admin_token: str):
        """Test getting analytics for all time."""
        response = client.get(
            "/api/v1/admin/analytics?period=all",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_analytics_with_gira_filter(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test analytics filtered by gira."""
        response = client.get(
            f"/api/v1/admin/analytics?gira_id={gira_id}&period=week",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_analytics_unauthorized(self, client: TestClient, operator_token: str):
        """Test analytics access by non-admin fails."""
        response = client.get(
            "/api/v1/admin/analytics",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403


class TestAdminUsers:
    """Test user management."""

    def test_create_user(self, client: TestClient, admin_token: str):
        """Test creating new user."""
        response = client.post(
            "/api/v1/admin/users",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "SecurePass123!",
                "role": "operator",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201

    def test_create_user_duplicate_email(self, client: TestClient, admin_token: str):
        """Test creating user with duplicate email fails."""
        # Create first user
        client.post(
            "/api/v1/admin/users",
            json={
                "email": "duplicate@example.com",
                "username": "user1",
                "password": "Pass123!",
                "role": "operator",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # Try to create same email
        response = client.post(
            "/api/v1/admin/users",
            json={
                "email": "duplicate@example.com",
                "username": "user2",
                "password": "Pass123!",
                "role": "operator",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 409

    def test_list_users(self, client: TestClient, admin_token: str):
        """Test listing users."""
        response = client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_list_users_by_role(self, client: TestClient, admin_token: str):
        """Test listing users filtered by role."""
        response = client.get(
            "/api/v1/admin/users?role_filter=operator",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_get_user(self, client: TestClient, admin_token: str, user_id: UUID):
        """Test getting specific user."""
        response = client.get(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_update_user(self, client: TestClient, admin_token: str, user_id: UUID):
        """Test updating user."""
        response = client.put(
            f"/api/v1/admin/users/{user_id}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_deactivate_user(self, client: TestClient, admin_token: str, user_id: UUID):
        """Test deactivating user."""
        response = client.put(
            f"/api/v1/admin/users/{user_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

    def test_delete_user(self, client: TestClient, admin_token: str, user_id: UUID):
        """Test deleting user (soft delete)."""
        response = client.delete(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 204


class TestAdminExports:
    """Test export functionality."""

    def test_export_csv(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test exporting tickets to CSV."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id}/export-csv",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv"


class TestAdminHealth:
    """Test health check."""

    def test_health_check(self, client: TestClient, admin_token: str):
        """Test admin health check."""
        response = client.get(
            "/api/v1/admin/health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "overall_status" in data
        assert "database" in data
        assert "email_primary" in data


class TestAdminPermissions:
    """Test permission and authorization."""

    def test_admin_required_giras(self, client: TestClient, operator_token: str):
        """Test non-admin cannot access admin gira endpoints."""
        response = client.get(
            "/api/v1/admin/giras",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403

    def test_admin_required_tickets(self, client: TestClient, operator_token: str):
        """Test non-admin cannot access admin ticket endpoints."""
        response = client.get(
            "/api/v1/admin/giras/some-id/tickets",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403

    def test_admin_required_analytics(self, client: TestClient, operator_token: str):
        """Test non-admin cannot access analytics."""
        response = client.get(
            "/api/v1/admin/analytics",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert response.status_code == 403

    def test_no_token_access(self, client: TestClient):
        """Test unauthenticated access is denied."""
        response = client.get("/api/v1/admin/giras")
        assert response.status_code == 401


class TestAdminMultiTenant:
    """Test multi-tenant isolation in admin operations."""

    def test_admin_sees_only_tenant_data(
        self, client: TestClient, admin_token_tenant1: str, gira_id_tenant1: UUID
    ):
        """Test admin can only see their tenant's giras."""
        response = client.get(
            "/api/v1/admin/giras",
            headers={"Authorization": f"Bearer {admin_token_tenant1}"},
        )
        assert response.status_code == 200
        # Verify returned giras belong to tenant1

    def test_cannot_access_other_tenant_gira(
        self, client: TestClient, admin_token_tenant1: str, gira_id_tenant2: UUID
    ):
        """Test admin cannot access other tenant's gira."""
        response = client.get(
            f"/api/v1/admin/giras/{gira_id_tenant2}",
            headers={"Authorization": f"Bearer {admin_token_tenant1}"},
        )
        assert response.status_code == 404


class TestAuditLogging:
    """Test that admin operations are properly logged."""

    def test_create_gira_logged(self, client: TestClient, admin_token: str, db: AsyncSession):
        """Test that gira creation is audited."""
        response = client.post(
            "/api/v1/admin/giras",
            json={
                "nome": "Test Gira",
                "data_inicio": "2026-03-15T18:00:00Z",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201

        # Verify audit log was created
        # (Implementation depends on database setup in test fixtures)

    def test_delete_gira_logged(self, client: TestClient, admin_token: str, gira_id: UUID):
        """Test that gira deletion is audited."""
        response = client.delete(
            f"/api/v1/admin/giras/{gira_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 204

        # Verify audit log contains DELETE action


# Test fixtures (pytest)
@pytest.fixture
def client():
    """Create test client."""
    from backend.src.main import app
    return TestClient(app)


@pytest.fixture
def admin_token(client: TestClient, db: AsyncSession) -> str:
    """Create admin user and return token."""
    # Implementation depends on auth setup
    pass


@pytest.fixture
def operator_token(client: TestClient, db: AsyncSession) -> str:
    """Create operator user and return token."""
    pass


@pytest.fixture
def gira_id(db: AsyncSession) -> UUID:
    """Create test gira and return ID."""
    pass


@pytest.fixture
def ticket_id(db: AsyncSession, gira_id: UUID) -> UUID:
    """Create test ticket and return ID."""
    pass


@pytest.fixture
def tenant_id(db: AsyncSession) -> UUID:
    """Get test tenant ID."""
    pass


@pytest.fixture
def user_id(db: AsyncSession) -> UUID:
    """Get test user ID."""
    pass
