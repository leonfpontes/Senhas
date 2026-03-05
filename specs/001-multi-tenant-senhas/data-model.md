# Data Model - Multi-Tenant Password Management SaaS

**Version**: 1.0  
**Last Updated**: 2026-03-05  
**Stack**: PostgreSQL 14+, SQLAlchemy 2.0+

---

## Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Table Schemas](#table-schemas)
4. [Indices Strategy](#indices-strategy)
5. [Constraints & Validation](#constraints--validation)
6. [Migration Strategy](#migration-strategy)

---

## Overview

### Multi-Tenancy Architecture

- **Isolation Model**: Row-Level Security (RLS) with `tenant_id` on all tables
- **Tenant Scope**: Every query must filter by `tenant_id` to prevent cross-tenant leakage
- **Soft Deletes**: All tables except `audit_logs` support soft-delete via `deleted_at` timestamp
- **Data Retention**: LGPD-compliant with configurable TTL (default 12 months for deleted records)

### Key Principles

- Immutable audit trail via `audit_logs`
- Atomic ticket numbering via SELECT FOR UPDATE
- JWT-based authentication with RBAC roles
- Timestamps in UTC (created_at, updated_at) for all tables

---

## Entity Relationship Diagram

```
┌─────────────┐
│   TENANTS   │────────┐
├─────────────┤        │
│ id (PK)     │        │ 1:N
│ slug (UQ)   │        │
│ name        │        │
│ branding    │        │
└─────────────┘        │
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│    USERS    │  │     GIRAS    │  │   CONSULENTES│
├─────────────┤  ├──────────────┤  ├──────────────┤
│ id (PK)     │  │ id (PK)      │  │ id (PK)      │
│ tenant_id   │  │ tenant_id    │  │ tenant_id    │
│ email (UQ)  │  │ number       │  │ email        │
│ password    │  │ completed_at │  │ name         │
│ role        │  │ deleted_at   │  │ phone        │
│ deleted_at  │  │ created_at   │  │ deleted_at   │
└─────────────┘  └──────────────┘  └──────────────┘
    │                 ▲                  ▲
    │ 1:N             │ 1:N              │ 1:N
    │                 │                  │
    │            ┌────────────────┐      │
    │            │    TICKETS     │─────┘
    │            ├────────────────┤
    └─────────────│ id (PK)        │
                 │ tenant_id      │
                 │ gira_id        │
                 │ consulente_id  │
                 │ number         │
                 │ sequence       │
                 │ email_sent_at  │
                 │ deleted_at     │
                 └────────────────┘
                        ▲
                        │ 1:N
    ┌───────────────────┴────────────────┐
    │                                    │
┌─────────────────┐          ┌──────────────────┐
│ SENHA_CONTROLS  │          │  AUDIT_LOGS      │
├─────────────────┤          ├──────────────────┤
│ id (PK)         │          │ id (PK)          │
│ tenant_id       │          │ tenant_id        │
│ gira_id         │          │ user_id (FK)     │
│ ticket_id       │          │ action           │
│ password        │          │ entity_type      │
│ revealed_at     │          │ entity_id        │
│ deleted_at      │          │ changes          │
│ created_at      │          │ ip_address       │
└─────────────────┘          │ user_agent       │
                             │ created_at       │
                             └──────────────────┘
```

---

## Table Schemas

### 1. TENANTS

Root entity for multi-tenancy. Each tenant is isolated and has their own data, users, and branding.

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Branding & Configuration
    branding JSONB NOT NULL DEFAULT '{
        "logo_url": null,
        "primary_color": "#6366f1",
        "secondary_color": "#4f46e5",
        "support_email": null,
        "terms_url": null
    }',
    
    -- Subscription & Status
    plan VARCHAR(20) NOT NULL DEFAULT 'starter' 
        CHECK (plan IN ('starter', 'professional', 'enterprise')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'cancelled')),
    
    -- LGPD Data Retention (in days)
    data_retention_days INT NOT NULL DEFAULT 365,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
```

**Constraints**:
- `slug`: 3-50 alphanumeric characters + hyphens, unique when not deleted
- `plan`: Only valid SaaS plan tiers
- `data_retention_days`: 30-3650 range, user-configurable

---

### 2. USERS

Tenant users with role-based access control.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Authentication
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile
    full_name VARCHAR(255),
    phone VARCHAR(20),
    
    -- Authorization
    role VARCHAR(20) NOT NULL DEFAULT 'operator'
        CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATOR')),
    
    -- Account Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Session Management
    password_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(tenant_id, email) WHERE deleted_at IS NULL
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_is_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;
```

**Constraints**:
- `email`: RFC 5322 compliant, lowercase, unique per tenant
- `role`: SUPER_ADMIN (platform level), ADMIN (tenant manager), OPERATOR (regular user)
- `failed_login_attempts`: Reset on successful login, locks after 5 attempts for 15 min
- `password_changed_at`: Track password age for security policies

---

### 3. GIRAS

Events (spiritual ceremonies) where tickets are emitted. Core booking entity.

```sql
CREATE TABLE giras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Event Metadata
    number INT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    
    -- Scheduling
    event_date DATE NOT NULL,
    event_time TIME,
    duration_minutes INT,
    
    -- Location
    location VARCHAR(255),
    capacity INT,
    
    -- Ticket Control
    total_tickets_issued INT NOT NULL DEFAULT 0,
    tickets_limit INT,
    
    -- Status & Completion
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(tenant_id, number) WHERE deleted_at IS NULL
);

CREATE INDEX idx_giras_tenant_id ON giras(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_giras_event_date ON giras(tenant_id, event_date) WHERE deleted_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX idx_giras_completed_at ON giras(tenant_id, completed_at) WHERE deleted_at IS NULL;
```

**Constraints**:
- `number`: Auto-incremented per tenant, immutable after creation
- `event_date`: Cannot be in the past when creating
- `tickets_limit`: Optional; if set, must be ≥ total_tickets_issued
- `completed_at`: Set when gira is marked as completed (final state)

---

### 4. TICKETS

Emitted tickets (senha) for consulentes. Atomic numbering via SELECT FOR UPDATE.

```sql
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gira_id UUID NOT NULL REFERENCES giras(id) ON DELETE RESTRICT,
    consulente_id UUID NOT NULL REFERENCES consulentes(id) ON DELETE CASCADE,
    
    -- Ticket Numbering
    number INT NOT NULL,
    sequence INT NOT NULL,
    
    -- Email Tracking
    email_address VARCHAR(255) NOT NULL,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_opened_at TIMESTAMP WITH TIME ZONE,
    resend_count INT NOT NULL DEFAULT 0,
    last_resend_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    request_ip VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(tenant_id, gira_id, number) WHERE deleted_at IS NULL,
    UNIQUE(tenant_id, gira_id, sequence) WHERE deleted_at IS NULL
);

CREATE INDEX idx_tickets_tenant_id ON tickets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_gira_id ON tickets(gira_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_consulente_id ON tickets(consulente_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_email_address ON tickets(tenant_id, email_address) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_is_used ON tickets(gira_id, is_used) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_created_at ON tickets(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
```

**Constraints**:
- `number`: Globally unique per (tenant_id, gira_id), assigned atomically
- `sequence`: Row order within gira, used for "next ticket" logic
- `email_address`: Denormalized from consulente for audit trail
- `resend_count`: Max 3 resends per ticket (rate limit 2 req/min)
- `is_used`: Immutable once TRUE; marks when ticket holder arrives

---

### 5. CONSULENTES

Guest/visitor data for ticket emission. Lightweight profile.

```sql
CREATE TABLE consulentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Contact Info
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    
    -- Profile
    birth_date DATE,
    document_number VARCHAR(20),
    
    -- Engagement
    total_tickets INT NOT NULL DEFAULT 0,
    first_ticket_date TIMESTAMP WITH TIME ZONE,
    last_ticket_date TIMESTAMP WITH TIME ZONE,
    
    -- Preferences
    subscription_type VARCHAR(20) DEFAULT 'none'
        CHECK (subscription_type IN ('none', 'weekly', 'monthly', 'each_gira')),
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(tenant_id, email) WHERE deleted_at IS NULL
);

CREATE INDEX idx_consulentes_tenant_id ON consulentes(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_consulentes_email ON consulentes(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_consulentes_subscription_type ON consulentes(tenant_id, subscription_type) WHERE deleted_at IS NULL;
```

**Constraints**:
- `email`: RFC 5322 compliant, denormalized to tickets for audit trail
- `document_number`: Optional, used for internal identification
- `total_tickets`: Counts emitted tickets (not deleted ones)

---

### 6. SENHA_CONTROLS

Audit trail for password (ticket) visibility. LGPD-critical for tracking who saw what.

```sql
CREATE TABLE senha_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gira_id UUID NOT NULL REFERENCES giras(id) ON DELETE RESTRICT,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    
    -- Audit Trail
    password VARCHAR(50) NOT NULL,
    revealed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revealed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Context
    reason VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_senha_controls_tenant_id ON senha_controls(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_ticket_id ON senha_controls(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_gira_id ON senha_controls(gira_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_revealed_at ON senha_controls(tenant_id, revealed_at DESC) WHERE deleted_at IS NULL;
```

**Constraints**:
- `password`: Immutable, same format as emitted ticket number
- `revealed_at`: Timestamp of password visibility (security audit)
- `revealed_by_user_id`: NULL if revealed by system (e.g., email); user ID if manually revealed
- **Note**: Immutable record; no updates after creation (only soft-delete)

---

### 7. AUDIT_LOGS

Immutable audit trail for compliance and forensics. No soft-delete (immutable by design).

```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action Metadata
    action VARCHAR(50) NOT NULL
        CHECK (action IN (
            'CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT',
            'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ROLE_CHANGE',
            'TICKET_EMIT', 'TICKET_RESEND', 'TICKET_MARK_USED',
            'SENHA_REVEAL', 'GIRA_COMPLETE', 'BULK_OPERATION'
        )),
    
    -- Entity Reference
    entity_type VARCHAR(50) NOT NULL
        CHECK (entity_type IN (
            'USER', 'TENANT', 'GIRA', 'TICKET', 'CONSULENTE',
            'SENHA_CONTROL', 'BRANDING_CONFIG'
        )),
    entity_id UUID,
    
    -- Change Tracking
    changes JSONB,
    
    -- Request Context
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    request_id UUID,
    
    -- Timestamps (immutable, no updated_at)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(tenant_id, created_at DESC);
```

**Comments**:
- No UPDATE or DELETE operations; only INSERT
- `changes`: JSON object with field-level changes:
  ```json
  {
    "before": {"status": "active", "role": "OPERATOR"},
    "after": {"status": "suspended", "role": "ADMIN"}
  }
  ```
- Used for LGPD audit trails, compliance reports, forensic investigation

---

## Indices Strategy

### Performance Goals

- <60s end-to-end ticket emission
- 50 concurrent emissions without lock contention
- Query optimization for list/filter operations

### Core Indices

| Table | Index | Purpose | Query |
|-------|-------|---------|-------|
| tenants | (slug) | Fast tenant lookup by domain slug | Login, API routing |
| users | (tenant_id, is_active) | Active users per tenant | Dashboard, user list |
| giras | (tenant_id, event_date) | Upcoming giras | UI calendar, next-gira API |
| tickets | (gira_id, is_used) | Unused tickets count | Capacity check, analytics |
| tickets | (consulente_id, created_at) | Consulente history | User profile, stats |
| consulentes | (email) | Email lookup | Deduplication, contact |
| audit_logs | (tenant_id, created_at DESC) | Recent activity | Admin dashboard |

### Partial Indices (Multi-Tenancy Safety)

All filtered indices include `WHERE deleted_at IS NULL` to:
- Exclude soft-deleted records from query plans
- Reduce index size (typically 80% smaller)
- Prevent queries from accidentally including deleted data

---

## Constraints & Validation

### Application-Level Validation

All constraints enforced both in DB and application layer (FastAPI Pydantic models):

#### Unique Constraints
```python
# Tenant slug must be globally unique
class TenantCreate(BaseModel):
    slug: str = Field(..., regex=r'^[a-z0-9-]{3,50}$')
    name: str = Field(..., min_length=1, max_length=255)

# User email unique per tenant
class UserCreate(BaseModel):
    email: EmailStr
    role: RoleEnum = RoleEnum.OPERATOR
```

#### Check Constraints
```python
# Password history validation
CHECK (
    password_changed_at <= CURRENT_TIMESTAMP
)

# Ticket capacity
CHECK (
    total_tickets_issued <= COALESCE(tickets_limit, 2147483647)
)
```

#### Foreign Key Constraints
- `ON DELETE CASCADE`: Tenant delete removes all tenant data
- `ON DELETE RESTRICT`: Gira cannot be deleted if tickets exist
- `ON DELETE SET NULL`: Audit logs preserve deleted user references

---

## Migration Strategy

### Version Control

```
migrations/
├── 001_initial_schema.sql
├── 002_add_indexes.sql
├── 003_add_soft_delete.sql
├── 004_add_audit_logs.sql
└── 005_add_rate_limit_tracking.sql
```

### Flyway Configuration

```ini
# flyway.conf
flyway.locations=filesystem:migrations
flyway.baselineOnMigrate=true
flyway.validateOnMigrate=true
flyway.sql.migration.defaultSchemaName=public
```

### Deployment Checklist

1. **Pre-Migration**
   - [ ] Backup production database
   - [ ] Dry-run on staging environment
   - [ ] Validate migration reversibility

2. **During Migration**
   - [ ] Run on low-traffic window
   - [ ] Monitor table locks with `pg_stat_activity`
   - [ ] Verify index creation on large tables

3. **Post-Migration**
   - [ ] Verify all indices are valid: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0`
   - [ ] Vacuum and analyze: `VACUUM ANALYZE`
   - [ ] Update application version constraints
   - [ ] Monitor query performance with EXPLAIN ANALYZE

### Data Retention (LGPD)

```sql
-- Automated cleanup job (runs daily)
DELETE FROM audit_logs
WHERE tenant_id IN (
    SELECT id FROM tenants
    WHERE data_retention_days IS NOT NULL
)
AND created_at < NOW() - (
    SELECT INTERVAL '1 day' * data_retention_days
    FROM tenants t
    WHERE s.tenant_id = t.id
);

-- Soft-delete older than retention period
UPDATE tickets
SET deleted_at = NOW()
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '12 months'
  AND tenant_id IN (
      SELECT id FROM tenants WHERE status IN ('cancelled', 'suspended')
  );
```

---

## SQL Initialization Script

**Full schema creation** (use in migrations/001_initial_schema.sql):

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TENANTS
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    branding JSONB NOT NULL DEFAULT '{"logo_url":null,"primary_color":"#6366f1","secondary_color":"#4f46e5","support_email":null,"terms_url":null}',
    plan VARCHAR(20) NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','professional','enterprise')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
    data_retention_days INT NOT NULL DEFAULT 365 CHECK (data_retention_days >= 30 AND data_retention_days <= 3650),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;

-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'operator' CHECK (role IN ('SUPER_ADMIN','ADMIN','OPERATOR')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    failed_login_attempts INT NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, email) WHERE deleted_at IS NULL
);
CREATE INDEX idx_users_tenant_id ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_is_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;

-- GIRAS
CREATE TABLE giras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number INT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    event_date DATE NOT NULL,
    event_time TIME,
    duration_minutes INT,
    location VARCHAR(255),
    capacity INT,
    total_tickets_issued INT NOT NULL DEFAULT 0 CHECK (total_tickets_issued >= 0),
    tickets_limit INT,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, number) WHERE deleted_at IS NULL,
    CHECK (tickets_limit IS NULL OR tickets_limit >= total_tickets_issued)
);
CREATE INDEX idx_giras_tenant_id ON giras(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_giras_event_date ON giras(tenant_id, event_date) WHERE deleted_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX idx_giras_completed_at ON giras(tenant_id, completed_at) WHERE deleted_at IS NULL;

-- CONSULENTES
CREATE TABLE consulentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    document_number VARCHAR(20),
    total_tickets INT NOT NULL DEFAULT 0 CHECK (total_tickets >= 0),
    first_ticket_date TIMESTAMP WITH TIME ZONE,
    last_ticket_date TIMESTAMP WITH TIME ZONE,
    subscription_type VARCHAR(20) DEFAULT 'none' CHECK (subscription_type IN ('none','weekly','monthly','each_gira')),
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, email) WHERE deleted_at IS NULL
);
CREATE INDEX idx_consulentes_tenant_id ON consulentes(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_consulentes_email ON consulentes(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_consulentes_subscription_type ON consulentes(tenant_id, subscription_type) WHERE deleted_at IS NULL;

-- TICKETS
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gira_id UUID NOT NULL REFERENCES giras(id) ON DELETE RESTRICT,
    consulente_id UUID NOT NULL REFERENCES consulentes(id) ON DELETE CASCADE,
    number INT NOT NULL,
    sequence INT NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_opened_at TIMESTAMP WITH TIME ZONE,
    resend_count INT NOT NULL DEFAULT 0 CHECK (resend_count >= 0 AND resend_count <= 3),
    last_resend_at TIMESTAMP WITH TIME ZONE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    request_ip VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, gira_id, number) WHERE deleted_at IS NULL,
    UNIQUE(tenant_id, gira_id, sequence) WHERE deleted_at IS NULL
);
CREATE INDEX idx_tickets_tenant_id ON tickets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_gira_id ON tickets(gira_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_consulente_id ON tickets(consulente_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_email_address ON tickets(tenant_id, email_address) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_is_used ON tickets(gira_id, is_used) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_created_at ON tickets(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- SENHA_CONTROLS
CREATE TABLE senha_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gira_id UUID NOT NULL REFERENCES giras(id) ON DELETE RESTRICT,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    password VARCHAR(50) NOT NULL,
    revealed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revealed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_senha_controls_tenant_id ON senha_controls(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_ticket_id ON senha_controls(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_gira_id ON senha_controls(gira_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_senha_controls_revealed_at ON senha_controls(tenant_id, revealed_at DESC) WHERE deleted_at IS NULL;

-- AUDIT_LOGS
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE','READ','UPDATE','DELETE','EXPORT','LOGIN','LOGOUT','PASSWORD_CHANGE','ROLE_CHANGE','TICKET_EMIT','TICKET_RESEND','TICKET_MARK_USED','SENHA_REVEAL','GIRA_COMPLETE','BULK_OPERATION')),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('USER','TENANT','GIRA','TICKET','CONSULENTE','SENHA_CONTROL','BRANDING_CONFIG')),
    entity_id UUID,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    request_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(tenant_id, created_at DESC);
```

---

## Key Design Decisions

1. **UUID Primary Keys**: Better for distributed systems, less predictable
2. **Soft Deletes**: Comply with LGPD "right to be forgotten" via TTL, preserve audit trail
3. **Denormalized Email**: In tickets for immutable audit trail, survives consulente deletion
4. **SELECT FOR UPDATE**: Atomic ticket numbering prevents race conditions in concurrent emissions
5. **JSONB Branding**: Flexible config without schema migrations
6. **Partial Indices**: Multi-tenancy safety + query optimization
7. **Immutable Audit Logs**: No DELETE/UPDATE, only INSERT for regulatory compliance

---

## Performance Targets vs Schema

| Metric | Target | Schema Support |
|--------|--------|-----------------|
| Ticket emission | <60s end-to-end | Atomic numbering via SELECT FOR UPDATE |
| Concurrent emissions | 50 w/ zero duplicates | Unique constraints + sequence locking |
| Email delivery | 95% | Resend tracking, retry logic |
| Uptime | 99.5% | HA-ready UUID PKs, no sequential bottlenecks |
| Query response | <200ms | Composite indices, partial indices for soft-deletes |

