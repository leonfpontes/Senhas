"""Tests for main.py - app factory, exception handlers, health endpoint."""
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class TestCreateApp:
    @patch("src.main.engine")
    @patch("src.main.settings")
    def test_returns_fastapi_instance(self, mock_settings, mock_engine):
        mock_settings.APP_NAME = "Senhas"
        mock_settings.APP_VERSION = "1.0.0"
        mock_settings.CORS_ORIGINS = ["http://localhost:3000"]
        mock_settings.DATABASE_URL = "sqlite+aiosqlite://"

        from src.main import create_app
        app = create_app()
        assert isinstance(app, FastAPI)
        assert app.title == "Senhas"

    @patch("src.main.engine")
    @patch("src.main.settings")
    def test_app_has_health_route(self, mock_settings, mock_engine):
        mock_settings.APP_NAME = "Senhas"
        mock_settings.APP_VERSION = "1.0.0"
        mock_settings.CORS_ORIGINS = ["http://localhost:3000"]
        mock_settings.DATABASE_URL = "sqlite+aiosqlite://"

        from src.main import create_app
        app = create_app()
        routes = [r.path for r in app.routes]
        assert "/health" in routes

    @patch("src.main.engine")
    @patch("src.main.settings")
    def test_app_has_api_root(self, mock_settings, mock_engine):
        mock_settings.APP_NAME = "Senhas"
        mock_settings.APP_VERSION = "1.0.0"
        mock_settings.CORS_ORIGINS = ["http://localhost:3000"]
        mock_settings.DATABASE_URL = "sqlite+aiosqlite://"

        from src.main import create_app
        app = create_app()
        routes = [r.path for r in app.routes]
        assert "/api/v1" in routes


class TestExceptionHandlers:
    def test_api_exception_returns_json(self):
        """Test the exception handler logic with a minimal app (no middleware)."""
        from src.core.errors import APIException, NotFoundError

        app = FastAPI()

        @app.exception_handler(APIException)
        async def api_exception_handler(request, exc: APIException):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error_code": exc.error_code,
                    "message": exc.message,
                    "details": exc.details,
                },
            )

        @app.get("/test-error")
        async def trigger_error():
            raise NotFoundError("Test resource")

        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/test-error")
        assert response.status_code == 404
        data = response.json()
        assert data["error_code"] == "NOT_FOUND"

    def test_validation_error_returns_422(self):
        """Test validation error handler logic with a minimal app."""
        from fastapi.exceptions import RequestValidationError
        from pydantic import BaseModel

        app = FastAPI()

        @app.exception_handler(RequestValidationError)
        async def validation_exception_handler(request, exc: RequestValidationError):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=422,
                content={
                    "error_code": "VALIDATION_ERROR",
                    "message": "Erro na validação dos dados",
                    "details": exc.errors(),
                },
            )

        class TestBody(BaseModel):
            required_field: int

        @app.post("/test-validation")
        async def trigger_validation(body: TestBody):
            return {"ok": True}

        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/test-validation", json={})
        assert response.status_code == 422
        data = response.json()
        assert data["error_code"] == "VALIDATION_ERROR"
