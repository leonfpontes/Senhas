"""Checklist "primeira gira" no dashboard-summary (_get_onboarding_status).

O projeto ainda não tem testes com Postgres real (Q-01), então a sessão é
mockada; o teste compila a consulta para o dialeto Postgres para garantir
filtro por tenant_id, exclusão de soft-deleted e o critério de cada passo.
"""
import asyncio
import uuid
from unittest.mock import MagicMock, patch

from sqlalchemy.dialects import postgresql

import src.api.v1.admin.dashboard_summary as ds

TENANT = uuid.UUID("11111111-1111-1111-1111-111111111111")


def _run(row):
    captured = {}

    class _Result:
        def one(self):
            return row

    async def fake_execute(stmt):
        captured["sql"] = str(
            stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
        )
        return _Result()

    db = MagicMock()
    db.execute = fake_execute
    with patch.object(ds.settings, "FRONTEND_URL", "https://girahub.com.br/"):
        status = asyncio.run(ds._get_onboarding_status(db, TENANT))
    return status, captured["sql"]


class TestOnboardingQuery:
    def test_every_subquery_is_scoped_to_tenant_and_ignores_soft_deleted(self):
        _, sql = _run((False, 0, False, "t", None))
        tid = str(TENANT)
        assert sql.count(f"giras.tenant_id = '{tid}'") == 1
        assert sql.count(f"tickets.tenant_id = '{tid}'") == 2
        assert sql.count(f"tenants.id = '{tid}'") == 1
        assert sql.count(f"tenant_configs.tenant_id = '{tid}'") == 1
        assert "tenant_configs.deleted_at IS NULL" in sql
        assert "giras.deleted_at IS NULL" in sql
        assert sql.count("tickets.deleted_at IS NULL") == 2

    def test_public_tickets_counts_only_self_service_emission(self):
        _, sql = _run((False, 0, False, "t", None))
        assert "tickets.emitido_por_id IS NULL" in sql

    def test_door_used_is_checkin_or_called(self):
        _, sql = _run((False, 0, False, "t", None))
        assert "tickets.checkin_em IS NOT NULL OR tickets.chamado_em IS NOT NULL" in sql

    def test_single_round_trip(self):
        calls = []

        class _Result:
            def one(self):
                return (True, 1, True, "t", None)

        async def fake_execute(stmt):
            calls.append(stmt)
            return _Result()

        db = MagicMock()
        db.execute = fake_execute
        asyncio.run(ds._get_onboarding_status(db, TENANT))
        assert len(calls) == 1


class TestOnboardingStatus:
    def test_new_tenant(self):
        status, _ = _run((False, 0, False, "casa-nova", None))
        dumped = status.model_dump()
        assert dumped == {
            "has_gira": False,
            "public_tickets": 0,
            "door_used": False,
            "public_link": "https://girahub.com.br/public/casa-nova/senha",
            "principal_dor": None,
            "completed": False,
        }

    def test_completed_requires_all_three_signals(self):
        assert _run((True, 5, True, "t", None))[0].completed is True
        assert _run((True, 5, False, "t", None))[0].completed is False
        assert _run((True, 0, True, "t", None))[0].completed is False
        assert _run((False, 5, True, "t", None))[0].completed is False

    def test_null_count_and_missing_slug(self):
        status, _ = _run((None, None, None, None, None))
        assert status.public_tickets == 0
        assert status.has_gira is False
        assert status.public_link is None

    def test_principal_dor_read_from_custom_settings(self):
        status, _ = _run((False, 0, False, "t", {"como_conheceu": "google", "principal_dor": "financeiro"}))
        assert status.principal_dor == "financeiro"

    def test_principal_dor_ignores_unknown_or_missing(self):
        assert _run((False, 0, False, "t", {"principal_dor": "hackeado"}))[0].principal_dor is None
        assert _run((False, 0, False, "t", {"como_conheceu": "google"}))[0].principal_dor is None
        assert _run((False, 0, False, "t", None))[0].principal_dor is None

    def test_response_model_exposes_onboarding_with_completed(self):
        resp = ds.DashboardSummaryResponse()
        assert resp.model_dump()["onboarding"]["completed"] is False
