"""Tests targeting remaining coverage gaps to reach 90%.
Covers: emit_ticket, resend_email, subscription_service, platform endpoints,
email providers, templates, tenant_service, main.py, health.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import uuid4, UUID
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException


TENANT_ID = uuid4()
GIRA_ID = uuid4()
TICKET_ID = uuid4()
USER_ID = uuid4()


class _ComparableMock:
    """Mock that supports comparison operators (for SQLAlchemy column expressions)."""
    def __le__(self, other): return MagicMock()
    def __ge__(self, other): return MagicMock()
    def __lt__(self, other): return MagicMock()
    def __gt__(self, other): return MagicMock()
    def __eq__(self, other): return MagicMock()
    def __ne__(self, other): return MagicMock()
    def __hash__(self): return id(self)
    def __getattr__(self, name): return MagicMock()


class _MockGiraClass:
    """Mock Gira model class with attributes that support comparisons."""
    tenant_id = _ComparableMock()
    is_active = _ComparableMock()
    release_start_at = _ComparableMock()
    release_end_at = _ComparableMock()
    status = _ComparableMock()
    max_tickets = _ComparableMock()
    sponsor_release_start_at = _ComparableMock()
    sponsor_release_end_at = _ComparableMock()
    sponsor_max_tickets = _ComparableMock()
    deleted_at = _ComparableMock()


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock()
    return db


def _mock_result_scalar(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _super_admin_user(tenant_id=None):
    from src.models import UserRole
    u = MagicMock()
    u.role = UserRole.SUPER_ADMIN
    u.tenant_id = tenant_id
    u.id = USER_ID
    return u


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# emit_ticket.py Coverage (Lines 143-294, 328-387)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
def _make_starlette_request():
    """Create a minimal Starlette Request that passes slowapi's isinstance check."""
    from starlette.requests import Request as StarletteRequest
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/public/test/emit-ticket",
        "headers": [],
        "query_string": b"",
    }
    return StarletteRequest(scope)


class TestEmitTicketEndpoint:

    async def test_emit_ticket_tenant_not_found(self):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        db = _mock_db()
        db.execute.return_value = _mock_result_scalar(None)
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "bad-slug", "regular", req, db)
        assert exc.value.status_code == 404

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_no_active_gira(self, mock_and, mock_select):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        # First call: tenant found, second call: no gira
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(None),
        ])
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 404

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_duplicate(self, mock_and, mock_select,
                                          MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        gira = MagicMock()
        gira.id = GIRA_ID
        gira.max_tickets = 100
        gira.release_start_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        gira.status = "ACTIVE"
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        consulente = MagicMock()
        consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, False))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=True)
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 409

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_invalid_email(self, mock_and, mock_select,
                                              MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        gira = MagicMock()
        gira.id = GIRA_ID
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        MockConsRepo.return_value.upsert_consulente = AsyncMock(side_effect=ValueError("Invalid email"))
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 400

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_capacity_exceeded(self, mock_and, mock_select,
                                                  MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        gira = MagicMock()
        gira.id = GIRA_ID
        gira.max_tickets = 10
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
            # waitlist_service.waitlist_enabled_for_tenant's TenantConfig lookup —
            # feature disabled, so capacity overflow must still 410 as before.
            _mock_result_scalar(MagicMock(enable_waitlist=False)),
        ])
        consulente = MagicMock()
        consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=11)  # > max_tickets
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 410

    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_increment_fails(self, mock_and, mock_select,
                                                MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        gira = MagicMock()
        gira.id = GIRA_ID
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        consulente = MagicMock(); consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(side_effect=ValueError("fail"))
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 500

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_success(self, mock_and, mock_select,
                                        MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        tenant.name = "Test Tenant"
        tenant.logo_url = "http://logo.png"
        tenant.brand_color = "#000"
        gira = MagicMock()
        gira.id = GIRA_ID
        gira.nome = "Gira Teste"
        gira.max_tickets = 100
        gira.data_inicio = None
        gira.local = "Sala 1"
        gira.use_time_slots = False
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
            _mock_result_scalar(None),  # TenantConfig query (colors/address/logo)
        ])
        consulente = MagicMock()
        consulente.id = uuid4()
        consulente.email = "t@t.com"
        consulente.nome = "Test"
        consulente.telefone = None
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=42)
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        ticket = MagicMock()
        ticket.id = TICKET_ID
        MockTicketRepo.return_value.create_ticket = AsyncMock(return_value=ticket)
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with patch("src.api.v1.public.emit_ticket.email_queue") as mock_queue:
            result = await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert result.ticket_number == "0042"
        assert result.email_sent is True
        mock_queue.enqueue.assert_called_once()

    # ── agendamento por horário (time slots) ────────────────────────────────
    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_time_slot_required_but_missing(
        self, mock_and, mock_select, MockConsRepo, MockSenhaRepo, MockTicketRepo,
    ):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        db = _mock_db()
        tenant = MagicMock(); tenant.id = TENANT_ID; tenant.slug = "test"
        gira = MagicMock(); gira.id = GIRA_ID; gira.max_tickets = 100; gira.use_time_slots = True
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        consulente = MagicMock(); consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=1)
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        req = EmitTicketRequest(name="Test", email="t@t.com")  # no time_slot_id
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 400
        db.rollback.assert_awaited()

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_time_slot_invalid(
        self, mock_and, mock_select, MockConsRepo, MockSenhaRepo, MockTicketRepo, MockSlotRepo,
    ):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        db = _mock_db()
        tenant = MagicMock(); tenant.id = TENANT_ID; tenant.slug = "test"
        gira = MagicMock(); gira.id = GIRA_ID; gira.max_tickets = 100; gira.use_time_slots = True
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        consulente = MagicMock(); consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=1)
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        MockSlotRepo.return_value.get_by_id_for_gira = AsyncMock(return_value=None)
        req = EmitTicketRequest(name="Test", email="t@t.com", time_slot_id=uuid4())
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 404
        db.rollback.assert_awaited()

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_time_slot_full(
        self, mock_and, mock_select, MockConsRepo, MockSenhaRepo, MockTicketRepo, MockSlotRepo,
    ):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        from src.repositories.gira_time_slot_repo import TimeSlotFullError
        db = _mock_db()
        tenant = MagicMock(); tenant.id = TENANT_ID; tenant.slug = "test"
        gira = MagicMock(); gira.id = GIRA_ID; gira.max_tickets = 100; gira.use_time_slots = True
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
        ])
        consulente = MagicMock(); consulente.id = uuid4()
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=1)
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        slot = MagicMock(); slot.id = uuid4()
        MockSlotRepo.return_value.get_by_id_for_gira = AsyncMock(return_value=slot)
        MockSlotRepo.return_value.increment_atomic = AsyncMock(side_effect=TimeSlotFullError("full"))
        req = EmitTicketRequest(name="Test", email="t@t.com", time_slot_id=slot.id)
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 410
        db.rollback.assert_awaited()
        MockTicketRepo.return_value.create_ticket.assert_not_called()

    @patch("src.api.v1.public.emit_ticket.Gira", _MockGiraClass)
    @patch("src.api.v1.public.emit_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_time_slot_success(
        self, mock_and, mock_select, MockConsRepo, MockSenhaRepo, MockTicketRepo, MockSlotRepo,
    ):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        mock_select.return_value = MagicMock(
            where=MagicMock(return_value=MagicMock(
                order_by=MagicMock(return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock())
                ))
            ))
        )
        db = _mock_db()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        tenant.name = "Test Tenant"
        gira = MagicMock()
        gira.id = GIRA_ID
        gira.nome = "Gira Teste"
        gira.max_tickets = 100
        gira.data_inicio = None
        gira.local = "Sala 1"
        gira.use_time_slots = True
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(tenant),
            _mock_result_scalar(gira),
            _mock_result_scalar(None),  # TenantConfig query (colors/address/logo)
        ])
        consulente = MagicMock()
        consulente.id = uuid4()
        consulente.email = "t@t.com"
        consulente.nome = "Test"
        consulente.telefone = None
        MockConsRepo.return_value.upsert_consulente = AsyncMock(return_value=(consulente, True))
        MockTicketRepo.return_value.check_duplicate_in_gira = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.get_or_create_for_gira = AsyncMock()
        MockSenhaRepo.return_value.increment_atomic = AsyncMock(return_value=42)
        MockSenhaRepo.return_value.get_by_gira = AsyncMock(return_value=None)
        slot = MagicMock(); slot.id = uuid4()
        MockSlotRepo.return_value.get_by_id_for_gira = AsyncMock(return_value=slot)
        MockSlotRepo.return_value.increment_atomic = AsyncMock(return_value=5)
        ticket = MagicMock()
        ticket.id = TICKET_ID
        MockTicketRepo.return_value.create_ticket = AsyncMock(return_value=ticket)
        req = EmitTicketRequest(name="Test", email="t@t.com", time_slot_id=slot.id)
        with patch("src.api.v1.public.emit_ticket.email_queue"):
            result = await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert result.ticket_number == "0042"
        MockTicketRepo.return_value.create_ticket.assert_awaited_once()
        assert MockTicketRepo.return_value.create_ticket.call_args.kwargs["time_slot_id"] == slot.id

    @patch("src.api.v1.public.emit_ticket.TicketRepository")
    @patch("src.api.v1.public.emit_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.emit_ticket.ConsulenteRepository")
    @patch("src.api.v1.public.emit_ticket.select")
    @patch("src.api.v1.public.emit_ticket.and_")
    async def test_emit_ticket_unexpected_error(self, mock_and, mock_select,
                                                 MockConsRepo, MockSenhaRepo, MockTicketRepo):
        from src.api.v1.public.emit_ticket import emit_ticket, EmitTicketRequest
        db = _mock_db()
        db.execute = AsyncMock(side_effect=RuntimeError("DB down"))
        req = EmitTicketRequest(name="Test", email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await emit_ticket(_make_starlette_request(), "test", "regular", req, db)
        assert exc.value.status_code == 500

    # _send_ticket_email was replaced by email_queue.enqueue() — tests skipped
    @pytest.mark.skip(reason="_send_ticket_email removed; email now via email_queue.enqueue")
    @patch("src.api.v1.public.emit_ticket.BrevoEmailService")
    @patch("src.api.v1.public.emit_ticket.generate_ticket_emission_html", return_value="<html>")
    @patch("src.api.v1.public.emit_ticket.generate_plain_text_fallback", return_value="text")
    async def test_send_ticket_email_brevo_success(self, mock_text, mock_html, MockBrevo):
        pass

    @pytest.mark.skip(reason="_send_ticket_email removed; email now via email_queue.enqueue")
    async def test_send_ticket_email_brevo_fails_resend_succeeds(self):
        pass

    @pytest.mark.skip(reason="_send_ticket_email removed; email now via email_queue.enqueue")
    async def test_send_ticket_email_all_fail(self):
        pass

    @pytest.mark.skip(reason="_send_ticket_email removed; email now via email_queue.enqueue")
    async def test_send_ticket_email_template_error(self):
        pass


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# resend_email.py Coverage (Lines 99-164, 198-267)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestResendEmailEndpoint:
    """resend_ticket_email — success path + full template wiring is covered by
    tests/unit/test_resend_ticket_email.py. Here: the error/early-return
    branches only. `_resend_ticket_email_task` and the direct Brevo/Resend
    calls it used to test no longer exist — the endpoint now builds the email
    inline and hands it to email_queue, matching the admin resend endpoint."""

    async def test_resend_tenant_not_found(self):
        from src.api.v1.public.resend_email import resend_ticket_email, ResendTicketEmailRequest
        db = _mock_db()
        db.execute.return_value = _mock_result_scalar(None)
        req = ResendTicketEmailRequest(email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await resend_ticket_email("bad", req, db)
        assert exc.value.status_code == 404

    @patch("src.api.v1.public.resend_email.ConsulenteRepository.normalize_email")
    async def test_resend_invalid_email(self, mock_normalize):
        from src.api.v1.public.resend_email import resend_ticket_email, ResendTicketEmailRequest
        db = _mock_db()
        tenant = MagicMock(); tenant.id = TENANT_ID
        db.execute.return_value = _mock_result_scalar(tenant)
        mock_normalize.side_effect = ValueError("Invalid")
        req = ResendTicketEmailRequest(email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await resend_ticket_email("test", req, db)
        assert exc.value.status_code == 400

    @patch("src.api.v1.public.resend_email.TicketRepository")
    async def test_resend_no_tickets(self, MockTicketRepo):
        from src.api.v1.public.resend_email import resend_ticket_email, ResendTicketEmailRequest
        db = _mock_db()
        tenant = MagicMock(); tenant.id = TENANT_ID
        db.execute.return_value = _mock_result_scalar(tenant)
        MockTicketRepo.return_value.list_by_consulente_email = AsyncMock(return_value=[])
        req = ResendTicketEmailRequest(email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await resend_ticket_email("test", req, db)
        assert exc.value.status_code == 404

    async def test_resend_unexpected_error(self):
        from src.api.v1.public.resend_email import resend_ticket_email, ResendTicketEmailRequest
        db = _mock_db()
        db.execute = AsyncMock(side_effect=RuntimeError("boom"))
        req = ResendTicketEmailRequest(email="t@t.com")
        with pytest.raises(HTTPException) as exc:
            await resend_ticket_email("test", req, db)
        assert exc.value.status_code == 500


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# subscription_service.py Coverage
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestSubscriptionService:

    @pytest.fixture
    def svc(self):
        db = _mock_db()
        with patch("src.services.subscription_service.SubscriptionRepository") as MockSubRepo, \
             patch("src.services.subscription_service.BillingRepository") as MockBillRepo:
            from src.services.subscription_service import SubscriptionService
            s = SubscriptionService(db)
            s.subscription_repo = MockSubRepo.return_value
            s.billing_repo = MockBillRepo.return_value
            return s, db

    async def test_get_subscription_none(self, svc):
        s, _ = svc
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=None)
        result = await s.get_subscription(TENANT_ID)
        assert result is None

    async def test_get_subscription_found(self, svc):
        s, _ = svc
        sub = MagicMock()
        sub.id = uuid4()
        sub.tenant_id = TENANT_ID
        sub.plan.value = "basic"
        sub.status.value = "active"
        sub.max_users = 5
        sub.max_giras_per_month = 10
        sub.current_users = 2
        sub.monthly_price = 99.0
        sub.is_trial = False
        sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=sub)
        result = await s.get_subscription(TENANT_ID)
        assert result is not None
        assert result["plan"] == "basic"

    async def test_upgrade_plan_not_found(self, svc):
        from src.core.errors import NotFoundError
        from src.models import PlanType
        s, _ = svc
        s.subscription_repo.upgrade_plan = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await s.upgrade_plan(TENANT_ID, PlanType.PRO)

    async def test_upgrade_plan_success(self, svc):
        from src.models import PlanType
        s, _ = svc
        sub = MagicMock()
        sub.id = uuid4(); sub.tenant_id = TENANT_ID
        sub.plan.value = "pro"; sub.status.value = "active"
        sub.max_users = 10; sub.max_giras_per_month = 20
        sub.current_users = 3; sub.monthly_price = 199.0
        sub.is_trial = False; sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.upgrade_plan = AsyncMock(return_value=sub)
        s.billing_repo.create_invoice = AsyncMock()
        result = await s.upgrade_plan(TENANT_ID, PlanType.PRO)
        assert result["plan"] == "pro"

    async def test_downgrade_plan_not_found(self, svc):
        from src.core.errors import NotFoundError
        from src.models import PlanType
        s, _ = svc
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await s.downgrade_plan(TENANT_ID, PlanType.BASIC)

    async def test_downgrade_plan_not_lower(self, svc):
        from src.core.errors import InvalidInputError
        from src.models import PlanType
        s, _ = svc
        current = MagicMock()
        current.plan = PlanType.BASIC
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=current)
        with pytest.raises(InvalidInputError, match="inferior"):
            await s.downgrade_plan(TENANT_ID, PlanType.PRO)

    async def test_downgrade_plan_success(self, svc):
        from src.models import PlanType
        s, _ = svc
        current = MagicMock()
        current.plan = PlanType.PRO
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=current)
        sub = MagicMock()
        sub.id = uuid4(); sub.tenant_id = TENANT_ID
        sub.plan.value = "basic"; sub.status.value = "active"
        sub.max_users = 5; sub.max_giras_per_month = 10
        sub.current_users = 1; sub.monthly_price = 49.0
        sub.is_trial = False; sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.upgrade_plan = AsyncMock(return_value=sub)
        result = await s.downgrade_plan(TENANT_ID, PlanType.BASIC)
        assert result["plan"] == "basic"

    async def test_suspend_not_found(self, svc):
        from src.core.errors import NotFoundError
        s, _ = svc
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await s.suspend_subscription(TENANT_ID)

    async def test_suspend_success(self, svc):
        from src.models import SubscriptionStatus
        s, db = svc
        sub = MagicMock()
        sub.id = uuid4(); sub.tenant_id = TENANT_ID
        sub.plan.value = "basic"; sub.status.value = "suspended"
        sub.max_users = 5; sub.max_giras_per_month = 10
        sub.current_users = 0; sub.monthly_price = 99.0
        sub.is_trial = False; sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=sub)
        result = await s.suspend_subscription(TENANT_ID)
        assert sub.status == SubscriptionStatus.SUSPENDED

    async def test_reactivate_not_found(self, svc):
        from src.core.errors import NotFoundError
        s, _ = svc
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await s.reactivate_subscription(TENANT_ID)

    async def test_reactivate_success(self, svc):
        from src.models import SubscriptionStatus
        s, db = svc
        sub = MagicMock()
        sub.id = uuid4(); sub.tenant_id = TENANT_ID
        sub.plan.value = "basic"; sub.status.value = "active"
        sub.max_users = 5; sub.max_giras_per_month = 10
        sub.current_users = 0; sub.monthly_price = 99.0
        sub.is_trial = False; sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=sub)
        result = await s.reactivate_subscription(TENANT_ID)
        assert sub.status == SubscriptionStatus.ACTIVE

    async def test_record_usage_not_found(self, svc):
        from src.core.errors import NotFoundError
        s, _ = svc
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await s.record_usage(TENANT_ID, 5)

    async def test_record_usage_exceeds_limit(self, svc):
        from src.core.errors import InvalidInputError
        s, _ = svc
        sub = MagicMock(); sub.max_users = 5
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=sub)
        with pytest.raises(InvalidInputError, match="excedido"):
            await s.record_usage(TENANT_ID, 10)

    async def test_record_usage_ok(self, svc):
        s, db = svc
        sub = MagicMock()
        sub.max_users = 10
        sub.id = uuid4(); sub.tenant_id = TENANT_ID
        sub.plan.value = "basic"; sub.status.value = "active"
        sub.max_giras_per_month = 10; sub.current_users = 0
        sub.monthly_price = 99.0; sub.is_trial = False
        sub.trial_ends_at = None; sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.subscription_repo.get_by_tenant = AsyncMock(return_value=sub)
        result = await s.record_usage(TENANT_ID, 5)
        assert sub.current_users == 5


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Email providers coverage
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestBrevoEmailService:

    @patch("src.services.email.brevo_provider.settings")
    def test_init_no_api_key(self, mock_settings):
        mock_settings.BREVO_API_KEY = None
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        with pytest.raises(ValueError, match="BREVO_API_KEY"):
            BrevoEmailService()

    @patch("src.services.email.brevo_provider.settings")
    async def test_is_healthy_success(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        svc = BrevoEmailService()
        with patch("src.services.email.brevo_provider.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.is_healthy()
            assert result is True

    @patch("src.services.email.brevo_provider.settings")
    async def test_is_healthy_fail(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        svc = BrevoEmailService()
        with patch("src.services.email.brevo_provider.httpx.AsyncClient") as MockClient:
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.get = AsyncMock(side_effect=Exception("timeout"))
            MockClient.return_value = ctx
            result = await svc.is_healthy()
            assert result is False

    @patch("src.services.email.brevo_provider.settings")
    async def test_send_async_success(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.base import EmailMessage
        svc = BrevoEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>Hi</p>")
        with patch("src.services.email.brevo_provider.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock()
            mock_resp.status_code = 201
            mock_resp.json.return_value = {"messageId": "abc123"}
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is True

    @patch("src.services.email.brevo_provider.settings")
    async def test_send_async_failure(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.base import EmailMessage
        svc = BrevoEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>Hi</p>")
        with patch("src.services.email.brevo_provider.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock()
            mock_resp.status_code = 400
            mock_resp.text = "Bad request"
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is False

    @patch("src.services.email.brevo_provider.settings")
    async def test_send_async_exception(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.base import EmailMessage
        svc = BrevoEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>Hi</p>")
        with patch("src.services.email.brevo_provider.httpx.AsyncClient") as MockClient:
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(side_effect=Exception("network error"))
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is False

    @patch("src.services.email.brevo_provider.settings")
    async def test_send_batch(self, mock_settings):
        mock_settings.BREVO_API_KEY = "test-key"
        mock_settings.BREVO_FROM_EMAIL = "a@b.com"
        mock_settings.BREVO_FROM_NAME = "Test"
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.base import EmailMessage
        svc = BrevoEmailService()
        svc.send_async = AsyncMock(side_effect=[True, False])
        msgs = [
            EmailMessage(to_email="a@a.com", subject="S", html_body="H"),
            EmailMessage(to_email="b@b.com", subject="S", html_body="H"),
        ]
        results = await svc.send_batch(msgs)
        assert results["a@a.com"] is True
        assert results["b@b.com"] is False


class TestResendEmailService:

    @patch("src.services.email.resend_fallback.settings")
    def test_init_no_api_key(self, mock_settings):
        mock_settings.RESEND_API_KEY = None
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        with pytest.raises(ValueError, match="RESEND_API_KEY"):
            ResendEmailService()

    @patch("src.services.email.resend_fallback.settings")
    async def test_is_healthy(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        svc = ResendEmailService()
        with patch("src.services.email.resend_fallback.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock(); mock_resp.status_code = 200
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.is_healthy()
            assert result is True

    @patch("src.services.email.resend_fallback.settings")
    async def test_is_healthy_fail(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        svc = ResendEmailService()
        with patch("src.services.email.resend_fallback.httpx.AsyncClient") as MockClient:
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.get = AsyncMock(side_effect=Exception("timeout"))
            MockClient.return_value = ctx
            result = await svc.is_healthy()
            assert result is False

    @patch("src.services.email.resend_fallback.settings")
    async def test_send_async_success(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.base import EmailMessage
        svc = ResendEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>test</p>")
        with patch("src.services.email.resend_fallback.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"id": "abc123"}
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is True

    @patch("src.services.email.resend_fallback.settings")
    async def test_send_async_failure(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.base import EmailMessage
        svc = ResendEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>test</p>")
        with patch("src.services.email.resend_fallback.httpx.AsyncClient") as MockClient:
            mock_resp = MagicMock()
            mock_resp.status_code = 400
            mock_resp.text = "Bad Request"
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is False

    @patch("src.services.email.resend_fallback.settings")
    async def test_send_async_exception(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.base import EmailMessage
        svc = ResendEmailService()
        msg = EmailMessage(to_email="t@t.com", subject="Test", html_body="<p>test</p>")
        with patch("src.services.email.resend_fallback.httpx.AsyncClient") as MockClient:
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=ctx)
            ctx.__aexit__ = AsyncMock(return_value=False)
            ctx.post = AsyncMock(side_effect=Exception("network"))
            MockClient.return_value = ctx
            result = await svc.send_async(msg)
            assert result is False

    @patch("src.services.email.resend_fallback.settings")
    async def test_send_batch(self, mock_settings):
        mock_settings.RESEND_API_KEY = "test-key"
        mock_settings.RESEND_FROM_EMAIL = "a@b.com"
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.base import EmailMessage
        svc = ResendEmailService()
        svc.send_async = AsyncMock(side_effect=[True, Exception("fail")])
        msgs = [
            EmailMessage(to_email="a@a.com", subject="S", html_body="H"),
            EmailMessage(to_email="b@b.com", subject="S", html_body="H"),
        ]
        results = await svc.send_batch(msgs)
        assert results["a@a.com"] is True
        assert results["b@b.com"] is False


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# ticket_emission.py template
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestTicketEmissionTemplate:

    def test_generate_html(self):
        from src.services.email.templates.ticket_emission import generate_ticket_emission_html
        html = generate_ticket_emission_html(
            ticket_number="0042",
            consulente_name="Joao",
            gira_name="Gira Mensal",
            gira_date="01/01/2024",
            gira_location="Sala Principal",
            rescue_link="http://example.com/rescue",
            tenant_name="Centro Espirita",
            tenant_logo_url="http://example.com/logo.png",
        )
        assert "0042" in html
        assert "Gira Mensal" in html

    def test_generate_html_custom_color(self):
        from src.services.email.templates.ticket_emission import generate_ticket_emission_html
        html = generate_ticket_emission_html(
            ticket_number="0001",
            consulente_name="Maria",
            gira_name="Gira Especial",
            gira_date="15/03/2024",
            gira_location="Templo",
            rescue_link="http://link",
            tenant_name="Centro",
            tenant_logo_url="http://logo",
            tenant_color="#FF0000",
        )
        assert "#FF0000" in html

    def test_generate_plain_text(self):
        from src.services.email.templates.ticket_emission import generate_plain_text_fallback
        text = generate_plain_text_fallback(
            ticket_number="0042",
            consulente_name="Joao",
            gira_name="Gira",
            gira_date="01/01",
            gira_location="Sala",
            rescue_link="http://link",
        )
        assert "0042" in text
        assert "Joao" in text


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# tenant_service.py Coverage
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestTenantServiceExtended:

    @pytest.fixture
    def svc(self):
        db = _mock_db()
        with patch("src.services.tenant_service.TenantRepository") as MockTR, \
             patch("src.services.tenant_service.UserRepository") as MockUR, \
             patch("src.services.tenant_service.SubscriptionRepository") as MockSR:
            from src.services.tenant_service import TenantService
            s = TenantService(db)
            s.tenant_repo = MockTR.return_value
            s.user_repo = MockUR.return_value
            s.subscription_repo = MockSR.return_value
            return s, db

    @patch("src.services.tenant_service.hash_password", return_value="hashed")
    async def test_create_tenant_slug_exists(self, mock_hash, svc):
        from src.core.errors import InvalidInputError
        s, _ = svc
        s.tenant_repo.get_by_slug = AsyncMock(return_value=MagicMock())
        with pytest.raises(InvalidInputError, match="em uso"):
            await s.create_tenant("existing", "Name", "admin@t.com")

    @patch("src.services.tenant_service.hash_password", return_value="hashed")
    async def test_create_tenant_success(self, mock_hash, svc):
        s, db = svc
        s.tenant_repo.get_by_slug = AsyncMock(return_value=None)
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "new"
        tenant.name = "New"
        tenant.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        s.tenant_repo.create = AsyncMock(return_value=tenant)
        sub = MagicMock()
        sub.plan.value = "basic"
        sub.is_trial = False
        sub.max_users = 5
        sub.max_giras_per_month = 10
        s.subscription_repo.create_for_tenant = AsyncMock(return_value=sub)
        result = await s.create_tenant("new", "New", "admin@t.com")
        assert result["slug"] == "new"
        db.add.assert_called()

    async def test_update_tenant_not_found(self, svc):
        s, _ = svc
        s.tenant_repo.update = AsyncMock(return_value=None)
        result = await s.update_tenant(TENANT_ID, name="Updated")
        assert result is None

    async def test_update_tenant_success(self, svc):
        s, db = svc
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "test"
        tenant.name = "Updated"
        tenant.description = "desc"
        tenant.is_active = True
        tenant.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        tenant.updated_at = datetime(2024, 1, 2, tzinfo=timezone.utc)
        s.tenant_repo.update = AsyncMock(return_value=tenant)
        result = await s.update_tenant(TENANT_ID, name="Updated")
        assert result is not None

    async def test_delete_tenant_not_found(self, svc):
        s, _ = svc
        s.tenant_repo.soft_delete = AsyncMock(return_value=None)
        result = await s.delete_tenant(TENANT_ID)
        assert result is False

    async def test_delete_tenant_success(self, svc):
        s, db = svc
        tenant = MagicMock()
        tenant.is_active = True
        s.tenant_repo.soft_delete = AsyncMock(return_value=tenant)
        result = await s.delete_tenant(TENANT_ID)
        assert result is True


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Platform endpoints: extended coverage
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestPlatformUsersExtended:
    """Cover get_user, update_user error paths."""

    async def test_get_user_not_found(self):
        from src.api.v1.platform.users_global import get_platform_user
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await get_platform_user(uuid4(), user, db)
            assert exc.value.status_code == 404

    async def test_get_user_success(self):
        from src.api.v1.platform.users_global import get_platform_user
        db = _mock_db()
        user = _super_admin_user()
        found = MagicMock()
        found.id = uuid4()
        found.email = "a@b.com"
        found.username = "admin"
        found.role.value = "SUPER_ADMIN"
        found.is_active = True
        found.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=found)
            result = await get_platform_user(found.id, user, db)
            assert result.email == "a@b.com"

    async def test_get_user_exception(self):
        from src.api.v1.platform.users_global import get_platform_user
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(side_effect=RuntimeError("db error"))
            with pytest.raises(HTTPException) as exc:
                await get_platform_user(uuid4(), user, db)
            assert exc.value.status_code == 500

    async def test_update_user_empty(self):
        from src.api.v1.platform.users_global import update_platform_user, UpdatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdatePlatformUserRequest()
        with pytest.raises(HTTPException) as exc:
            await update_platform_user(uuid4(), req, user, db)
        assert exc.value.status_code == 400

    async def test_update_user_not_found(self):
        from src.api.v1.platform.users_global import update_platform_user, UpdatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdatePlatformUserRequest(username="new_name")
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await update_platform_user(uuid4(), req, user, db)
            assert exc.value.status_code == 404

    async def test_update_user_success(self):
        from src.api.v1.platform.users_global import update_platform_user, UpdatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdatePlatformUserRequest(username="updated")
        updated = MagicMock()
        updated.id = uuid4()
        updated.email = "a@b.com"
        updated.username = "updated"
        updated.role.value = "SUPER_ADMIN"
        updated.is_active = True
        updated.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=updated)
            result = await update_platform_user(uuid4(), req, user, db)
            assert result.username == "updated"

    async def test_update_user_exception(self):
        from src.api.v1.platform.users_global import update_platform_user, UpdatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdatePlatformUserRequest(username="new")
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await update_platform_user(uuid4(), req, user, db)
            assert exc.value.status_code == 500

    async def test_delete_user_not_found(self):
        from src.api.v1.platform.users_global import delete_platform_user
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.soft_delete = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await delete_platform_user(uuid4(), user, db)
            assert exc.value.status_code == 404

    async def test_delete_user_exception(self):
        from src.api.v1.platform.users_global import delete_platform_user
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.soft_delete = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await delete_platform_user(uuid4(), user, db)
            assert exc.value.status_code == 500

    async def test_list_users_exception(self):
        from src.api.v1.platform.users_global import list_platform_users
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.list_all = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await list_platform_users(0, 100, user, db)
            assert exc.value.status_code == 500

    async def test_create_user_email_exists(self):
        from src.api.v1.platform.users_global import create_platform_user, CreatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = CreatePlatformUserRequest(email="a@b.com", username="test", password="pass")
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.get_by_email = AsyncMock(return_value=MagicMock())
            with pytest.raises(HTTPException) as exc:
                await create_platform_user(req, user, db)
            assert exc.value.status_code == 400

    async def test_create_user_exception(self):
        from src.api.v1.platform.users_global import create_platform_user, CreatePlatformUserRequest
        db = _mock_db()
        user = _super_admin_user()
        req = CreatePlatformUserRequest(email="a@b.com", username="test", password="pass")
        with patch("src.api.v1.platform.users_global.PlatformUserRepository") as MockRepo:
            MockRepo.return_value.get_by_email = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await create_platform_user(req, user, db)
            assert exc.value.status_code == 500


class TestPlatformSubscriptionsExtended:
    """Cover error paths in subscriptions endpoints."""

    async def test_get_subscription_not_found(self):
        from src.api.v1.platform.subscriptions import get_subscription
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.get_subscription = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await get_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 404

    async def test_get_subscription_exception(self):
        from src.api.v1.platform.subscriptions import get_subscription
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.get_subscription = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 500

    async def test_upgrade_not_found(self):
        from src.api.v1.platform.subscriptions import upgrade_subscription, UpgradePlanRequest
        from src.core.errors import NotFoundError
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = UpgradePlanRequest(plan=PlanType.PRO)
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.upgrade_plan = AsyncMock(side_effect=NotFoundError("not found"))
            with pytest.raises(HTTPException) as exc:
                await upgrade_subscription(TENANT_ID, req, user, db)
            assert exc.value.status_code == 404

    async def test_upgrade_exception(self):
        from src.api.v1.platform.subscriptions import upgrade_subscription, UpgradePlanRequest
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = UpgradePlanRequest(plan=PlanType.PRO)
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.upgrade_plan = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await upgrade_subscription(TENANT_ID, req, user, db)
            assert exc.value.status_code == 500

    async def test_downgrade_not_found(self):
        from src.api.v1.platform.subscriptions import downgrade_subscription, UpgradePlanRequest
        from src.core.errors import NotFoundError
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = UpgradePlanRequest(plan=PlanType.BASIC)
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.downgrade_plan = AsyncMock(side_effect=NotFoundError("nf"))
            with pytest.raises(HTTPException) as exc:
                await downgrade_subscription(TENANT_ID, req, user, db)
            assert exc.value.status_code == 404

    async def test_downgrade_exception(self):
        from src.api.v1.platform.subscriptions import downgrade_subscription, UpgradePlanRequest
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = UpgradePlanRequest(plan=PlanType.BASIC)
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.downgrade_plan = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await downgrade_subscription(TENANT_ID, req, user, db)
            assert exc.value.status_code == 500

    async def test_suspend_not_found(self):
        from src.api.v1.platform.subscriptions import suspend_subscription
        from src.core.errors import NotFoundError
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.suspend_subscription = AsyncMock(side_effect=NotFoundError("nf"))
            with pytest.raises(HTTPException) as exc:
                await suspend_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 404

    async def test_suspend_exception(self):
        from src.api.v1.platform.subscriptions import suspend_subscription
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.suspend_subscription = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await suspend_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 500

    async def test_reactivate_not_found(self):
        from src.api.v1.platform.subscriptions import reactivate_subscription
        from src.core.errors import NotFoundError
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.reactivate_subscription = AsyncMock(side_effect=NotFoundError("nf"))
            with pytest.raises(HTTPException) as exc:
                await reactivate_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 404

    async def test_reactivate_exception(self):
        from src.api.v1.platform.subscriptions import reactivate_subscription
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.subscriptions.SubscriptionService") as MockSvc:
            MockSvc.return_value.reactivate_subscription = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await reactivate_subscription(TENANT_ID, user, db)
            assert exc.value.status_code == 500


class TestPlatformFeatureFlagsExtended:

    async def test_get_flag_not_found(self):
        from src.api.v1.platform.feature_flags import get_feature_flag
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.get_by_name = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await get_feature_flag(TENANT_ID, "test", user, db)
            assert exc.value.status_code == 404

    async def test_get_flag_exception(self):
        from src.api.v1.platform.feature_flags import get_feature_flag
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.get_by_name = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_feature_flag(TENANT_ID, "test", user, db)
            assert exc.value.status_code == 500

    async def test_get_flag_success(self):
        from src.api.v1.platform.feature_flags import get_feature_flag
        db = _mock_db()
        user = _super_admin_user()
        flag = MagicMock()
        flag.id = uuid4(); flag.tenant_id = TENANT_ID
        flag.feature = "test"; flag.enabled = True
        flag.expires_at = None; flag.description = "A flag"
        flag.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.get_by_name = AsyncMock(return_value=flag)
            result = await get_feature_flag(TENANT_ID, "test", user, db)
            assert result.feature == "test"

    async def test_list_flags_exception(self):
        from src.api.v1.platform.feature_flags import list_feature_flags
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.list_all_for_tenant = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await list_feature_flags(TENANT_ID, user, db)
            assert exc.value.status_code == 500

    async def test_delete_flag_not_found(self):
        from src.api.v1.platform.feature_flags import delete_feature_flag
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.disable = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await delete_feature_flag(TENANT_ID, "test", user, db)
            assert exc.value.status_code == 404

    async def test_delete_flag_exception(self):
        from src.api.v1.platform.feature_flags import delete_feature_flag
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.disable = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await delete_feature_flag(TENANT_ID, "test", user, db)
            assert exc.value.status_code == 500

    async def test_set_flag_invalid_expires(self):
        from src.api.v1.platform.feature_flags import set_feature_flag, SetFeatureFlagRequest
        db = _mock_db()
        user = _super_admin_user()
        req = SetFeatureFlagRequest(feature="test", enabled=True, expires_at="not-a-date")
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository"):
            with pytest.raises(HTTPException) as exc:
                await set_feature_flag(TENANT_ID, req, user, db)
            assert exc.value.status_code == 400

    async def test_set_flag_exception(self):
        from src.api.v1.platform.feature_flags import set_feature_flag, SetFeatureFlagRequest
        db = _mock_db()
        user = _super_admin_user()
        req = SetFeatureFlagRequest(feature="test", enabled=True)
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.create_or_update = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await set_feature_flag(TENANT_ID, req, user, db)
            assert exc.value.status_code == 500

    async def test_list_enabled_exception(self):
        from src.api.v1.platform.feature_flags import list_enabled_features
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository") as MockRepo:
            MockRepo.return_value.list_enabled = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await list_enabled_features(TENANT_ID, user, db)
            assert exc.value.status_code == 500


class TestConsolidatedAuditExtended:

    def test_parse_datetime_valid(self):
        from src.api.v1.platform.consolidated_audit import _parse_datetime
        dt = _parse_datetime("2024-01-15")
        assert dt.year == 2024

    def test_parse_datetime_with_time(self):
        from src.api.v1.platform.consolidated_audit import _parse_datetime
        dt = _parse_datetime("2024-01-15T10:30:00Z")
        assert dt.hour == 10

    def test_parse_datetime_invalid(self):
        from src.api.v1.platform.consolidated_audit import _parse_datetime
        with pytest.raises(HTTPException) as exc:
            _parse_datetime("invalid-date")
        assert exc.value.status_code == 400

    async def test_get_audit_logs_start_after_end(self):
        from src.api.v1.platform.consolidated_audit import get_audit_logs
        db = _mock_db()
        user = _super_admin_user()
        with pytest.raises(HTTPException) as exc:
            await get_audit_logs("2024-12-31", "2024-01-01", user, db)
        assert exc.value.status_code == 400

    async def test_get_audit_logs_exception(self):
        from src.api.v1.platform.consolidated_audit import get_audit_logs
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.get_audit_summary = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_audit_logs("2024-01-01", "2024-12-31", user, db)
            assert exc.value.status_code == 500

    async def test_get_tenant_audit_exception(self):
        from src.api.v1.platform.consolidated_audit import get_tenant_audit_logs
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.get_tenant_activity = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_tenant_audit_logs(TENANT_ID, "2024-01-01", "2024-12-31", 0, 100, user, db)
            assert exc.value.status_code == 500

    async def test_get_user_audit_exception(self):
        from src.api.v1.platform.consolidated_audit import get_user_audit_logs
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.get_user_activity = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_user_audit_logs(USER_ID, "2024-01-01", "2024-12-31", 0, 100, user, db)
            assert exc.value.status_code == 500

    async def test_get_action_trends_exception(self):
        from src.api.v1.platform.consolidated_audit import get_action_trends
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.get_action_trends = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_action_trends("2024-01-01", "2024-12-31", user, db)
            assert exc.value.status_code == 500

    async def test_get_tenant_trends_exception(self):
        from src.api.v1.platform.consolidated_audit import get_tenant_trends
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.get_tenant_trends = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_tenant_trends("2024-01-01", "2024-12-31", user, db)
            assert exc.value.status_code == 500

    async def test_export_audit_exception(self):
        from src.api.v1.platform.consolidated_audit import export_audit_logs
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService") as MockSvc:
            MockSvc.return_value.export_audit_logs = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await export_audit_logs("2024-01-01", "2024-12-31", "json", user, db)
            assert exc.value.status_code == 500


class TestPlatformTenantsExtended:

    async def test_update_tenant_empty(self):
        from src.api.v1.platform.tenants import update_tenant, UpdateTenantRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdateTenantRequest()
        with pytest.raises(HTTPException) as exc:
            await update_tenant(TENANT_ID, req, user, db)
        assert exc.value.status_code == 400

    async def test_update_tenant_not_found(self):
        from src.api.v1.platform.tenants import update_tenant, UpdateTenantRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdateTenantRequest(name="Updated")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.update_tenant = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await update_tenant(TENANT_ID, req, user, db)
            assert exc.value.status_code == 404

    async def test_update_tenant_exception(self):
        from src.api.v1.platform.tenants import update_tenant, UpdateTenantRequest
        db = _mock_db()
        user = _super_admin_user()
        req = UpdateTenantRequest(name="Updated")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.update_tenant = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await update_tenant(TENANT_ID, req, user, db)
            assert exc.value.status_code == 500

    async def test_delete_tenant_not_found(self):
        from src.api.v1.platform.tenants import delete_tenant, DeleteTenantRequest
        from src.core.errors import NotFoundError
        db = _mock_db()
        user = _super_admin_user()
        req = DeleteTenantRequest(confirm_slug="terreiro-test")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.hard_delete_tenant = AsyncMock(side_effect=NotFoundError("Tenant não encontrado"))
            with pytest.raises(HTTPException) as exc:
                await delete_tenant(TENANT_ID, req, user, db)
            assert exc.value.status_code == 404

    async def test_delete_tenant_exception(self):
        from src.api.v1.platform.tenants import delete_tenant, DeleteTenantRequest
        db = _mock_db()
        user = _super_admin_user()
        req = DeleteTenantRequest(confirm_slug="terreiro-test")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.hard_delete_tenant = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await delete_tenant(TENANT_ID, req, user, db)
            assert exc.value.status_code == 500

    async def test_get_tenant_exception(self):
        from src.api.v1.platform.tenants import get_tenant
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.tenants.TenantRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_tenant(TENANT_ID, user, db)
            assert exc.value.status_code == 500

    async def test_list_tenants_exception(self):
        from src.api.v1.platform.tenants import list_tenants
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.tenants.TenantRepository") as MockRepo:
            MockRepo.return_value.search = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await list_tenants(0, 100, None, user, db)
            assert exc.value.status_code == 500

    async def test_create_tenant_invalid_input(self):
        from src.api.v1.platform.tenants import create_tenant, CreateTenantRequest
        from src.core.errors import InvalidInputError
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = CreateTenantRequest(slug="test", name="Test", email_admin="a@b.com")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.create_tenant = AsyncMock(side_effect=InvalidInputError("slug exists"))
            with pytest.raises(HTTPException) as exc:
                await create_tenant(req, user, db)
            assert exc.value.status_code == 400

    async def test_create_tenant_exception(self):
        from src.api.v1.platform.tenants import create_tenant, CreateTenantRequest
        from src.models import PlanType
        db = _mock_db()
        user = _super_admin_user()
        req = CreateTenantRequest(slug="test", name="Test", email_admin="a@b.com")
        with patch("src.api.v1.platform.tenants.TenantService") as MockSvc:
            MockSvc.return_value.create_tenant = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await create_tenant(req, user, db)
            assert exc.value.status_code == 500


class TestBillingExtended:

    async def test_get_invoice_not_found(self):
        from src.api.v1.platform.billing import get_invoice
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.billing.BillingRepository") as MockRepo:
            MockRepo.return_value.db.get = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc:
                await get_invoice(TENANT_ID, uuid4(), user, db)
            assert exc.value.status_code in (404, 500)

    async def test_get_invoices_exception(self):
        from src.api.v1.platform.billing import get_tenant_invoices
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.billing.BillingRepository") as MockRepo:
            MockRepo.return_value.list_by_tenant = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_tenant_invoices(TENANT_ID, 0, 100, user, db)
            assert exc.value.status_code == 500

    async def test_billing_statistics_exception(self):
        from src.api.v1.platform.billing import get_billing_statistics
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.billing.BillingRepository") as MockRepo:
            MockRepo.return_value.total_revenue = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_billing_statistics(user, db)
            assert exc.value.status_code == 500

    async def test_tenant_billing_stats_exception(self):
        from src.api.v1.platform.billing import get_tenant_billing_statistics
        db = _mock_db()
        user = _super_admin_user()
        with patch("src.api.v1.platform.billing.BillingRepository") as MockRepo:
            MockRepo.return_value.count_paid = AsyncMock(side_effect=RuntimeError("err"))
            with pytest.raises(HTTPException) as exc:
                await get_tenant_billing_statistics(TENANT_ID, user, db)
            assert exc.value.status_code == 500

    async def test_tenant_billing_stats_success(self):
        from src.api.v1.platform.billing import get_tenant_billing_statistics
        db = _mock_db()
        user = _super_admin_user()
        inv1 = MagicMock(); inv1.total_amount = 100.0; inv1.paid_amount = 100.0
        inv2 = MagicMock(); inv2.total_amount = 200.0; inv2.paid_amount = 0.0
        with patch("src.api.v1.platform.billing.BillingRepository") as MockRepo:
            MockRepo.return_value.count_paid = AsyncMock(return_value=1)
            MockRepo.return_value.list_by_tenant = AsyncMock(return_value=[inv1, inv2])
            result = await get_tenant_billing_statistics(TENANT_ID, user, db)
            assert result["total_invoices"] == 2
            assert result["total_billed"] == 300.0
            assert result["outstanding"] == 200.0


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# main.py Coverage + health
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TestMainApp:

    def test_create_app(self):
        with patch("src.main.FastAPI") as MockFastAPI:
            MockFastAPI.return_value = MagicMock()
            from importlib import reload
            import src.main
            reload(src.main)

    @patch("src.api.v1.admin.health.ResendEmailService")
    @patch("src.api.v1.admin.health.BrevoEmailService")
    async def test_health_db_error(self, MockBrevo, MockResend):
        from src.api.v1.admin.health import health_check
        MockBrevo.side_effect = Exception("no key")
        MockResend.side_effect = Exception("no key")
        db = _mock_db()
        db.execute = AsyncMock(side_effect=Exception("db down"))
        user = MagicMock()
        user.is_admin = True
        result = await health_check(user, db)
        assert result.database.status == "error"
        assert result.overall_status == "error"

    @patch("src.api.v1.admin.health.ResendEmailService")
    @patch("src.api.v1.admin.health.BrevoEmailService")
    async def test_health_ok(self, MockBrevo, MockResend):
        from src.api.v1.admin.health import health_check
        brevo = MagicMock()
        brevo.api_key = "key"
        MockBrevo.return_value = brevo
        resend = MagicMock()
        resend.api_key = "key"
        MockResend.return_value = resend
        db = _mock_db()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        db.execute.return_value = mock_result
        user = MagicMock()
        user.is_admin = True
        result = await health_check(user, db)
        assert result.database.status == "ok"
        assert result.overall_status == "ok"

    @patch("src.api.v1.admin.health.ResendEmailService")
    @patch("src.api.v1.admin.health.BrevoEmailService")
    async def test_health_not_admin(self, MockBrevo, MockResend):
        from src.api.v1.admin.health import health_check
        from src.core.errors import InsufficientPermissionsError
        user = MagicMock()
        user.is_admin = False
        user.is_operator_or_admin = False
        db = _mock_db()
        with pytest.raises(InsufficientPermissionsError):
            await health_check(user, db)

    @patch("src.api.v1.admin.health.ResendEmailService")
    @patch("src.api.v1.admin.health.BrevoEmailService")
    async def test_health_degraded(self, MockBrevo, MockResend):
        from src.api.v1.admin.health import health_check
        brevo = MagicMock()
        brevo.api_key = "key"
        MockBrevo.return_value = brevo
        MockResend.side_effect = Exception("no resend")
        db = _mock_db()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        db.execute.return_value = mock_result
        user = MagicMock()
        user.is_admin = True
        result = await health_check(user, db)
        assert result.overall_status == "degraded"

