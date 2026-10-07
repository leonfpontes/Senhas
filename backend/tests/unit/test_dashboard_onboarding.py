"""Checklist de primeiros passos no dashboard-summary (_get_onboarding_status).

A sessão é mockada; o teste compila a consulta para o dialeto Postgres para garantir
filtro por tenant_id, exclusão de soft-deleted e o critério de cada passo. Trilhas por dor
(checklist que segue a resposta do cadastro): passos e flags de "feito" de cada trilha.
A suíte `tests/integration_pg/test_onboarding_checklist_pg.py` confere o mesmo no Postgres real.
"""
import asyncio
import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.dialects import postgresql

import src.api.v1.admin.dashboard_summary as ds

TENANT = uuid.UUID("11111111-1111-1111-1111-111111111111")

SINAIS_VAZIOS = {
    "has_gira": False,
    "public_tickets": 0,
    "door_used": False,
    "slug": "t",
    "custom_settings": None,
    "senhas_configuradas": False,
    "tem_medium": False,
    "mensalidade_configurada": False,
    "mensalidade_paga": False,
    "tem_lancamento": False,
    "site_publicado": False,
    "site_salvo": False,
    "tem_grupo": False,
    "tem_movimentacao": False,
    "tem_item": False,
}


class _Row:
    def __init__(self, mapping):
        self._mapping = mapping


def _run(**sinais):
    captured = {}
    row = _Row({**SINAIS_VAZIOS, **sinais})

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


def _dor(dor):
    return {"custom_settings": {"principal_dor": dor}}


def _steps(status):
    return [(s.key, s.done) for s in status.steps]


class TestOnboardingQuery:
    def test_every_subquery_is_scoped_to_tenant_and_ignores_soft_deleted(self):
        _, sql = _run()
        tid = str(TENANT)
        # has_gira + senhas configuradas
        assert sql.count(f"giras.tenant_id = '{tid}'") == 2
        assert sql.count(f"tickets.tenant_id = '{tid}'") == 2
        assert sql.count(f"tenants.id = '{tid}'") == 1
        assert sql.count(f"tenant_configs.tenant_id = '{tid}'") == 1
        for tabela in (
            "mediuns",
            "mensalidade_configs",
            "mensalidade_pagamentos",
            "contas_financeiras",
            "tenant_sites",
            "site_versions",
            "estoque_grupos",
            "estoque_itens",
            "estoque_movimentacoes",
        ):
            assert sql.count(f"{tabela}.tenant_id = '{tid}'") == 1, tabela
        for tabela in (
            "tenant_configs",
            "mediuns",
            "mensalidade_configs",
            "mensalidade_pagamentos",
            "contas_financeiras",
            "tenant_sites",
            "estoque_grupos",
            "estoque_itens",
            "estoque_movimentacoes",
        ):
            assert f"{tabela}.deleted_at IS NULL" in sql, tabela
        assert sql.count("giras.deleted_at IS NULL") == 2
        assert sql.count("tickets.deleted_at IS NULL") == 2

    def test_public_tickets_counts_only_self_service_emission(self):
        _, sql = _run()
        assert "tickets.emitido_por_id IS NULL" in sql

    def test_door_used_is_checkin_or_called(self):
        _, sql = _run()
        assert "tickets.checkin_em IS NOT NULL OR tickets.chamado_em IS NOT NULL" in sql

    def test_step_conditions(self):
        _, sql = _run()
        assert "giras.max_tickets > 0" in sql
        assert "mensalidade_configs.valor_mensal > 0" in sql
        assert "mensalidade_pagamentos.status = 'PAGO'" in sql
        # Lançamento manual: o espelho automático das mensalidades não conta.
        assert "contas_financeiras.external_ref IS NULL OR contas_financeiras.external_ref NOT LIKE 'mensalidade:%" in sql
        assert "tenant_sites.status = 'PUBLISHED'" in sql

    def test_single_round_trip(self):
        calls = []

        class _Result:
            def one(self):
                return _Row(SINAIS_VAZIOS)

        async def fake_execute(stmt):
            calls.append(stmt)
            return _Result()

        db = MagicMock()
        db.execute = fake_execute
        asyncio.run(ds._get_onboarding_status(db, TENANT))
        assert len(calls) == 1


class TestOnboardingStatus:
    def test_new_tenant_keeps_the_classic_gira_checklist(self):
        status, _ = _run(slug="casa-nova")
        dumped = status.model_dump()
        assert dumped == {
            "has_gira": False,
            "public_tickets": 0,
            "door_used": False,
            "public_link": "https://girahub.com.br/public/casa-nova/senha",
            "principal_dor": None,
            "trilha": "gira",
            "steps": [
                {"key": "gira", "done": False},
                {"key": "share", "done": False},
                {"key": "tickets", "done": False},
                {"key": "porta", "done": False},
            ],
            "completed": False,
        }

    def test_completed_requires_all_three_signals_on_gira_trilha(self):
        assert _run(has_gira=True, public_tickets=5, door_used=True)[0].completed is True
        assert _run(has_gira=True, public_tickets=5, door_used=False)[0].completed is False
        assert _run(has_gira=True, public_tickets=0, door_used=True)[0].completed is False
        assert _run(has_gira=False, public_tickets=5, door_used=True)[0].completed is False

    def test_null_count_and_missing_slug(self):
        status, _ = _run(has_gira=None, public_tickets=None, door_used=None, slug=None)
        assert status.public_tickets == 0
        assert status.has_gira is False
        assert status.public_link is None

    def test_principal_dor_read_from_custom_settings(self):
        status, _ = _run(custom_settings={"como_conheceu": "google", "principal_dor": "financeiro"})
        assert status.principal_dor == "financeiro"
        assert status.trilha == "financeiro"

    def test_principal_dor_ignores_unknown_or_missing(self):
        assert _run(custom_settings={"principal_dor": "hackeado"})[0].trilha == "gira"
        assert _run(custom_settings={"como_conheceu": "google"})[0].principal_dor is None
        assert _run()[0].principal_dor is None

    def test_response_model_exposes_onboarding_with_completed(self):
        resp = ds.DashboardSummaryResponse()
        dumped = resp.model_dump()["onboarding"]
        assert dumped["completed"] is False
        assert dumped["trilha"] == "gira"


class TestTrilhasPorDor:
    @pytest.mark.parametrize(
        "dor,trilha,passos",
        [
            (None, "gira", ["gira", "share", "tickets", "porta"]),
            ("outro", "gira", ["gira", "share", "tickets", "porta"]),
            ("senhas", "senhas", ["gira", "senhas", "share", "tickets"]),
            ("mediuns", "mediuns", ["medium", "mensalidade", "gira"]),
            ("financeiro", "financeiro", ["mensalidade", "pagamento", "lancamento", "gira"]),
            ("divulgacao", "site", ["site", "publicar", "gira"]),
            ("estoque", "estoque", ["grupo", "item", "movimentacao", "gira"]),
        ],
    )
    def test_steps_per_dor(self, dor, trilha, passos):
        status, _ = _run(**(_dor(dor) if dor else {}))
        assert status.trilha == trilha
        assert [s.key for s in status.steps] == passos
        assert not any(s.done for s in status.steps)
        assert status.completed is False

    def test_every_dor_has_a_trilha_and_every_trilha_ends_reachable(self):
        from src.core.onboarding import PRINCIPAL_DOR_VALUES

        assert set(ds.TRILHA_POR_DOR) == set(PRINCIPAL_DOR_VALUES)
        for trilha, passos in ds.TRILHA_PASSOS.items():
            assert 3 <= len(passos) <= 5, trilha
            assert "gira" in passos, f"a trilha {trilha} precisa levar à primeira gira"

    def test_senhas_done_flags(self):
        status, _ = _run(**_dor("senhas"), has_gira=True, senhas_configuradas=True, public_tickets=2)
        assert _steps(status) == [("gira", True), ("senhas", True), ("share", True), ("tickets", True)]
        assert status.completed is True

    def test_mediuns_done_flags(self):
        status, _ = _run(**_dor("mediuns"), tem_medium=True)
        assert _steps(status) == [("medium", True), ("mensalidade", False), ("gira", False)]
        status, _ = _run(**_dor("mediuns"), tem_medium=True, mensalidade_configurada=True, has_gira=True)
        assert status.completed is True

    def test_financeiro_done_flags(self):
        status, _ = _run(**_dor("financeiro"), mensalidade_configurada=True, mensalidade_paga=True)
        assert _steps(status) == [("mensalidade", True), ("pagamento", True), ("lancamento", False), ("gira", False)]

    def test_site_saved_or_published_counts_as_configured(self):
        status, _ = _run(**_dor("divulgacao"), site_salvo=True)
        assert _steps(status)[:2] == [("site", True), ("publicar", False)]
        status, _ = _run(**_dor("divulgacao"), site_publicado=True)
        assert _steps(status)[:2] == [("site", True), ("publicar", True)]

    def test_estoque_done_flags(self):
        status, _ = _run(**_dor("estoque"), tem_grupo=True, tem_item=True, tem_movimentacao=True, has_gira=True)
        assert _steps(status) == [("grupo", True), ("item", True), ("movimentacao", True), ("gira", True)]
        assert status.completed is True

    def test_gira_trilha_signals_do_not_leak_into_module_trilhas(self):
        # Porta usada e senhas pelo link não completam a trilha de estoque.
        status, _ = _run(**_dor("estoque"), door_used=True, public_tickets=50)
        assert status.completed is False
