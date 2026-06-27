# Arquitetura do Sistema

**GiraHub (Senhas)** — Sistema SaaS multi-tenant para gestão de senhas de Terreiros de Umbanda.

---

## Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└─────────────┬──────────────────────┬────────────────────────┘
              │                      │
       ┌──────▼──────┐       ┌──────▼──────┐
       │   Nginx     │       │  Certbot    │
       │  (SSL/TLS)  │       │ (Let's      │
       │  port 80/443│       │  Encrypt)   │
       └──────┬──────┘       └─────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼───┐ ┌──▼──┐ ┌───▼────┐
│Next.js│ │ API │ │ Static │
│:3000  │ │:8000│ │ Files  │
└───────┘ └──┬──┘ └────────┘
             │
    ┌────────┼────────┐
    │        │        │
┌───▼──┐ ┌──▼───┐ ┌──▼───┐ ┌────────┐
│Postgr│ │Redis │ │Email │ │Sentry  │
│SQL 15│ │ 7    │ │Brevo │ │(erros) │
│:5432 │ │:6379 │ │Resend│ │externo │
└──────┘ └──────┘ └──────┘ └────────┘
```

---

## Camadas da Aplicação

### 1. Presentation Layer (Frontend)

**Next.js 14** com TypeScript, renderização server-side e client-side.

| Área | Responsabilidade |
|------|-----------------|
| **Public pages** | Emissão de senhas, consulta de giras |
| **Admin dashboard** | CRUD de giras, tickets, analytics, audit |
| **Platform** | Gestão multi-tenant (SUPER_ADMIN) |

**Libs**: Material-UI v5, Recharts, Axios (withCredentials: true), Zustand, @sentry/nextjs.

### 2. API Layer (Backend)

**FastAPI 0.104** com Python async, OpenAPI automático.

```
Request → Nginx → FastAPI
                    ├── Middleware Stack
                    │   ├── CORS
                    │   ├── Tenant Context (extract tenant_id)
                    │   ├── JWT Auth (decode + validate)
                    │   └── Audit Logging
                    │
                    ├── Router → Endpoint Handler
                    │   ├── Pydantic validation (request body)
                    │   ├── Business logic
                    │   └── Pydantic serialization (response)
                    │
                    └── Repository → Database
```

**Organização dos endpoints**:

| Prefixo | Auth | Descrição |
|---------|------|-----------|
| `/api/v1/public/` | Nenhuma | Emissão pública de senhas |
| `/api/v1/auth/` | Nenhuma | Login, refresh, logout |
| `/api/v1/admin/` | JWT (ADMIN/OPERATOR) | Painel administrativo |
| `/api/v1/platform/` | JWT (SUPER_ADMIN) | Gestão da plataforma |

### 3. Service Layer

Lógica de negócio desacoplada dos endpoints:

| Serviço | Responsabilidade |
|---------|-----------------|
| `EmailService` | Envio dual-provider (Brevo → Resend fallback) |
| `AuditService` | Registro imutável de ações |
| `SubscriptionService` | Gestão de planos e assinaturas |
| `TenantService` | Criação e gestão de tenants |

### 4. Repository Layer

Padrão `BaseRepository<T>` com filtragem automática por `tenant_id`:

```python
class BaseRepository(Generic[T]):
    """Todas as queries incluem WHERE tenant_id = :tenant_id automaticamente."""

    async def get_by_id(self, id: UUID) -> T | None: ...
    async def list(self, offset=0, limit=50) -> list[T]: ...
    async def create(self, **kwargs) -> T: ...
    async def update(self, id: UUID, **kwargs) -> T: ...
    async def soft_delete(self, id: UUID) -> None: ...
```

**15 repositórios** estendem `BaseRepository`:
- `TenantRepo`, `UserRepo`, `GiraRepo`, `ConsulentRepo`, `TicketRepo`
- `SenhaControlRepo`, `AuditLogRepo`, `ConfigRepo`
- `SubscriptionRepo`, `BillingRepo`, `FeatureFlagsRepo`
- `TicketAnalyticsRepo`, `ConsolidatedAuditRepo`, `PlatformUserRepo`

### 5. Data Layer

**PostgreSQL 15** com SQLAlchemy 2.0 async + Alembic migrations.

- 12 modelos ORM
- UUIDs como chaves primárias
- Soft delete via `deleted_at`
- Timestamps automáticos (`created_at`, `updated_at`)
- JSONB para details em AuditLog

---

## Middleware Stack

A cada request, o stack de middleware executa em sequência:

```
1. CORSMiddleware        → Valida origem da requisição
2. TenantContextMiddleware → Extrai tenant_id do JWT ou path
3. JWTMiddleware          → Decodifica e valida token
4. AuditLoggingMiddleware → Registra a operação no audit trail
```

---

## Fluxo: Emissão de Senha (Core MVP)

```
Consulente (browser)
    │
    ▼
GET /public/{tenant_id}/next-gira
    → Retorna gira ativa com vagas
    │
    ▼
POST /public/{tenant_id}/emit-ticket
    → Valida dados (Pydantic)
    → BEGIN TRANSACTION
    → SELECT FOR UPDATE senha_controls WHERE (tenant_id, gira_id)
    → IF proximo_numero >= max_tickets → ROLLBACK → 409 Conflict
    → INSERT ticket (numero = proximo_numero)
    → UPDATE senha_controls SET proximo_numero += 1
    → COMMIT
    → Envia e-mail async (Brevo → Resend fallback)
    → Retorna ticket emitido (201)
```

Características do fluxo:
- **Atômico**: `SELECT FOR UPDATE` impede race conditions
- **Idempotente**: Mesmo e-mail por gira retorna 409 (sem duplicatas)
- **Resiliente**: Se Brevo falha, tenta Resend automaticamente

---

## Multi-Tenant Isolation

3 camadas de isolamento garantem que nenhum tenant acessa dados de outro:

| Camada | Mecanismo | Onde |
|--------|-----------|------|
| **1. Token** | `tenant_id` no payload JWT | `security/jwt.py` |
| **2. Middleware** | Verifica e injeta `tenant_id` no request state | `middleware/tenant_context.py` |
| **3. Query** | Todas as queries filtram por `tenant_id` | `repositories/base.py` |

---

## Grupos de Permissão (Fine-Grained RBAC)

O sistema conta com um controle de acesso baseado em grupos (Group-Based RBAC) que refina as permissões atribuídas a usuários com a role `OPERATOR`:

1. **Estrutura**: Admins do tenant definem grupos de usuários (ex: "Operadores da Porta", "Financeiro") e mapeiam permissões (Visualizar, Inserir, Editar, Deletar) para cada funcionalidade (giras, tickets, porta, estoque, financeiro, etc.).
2. **Consolidação**: Usuários podem pertencer a múltiplos grupos. Suas permissões finais são consolidadas via **lógica OR permissiva** (se pelo menos um grupo do usuário concede a permissão, o acesso é liberado).
3. **Bypass**: Usuários com a role `ADMIN` ou `SUPER_ADMIN` (e sessões de impersonação ativa) bypassam todas as verificações de grupo, mantendo acesso total.
4. **Compatibilidade Retroativa**: Um operador que não pertença a nenhum grupo de permissões mantém acesso total de operador por padrão.
5. **Resiliência e Performance**:
   - As permissões no backend são validadas a cada requisição via injeção de dependência `require_group_permission(feature, action)`.
   - Para evitar N+1 queries no request pipeline, a consolidação OR é computada diretamente no banco de dados usando cláusulas SQL `MAX()` agrupadas.
   - O cache HTTP (`Cache-Control: private, max-age=300`) é utilizado no endpoint de permissões do usuário para aliviar as requisições recorrentes.

---

## Segurança

| Controle | Implementação |
|----------|---------------|
| Autenticação | JWT HS256, 24h access + 30d refresh |
| Autorização | RBAC (SUPER_ADMIN, ADMIN, OPERATOR) |
| Senhas | bcrypt 12 rounds |
| Transport | HTTPS TLS 1.3 (Let's Encrypt) |
| Injection | ORM parameterizado (SQLAlchemy) |
| XSS | React escaping + CSP headers |
| CSRF | SameSite cookies + CORS |
| Rate Limit | Configurável por endpoint |
| Auditoria | Trail imutável, LGPD compliant |

---

## Infraestrutura de Produção

```yaml
Services:
  postgres:   PostgreSQL 15-alpine, volume persistente, healthcheck
  redis:      Redis 7-alpine, cache + sessões
  backend:    FastAPI + Uvicorn (multi-worker)
  frontend:   Next.js (production build)
  nginx:      Reverse proxy, SSL termination
  prometheus: Coleta de métricas
  grafana:    Dashboards de monitoramento
```

---

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| **FastAPI** (não Django) | Async nativo, performance, OpenAPI automático |
| **SQLAlchemy 2.0 async** | ORM maduro + async/await |
| **Next.js 14** (não SPA) | SSR para SEO das páginas públicas |
| **Material-UI** | Design system robusto, acessibilidade WCAG AA |
| **Brevo + Resend** | Redundância de providers (99.5%+ delivery) |
| **UUID PKs** | Segurança (não sequencial), multi-tenant safe |
| **Soft delete** | LGPD compliance, auditoria |
| **SELECT FOR UPDATE** | Emissão atômica sem race conditions |
| **Monorepo** | Shared types/UI, deploy coordenado |
