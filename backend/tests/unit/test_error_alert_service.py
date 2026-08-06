"""Tests for ErrorAlertService — in-memory fallback and Redis-backed mode.

The Redis-backed path was manually smoke-tested against a real Redis
container (verifies ZADD/pipeline semantics and, critically, that two
separate ErrorAlertService instances sharing REDIS_URL see the same events —
that's the actual bug this rewrite fixes: /platform/observatory losing
events depending on which of the backend's 2 workers handled the read vs.
the write). These tests mock the redis client to keep CI fast and
dependency-free, and focus on verifying the service calls Redis correctly.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.asyncio


def _make_inmemory_service():
    from src.services.error_alert_service import ErrorAlertService
    with patch("src.services.error_alert_service.settings") as mock_settings:
        mock_settings.REDIS_URL = ""
        svc = ErrorAlertService()
    assert svc._redis is None
    return svc


class TestErrorAlertServiceInMemory:
    async def test_record_and_recent_errors(self):
        svc = _make_inmemory_service()
        await svc.record_error("POST", "/api/x", 500, "tenant-a", None)
        await svc.record_error("GET", "/api/y", 502, None, "user-1")

        errors = await svc.recent_errors(window_minutes=5)
        assert len(errors) == 2
        assert errors[0].path == "/api/x"
        assert errors[1].tenant_id is None
        assert errors[1].user_id == "user-1"

    async def test_recent_errors_prunes_outside_window(self):
        from datetime import datetime, timedelta
        from src.services.error_alert_service import ErrorEvent, _TZ_BRT

        svc = _make_inmemory_service()
        old_event = ErrorEvent(
            timestamp=datetime.now(_TZ_BRT) - timedelta(minutes=10),
            method="POST", path="/old", status_code=500,
            tenant_id=None, user_id=None,
        )
        svc._errors.append(old_event)
        await svc.record_error("POST", "/new", 500, None, None)

        errors = await svc.recent_errors(window_minutes=5)
        assert len(errors) == 1
        assert errors[0].path == "/new"

    async def test_should_alert_below_threshold(self):
        svc = _make_inmemory_service()
        await svc.record_error("POST", "/x", 500, None, None)
        result = await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30)
        assert result is False

    async def test_should_alert_meets_threshold(self):
        svc = _make_inmemory_service()
        for _ in range(3):
            await svc.record_error("POST", "/x", 500, None, None)
        result = await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30)
        assert result is True

    async def test_should_alert_respects_cooldown(self):
        svc = _make_inmemory_service()
        for _ in range(3):
            await svc.record_error("POST", "/x", 500, None, None)
        assert await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30) is True
        await svc.mark_alert_sent()
        assert await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30) is False


class TestErrorAlertServiceRedis:
    def _make_redis_service(self, redis_mock):
        from src.services.error_alert_service import ErrorAlertService
        with patch("src.services.error_alert_service.settings") as mock_settings:
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            with patch("redis.asyncio.from_url", return_value=redis_mock):
                svc = ErrorAlertService()
        assert svc._redis is redis_mock
        return svc

    def _mock_redis_with_pipeline(self):
        # redis-py pipelines queue commands synchronously (zadd, zremrangebyrank, ...)
        # and only `execute()` is awaited — mock it that way so unawaited-coroutine
        # warnings don't mask real bugs in the queued-call assertions below.
        redis_mock = MagicMock()
        pipe = MagicMock()
        pipe.execute = AsyncMock(return_value=[0, []])
        pipe_cm = MagicMock()
        pipe_cm.__aenter__ = AsyncMock(return_value=pipe)
        pipe_cm.__aexit__ = AsyncMock(return_value=False)
        redis_mock.pipeline = MagicMock(return_value=pipe_cm)
        return redis_mock, pipe

    async def test_record_error_calls_zadd_via_pipeline(self):
        redis_mock, pipe = self._mock_redis_with_pipeline()
        svc = self._make_redis_service(redis_mock)

        await svc.record_error("POST", "/api/x", 500, "tenant-a", None)

        pipe.zadd.assert_called_once()
        args, kwargs = pipe.zadd.call_args
        assert args[0] == "senhas:error_alert:events"
        mapping = args[1]
        (member,) = mapping.keys()
        payload = json.loads(member)
        assert payload["method"] == "POST"
        assert payload["path"] == "/api/x"
        assert payload["status_code"] == 500
        assert payload["tenant_id"] == "tenant-a"
        pipe.zremrangebyrank.assert_called_once()

    async def test_recent_errors_parses_redis_members(self):
        redis_mock, pipe = self._mock_redis_with_pipeline()
        svc = self._make_redis_service(redis_mock)

        member = json.dumps({
            "timestamp": "2026-08-06T10:00:00-03:00",
            "method": "POST",
            "path": "/api/x",
            "status_code": 500,
            "tenant_id": "tenant-a",
            "user_id": None,
        })
        pipe.execute = AsyncMock(return_value=[1, [member]])

        errors = await svc.recent_errors(window_minutes=5)
        assert len(errors) == 1
        assert errors[0].path == "/api/x"
        assert errors[0].tenant_id == "tenant-a"
        pipe.zremrangebyscore.assert_called_once()
        pipe.zrangebyscore.assert_called_once()

    async def test_recent_errors_skips_corrupted_member(self):
        redis_mock, pipe = self._mock_redis_with_pipeline()
        svc = self._make_redis_service(redis_mock)
        pipe.execute = AsyncMock(return_value=[0, ["not-json"]])

        errors = await svc.recent_errors(window_minutes=5)
        assert errors == []

    async def test_should_alert_true_when_no_cooldown_key(self):
        redis_mock, pipe = self._mock_redis_with_pipeline()
        member = json.dumps({
            "timestamp": "2026-08-06T10:00:00-03:00", "method": "POST", "path": "/x",
            "status_code": 500, "tenant_id": None, "user_id": None,
        })
        pipe.execute = AsyncMock(return_value=[0, [member, member, member]])
        redis_mock.exists = AsyncMock(return_value=0)
        svc = self._make_redis_service(redis_mock)

        result = await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30)
        assert result is True

    async def test_should_alert_false_when_cooldown_key_present(self):
        redis_mock, pipe = self._mock_redis_with_pipeline()
        member = json.dumps({
            "timestamp": "2026-08-06T10:00:00-03:00", "method": "POST", "path": "/x",
            "status_code": 500, "tenant_id": None, "user_id": None,
        })
        pipe.execute = AsyncMock(return_value=[0, [member, member, member]])
        redis_mock.exists = AsyncMock(return_value=1)
        svc = self._make_redis_service(redis_mock)

        result = await svc.should_alert(threshold=3, window_minutes=5, cooldown_minutes=30)
        assert result is False

    async def test_mark_alert_sent_sets_cooldown_key_with_ttl(self):
        redis_mock, _ = self._mock_redis_with_pipeline()
        redis_mock.set = AsyncMock()
        svc = self._make_redis_service(redis_mock)

        await svc.mark_alert_sent(cooldown_minutes=15)

        redis_mock.set.assert_called_once_with("senhas:error_alert:cooldown", "1", ex=15 * 60)

    async def test_two_instances_share_state_via_same_redis_mock(self):
        """Regression guard for the actual bug: two ErrorAlertService instances
        (standing in for two backend workers) must read from the same store,
        not from independent per-process state."""
        redis_mock, pipe = self._mock_redis_with_pipeline()
        svc_worker_a = self._make_redis_service(redis_mock)

        from src.services.error_alert_service import ErrorAlertService
        with patch("src.services.error_alert_service.settings") as mock_settings:
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            with patch("redis.asyncio.from_url", return_value=redis_mock):
                svc_worker_b = ErrorAlertService()

        await svc_worker_a.record_error("POST", "/api/x", 500, "tenant-a", None)

        member = json.dumps({
            "timestamp": "2026-08-06T10:00:00-03:00", "method": "POST", "path": "/api/x",
            "status_code": 500, "tenant_id": "tenant-a", "user_id": None,
        })
        pipe.execute = AsyncMock(return_value=[0, [member]])
        errors_seen_by_b = await svc_worker_b.recent_errors(window_minutes=5)
        assert len(errors_seen_by_b) == 1
        assert errors_seen_by_b[0].tenant_id == "tenant-a"
