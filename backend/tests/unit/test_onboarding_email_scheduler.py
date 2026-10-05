"""E-mails de onboarding D+1/D+3: regras, modelos, trava de rodada e marca
persistente de envio (services/onboarding_email_scheduler.py)."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import unquote

import pytest
from sqlalchemy.dialects import postgresql

import src.services.onboarding_email_scheduler as sched
from src.services.email.templates.onboarding_nudge import (
    render_onboarding_d1_email,
    render_onboarding_d3_email,
    whatsapp_share_url,
)

NOW = datetime(2026, 10, 6, 13, 0, tzinfo=timezone.utc)  # 10:00 BRT
H = timedelta(hours=1)


class TestClassify:
    @pytest.mark.parametrize(
        "age_h,has_gira,tickets,sent,expected",
        [
            (19, False, 0, {}, None),          # cedo demais
            (20, False, 0, {}, "d1"),          # D+1 sem gira
            (44, False, 0, {}, "d1"),
            (44, True, 0, {}, None),           # já criou gira: sem D+1
            (44, False, 0, {"d1": "x"}, None), # D+1 já enviado
            (67, False, 0, {}, "d1"),
            (68, False, 0, {}, "d3"),          # D+3 sem senha pelo link
            (68, True, 0, {"d1": "x"}, "d3"),
            (100, True, 3, {}, None),          # já recebe senhas: sem D+3
            (100, False, 0, {"d3": "x"}, None),
            (167, False, 0, {}, "d3"),
            (168, False, 0, {}, None),         # 7 dias: base antiga nunca recebe
            (2000, False, 0, {}, None),
        ],
    )
    def test_rules(self, age_h, has_gira, tickets, sent, expected):
        assert sched.classify(age_h * H, has_gira, tickets, sent) == expected

    def test_sent_markers_tolerates_garbage(self):
        assert sched.sent_markers(None) == {}
        assert sched.sent_markers({"onboarding_emails": "x"}) == {}
        assert sched.sent_markers({"onboarding_emails": {"d1": "t"}}) == {"d1": "t"}


class TestTemplates:
    def test_d1_cta_utm_and_escaping(self):
        subject, html, text = render_onboarding_d1_email(
            "Maria <b>Silva</b>", "Casa <script>", "https://girahub.com.br/"
        )
        assert subject == "Sua primeira gira no GiraHub leva 1 minuto"
        url = "https://girahub.com.br/admin/giras?nova=1&amp;utm_source=email&amp;utm_medium=onboarding&amp;utm_campaign=onboarding_d1"
        assert url in html
        assert "<script>" not in html and "&lt;script&gt;" in html
        assert "Maria &lt;b&gt;" not in html  # usa só o primeiro nome, escapado
        assert "P.S." not in html
        assert "admin/giras?nova=1&utm_campaign" not in text
        assert "utm_campaign=onboarding_d1" in text

    def test_d1_ps_points_to_trail_module(self):
        _, html, text = render_onboarding_d1_email("Ana", "Casa", "https://girahub.com.br", "financeiro")
        assert "P.S." in html and "/admin/financeiro/mensalidades" in html
        assert "/admin/financeiro/mensalidades" in text
        _, html_outro, _ = render_onboarding_d1_email("Ana", "Casa", "https://girahub.com.br", "senhas")
        assert "P.S." not in html_outro

    def test_d3_with_gira_shows_link_and_whatsapp_without_create(self):
        link = "https://girahub.com.br/public/casa/senha"
        subject, html, text = render_onboarding_d3_email("Ana", "Casa", "https://girahub.com.br", link, True)
        assert subject.startswith("Falta um passo")
        assert link in html and "Enviar no WhatsApp" in html
        assert "Criar a gira" not in html
        assert "nenhum consulente pegou senha" in text

    def test_d3_without_gira_asks_to_create_first(self):
        _, html, text = render_onboarding_d3_email(
            "Ana", "Casa", "https://girahub.com.br", "https://girahub.com.br/public/casa/senha", False
        )
        assert "Criar a gira" in html and "Criar a gira:" in text

    def test_d3_without_link_has_no_whatsapp(self):
        _, html, _ = render_onboarding_d3_email("Ana", "Casa", "https://girahub.com.br", None, True)
        assert "Enviar no WhatsApp" not in html

    def test_whatsapp_message_matches_checklist_text(self):
        url = whatsapp_share_url("https://x/public/casa/senha", "Casa Nova")
        text = unquote(url.split("?text=", 1)[1])
        assert "do Casa Nova" in text and "https://x/public/casa/senha" in text
        assert "mesmo para todas as giras" in text


class TestCandidateQuery:
    async def test_window_exclusions_and_tenant_correlation(self):
        captured = {}

        class _R:
            def all(self):
                return []

        async def fake_execute(stmt):
            captured["sql"] = str(
                stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
            )
            return _R()

        db = MagicMock()
        db.execute = fake_execute
        await sched.load_candidates(db, NOW)
        sql = captured["sql"]
        assert "tenants.created_at >= '2026-09-29 13:00:00+00:00'" in sql
        assert "tenants.created_at <= '2026-10-05 17:00:00+00:00'" in sql
        assert "tenants.deleted_at IS NULL" in sql
        assert "tenants.is_active IS true" in sql
        assert "tenants.self_deactivated_at IS NULL" in sql
        assert "giras.tenant_id = tenants.id" in sql
        assert "tickets.tenant_id = tenants.id" in sql and "tickets.emitido_por_id IS NULL" in sql
        assert "tenant_configs.tenant_id = tenants.id" in sql


def _cand(age_h, has_gira=False, tickets=0, settings=None, slug="casa"):
    return sched.Candidate(
        tenant_id=uuid.uuid4(), name="Casa", slug=slug, created_at=NOW - age_h * H,
        has_gira=has_gira, public_tickets=tickets, custom_settings=settings,
    )


class _Conn:
    def __init__(self, locked):
        self.locked = locked
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt, params=None):
        self.calls.append(str(stmt))
        return SimpleNamespace(scalar=lambda: self.locked)


class _Session:
    async def __aenter__(self):
        return MagicMock()

    async def __aexit__(self, *a):
        return False


@pytest.fixture
def env(monkeypatch):
    conn = _Conn(locked=True)
    engine = SimpleNamespace(connect=lambda: conn)
    monkeypatch.setattr("src.core.database.engine", engine)
    monkeypatch.setattr("src.core.database.AsyncSessionLocal", lambda: _Session())
    monkeypatch.setattr("src.core.config.settings.FRONTEND_URL", "https://girahub.com.br")
    contact = AsyncMock(return_value=("dono@example.com", "Ana Souza"))
    monkeypatch.setattr("src.services.trial_scheduler.get_tenant_primary_contact", contact)
    send = AsyncMock(return_value=True)
    monkeypatch.setattr(sched, "send_email", send)
    claim = AsyncMock(return_value=True)
    monkeypatch.setattr(sched, "claim", claim)
    return SimpleNamespace(conn=conn, contact=contact, send=send, claim=claim, monkeypatch=monkeypatch)


def _with_candidates(env, cands):
    env.monkeypatch.setattr(sched, "load_candidates", AsyncMock(return_value=cands))


class TestRunOnce:
    async def test_sends_d1_and_d3_and_marks_before_sending(self, env):
        _with_candidates(env, [_cand(44, slug="nova"), _cand(100, has_gira=True, slug="sem-senha"), _cand(100, tickets=5)])
        order = []
        env.claim.side_effect = lambda *a, **k: order.append("claim") or True
        env.send.side_effect = lambda *a, **k: order.append("send") or True
        done = await sched.run_once(now=NOW)
        assert done == [("nova", "d1"), ("sem-senha", "d3")]
        assert order == ["claim", "send", "claim", "send"]
        subjects = [c.args[1] for c in env.send.call_args_list]
        assert subjects[0].startswith("Sua primeira gira")
        assert subjects[1].startswith("Falta um passo")
        assert env.send.call_args_list[1].args[0] == "dono@example.com"
        assert "https://girahub.com.br/public/sem-senha/senha" in env.send.call_args_list[1].args[2]

    async def test_already_claimed_is_not_sent(self, env):
        _with_candidates(env, [_cand(44)])
        env.claim.return_value = False
        assert await sched.run_once(now=NOW) == []
        env.send.assert_not_called()

    async def test_no_contact_skips_without_marking(self, env):
        _with_candidates(env, [_cand(44)])
        env.contact.return_value = None
        await sched.run_once(now=NOW)
        env.claim.assert_not_called()
        env.send.assert_not_called()

    async def test_other_worker_holds_lock(self, env):
        env.conn.locked = False
        loader = AsyncMock(return_value=[_cand(44)])
        env.monkeypatch.setattr(sched, "load_candidates", loader)
        assert await sched.run_once(now=NOW) == []
        loader.assert_not_called()
        env.send.assert_not_called()

    async def test_lock_is_released(self, env):
        _with_candidates(env, [])
        await sched.run_once(now=NOW)
        assert any("pg_try_advisory_lock" in c for c in env.conn.calls)
        assert any("pg_advisory_unlock" in c for c in env.conn.calls)

    async def test_dry_run_lists_without_lock_marking_or_sending(self, env):
        _with_candidates(env, [_cand(44, slug="nova"), _cand(100, slug="velha")])
        assert await sched.run_once(now=NOW, dry_run=True) == [("nova", "d1"), ("velha", "d3")]
        env.claim.assert_not_called()
        env.send.assert_not_called()
        assert env.conn.calls == []

    async def test_one_tenant_failing_does_not_stop_the_round(self, env):
        _with_candidates(env, [_cand(44, slug="quebra"), _cand(44, slug="ok")])
        env.contact.side_effect = [RuntimeError("db"), ("b@example.com", "B")]
        assert await sched.run_once(now=NOW) == [("ok", "d1")]


class TestClaim:
    def _patch_session(self, monkeypatch, cfg):
        session = MagicMock()
        session.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: cfg))
        session.commit = AsyncMock()

        class _S:
            async def __aenter__(self_inner):
                return session

            async def __aexit__(self_inner, *a):
                return False

        monkeypatch.setattr("src.core.database.AsyncSessionLocal", lambda: _S())
        return session

    async def test_marks_and_preserves_other_settings(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"como_conheceu": "google", "principal_dor": "senhas"})
        session = self._patch_session(monkeypatch, cfg)
        assert await sched.claim(uuid.uuid4(), "d1", NOW) is True
        assert cfg.custom_settings == {
            "como_conheceu": "google",
            "principal_dor": "senhas",
            "onboarding_emails": {"d1": NOW.isoformat()},
        }
        session.commit.assert_awaited_once()

    async def test_refuses_when_already_sent(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"onboarding_emails": {"d3": "antes"}})
        session = self._patch_session(monkeypatch, cfg)
        assert await sched.claim(uuid.uuid4(), "d3", NOW) is False
        session.commit.assert_not_awaited()
        assert cfg.custom_settings == {"onboarding_emails": {"d3": "antes"}}

    async def test_uses_row_lock(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings=None)
        session = self._patch_session(monkeypatch, cfg)
        await sched.claim(uuid.uuid4(), "d1", NOW)
        stmt = session.execute.call_args.args[0]
        assert "FOR UPDATE" in str(stmt.compile(dialect=postgresql.dialect()))


class TestKillSwitch:
    def test_disabled_does_not_start(self, monkeypatch):
        monkeypatch.setattr("src.core.config.settings.ONBOARDING_EMAILS_ENABLED", False)
        s = sched.OnboardingEmailScheduler()
        with patch("asyncio.create_task") as create_task:
            s.start()
        create_task.assert_not_called()
