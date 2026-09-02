"""Tests for the acompanhantes-per-gira feature.

Covers:
- giras_crud._validate_acompanhantes_config (create/update gating)
- emit_ticket: request validation and the per-gira opt-in checks (STEP 2c)
- cancel_ticket: cascade cancellation of acompanhante tickets + slot returns
- email templates: acompanhantes block (HTML + plain text)
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.models.tickets import TicketStatus
from tests.conftest import TENANT_ID, GIRA_ID


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    """Disable slowapi enforcement — the public endpoints are @limiter.limit-decorated."""
    from src.core.limiter import limiter
    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _mock_result_scalars(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(items)
    return result


def _mock_db(*results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_tenant():
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.slug = "terreiro-test"
    tenant.name = "Terreiro Test"
    return tenant


def _mock_gira(allow_acompanhantes=True, max_acompanhantes=3, starts_in_hours=2.0):
    gira = MagicMock()
    gira.id = GIRA_ID
    gira.tenant_id = TENANT_ID
    gira.nome = "Gira de Caboclos"
    gira.data_inicio = datetime.now(timezone.utc) + timedelta(hours=starts_in_hours)
    gira.recados = None
    gira.allow_acompanhantes = allow_acompanhantes
    gira.max_acompanhantes = max_acompanhantes
    gira.use_time_slots = False
    return gira


def _mock_ticket(status=TicketStatus.EMITTED, is_acompanhante=False, numero=42, time_slot_id=None):
    t = MagicMock()
    t.id = uuid4()
    t.tenant_id = TENANT_ID
    t.gira_id = GIRA_ID
    t.numero = numero
    t.status = status
    t.promoted_at = None
    t.time_slot_id = time_slot_id
    t.is_sponsor = False
    t.is_acompanhante = is_acompanhante
    t.consulente = MagicMock(nome="Maria Silva", email="maria@example.com")
    return t


def _mock_tenant_config():
    tc = MagicMock()
    tc.primary_color = "#2E7D32"
    tc.secondary_color = "#1B5E20"
    tc.logo_data = None
    tc.logo_url = ""
    return tc


# ── giras_crud: config validation ────────────────────────────────────────────

class TestValidateAcompanhantesConfig:
    def test_disabled_ignores_max(self):
        from src.api.v1.admin.giras_crud import _validate_acompanhantes_config
        _validate_acompanhantes_config(False, None)  # não levanta

    def test_enabled_requires_max(self):
        from src.api.v1.admin.giras_crud import _validate_acompanhantes_config
        with pytest.raises(HTTPException) as exc:
            _validate_acompanhantes_config(True, None)
        assert exc.value.status_code == 400

    def test_enabled_rejects_zero(self):
        from src.api.v1.admin.giras_crud import _validate_acompanhantes_config
        with pytest.raises(HTTPException) as exc:
            _validate_acompanhantes_config(True, 0)
        assert exc.value.status_code == 400

    def test_enabled_rejects_above_20(self):
        from src.api.v1.admin.giras_crud import _validate_acompanhantes_config
        with pytest.raises(HTTPException) as exc:
            _validate_acompanhantes_config(True, 21)
        assert exc.value.status_code == 400

    def test_enabled_valid(self):
        from src.api.v1.admin.giras_crud import _validate_acompanhantes_config
        _validate_acompanhantes_config(True, 3)  # não levanta


# ── giras_crud: senha config endpoint ────────────────────────────────────────

class TestSenhaConfigAcompanhantes:
    def _config(self, **overrides):
        from src.api.v1.admin.giras_crud import SenhaConfigRequest
        now = datetime.now(timezone.utc)
        data = {
            "max_tickets": 100,
            "release_start_at": now,
            "release_end_at": now + timedelta(hours=4),
        }
        data.update(overrides)
        return SenhaConfigRequest(**data)

    def _admin_user(self):
        user = MagicMock()
        user.id = uuid4()
        user.tenant_id = TENANT_ID
        user.is_operator_or_admin = True
        return user

    @patch("src.services.waitlist_service.waitlist_enabled_for_tenant", new_callable=AsyncMock)
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_enabled_without_max_rejects_before_saving(
        self, MockRepo, MockAudit, mock_waitlist
    ):
        from src.api.v1.admin.giras_crud import update_senha_config

        config = self._config(allow_acompanhantes=True, max_acompanhantes=None)
        with pytest.raises(HTTPException) as exc:
            await update_senha_config(config, GIRA_ID, self._admin_user(), AsyncMock())
        assert exc.value.status_code == 400
        MockRepo.return_value.update.assert_not_called()

    @patch("src.services.waitlist_service.waitlist_enabled_for_tenant", new_callable=AsyncMock)
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_persists_acompanhantes_config(self, MockRepo, MockAudit, mock_waitlist):
        from src.api.v1.admin.giras_crud import update_senha_config

        mock_waitlist.return_value = False
        repo_inst = MockRepo.return_value
        repo_inst.get_by_id = AsyncMock(return_value=_mock_gira())
        repo_inst.update = AsyncMock()
        MockAudit.return_value.log_update = AsyncMock()
        # SenhaControl regular + 2x _get_senha_count
        db = _mock_db(
            _mock_result_scalar(None), _mock_result_scalar(None), _mock_result_scalar(None)
        )

        config = self._config(allow_acompanhantes=True, max_acompanhantes=2)
        response = await update_senha_config(config, GIRA_ID, self._admin_user(), db)

        update_kwargs = repo_inst.update.call_args.kwargs
        assert update_kwargs["allow_acompanhantes"] is True
        assert update_kwargs["max_acompanhantes"] == 2
        assert response.allow_acompanhantes is True
        assert response.max_acompanhantes == 2

    @patch("src.services.waitlist_service.waitlist_enabled_for_tenant", new_callable=AsyncMock)
    @patch("src.api.v1.admin.giras_crud.AuditService")
    @patch("src.api.v1.admin.giras_crud.GiraRepository")
    async def test_disabled_clears_max(self, MockRepo, MockAudit, mock_waitlist):
        from src.api.v1.admin.giras_crud import update_senha_config

        mock_waitlist.return_value = False
        repo_inst = MockRepo.return_value
        repo_inst.get_by_id = AsyncMock(return_value=_mock_gira())
        repo_inst.update = AsyncMock()
        MockAudit.return_value.log_update = AsyncMock()
        db = _mock_db(
            _mock_result_scalar(None), _mock_result_scalar(None), _mock_result_scalar(None)
        )

        config = self._config(allow_acompanhantes=False, max_acompanhantes=5)
        response = await update_senha_config(config, GIRA_ID, self._admin_user(), db)

        update_kwargs = repo_inst.update.call_args.kwargs
        assert update_kwargs["allow_acompanhantes"] is False
        assert update_kwargs["max_acompanhantes"] is None
        assert response.max_acompanhantes is None


# ── emit_ticket: request validation ──────────────────────────────────────────

class TestEmitRequestAcompanhantes:
    def _body(self, **overrides):
        from src.api.v1.public.emit_ticket import EmitTicketRequest
        data = {"name": "Maria Silva", "email": "maria@example.com"}
        data.update(overrides)
        return EmitTicketRequest(**data)

    def test_default_empty(self):
        assert self._body().acompanhantes == []

    def test_names_are_trimmed(self):
        body = self._body(acompanhantes=["  João  ", "Ana Souza"])
        assert body.acompanhantes == ["João", "Ana Souza"]

    def test_rejects_blank_name(self):
        with pytest.raises(ValidationError):
            self._body(acompanhantes=["João", "  "])

    def test_rejects_single_char_name(self):
        with pytest.raises(ValidationError):
            self._body(acompanhantes=["J"])

    def test_rejects_more_than_20(self):
        with pytest.raises(ValidationError):
            self._body(acompanhantes=[f"Pessoa {i:02d}" for i in range(21)])


class TestValidationErrorSerialization:
    def test_field_validator_error_returns_422_not_500(self):
        """Regressão: field_validators que levantam ValueError põem o próprio
        objeto da exceção em exc.errors()[..]["ctx"]; o handler global de
        RequestValidationError precisa serializá-lo (jsonable_encoder) em vez
        de estourar 500 no json.dumps."""
        from fastapi.testclient import TestClient
        from src.main import create_app

        # base_url localhost: o TrustedHostMiddleware rejeita o host padrão
        # "testserver" do TestClient com 400 antes de chegar na validação.
        client = TestClient(create_app(), raise_server_exceptions=False, base_url="http://localhost")
        response = client.post(
            "/api/v1/public/emit-ticket?tenant_slug=qualquer",
            json={"name": "Maria Silva", "email": "maria@example.com", "acompanhantes": ["  "]},
        )
        assert response.status_code == 422
        data = response.json()
        assert data["error_code"] == "VALIDATION_ERROR"
        assert "acompanhante" in str(data["details"])


# ── emit_ticket: per-gira opt-in (STEP 2c) ───────────────────────────────────

class TestEmitAcompanhantesGating:
    async def _emit(self, gira, acompanhantes):
        from src.api.v1.public.emit_ticket import EmitTicketRequest, emit_ticket

        db = _mock_db(
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalar(gira),
        )
        body = EmitTicketRequest(
            name="Maria Silva", email="maria@example.com", acompanhantes=acompanhantes
        )
        return await emit_ticket(
            MagicMock(), "terreiro-test", tipo="regular", body=body, session=db, gira_id=GIRA_ID
        )

    async def test_gira_without_feature_rejects(self):
        gira = _mock_gira(allow_acompanhantes=False, max_acompanhantes=None)
        with pytest.raises(HTTPException) as exc:
            await self._emit(gira, ["João Santos"])
        assert exc.value.status_code == 400
        assert "não permite acompanhantes" in exc.value.detail

    async def test_above_gira_max_rejects(self):
        gira = _mock_gira(allow_acompanhantes=True, max_acompanhantes=2)
        with pytest.raises(HTTPException) as exc:
            await self._emit(gira, ["João Santos", "Ana Souza", "Pedro Lima"])
        assert exc.value.status_code == 400
        assert "no máximo 2" in exc.value.detail


# ── cancel_ticket: cascade for acompanhantes ─────────────────────────────────

class TestCancelCascade:
    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_titular_cancel_cascades_and_returns_all_slots(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        titular = _mock_ticket(is_acompanhante=False)
        acomp1 = _mock_ticket(is_acompanhante=True, numero=43)
        acomp2 = _mock_ticket(is_acompanhante=True, numero=44)
        db = _mock_db(
            _mock_result_scalar(titular),
            _mock_result_scalar(_mock_gira()),
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalars([acomp1, acomp2]),   # _load_active_acompanhantes
            _mock_result_scalar(_mock_tenant_config()),
        )
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        result = await cancel_ticket(MagicMock(), str(titular.id), db)

        assert titular.status == TicketStatus.CANCELLED
        assert acomp1.status == TicketStatus.CANCELLED
        assert acomp2.status == TicketStatus.CANCELLED
        # 1 vaga do titular + 2 dos acompanhantes
        assert MockSenhaRepo.return_value.increment_slots_returned.await_count == 3
        assert "2 senha(s) de acompanhante" in result.message
        db.commit.assert_awaited_once()

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_cascade_reports_group_size_to_waitlist(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        titular = _mock_ticket(is_acompanhante=False)
        acomp = _mock_ticket(is_acompanhante=True, numero=43)
        db = _mock_db(
            _mock_result_scalar(titular),
            _mock_result_scalar(_mock_gira()),
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalars([acomp]),
            _mock_result_scalar(_mock_tenant_config()),
        )
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=True)
        mock_waitlist.reconcile_and_fill = AsyncMock(return_value=([], 2))
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(titular.id), db)

        assert mock_waitlist.reconcile_and_fill.call_args.kwargs["extra_slots"] == 2
        # Ninguém na fila pôde assumir — as duas vagas voltam ao pool
        assert MockSenhaRepo.return_value.increment_slots_returned.await_count == 2

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_cascade_returns_time_slots_of_each_ticket(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        slot_id = uuid4()
        titular = _mock_ticket(is_acompanhante=False, time_slot_id=slot_id)
        acomp = _mock_ticket(is_acompanhante=True, numero=43, time_slot_id=slot_id)
        db = _mock_db(
            _mock_result_scalar(titular),
            _mock_result_scalar(_mock_gira()),
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalars([acomp]),
            _mock_result_scalar(_mock_tenant_config()),
        )
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockSlotRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(titular.id), db)

        # Uma devolução de horário por senha (titular + acompanhante)
        assert MockSlotRepo.return_value.increment_slots_returned.await_count == 2

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_acompanhante_ticket_cancels_alone(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        acomp = _mock_ticket(is_acompanhante=True, numero=43)
        db = _mock_db(
            _mock_result_scalar(acomp),
            _mock_result_scalar(_mock_gira()),
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalar(_mock_tenant_config()),
        )
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        result = await cancel_ticket(MagicMock(), str(acomp.id), db)

        assert acomp.status == TicketStatus.CANCELLED
        MockSenhaRepo.return_value.increment_slots_returned.assert_awaited_once()
        assert "acompanhante" not in result.message

    async def test_cancel_info_lists_acompanhantes(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        titular = _mock_ticket(is_acompanhante=False)
        acomp = _mock_ticket(is_acompanhante=True, numero=43)
        acomp.consulente = MagicMock(nome="João Santos")
        db = _mock_db(
            _mock_result_scalar(titular),
            _mock_result_scalar(_mock_gira()),
            _mock_result_scalar(_mock_tenant()),
            _mock_result_scalars([acomp]),
        )

        info = await get_cancel_info(MagicMock(), str(titular.id), db)

        assert info.cancellable is True
        assert [(a.ticket_number, a.name) for a in info.acompanhantes] == [("0043", "João Santos")]


# ── email templates ──────────────────────────────────────────────────────────

class TestEmailAcompanhantes:
    def test_html_block_lists_names_and_numbers(self):
        from src.services.email.templates.ticket_emission import generate_ticket_emission_html

        html = generate_ticket_emission_html(
            ticket_number="0042",
            consulente_name="Maria Silva",
            gira_name="Gira de Caboclos",
            gira_date="10/09/2026 às 20:00",
            gira_location="",
            rescue_link="https://example.com/rescue",
            tenant_name="Terreiro Test",
            tenant_logo_url="",
            acompanhantes=[("João <b>Santos</b>", "0043"), ("Ana Souza", "0044")],
        )
        assert "Senhas dos Acompanhantes" in html
        assert "0043" in html and "0044" in html
        assert "João &lt;b&gt;Santos&lt;/b&gt;" in html  # nomes são escapados

    def test_html_block_absent_without_acompanhantes(self):
        from src.services.email.templates.ticket_emission import generate_ticket_emission_html

        html = generate_ticket_emission_html(
            ticket_number="0042",
            consulente_name="Maria Silva",
            gira_name="Gira de Caboclos",
            gira_date="10/09/2026 às 20:00",
            gira_location="",
            rescue_link="https://example.com/rescue",
            tenant_name="Terreiro Test",
            tenant_logo_url="",
        )
        assert "Senhas dos Acompanhantes" not in html

    def test_plain_text_lists_acompanhantes(self):
        from src.services.email.templates.ticket_emission import generate_plain_text_fallback

        text = generate_plain_text_fallback(
            ticket_number="0042",
            consulente_name="Maria Silva",
            gira_name="Gira de Caboclos",
            gira_date="10/09/2026 às 20:00",
            gira_location="",
            rescue_link="https://example.com/rescue",
            acompanhantes=[("João Santos", "0043")],
        )
        assert "Senhas dos Acompanhantes:" in text
        assert "- 0043: João Santos" in text
