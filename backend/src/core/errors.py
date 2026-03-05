"""Custom exceptions and error handling."""
from typing import Any, Optional
from fastapi import HTTPException, status


class APIException(Exception):
    """Base exception for API errors."""
    
    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = "INTERNAL_ERROR",
        details: Optional[dict[str, Any]] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class UnauthorizedError(APIException):
    """Raised when authentication fails."""
    
    def __init__(self, message: str = "Não autorizado", details: Optional[dict] = None):
        super().__init__(
            message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="UNAUTHORIZED",
            details=details,
        )


class ForbiddenError(APIException):
    """Raised when user lacks required permissions."""
    
    def __init__(self, message: str = "Acesso proibido", details: Optional[dict] = None):
        super().__init__(
            message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="FORBIDDEN",
            details=details,
        )


class NotFoundError(APIException):
    """Raised when resource not found."""
    
    def __init__(self, resource: str, details: Optional[dict] = None):
        message = f"{resource} não encontrado"
        super().__init__(
            message,
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="NOT_FOUND",
            details=details,
        )


class ConflictError(APIException):
    """Raised when resource already exists."""
    
    def __init__(self, message: str = "Conflito de recursos", details: Optional[dict] = None):
        super().__init__(
            message,
            status_code=status.HTTP_409_CONFLICT,
            error_code="CONFLICT",
            details=details,
        )


class ValidationError(APIException):
    """Raised when validation fails."""
    
    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(
            message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="VALIDATION_ERROR",
            details=details,
        )


class InvalidTokenError(UnauthorizedError):
    """Raised when JWT token is invalid."""
    
    def __init__(self, message: str = "Token inválido ou expirado"):
        super().__init__(message)


class InsufficientPermissionsError(ForbiddenError):
    """Raised when user lacks required role."""
    
    def __init__(self, required_role: str):
        message = f"Requer role: {required_role}"
        super().__init__(message, details={"required_role": required_role})


class MultiTenantViolationError(ForbiddenError):
    """Raised when accessing resource from different tenant."""
    
    def __init__(self):
        super().__init__("Acesso a recurso de outro tenant proibido")


class TicketEmissionLimitError(APIException):
    """Raised when ticket emission limit is exceeded."""
    
    def __init__(self, message: str = "Limite de emissão de senhas atingido"):
        super().__init__(
            message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_code="TICKET_LIMIT_EXCEEDED",
        )
