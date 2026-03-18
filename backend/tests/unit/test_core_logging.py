"""Tests for logging utilities."""
import json
import logging
from unittest.mock import patch

import pytest

from src.core.logging import log_audit_event, log_security_event


class TestLogAuditEvent:
    """Tests for log_audit_event function."""

    def test_logs_with_all_parameters(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_audit_event(
                action="create",
                resource_type="Ticket",
                resource_id="some-id",
                user_id="user-id",
                tenant_id="tenant-id",
                details={"numero": 42},
            )
        assert "AUDIT" in caplog.text
        assert "create" in caplog.text
        assert "Ticket" in caplog.text

    def test_logs_with_minimal_parameters(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_audit_event(action="read", resource_type="Gira")
        assert "AUDIT" in caplog.text
        assert "read" in caplog.text

    def test_null_ids_handled(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_audit_event(
                action="delete",
                resource_type="User",
                resource_id=None,
                user_id=None,
                tenant_id=None,
            )
        assert "AUDIT" in caplog.text

    def test_output_is_json(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_audit_event(action="update", resource_type="Config")
        # Find the AUDIT log line
        for record in caplog.records:
            if "AUDIT" in record.message:
                json_str = record.message.split("AUDIT: ")[1]
                data = json.loads(json_str)
                assert data["action"] == "update"
                assert data["resource_type"] == "Config"


class TestLogSecurityEvent:
    """Tests for log_security_event function."""

    def test_successful_event(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_security_event(
                event_type="login",
                user_id="user-id",
                tenant_id="tenant-id",
                success=True,
            )
        assert "SECURITY" in caplog.text
        assert "login" in caplog.text

    def test_failed_event_logged_as_warning(self, caplog):
        with caplog.at_level(logging.WARNING, logger="senhas"):
            log_security_event(
                event_type="login",
                success=False,
                details={"reason": "invalid_password"},
            )
        assert "SECURITY" in caplog.text

    def test_minimal_parameters(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_security_event(event_type="logout")
        assert "SECURITY" in caplog.text

    def test_output_is_json(self, caplog):
        with caplog.at_level(logging.INFO, logger="senhas"):
            log_security_event(event_type="token_refresh", success=True)
        for record in caplog.records:
            if "SECURITY" in record.message:
                json_str = record.message.split("SECURITY: ")[1]
                data = json.loads(json_str)
                assert data["event_type"] == "token_refresh"
                assert data["success"] is True
