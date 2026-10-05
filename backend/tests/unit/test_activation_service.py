"""Painel de ativação do Observatório (services/activation_service.py)."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy.dialects import postgresql

import src.services.activation_service as act
from src.models.subscriptions import PlanType

NOW = datetime(2026, 10, 5, 18, 0, tzinfo=timezone.utc)


class TestClassifyStage:
    @pytest.mark.parametrize(
        "giras,cfg,public,door,expected",
        [
            (0, 0, 0, False, "sem_gira"),
            (2, 0, 0, False, "sem_senhas"),
            (2, 1, 0, False, "aguardando_senha"),
            (1, 1, 4, False, "recebendo"),
            (1, 1, 4, True, "usou_porta"),
            (1, 1, 20, False, "ativado"),
            (1, 1, 200, True, "ativado"),
        ],
    )
    def test_stages(self, giras, cfg, public, door, expected):
        assert act.classify_stage(giras, cfg, public, door) == expected

    def test_stage_order_is_declared(self):
        assert act.STAGES[0] == "sem_gira" and act.STAGES[-1] == "ativado"


def _row(**kw):
    base = dict(
        id=uuid.uuid4(), name="Casa", slug="casa", created_at=NOW - timedelta(days=3), is_active=True,
        self_deactivated_at=None, plan=PlanType.PREMIUM, is_trial=True, trial_ends_at=NOW + timedelta(days=27, hours=1),
        stripe_sub=None, giras=1, cfg=1, next_gira=NOW + timedelta(days=2), public=0, door=False,
        last_sess=NOW - timedelta(days=1), last_act=NOW - timedelta(hours=2), settings=None,
    )
    base.update(kw)
    return tuple(base[k] for k in (
        "id", "name", "slug", "created_at", "is_active", "self_deactivated_at", "plan", "is_trial",
        "trial_ends_at", "stripe_sub", "giras", "cfg", "next_gira", "public", "door", "last_sess", "last_act",
        "settings",
    ))


def _db(rows, users):
    calls = []

    async def execute(stmt):
        calls.append(stmt)
        data = rows if len(calls) == 1 else users
        return SimpleNamespace(all=lambda: data)

    db = MagicMock()
    db.execute = execute
    return db, calls


class TestGetActivation:
    async def test_maps_row_contact_trial_and_summary(self):
        tid = uuid.uuid4()
        row = _row(
            id=tid,
            settings={"principal_dor": "mediuns", "onboarding_emails": {"d1": "2026-10-04T13:00:00+00:00", "x": "y"}},
        )
        users = [
            (tid, "Maria Fundadora", "maria", "maria@example.com", "11999998888"),
            (tid, "Segundo Admin", "seg", "seg@example.com", None),  # mais novo: ignorado
        ]
        db, calls = _db([row], users)
        out = await act.get_activation(db, NOW)
        assert out["total"] == 1 and out["window_days"] == 60
        assert out["by_stage"]["aguardando_senha"] == 1
        t = out["tenants"][0]
        assert t["stage"] == "aguardando_senha"
        assert t["days_since_signup"] == 3
        assert t["trial_days_left"] == 27
        assert t["principal_dor"] == "mediuns"
        assert t["onboarding_emails"] == {"d1": "2026-10-04T13:00:00+00:00"}
        assert t["contact"] == {"name": "Maria Fundadora", "email": "maria@example.com", "phone": "11999998888"}
        assert t["days_since_activity"] == 0  # última ação há 2h
        assert t["plan"] == "premium" and t["paying"] is False and t["inactive"] is False
        assert len(calls) == 2

    async def test_paying_inactive_and_no_contact(self):
        row = _row(is_trial=False, trial_ends_at=None, stripe_sub="sub_1", self_deactivated_at=NOW,
                   giras=0, cfg=0, last_sess=None, last_act=None, public=25)
        db, _ = _db([row], [])
        t = (await act.get_activation(db, NOW))["tenants"][0]
        assert t["paying"] is True and t["inactive"] is True
        assert t["trial_days_left"] is None
        assert t["stage"] == "ativado"
        assert t["contact"] is None
        assert t["last_activity_at"] is None and t["days_since_activity"] is None

    async def test_no_tenants_skips_user_query(self):
        db, calls = _db([], [])
        out = await act.get_activation(db, NOW)
        assert out["total"] == 0 and len(calls) == 1
        assert set(out["by_stage"]) == set(act.STAGES)

    async def test_query_window_and_correlation(self):
        db, calls = _db([], [])
        await act.get_activation(db, NOW)
        sql = str(calls[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "tenants.created_at >= '2026-08-06 18:00:00+00:00'" in sql
        assert "tenants.deleted_at IS NULL" in sql
        assert "giras.max_tickets > 0" in sql
        assert "tickets.emitido_por_id IS NULL" in sql
        for table in ("giras", "tickets", "user_sessions", "audit_logs", "tenant_configs"):
            assert f"{table}.tenant_id = tenants.id" in sql
        assert "LEFT OUTER JOIN subscriptions" in sql


def test_observatory_includes_activation():
    import inspect

    from src.api.v1.platform import tenant_observatory

    src = inspect.getsource(tenant_observatory.get_tenant_observatory)
    assert '"activation": activation' in src
    assert "require_super_admin" in src
