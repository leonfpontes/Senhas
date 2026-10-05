"""Anti-duplicação dos agendadores in-process (2 workers): advisory lock por
rodada + marca persistente com escopo (services/scheduler_guard.py), e sua
aplicação em trial_scheduler e birthday_scheduler."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

import src.services.scheduler_guard as guard
from src.services import birthday_scheduler as bmod
from src.services import trial_scheduler as tmod

NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
TID = uuid.UUID("22222222-2222-2222-2222-222222222222")


# ---------------------------------------------------------------- advisory_lock
class _Conn:
    def __init__(self, acquired):
        self.acquired = acquired
        self.sql = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt, params=None):
        self.sql.append((str(stmt), params))
        return SimpleNamespace(scalar=lambda: self.acquired)


def _engine(monkeypatch, acquired):
    conn = _Conn(acquired)
    monkeypatch.setattr("src.core.database.engine", SimpleNamespace(connect=lambda: conn))
    return conn


class TestAdvisoryLock:
    async def test_acquired_yields_true_and_unlocks(self, monkeypatch):
        conn = _engine(monkeypatch, True)
        async with guard.advisory_lock(guard.TRIAL_LOCK_KEY) as got:
            assert got is True
        assert "pg_try_advisory_lock" in conn.sql[0][0]
        assert "pg_advisory_unlock" in conn.sql[-1][0]
        assert conn.sql[0][1] == {"k": guard.TRIAL_LOCK_KEY}

    async def test_not_acquired_yields_false_without_unlock(self, monkeypatch):
        conn = _engine(monkeypatch, False)
        async with guard.advisory_lock(guard.BIRTHDAY_LOCK_KEY) as got:
            assert got is False
        assert not any("unlock" in s for s, _ in conn.sql)

    def test_keys_are_distinct_from_onboarding(self):
        keys = {0x6769726168756201, guard.TRIAL_LOCK_KEY, guard.BIRTHDAY_LOCK_KEY}
        assert len(keys) == 3
        assert all(k < 2**63 for k in keys)  # cabe em bigint


# ------------------------------------------------------------------ claim_once
def _session(monkeypatch, cfg):
    session = MagicMock()
    session.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: cfg))
    session.commit = AsyncMock()

    class _S:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr("src.core.database.AsyncSessionLocal", lambda: _S())
    return session


class TestClaimOnce:
    async def test_marks_and_preserves_other_settings(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"principal_dor": "senhas"})
        s = _session(monkeypatch, cfg)
        assert await guard.claim_once(TID, "trial_reminders", "7", scope="2026-10-24", now=NOW) is True
        assert cfg.custom_settings == {
            "principal_dor": "senhas",
            "trial_reminders": {"scope": "2026-10-24", "sent": {"7": NOW.isoformat()}},
        }
        s.commit.assert_awaited_once()
        stmt = s.execute.call_args.args[0]
        assert "FOR UPDATE" in str(stmt.compile(dialect=postgresql.dialect()))

    async def test_same_item_same_scope_is_refused(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"trial_reminders": {"scope": "A", "sent": {"7": "x"}}})
        s = _session(monkeypatch, cfg)
        assert await guard.claim_once(TID, "trial_reminders", "7", scope="A", now=NOW) is False
        s.commit.assert_not_awaited()

    async def test_other_item_same_scope_accumulates(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"trial_reminders": {"scope": "A", "sent": {"7": "x"}}})
        _session(monkeypatch, cfg)
        assert await guard.claim_once(TID, "trial_reminders", "3", scope="A", now=NOW) is True
        assert cfg.custom_settings["trial_reminders"]["sent"] == {"7": "x", "3": NOW.isoformat()}

    async def test_new_scope_resets_markers(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"birthday_digest": {"scope": "2026-10-05", "sent": {"sent": "x"}}})
        _session(monkeypatch, cfg)
        assert await guard.claim_once(TID, "birthday_digest", "sent", scope="2026-10-06", now=NOW) is True
        assert cfg.custom_settings["birthday_digest"] == {"scope": "2026-10-06", "sent": {"sent": NOW.isoformat()}}

    async def test_garbage_entry_is_replaced(self, monkeypatch):
        cfg = SimpleNamespace(custom_settings={"trial_reminders": "lixo"})
        _session(monkeypatch, cfg)
        assert await guard.claim_once(TID, "trial_reminders", "7", now=NOW) is True

    async def test_missing_config_allows(self, monkeypatch):
        s = _session(monkeypatch, None)
        assert await guard.claim_once(TID, "trial_reminders", "7", now=NOW) is True
        s.commit.assert_not_awaited()


# --------------------------------------------------------------- trial_scheduler
class TestDaysLeft:
    @pytest.mark.parametrize(
        "delta,expected",
        [
            (timedelta(days=7), 7),
            (timedelta(days=6, hours=1), 7),
            (timedelta(days=2, hours=23), 3),
            (timedelta(days=3, minutes=1), 4),
            (timedelta(hours=12), 1),
        ],
    )
    def test_rounds_up(self, delta, expected):
        assert tmod.days_left(delta) == expected


class TestTrialScheduler:
    async def test_skips_round_without_lock(self, monkeypatch):
        _engine(monkeypatch, False)
        s = tmod.TrialScheduler()
        s._process_trials_locked = AsyncMock()
        await s._process_trials()
        s._process_trials_locked.assert_not_called()

    async def test_runs_round_with_lock(self, monkeypatch):
        _engine(monkeypatch, True)
        s = tmod.TrialScheduler()
        s._process_trials_locked = AsyncMock()
        await s._process_trials()
        s._process_trials_locked.assert_awaited_once()

    async def _run_locked(self, monkeypatch, subs):
        session = MagicMock()
        session.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: subs)))

        class _S:
            async def __aenter__(self):
                return session

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr("src.core.database.AsyncSessionLocal", lambda: _S())

        class _FrozenDT(datetime):
            @classmethod
            def now(cls, tz=None):
                return NOW

        monkeypatch.setattr(tmod, "datetime", _FrozenDT)
        s = tmod.TrialScheduler()
        s._expire_trial = AsyncMock()
        s._maybe_send_reminder = AsyncMock()
        await s._process_trials_locked()
        return s

    def _sub(self, ends_in):
        return SimpleNamespace(tenant_id=uuid.uuid4(), trial_ends_at=NOW + ends_in)

    async def test_expires_only_after_end(self, monkeypatch):
        ended = self._sub(-timedelta(hours=1))
        half_day = self._sub(timedelta(hours=12))  # antes: .days == 0 → expirava ~12h cedo
        s = await self._run_locked(monkeypatch, [ended, half_day])
        s._expire_trial.assert_awaited_once_with(ended.tenant_id)
        s._maybe_send_reminder.assert_not_called()

    async def test_reminders_on_rounded_up_thresholds_with_scope(self, monkeypatch):
        d3 = self._sub(timedelta(days=2, hours=23))
        d7 = self._sub(timedelta(days=6, hours=2))
        d4 = self._sub(timedelta(days=3, hours=1))
        s = await self._run_locked(monkeypatch, [d3, d7, d4])
        calls = {c.args[0]: (c.args[1], c.kwargs["scope"]) for c in s._maybe_send_reminder.call_args_list}
        assert calls == {
            d3.tenant_id: (3, d3.trial_ends_at.isoformat()),
            d7.tenant_id: (7, d7.trial_ends_at.isoformat()),
        }

    async def test_reminder_sends_only_when_claimed(self, monkeypatch):
        s = tmod.TrialScheduler()
        s._get_primary_contact = AsyncMock(return_value=("a@x.com", "Ana"))
        s._send_reminder_email = AsyncMock()
        claim = AsyncMock(side_effect=[True, False])
        monkeypatch.setattr(guard, "claim_once", claim)
        await s._maybe_send_reminder(TID, 7, scope="S")
        await s._maybe_send_reminder(TID, 7, scope="S")
        s._send_reminder_email.assert_awaited_once_with(contact_email="a@x.com", contact_name="Ana", dias_restantes=7)
        assert claim.call_args_list[0].args == (TID, "trial_reminders", "7")
        assert claim.call_args_list[0].kwargs == {"scope": "S"}

    async def test_no_contact_does_not_mark(self, monkeypatch):
        s = tmod.TrialScheduler()
        s._get_primary_contact = AsyncMock(return_value=None)
        s._send_reminder_email = AsyncMock()
        claim = AsyncMock(return_value=True)
        monkeypatch.setattr(guard, "claim_once", claim)
        await s._maybe_send_reminder(TID, 3, scope="S")
        claim.assert_not_called()
        s._send_reminder_email.assert_not_called()


# ------------------------------------------------------------ birthday_scheduler
class TestBirthdayScheduler:
    async def test_skips_round_without_lock(self, monkeypatch):
        _engine(monkeypatch, False)
        s = bmod.BirthdayScheduler()
        s._send_all_digests_locked = AsyncMock()
        await s._send_all_digests()
        s._send_all_digests_locked.assert_not_called()

    async def _digest(self, monkeypatch, claimed):
        class _S:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr("src.core.database.AsyncSessionLocal", lambda: _S())
        tenant = SimpleNamespace(name="Casa", deleted_at=None)
        admin = SimpleNamespace(is_active=True, email="adm@x.com")
        monkeypatch.setattr(
            "src.repositories.tenant_repo.TenantRepository",
            lambda db: SimpleNamespace(get_by_id=AsyncMock(return_value=tenant)),
        )
        monkeypatch.setattr(
            "src.repositories.mediun_repo.MediumRepository",
            lambda db: SimpleNamespace(list_aniversariantes=AsyncMock(return_value=[MagicMock()])),
        )
        monkeypatch.setattr(
            "src.repositories.config_repo.TenantConfigRepository",
            lambda db: SimpleNamespace(get_by_tenant=AsyncMock(return_value=None)),
        )
        monkeypatch.setattr(
            "src.repositories.user_repo.UserRepository",
            lambda db: SimpleNamespace(get_admins=AsyncMock(return_value=[admin])),
        )
        monkeypatch.setattr(
            "src.services.email.templates.birthday_digest.render_birthday_digest", lambda **kw: "<html>"
        )
        claim = AsyncMock(return_value=claimed)
        monkeypatch.setattr(guard, "claim_once", claim)
        queue = MagicMock()
        monkeypatch.setattr("src.services.email.email_queue.email_queue", queue)
        await bmod.BirthdayScheduler()._send_digest_for_tenant(tenant_id=TID, today_brt_str="2026-10-06")
        return claim, queue

    async def test_enqueues_when_claimed_for_the_day(self, monkeypatch):
        claim, queue = await self._digest(monkeypatch, True)
        assert claim.call_args.args == (TID, "birthday_digest", "sent")
        assert claim.call_args.kwargs == {"scope": "2026-10-06"}
        queue.enqueue.assert_called_once()

    async def test_already_sent_today_is_not_enqueued(self, monkeypatch):
        _, queue = await self._digest(monkeypatch, False)
        queue.enqueue.assert_not_called()
