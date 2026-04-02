"""Unit tests for AuditLogRepository, BillingRepository, TenantConfigRepository."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timedelta


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.scalar.return_value = value
    return result


def _mock_result_scalars(items):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


# ═══════════════════════════════════════════════════════════
# AuditLogRepository
# ═══════════════════════════════════════════════════════════
class TestAuditLogRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.audit_log_repo import AuditLogRepository
        db = _mock_db()
        r = AuditLogRepository(db)
        return r, db

    async def test_create(self, repo):
        from src.models import AuditAction
        r, db = repo
        result = await r.create(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action=AuditAction.CREATE,
            resource_type="Ticket",
            resource_id=uuid4(),
            details={"key": "val"},
        )
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_create_no_tenant(self, repo):
        from src.models import AuditAction
        r, db = repo
        result = await r.create(
            tenant_id=None,
            user_id=None,
            action=AuditAction.LOGIN,
            resource_type="User",
        )
        db.add.assert_called_once()

    async def test_get_by_resource(self, repo):
        r, db = repo
        items = [MagicMock()]
        db.execute.return_value = _mock_result_scalars(items)
        result = await r.get_by_resource(uuid4(), "Ticket", uuid4())
        assert len(result) == 1

    async def test_list_by_tenant(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock(), MagicMock()])
        result = await r.list_by_tenant(uuid4())
        assert len(result) == 2

    async def test_list_by_tenant_pagination(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.list_by_tenant(uuid4(), skip=10, limit=5)
        assert result == []

    async def test_list_by_action(self, repo):
        from src.models import AuditAction
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_action(uuid4(), AuditAction.CREATE)
        assert len(result) == 1

    async def test_list_by_user(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_user(uuid4(), uuid4())
        assert len(result) == 1

    async def test_list_by_resource_type(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_resource_type(uuid4(), "Gira")
        assert len(result) == 1


# ═══════════════════════════════════════════════════════════
# BillingRepository
# ═══════════════════════════════════════════════════════════
class TestBillingRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.billing_repo import BillingRepository
        db = _mock_db()
        r = BillingRepository(db)
        return r, db

    async def test_get_by_number_found(self, repo):
        r, db = repo
        inv = MagicMock()
        db.execute.return_value = _mock_result_scalar(inv)
        result = await r.get_by_number("INV-001")
        assert result is inv

    async def test_get_by_number_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_number("NON-EXIST")
        assert result is None

    async def test_list_by_tenant(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_tenant(uuid4())
        assert len(result) == 1

    async def test_list_by_status(self, repo):
        from src.models import InvoiceStatus
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_status(InvoiceStatus.PAID)
        assert len(result) == 1

    async def test_create_invoice(self, repo):
        r, db = repo
        result = await r.create_invoice(
            tenant_id=uuid4(),
            invoice_number="INV-001",
            period_start=datetime(2024, 1, 1),
            period_end=datetime(2024, 1, 31),
            subtotal=100.0,
            tax_amount=10.0,
            discount_amount=5.0,
        )
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_create_invoice_with_due_date(self, repo):
        r, db = repo
        due = datetime(2024, 2, 15)
        result = await r.create_invoice(
            tenant_id=uuid4(),
            invoice_number="INV-002",
            period_start=datetime(2024, 1, 1),
            period_end=datetime(2024, 1, 31),
            subtotal=200.0,
            due_date=due,
        )
        db.add.assert_called_once()

    async def test_mark_as_paid_found(self, repo):
        r, db = repo
        inv = MagicMock()
        inv.total_amount = 100.0
        db.execute.return_value = _mock_result_scalar(inv)
        result = await r.mark_as_paid(uuid4(), "credit_card")
        assert result is inv
        db.flush.assert_awaited()

    async def test_mark_as_paid_with_ref(self, repo):
        r, db = repo
        inv = MagicMock()
        inv.total_amount = 100.0
        db.execute.return_value = _mock_result_scalar(inv)
        result = await r.mark_as_paid(uuid4(), "pix", payment_reference="ABC123", paid_amount=100.0)
        assert inv.payment_reference == "ABC123"
        assert inv.paid_amount == 100.0

    async def test_mark_as_paid_not_found(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.mark_as_paid(uuid4(), "credit_card")
        assert result is None

    async def test_count_paid(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(5)
        result = await r.count_paid(uuid4())
        assert result == 5

    async def test_count_paid_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.count_paid(uuid4())
        assert result == 0

    async def test_total_revenue(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(9999.99)
        result = await r.total_revenue()
        assert result == 9999.99

    async def test_total_revenue_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.total_revenue()
        assert result == 0.0


# ═══════════════════════════════════════════════════════════
# TenantConfigRepository
# ═══════════════════════════════════════════════════════════
class TestTenantConfigRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.config_repo import TenantConfigRepository
        db = _mock_db()
        r = TenantConfigRepository(db)
        return r, db

    async def test_get_by_tenant_exists(self, repo):
        r, db = repo
        config = MagicMock()
        db.execute.return_value = _mock_result_scalar(config)
        result = await r.get_by_tenant(uuid4())
        assert result is config

    async def test_get_by_tenant_creates_default(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_tenant(uuid4())
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_update_branding(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.update_branding(uuid4(), logo_url="http://logo.png", primary_color="#FF0000")
        assert config.logo_url == "http://logo.png"
        assert config.primary_color == "#FF0000"
        db.flush.assert_awaited()

    async def test_update_branding_partial(self, repo):
        r, db = repo
        config = MagicMock()
        config.logo_url = "old.png"
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.update_branding(uuid4(), primary_color="#000")
        # logo_url should not be changed since None was passed
        assert config.logo_url == "old.png"

    async def test_update_email_settings(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.update_email_settings(uuid4(), reply_to_email="noreply@x.com", email_signature="Sig")
        assert config.reply_to_email == "noreply@x.com"
        assert config.email_signature == "Sig"

    async def test_toggle_feature_valid(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.toggle_feature(uuid4(), "enable_bulk_operations", True)
        assert config.enable_bulk_operations is True

    async def test_toggle_feature_analytics(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        await r.toggle_feature(uuid4(), "enable_analytics", False)
        assert config.enable_analytics is False

    async def test_toggle_feature_invalid_flag(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        # Invalid feature flag name should not setattr
        await r.toggle_feature(uuid4(), "nonexistent_flag", True)
        db.flush.assert_awaited()  # Still flushes

    async def test_update_custom_settings(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.update_custom_settings(uuid4(), {"theme": "dark"})
        assert config.custom_settings == {"theme": "dark"}

    async def test_update_custom_settings_empty(self, repo):
        r, db = repo
        config = MagicMock()
        r.get_by_tenant = AsyncMock(return_value=config)
        result = await r.update_custom_settings(uuid4(), {})
        assert config.custom_settings == {}
