"""Shared test fixtures for all backend tests."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import BYTEA, JSONB

@compiles(BYTEA, "sqlite")
def compile_bytea_sqlite(type_, compiler, **kw):
    return "BLOB"

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

from src.models.users import User, UserRole
from src.models.tenants import Tenant
from src.models.giras import Gira
from src.models.tickets import Ticket, TicketStatus
from src.models.consulentes import Consulente
from src.models.senha_controls import SenhaControl
from src.models.audit_logs import AuditLog, AuditAction


# ── Fixed UUIDs for deterministic tests ──────────────────────────────────────
TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TENANT_B_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
ADMIN_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")
SUPER_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000012")
GIRA_ID = uuid.UUID("00000000-0000-0000-0000-000000000020")
TICKET_ID = uuid.UUID("00000000-0000-0000-0000-000000000030")
CONSULENTE_ID = uuid.UUID("00000000-0000-0000-0000-000000000040")


@pytest.fixture
def tenant():
    """Create a mock tenant."""
    t = Tenant()
    t.id = TENANT_ID
    t.name = "Terreiro Test"
    t.slug = "terreiro-test"
    t.description = "Test tenant"
    t.is_active = True
    t.created_at = datetime.now(timezone.utc)
    t.updated_at = datetime.now(timezone.utc)
    t.deleted_at = None
    return t


@pytest.fixture
def operator_user(tenant):
    """Create a mock operator user."""
    u = User()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.email = "operator@test.com"
    u.username = "operator"
    u.password_hash = "$2b$12$fakehash"
    u.role = UserRole.OPERATOR
    u.is_active = True
    u.created_at = datetime.now(timezone.utc)
    u.updated_at = datetime.now(timezone.utc)
    u.deleted_at = None
    return u


@pytest.fixture
def admin_user(tenant):
    """Create a mock admin user."""
    u = User()
    u.id = ADMIN_USER_ID
    u.tenant_id = TENANT_ID
    u.email = "admin@test.com"
    u.username = "admin"
    u.password_hash = "$2b$12$fakehash"
    u.role = UserRole.ADMIN
    u.is_active = True
    u.created_at = datetime.now(timezone.utc)
    u.updated_at = datetime.now(timezone.utc)
    u.deleted_at = None
    return u


@pytest.fixture
def super_admin_user():
    """Create a mock super admin user."""
    u = User()
    u.id = SUPER_ADMIN_ID
    u.tenant_id = None
    u.email = "super@test.com"
    u.username = "superadmin"
    u.password_hash = "$2b$12$fakehash"
    u.role = UserRole.SUPER_ADMIN
    u.is_active = True
    u.created_at = datetime.now(timezone.utc)
    u.updated_at = datetime.now(timezone.utc)
    u.deleted_at = None
    return u


@pytest.fixture
def gira(tenant):
    """Create a mock gira."""
    g = Gira()
    g.id = GIRA_ID
    g.tenant_id = TENANT_ID
    g.nome = "Gira de Oxalá"
    g.descricao = "Gira mensal"
    g.data_inicio = datetime.now(timezone.utc) + timedelta(hours=1)
    g.data_fim = datetime.now(timezone.utc) + timedelta(hours=4)
    g.local = "Terreiro Central"
    g.is_active = True
    g.created_at = datetime.now(timezone.utc)
    g.updated_at = datetime.now(timezone.utc)
    g.deleted_at = None
    return g


@pytest.fixture
def consulente(tenant):
    """Create a mock consulente."""
    c = Consulente()
    c.id = CONSULENTE_ID
    c.tenant_id = TENANT_ID
    c.nome = "João da Silva"
    c.email = "joao@example.com"
    c.telefone = "11999998888"
    c.cpf = None
    c.endereco = None
    c.observacoes = None
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    c.deleted_at = None
    return c


@pytest.fixture
def ticket(tenant, gira, consulente):
    """Create a mock ticket."""
    t = Ticket()
    t.id = TICKET_ID
    t.tenant_id = TENANT_ID
    t.gira_id = GIRA_ID
    t.consulente_id = CONSULENTE_ID
    t.emitido_por_id = ADMIN_USER_ID
    t.numero = 1
    t.status = TicketStatus.EMITTED
    t.chamado_em = None
    t.finalizado_em = None
    t.observacoes = None
    t.created_at = datetime.now(timezone.utc)
    t.updated_at = datetime.now(timezone.utc)
    t.deleted_at = None
    return t


@pytest.fixture
def mock_db_session():
    """Create a mock async database session."""
    session = AsyncMock(spec=AsyncSession)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    session.refresh = AsyncMock()
    session.execute = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request."""
    request = MagicMock()
    request.state = MagicMock()
    request.state.user_id = USER_ID
    request.state.tenant_id = TENANT_ID
    request.state.role = "admin"
    request.url = MagicMock()
    request.url.path = "/api/v1/admin/giras"
    request.method = "GET"
    request.headers = {"Authorization": "Bearer test-token"}
    request.query_params = {}
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    return request
