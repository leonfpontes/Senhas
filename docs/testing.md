# Estratégia de Testes

**579 testes** | **95% cobertura** backend (3264/3440 statements)

---

## Visão Geral

| Tipo | Framework | Quantidade | Cobertura |
|------|-----------|-----------|-----------|
| **Unit (backend)** | pytest + pytest-asyncio | 579 | 95% |
| **Unit (frontend)** | Jest + React Testing Library | ~30 | Components/pages |
| **E2E** | Cypress | Scenarios | Auth + Admin flows |
| **Load** | Locust | Scenarios | p95 < 500ms |
| **Security** | Manual + scripts | OWASP checklist | Pass |

---

## Backend: Testes Unitários

### Setup

```bash
cd backend
pip install -e ".[dev]"
python -m pytest tests/unit/ --cov=src --cov-report=term-missing
```

### Estrutura de Testes

```
backend/tests/
├── conftest.py                          # Fixtures globais
├── unit/
│   ├── __init__.py
│   │
│   ├── # Core & Config
│   ├── test_core_config.py              # Settings, env vars
│   ├── test_core_database.py            # Session factory, engine
│   ├── test_core_errors.py              # Custom exceptions
│   ├── test_core_logging.py             # Structured logging
│   ├── test_main.py                     # App factory
│   │
│   ├── # Security
│   ├── test_security_jwt.py             # Token create/decode/expire
│   ├── test_security_password.py        # Hash/verify bcrypt
│   │
│   ├── # Models
│   ├── test_models.py                   # All 12 ORM models
│   │
│   ├── # Middleware
│   ├── test_middleware_tenant.py         # Tenant context injection
│   ├── test_middleware_jwt.py            # JWT decode middleware
│   ├── test_middleware_audit.py          # Audit logging middleware
│   │
│   ├── # Repositories (6 files, ~165 tests)
│   ├── test_repos_tenant_user_gira.py
│   ├── test_repos_ticket_consulente_senha.py
│   ├── test_repos_senha_extended.py
│   ├── test_repos_audit_billing_config.py
│   ├── test_repos_subscription_audit_flags.py
│   ├── test_repos_platform_analytics.py
│   ├── test_repositories_base.py
│   │
│   ├── # Dependencies
│   ├── test_dependencies.py             # Dependency injection
│   │
│   ├── # Endpoints
│   ├── test_auth_login.py               # Auth (login, refresh, logout)
│   ├── test_public_and_services.py      # Public endpoints + email service
│   ├── test_admin_endpoints.py          # Admin CRUD, analytics, audit
│   ├── test_admin_giras.py              # Gira CRUD specific
│   ├── test_platform_endpoints.py       # Platform (tenants, subs, billing)
│   │
│   ├── # Services
│   ├── test_audit_service.py            # Audit logging service
│   │
│   └── # Coverage gaps (121 tests)
│       └── test_coverage_gaps.py        # Emit-ticket, resend, subscriptions,
│                                        # email providers, templates, tenants,
│                                        # platform endpoints, health check
```

### Cobertura por Módulo

| Módulo | Statements | Missed | Coverage |
|--------|-----------|--------|----------|
| `api/v1/public/` | ~200 | ~10 | ~95% |
| `api/v1/admin/` | ~400 | ~30 | ~93% |
| `api/v1/platform/` | ~300 | ~20 | ~93% |
| `api/v1/auth/` | ~80 | ~5 | ~94% |
| `models/` | ~300 | ~5 | ~98% |
| `repositories/` | ~500 | ~30 | ~94% |
| `services/` | ~250 | ~15 | ~94% |
| `security/` | ~80 | ~5 | ~94% |
| `middleware/` | ~150 | ~10 | ~93% |
| `core/` | ~180 | ~45 | ~75% |
| **Total** | **3440** | **176** | **95%** |

### Padrão de Teste

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

class TestEndpoint:
    """Testes para um endpoint específico."""

    def _mock_db(self):
        """Cria mock do async session."""
        db = AsyncMock()
        db.execute = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_success_case(self):
        db = self._mock_db()
        # Setup mocks
        result = await endpoint_function(db=db, ...)
        # Assert
        assert result.status == "success"

    @pytest.mark.asyncio
    async def test_not_found(self):
        db = self._mock_db()
        db.execute.return_value.scalar_one_or_none.return_value = None
        with pytest.raises(HTTPException) as exc:
            await endpoint_function(db=db, ...)
        assert exc.value.status_code == 404
```

### Técnicas Especiais

**SQLAlchemy comparison mocking**: MagicMock não suporta `__le__`/`__ge__` (operadores de comparação usados em `WHERE gira.release_start_at <= now()`). Solução: usar classes Python puras:

```python
class _ComparableMock:
    """Mock para colunas SQLAlchemy que precisam de operadores de comparação."""
    def __le__(self, other): return MagicMock()
    def __ge__(self, other): return MagicMock()
    def __eq__(self, other): return MagicMock()
    def __ne__(self, other): return MagicMock()
    def __hash__(self): return id(self)
    def __getattr__(self, name): return MagicMock()
```

---

## Frontend: Testes Unitários

### Setup

```bash
cd frontend
npm test
```

### Estrutura

```
frontend/__tests__/
├── components/
│   └── BulkActionsBar.test.tsx     # Componente de ações em lote
├── hooks/
│   └── useGiraCountdown.test.ts    # Hook de countdown timer
├── pages/
│   ├── admin.test.tsx              # Página admin dashboard
│   ├── app.test.tsx                # App wrapper
│   ├── platform.test.tsx           # Página platform
│   └── public.test.tsx             # Página pública
├── providers/
│   └── ThemeProvider.test.tsx      # Theme provider MUI
└── services/
    └── api_client.test.ts          # Axios client
```

### Padrão

```tsx
import { render, screen } from '@testing-library/react';
import Dashboard from '../src/pages/admin/dashboard';

describe('Dashboard', () => {
  it('renders stats cards', () => {
    render(<Dashboard />);
    expect(screen.getByText('Total Giras')).toBeInTheDocument();
  });
});
```

---

## E2E: Cypress

### Cenários

```
e2e/scenarios/
├── auth_flow.spec.ts           # Login, refresh, logout, invalid creds
└── admin_operations.spec.ts    # Create gira, emit ticket, bulk mark used
```

### Execução

```bash
cd e2e
npx cypress run
# ou modo interativo:
npx cypress open
```

---

## Load: Locust

### Cenários

```python
# load_tests/locust_scenarios.py
class TicketEmissionUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def emit_ticket(self):
        self.client.post("/api/v1/public/{tenant}/emit-ticket", json={...})

    @task(1)
    def get_next_gira(self):
        self.client.get("/api/v1/public/{tenant}/next-gira")
```

### Execução

```bash
locust -f load_tests/locust_scenarios.py \
  --host=http://localhost:8000 \
  --users=100 \
  --spawn-rate=10 \
  --run-time=60s \
  --headless
```

### Resultados Esperados

| Métrica | Target | Resultado |
|---------|--------|-----------|
| p50 | < 100ms | ✅ |
| p95 | < 500ms | ✅ |
| p99 | < 1000ms | ✅ |
| Throughput | 100+ req/sec | ✅ |
| Error rate | < 0.1% | ✅ |

---

## Security: Audit

### OWASP Checklist

```
security/
├── audit.sh                    # Script de verificação automática
└── penetration_scenarios.md    # Cenários de teste de penetração
```

Verificações:
- ✅ SQL Injection (parameterized queries)
- ✅ XSS (React escaping + CSP)
- ✅ CSRF (SameSite cookies)
- ✅ Broken authentication (JWT validation)
- ✅ Broken access control (RBAC + tenant isolation)
- ✅ Security misconfiguration (headers, CORS)
- ✅ Rate limiting (configurável)

---

## CI/CD Integration

Os testes rodam automaticamente no GitHub Actions:

```yaml
# .github/workflows/deploy.yml
jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres: postgres:15
    steps:
      - uses: actions/setup-python@v5
      - run: pip install -e ".[dev]"
      - run: pytest tests/ --cov=src --cov-report=xml
      - uses: codecov/codecov-action@v4
```

---

## Executar Todos os Testes

```bash
# Backend
cd backend && python -m pytest tests/unit/ -v --cov=src

# Frontend
cd frontend && npm test

# E2E
cd e2e && npx cypress run

# Load
locust -f load_tests/locust_scenarios.py --headless --run-time=30s

# Security
bash security/audit.sh
```
