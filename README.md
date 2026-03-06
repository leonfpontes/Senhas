# Senhas - Sistema Multi-Tenant de Gestão de Senhas

[![CI/CD](https://github.com/leonfpontes/Senhas/actions/workflows/deploy.yml/badge.svg)](https://github.com/leonfpontes/Senhas/actions)
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)]()
[![License](https://img.shields.io/badge/license-Proprietary-blue)]()

Sistema SaaS multi-tenant para emissão e gestão de senhas (tickets) para Terreiros de Umbanda e centros espíritas. Suporte completo a multi-tenancy, auditoria imutável e conformidade com LGPD.

---

## Funcionalidades Principais

- **Emissão pública de senhas** — Consulentes solicitam senha online, recebem confirmação por e-mail
- **Controle atômico** — `SELECT FOR UPDATE` garante numeração sequencial sem race conditions
- **Multi-tenant completo** — Isolamento em 3 camadas (JWT → Middleware → Repository)
- **Painel administrativo** — CRUD de giras, tickets, consulentes, analytics e auditoria
- **Plataforma Super Admin** — Gestão de tenants, assinaturas, billing, feature flags
- **E-mail dual-provider** — Brevo (primário) + Resend (fallback)
- **RBAC** — 3 papéis: `SUPER_ADMIN`, `ADMIN`, `OPERATOR`
- **Auditoria LGPD** — Trail imutável de todas as operações
- **Design responsivo** — Material-UI, mobile-first, WCAG AA

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Backend** | FastAPI 0.104, Python 3.11+, SQLAlchemy 2.0 (async), Pydantic v2 |
| **Frontend** | Next.js 14, TypeScript 5, Material-UI v5, Recharts |
| **Banco** | PostgreSQL 15, Alembic migrations |
| **Auth** | JWT (24h access + 30d refresh), bcrypt |
| **E-mail** | Brevo + Resend |
| **Infra** | Docker Compose, Nginx, Let's Encrypt SSL |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus + Grafana |

---

## Estrutura do Monorepo

```
senhas/
├── backend/                    # FastAPI API
│   ├── src/
│   │   ├── api/v1/            # Endpoints (public, admin, platform, auth)
│   │   ├── models/            # 12 SQLAlchemy ORM models
│   │   ├── repositories/      # 15 repositórios (BaseRepository pattern)
│   │   ├── services/          # Email, audit, subscription, tenant
│   │   ├── security/          # JWT, password hashing
│   │   ├── middleware/        # Tenant context, JWT, audit logging
│   │   ├── core/              # Config, database, errors, logging
│   │   └── main.py            # App factory
│   ├── alembic/               # 3 migrações de banco
│   ├── tests/                 # 579 testes unitários (95% cobertura)
│   ├── Dockerfile
│   └── pyproject.toml
│
├── frontend/                   # Next.js 14
│   ├── src/
│   │   ├── pages/             # Public, Admin, Platform
│   │   ├── components/        # Componentes reutilizáveis
│   │   ├── services/          # Axios API client
│   │   └── hooks/             # useCountdownTimer, etc.
│   ├── __tests__/             # Jest + React Testing Library
│   ├── Dockerfile
│   └── package.json
│
├── packages/
│   ├── shared-types/          # Contratos TypeScript
│   └── shared-ui/             # Tema Material-UI + componentes
│
├── devops/                    # VPS setup automation
├── e2e/                       # Cypress E2E tests
├── load_tests/                # Locust performance tests
├── security/                  # Audit + penetration scenarios
├── docs/                      # Documentação completa do projeto
├── .github/workflows/         # CI/CD pipeline
├── docker-compose.yml         # Dev orchestration
├── docker-compose.prod.yml    # Production orchestration
└── .env.example               # Template de variáveis de ambiente
```

---

## Quick Start

### Pré-requisitos
- Docker & Docker Compose
- Node.js 18+ / Python 3.11+

### 1. Configurar ambiente

```bash
git clone https://github.com/leonfpontes/Senhas.git
cd Senhas
cp .env.example .env
# Edite .env com seus valores (JWT_SECRET_KEY, BREVO_API_KEY, etc.)
```

### 2. Iniciar com Docker

```bash
docker-compose up
```

Serviços disponíveis:
- **PostgreSQL**: `localhost:5432`
- **Backend (FastAPI)**: `http://localhost:8000` — Docs em `/docs`
- **Frontend (Next.js)**: `http://localhost:3000`

### 3. Criar Super Admin (primeira vez)

```bash
cd backend
python seed_superadmin.py
```

### Desenvolvimento local (sem Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn src.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## API Endpoints

### Públicos (sem autenticação)
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/public/{tenant_id}/next-gira` | Próxima gira disponível |
| `POST` | `/api/v1/public/{tenant_id}/emit-ticket` | Emitir senha |
| `POST` | `/api/v1/public/{tenant_id}/resend-email` | Reenviar e-mail |

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/auth/login` | Login (retorna JWT) |
| `POST` | `/api/v1/auth/refresh` | Renovar token |
| `POST` | `/api/v1/auth/logout` | Logout |

### Admin (requer JWT com role ADMIN)
| Método | Rota | Descrição |
|--------|------|-----------|
| `CRUD` | `/api/v1/admin/giras` | Gestão de giras |
| `GET` | `/api/v1/admin/giras/{id}/tickets` | Listar senhas da gira |
| `POST` | `/api/v1/admin/giras/{id}/tickets/bulk-*` | Operações em lote |
| `GET` | `/api/v1/admin/analytics` | Dashboard analytics |
| `GET` | `/api/v1/admin/audit-logs` | Trail de auditoria |
| `GET/PUT` | `/api/v1/admin/tenant/config` | Configuração do tenant |
| `GET` | `/api/v1/admin/giras/{id}/export-csv` | Exportar CSV |

### Platform (requer SUPER_ADMIN)
| Método | Rota | Descrição |
|--------|------|-----------|
| `CRUD` | `/api/v1/platform/tenants` | Gestão de tenants |
| `CRUD` | `/api/v1/platform/subscriptions` | Assinaturas |
| `GET/POST` | `/api/v1/platform/billing/invoices` | Faturamento |
| `CRUD` | `/api/v1/platform/feature-flags` | Feature flags |
| `GET` | `/api/v1/platform/audit/consolidated` | Auditoria global |
| `CRUD` | `/api/v1/platform/users` | Usuários globais |

> Documentação completa da API: [`docs/api.md`](docs/api.md)

---

## Testes

```bash
# Backend — 579 testes, 95% cobertura
cd backend
pip install -e ".[dev]"
python -m pytest tests/unit/ --cov=src --cov-report=term-missing

# Frontend — Jest + React Testing Library
cd frontend
npm test

# E2E — Cypress
cd e2e
npx cypress run

# Load — Locust
locust -f load_tests/locust_scenarios.py --host=http://localhost:8000
```

---

## Deploy em Produção

Veja [`DEPLOYMENT.md`](DEPLOYMENT.md) para guia completo. Resumo:

1. Provisionar VPS Ubuntu 22.04 LTS (2+ CPU, 4+ GB RAM)
2. Executar `devops/vps_setup.sh`
3. Configurar `.env` com valores de produção
4. `docker-compose -f docker-compose.prod.yml up -d`
5. `alembic upgrade head`
6. Configurar Nginx + SSL (Let's Encrypt)

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [`docs/architecture.md`](docs/architecture.md) | Arquitetura do sistema |
| [`docs/api.md`](docs/api.md) | Referência completa da API |
| [`docs/database.md`](docs/database.md) | Schema e modelos do banco |
| [`docs/authentication.md`](docs/authentication.md) | JWT, RBAC e segurança |
| [`docs/multi-tenancy.md`](docs/multi-tenancy.md) | Isolamento multi-tenant |
| [`docs/email.md`](docs/email.md) | Sistema de e-mail dual-provider |
| [`docs/testing.md`](docs/testing.md) | Estratégia e cobertura de testes |
| [`docs/deployment.md`](docs/deployment.md) | Guia de deploy |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Deploy guide (legado) |
| [`RELEASE.md`](RELEASE.md) | Release notes v1.0 |

---

## Variáveis de Ambiente

Veja [`.env.example`](.env.example) para todas as configurações:

| Grupo | Variáveis |
|-------|-----------|
| **Database** | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| **JWT** | `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS` |
| **E-mail** | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `RESEND_API_KEY` |
| **App** | `BACKEND_PORT`, `LOG_LEVEL`, `DEBUG`, `ENVIRONMENT` |
| **Frontend** | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME` |
| **LGPD** | `DEFAULT_DATA_RETENTION_DAYS`, `DEFAULT_TIMEZONE` |
| **Rate Limit** | `RATE_LIMIT_PUBLIC_EMISSION`, `RATE_LIMIT_ADMIN` |
| **Features** | `FEATURE_SUPER_ADMIN`, `FEATURE_ANALYTICS`, `FEATURE_PAYMENT` |

---

## Licença

Proprietário — © 2026 Leon F. Pontes. Todos os direitos reservados.
