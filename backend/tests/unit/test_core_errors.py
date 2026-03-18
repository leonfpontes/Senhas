"""Tests for custom exception classes."""
import pytest
from fastapi import status

from src.core.errors import (
    APIException,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
    InvalidTokenError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
    TicketEmissionLimitError,
)


class TestAPIException:
    def test_default_values(self):
        exc = APIException("test error")
        assert exc.message == "test error"
        assert exc.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert exc.error_code == "INTERNAL_ERROR"
        assert exc.details == {}

    def test_custom_values(self):
        exc = APIException("custom", status_code=400, error_code="CUSTOM", details={"key": "val"})
        assert exc.status_code == 400
        assert exc.error_code == "CUSTOM"
        assert exc.details == {"key": "val"}

    def test_inherits_exception(self):
        exc = APIException("test")
        assert isinstance(exc, Exception)
        assert str(exc) == "test"


class TestUnauthorizedError:
    def test_default_message(self):
        exc = UnauthorizedError()
        assert exc.message == "Não autorizado"
        assert exc.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc.error_code == "UNAUTHORIZED"

    def test_custom_message(self):
        exc = UnauthorizedError("Token expirado")
        assert exc.message == "Token expirado"

    def test_with_details(self):
        exc = UnauthorizedError(details={"reason": "expired"})
        assert exc.details == {"reason": "expired"}


class TestForbiddenError:
    def test_default_message(self):
        exc = ForbiddenError()
        assert exc.message == "Acesso proibido"
        assert exc.status_code == status.HTTP_403_FORBIDDEN
        assert exc.error_code == "FORBIDDEN"


class TestNotFoundError:
    def test_resource_name_in_message(self):
        exc = NotFoundError("Usuário")
        assert exc.message == "Usuário não encontrado"
        assert exc.status_code == status.HTTP_404_NOT_FOUND
        assert exc.error_code == "NOT_FOUND"

    def test_different_resources(self):
        for resource in ["Gira", "Ticket", "Tenant"]:
            exc = NotFoundError(resource)
            assert resource in exc.message


class TestConflictError:
    def test_default_message(self):
        exc = ConflictError()
        assert exc.status_code == status.HTTP_409_CONFLICT
        assert exc.error_code == "CONFLICT"

    def test_custom_message(self):
        exc = ConflictError("Email já existe")
        assert exc.message == "Email já existe"


class TestValidationError:
    def test_message_and_status(self):
        exc = ValidationError("Campo inválido")
        assert exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert exc.error_code == "VALIDATION_ERROR"

    def test_with_details(self):
        exc = ValidationError("Invalid", details={"field": "email"})
        assert exc.details == {"field": "email"}


class TestInvalidTokenError:
    def test_inherits_unauthorized(self):
        exc = InvalidTokenError()
        assert isinstance(exc, UnauthorizedError)
        assert exc.status_code == status.HTTP_401_UNAUTHORIZED

    def test_default_message(self):
        exc = InvalidTokenError()
        assert "Token" in exc.message

    def test_custom_message(self):
        exc = InvalidTokenError("Token mal formado")
        assert exc.message == "Token mal formado"


class TestInsufficientPermissionsError:
    def test_inherits_forbidden(self):
        exc = InsufficientPermissionsError("admin")
        assert isinstance(exc, ForbiddenError)
        assert exc.status_code == status.HTTP_403_FORBIDDEN

    def test_includes_required_role(self):
        exc = InsufficientPermissionsError("admin")
        assert "admin" in exc.message
        assert exc.details == {"required_role": "admin"}


class TestMultiTenantViolationError:
    def test_inherits_forbidden(self):
        exc = MultiTenantViolationError()
        assert isinstance(exc, ForbiddenError)
        assert exc.status_code == status.HTTP_403_FORBIDDEN
        assert "tenant" in exc.message.lower()


class TestTicketEmissionLimitError:
    def test_status_code(self):
        exc = TicketEmissionLimitError()
        assert exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert exc.error_code == "TICKET_LIMIT_EXCEEDED"

    def test_custom_message(self):
        exc = TicketEmissionLimitError("Limite atingido para esta gira")
        assert exc.message == "Limite atingido para esta gira"
