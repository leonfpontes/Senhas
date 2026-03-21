# Schema do Banco de Dados

**PostgreSQL 15** com SQLAlchemy 2.0 async e Alembic migrations.

---

## Diagrama ER

```
┌───────────────┐      ┌──────────────────┐      ┌─────────────────┐
│    Tenant     │──1:M──│      User        │      │  TenantConfig   │
│               │──1:1──│                  │      │                 │
│ id (UUID PK)  │       │ id (UUID PK)     │      │ tenant_id (FK)  │
│ slug (unique) │       │ tenant_id (FK)   │      │ primary_color   │
│ name          │       │ email (unique/t) │      │ secondary_color │
│ is_active     │       │ password_hash    │      │ logo_url        │
│ created_at    │       │ role (enum)      │      │ settings (JSON) │
│ updated_at    │       │ is_active        │      └─────────────────┘
│ deleted_at    │       │ created_at       │
└───────┬───────┘       └──────────────────┘
        │
        │──1:M──┐
        │       │
┌───────▼───────┐      ┌──────────────────┐
│     Gira      │──1:M──│     Ticket       │
│               │       │                  │
│ id (UUID PK)  │       │ id (UUID PK)     │
│ tenant_id(FK) │       │ tenant_id (FK)   │
│ nome          │       │ gira_id (FK)     │
│ data_inicio   │       │ consulente_id(FK)│
│ is_active     │       │ numero (int)     │
│ max_tickets   │       │ status (enum)    │
│ status (enum) │       │ emitido_por_id   │
│ created_at    │       │ email_sent       │
│ deleted_at    │       │ created_at       │
└───────┬───────┘       └──────────────────┘
        │
        │──1:1──┐       ┌──────────────────┐
        │       │       │   Consulente     │
┌───────▼───────┐       │                  │
│ SenhaControl  │       │ id (UUID PK)     │
│               │       │ tenant_id (FK)   │
│ tenant_id(FK) │       │ nome             │
│ gira_id (FK)  │       │ email            │
│ proximo_numero│       │ telefone         │
│ version (OL)  │       │ cpf              │
└───────────────┘       │ created_at       │
                        │ deleted_at       │
                        └──────────────────┘

┌───────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   AuditLog    │      │  Subscription    │      │    Invoice      │
│               │      │                  │      │                 │
│ id (UUID PK)  │      │ id (UUID PK)     │      │ id (UUID PK)    │
│ tenant_id(FK) │      │ tenant_id (FK)   │      │ tenant_id (FK)  │
│ user_id       │      │ plan_type (enum) │      │ subscription_id │
│ action (enum) │      │ status (enum)    │      │ amount          │
│ resource_type │      │ started_at       │      │ status          │
│ resource_id   │      │ expires_at       │      │ due_date        │
│ details (JSON)│      │ usage_count      │      │ paid_at         │
│ ip_address    │      │ max_usage        │      │ created_at      │
│ created_at    │      │ created_at       │      └─────────────────┘
└───────────────┘      └──────────────────┘

┌───────────────┐
│  FeatureFlag  │
│               │
│ id (UUID PK)  │
│ tenant_id(FK) │
│ flag_name     │
│ is_enabled    │
│ expires_at    │
│ created_at    │
└───────────────┘
```

---

## Modelos Detalhados

### Tenant

Representa uma organização (terreiro) no sistema.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK, default uuid4 |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL, indexed |
| `name` | VARCHAR(255) | NOT NULL |
| `is_active` | BOOLEAN | DEFAULT true |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `updated_at` | TIMESTAMP(tz) | ON UPDATE now() |
| `deleted_at` | TIMESTAMP(tz) | NULL (soft delete) |

### User

Identidade autenticada com RBAC.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), NULL para SUPER_ADMIN global |
| `email` | VARCHAR(255) | UNIQUE per tenant, NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `role` | ENUM | `SUPER_ADMIN`, `ADMIN`, `OPERATOR` |
| `full_name` | VARCHAR(255) | NOT NULL |
| `is_active` | BOOLEAN | DEFAULT true |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `updated_at` | TIMESTAMP(tz) | ON UPDATE now() |

### Gira

Sessão/evento espiritual onde senhas são emitidas.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), NOT NULL, indexed |
| `nome` | VARCHAR(255) | NOT NULL |
| `descricao` | TEXT | NULL |
| `data_inicio` | TIMESTAMP(tz) | NOT NULL |
| `release_start_at` | TIMESTAMP(tz) | Início da liberação de senhas |
| `release_end_at` | TIMESTAMP(tz) | Fim da liberação |
| `max_tickets` | INTEGER | DEFAULT 100 |
| `status` | ENUM | `ACTIVE`, `CLOSED`, `CANCELLED` |
| `is_active` | BOOLEAN | DEFAULT true |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `deleted_at` | TIMESTAMP(tz) | NULL (soft delete) |

### Ticket (Senha)

Entidade core — representa uma senha emitida para um consulente.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), NOT NULL, indexed |
| `gira_id` | UUID | FK(gira.id), NOT NULL |
| `consulente_id` | UUID | FK(consulente.id), NOT NULL |
| `numero` | INTEGER | NOT NULL, sequencial dentro da gira |
| `status` | ENUM | `PENDING`, `USED`, `CANCELLED`, `EXPIRED` |
| `emitido_por_id` | UUID | FK(user.id), NULL |
| `email_sent` | BOOLEAN | DEFAULT false |
| `email_provider` | VARCHAR(50) | `brevo` ou `resend` |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `marked_used_at` | TIMESTAMP(tz) | NULL |

**Unique constraint**: `(tenant_id, gira_id, consulente_email)` — impede duplicata por gira.

### Consulente

Pessoa que solicita uma senha.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), NOT NULL |
| `nome` | VARCHAR(255) | NOT NULL |
| `email` | VARCHAR(255) | NOT NULL |
| `telefone` | VARCHAR(20) | NULL |
| `cpf` | VARCHAR(14) | NULL, masked for LGPD |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `deleted_at` | TIMESTAMP(tz) | NULL (soft delete) |

### SenhaControl

Controle atômico de numeração para emissão de senhas.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), NOT NULL |
| `gira_id` | UUID | FK(gira.id), NOT NULL |
| `proximo_numero` | INTEGER | DEFAULT 1 |
| `version` | INTEGER | Optimistic locking |

**Unique constraint**: `(tenant_id, gira_id)` — uma entrada por gira por tenant.

**Nota**: Usa `SELECT FOR UPDATE` para garantir atomicidade na emissão.

### AuditLog

Trail imutável de todas as operações (LGPD compliance).

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), indexed |
| `user_id` | UUID | NULL (ações públicas) |
| `action` | ENUM | `TICKET_EMITTED`, `TICKET_USED`, `GIRA_CREATED`, etc. |
| `resource_type` | VARCHAR(50) | `ticket`, `gira`, `user`, etc. |
| `resource_id` | UUID | NULL |
| `details` | JSONB | Detalhes da operação |
| `ip_address` | VARCHAR(45) | IPv4/IPv6 |
| `created_at` | TIMESTAMP(tz) | DEFAULT now(), indexed |

**Nota**: Registros de audit NUNCA são atualizados ou deletados.

### TenantConfig

Configurações e branding customizáveis por tenant.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id), UNIQUE |
| `primary_color` | VARCHAR(7) | Hex color (#RRGGBB) |
| `secondary_color` | VARCHAR(7) | Hex color |
| `logo_url` | TEXT | NULL |
| `settings` | JSONB | Configurações adicionais |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |
| `updated_at` | TIMESTAMP(tz) | ON UPDATE now() |

### Subscription

Plano de assinatura do tenant.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id) |
| `plan_type` | ENUM | `FREE`, `BASIC`, `PRO`, `PREMIUM` |
| `status` | ENUM | `ACTIVE`, `SUSPENDED`, `CANCELLED`, `TRIAL` |
| `started_at` | TIMESTAMP(tz) | NOT NULL |
| `expires_at` | TIMESTAMP(tz) | NULL |
| `usage_count` | INTEGER | DEFAULT 0 |
| `max_usage` | INTEGER | Limite pelo plano |
| `trial_used` | BOOLEAN | DEFAULT false |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |

### Invoice

Registro de faturamento.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id) |
| `subscription_id` | UUID | FK(subscription.id) |
| `amount` | DECIMAL(10,2) | NOT NULL |
| `status` | VARCHAR(20) | `pending`, `paid`, `overdue` |
| `due_date` | DATE | NOT NULL |
| `paid_at` | TIMESTAMP(tz) | NULL |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |

### FeatureFlag

Controle de features por tenant.

| Coluna | Tipo | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK(tenant.id) |
| `flag_name` | VARCHAR(100) | NOT NULL |
| `is_enabled` | BOOLEAN | DEFAULT false |
| `expires_at` | TIMESTAMP(tz) | NULL (auto-disable) |
| `created_at` | TIMESTAMP(tz) | DEFAULT now() |

---

## Migrations

| Arquivo | Descrição |
|---------|-----------|
| `001_init_schema.py` | Tabelas core: tenants, users, giras, tickets, consulentes, senha_controls, audit_logs |
| `002_create_tables.py` | Campos adicionais, índices, constraints |
| `003_platform_tables.py` | tenant_config, subscriptions, invoices, feature_flags |

### Executar migrations

```bash
# Aplicar todas
alembic upgrade head

# Criar nova migration
alembic revision --autogenerate -m "Descrição"

# Reverter última
alembic downgrade -1
```

---

## Índices

| Tabela | Coluna(s) | Tipo |
|--------|-----------|------|
| `tenant` | `slug` | UNIQUE |
| `user` | `(tenant_id, email)` | UNIQUE |
| `ticket` | `tenant_id` | B-tree |
| `ticket` | `(tenant_id, gira_id)` | B-tree |
| `ticket` | `status` | B-tree |
| `gira` | `tenant_id` | B-tree |
| `gira` | `status` | B-tree |
| `audit_log` | `tenant_id` | B-tree |
| `audit_log` | `created_at` | B-tree |
| `senha_control` | `(tenant_id, gira_id)` | UNIQUE |

---

## Enums

```python
class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    OPERATOR = "OPERATOR"

class TicketStatus(str, Enum):
    PENDING = "PENDING"
    USED = "USED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class GiraStatus(str, Enum):
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"

class PlanType(str, Enum):
    FREE = "FREE"
    BASIC = "BASIC"
    PRO = "PRO"
    PREMIUM = "PREMIUM"

class SubscriptionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"
    TRIAL = "TRIAL"

class AuditAction(str, Enum):
    TICKET_EMITTED = "TICKET_EMITTED"
    TICKET_USED = "TICKET_USED"
    TICKET_CANCELLED = "TICKET_CANCELLED"
    GIRA_CREATED = "GIRA_CREATED"
    GIRA_UPDATED = "GIRA_UPDATED"
    GIRA_DELETED = "GIRA_DELETED"
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    CONFIG_UPDATED = "CONFIG_UPDATED"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
```
