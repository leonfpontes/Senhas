# AGENTS.md - Project Status & Coordination

**Last Updated**: 2026-03-06  
**Project**: Senhas - Multi-Tenant SaaS Password Management  
**Repository**: `leonfpontes/Senhas`  
**Branch**: `001-multi-tenant-senhas`  
**Status**: **v1.0 - COMPLETE & PRODUCTION READY** ✅

---

## Executive Summary

Sistema SaaS multi-tenant para emissão e gestão de senhas (tickets) para Terreiros de Umbanda. Todas as 7 fases de desenvolvimento concluídas com sucesso.

| Fase | Descrição | Tarefas | Arquivos | Status |
|------|-----------|---------|----------|--------|
| 1 | Setup & Infraestrutura | 10 | 36 | ✅ |
| 2 | Backend Foundation | 19 | 30 | ✅ |
| 3 | API Pública de Emissão | 20 | 35 | ✅ |
| 4 | Admin Dashboard & Analytics | 30 | 32 | ✅ |
| 5 | UI/UX & Branding | 15 | 15 | ✅ |
| 6 | Super Admin Platform | 20 | 18 | ✅ |
| 7 | Testes, QA & Deploy | 15 | 15 | ✅ |
| **Total** | | **149** | **200+** | ✅ |

**Cobertura de Testes**: 579 testes, **95% cobertura** backend (3264/3440 statements)

---

## Arquitetura

### Tech Stack
| Camada | Tecnologia |
|--------|-----------|
| **Backend** | FastAPI 0.104+, Python 3.11+, SQLAlchemy 2.0+ (async), Pydantic v2 |
| **Frontend** | Next.js 14+, TypeScript 5.x, Material-UI v5, Recharts |
| **Database** | PostgreSQL 15+, Alembic migrations |
| **Auth** | JWT (24h access + 30d refresh, HTTP-only cookie), bcrypt |
| **E-mail** | Brevo (primário) + Resend (fallback) |
| **Infra** | Docker Compose, Nginx, Let's Encrypt SSL |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus + Grafana |

### Estrutura do Monorepo

```
/
├── backend/                    # FastAPI 0.104+
│   ├── src/
│   │   ├── models/            # 12 SQLAlchemy ORM models
│   │   ├── repositories/     # 15 repositórios (BaseRepository pattern)
│   │   ├── api/v1/
│   │   │   ├── public/       # 3 endpoints (next-gira, emit-ticket, resend)
│   │   │   ├── admin/        # 13 endpoints (CRUD, analytics, audit)
│   │   │   ├── platform/     # 7 endpoints (tenants, billing, flags)
│   │   │   └── auth/         # Auth (login, refresh, logout)
│   │   ├── services/         # Email, audit, subscription, tenant
│   │   ├── security/         # JWT, password hashing
│   │   ├── middleware/       # Tenant context, JWT, audit logging
│   │   └── core/             # Config, database, errors, logging
│   ├── alembic/              # 3 database migrations
│   ├── tests/                # 579 testes (95% cobertura)
│   └── pyproject.toml
│
├── frontend/                  # Next.js 14+
│   ├── src/
│   │   ├── pages/            # Public, Admin, Platform
│   │   ├── components/       # Componentes reutilizáveis
│   │   ├── services/         # API client (Axios)
│   │   └── hooks/            # Custom hooks
│   ├── __tests__/            # Jest + React Testing Library
│   └── package.json
│
├── packages/
│   ├── shared-types/         # TypeScript API contracts
│   └── shared-ui/            # Material-UI theme + components
│
├── devops/                   # VPS setup automation
├── e2e/                      # Cypress E2E tests
├── load_tests/               # Locust performance tests
├── security/                 # Audit + penetration scenarios
├── docs/                     # Documentação completa
├── .github/workflows/        # CI/CD pipeline
├── docker-compose.yml        # Dev orchestration
└── docker-compose.prod.yml   # Production orchestration
```

---

## Funcionalidades por Fase

### Fase 1: Foundation
- Docker Compose (PostgreSQL + Backend + Frontend)
- Database schema (7+ tabelas, 100+ constraints)
- Git hooks (pre-commit lint/format)
- Monorepo workspace setup

### Fase 2: Backend Core
- 12 ORM models (Tenant, User, Gira, Ticket, Consulente, SenhaControl, AuditLog, TenantConfig, Subscription, Invoice, FeatureFlag)
- JWT auth (24h access, 30d refresh)
- RBAC (3 roles: SUPER_ADMIN, ADMIN, OPERATOR)
- BaseRepository pattern (multi-tenant auto-filtering)
- FastAPI app factory com middleware stack

### Fase 3: API Pública (Core MVP)
- Emissão atômica de tickets (SELECT FOR UPDATE)
- Dual email providers (Brevo + Resend)
- 3 endpoints públicos (next-gira, emit-ticket, resend-email)
- Frontend: Páginas públicas + countdown timer

### Fase 4: Admin Dashboard
- 13 endpoints admin (CRUD, analytics, bulk ops, exports)
- Audit logging (trail imutável)
- Analytics (SUM, COUNT, AVG)
- Admin pages (dashboard, giras, tickets, config, audit, analytics)

### Fase 5: Design System
- Material-UI theme system
- Tenant branding override (cores customizáveis)
- Design responsivo (mobile-first, 4 breakpoints)
- WCAG AA accessibility

### Fase 6: Super Admin Platform
- Gestão multi-tenant (criar, suspender, deletar)
- Gestão global de usuários SUPER_ADMIN
- Assinaturas (4 tiers: basic/pro/premium/enterprise)
- Auditoria consolidada cross-tenant
- Billing & invoicing
- Feature flags por tenant
- 7 endpoints platform + 5 páginas admin

### Fase 7: QA & Deployment
- 579 testes unitários (95% cobertura)
- E2E tests (Cypress)
- Load tests (Locust, p95 < 500ms)
- Security audit (OWASP checklist)
- CI/CD pipeline (GitHub Actions)
- VPS deployment (Ubuntu 22.04 LTS, Nginx, SSL)

---

## Multi-Tenant Isolation (3 camadas)

1. **JWT Payload**: `{"sub": "user_id", "tenant_id": "uuid"}`
2. **Middleware**: Extract `tenant_id` → `request.state.tenant_id`
3. **Repository**: Todas as queries: `WHERE tenant_id = :tenant_id`
4. **Resultado**: Zero risco de vazamento de dados entre tenants

---

## Métricas de Performance

| Métrica | Valor |
|---------|-------|
| p50 latency | < 100ms |
| p95 latency | < 500ms |
| p99 latency | < 1000ms |
| Throughput | 100+ req/sec |
| Ticket emission | 50+ tickets/sec |
| Concurrent users | 100 sem degradação |
| API error rate | < 0.1% |
| Email delivery | > 99.5% |

---

## Documentação

| Documento | Caminho |
|-----------|---------|
| Arquitetura | `docs/architecture.md` |
| API Reference | `docs/api.md` |
| Database Schema | `docs/database.md` |
| Autenticação & RBAC | `docs/authentication.md` |
| Multi-Tenancy | `docs/multi-tenancy.md` |
| E-mail System | `docs/email.md` |
| Testes | `docs/testing.md` |
| Deploy | `docs/deployment.md` |
| Release Notes | `RELEASE.md` |

---

## Status: PRODUCTION READY 🚀

Todo o MVP v1.0 completo. Todas as fases implementadas, testadas e documentadas.
