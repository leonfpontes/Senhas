# Admin API Contracts - Multi-Tenant SaaS

**Version**: 1.0  
**Last Updated**: 2026-03-05  
**Base URL**: `https://api.senhas.app/api/v1/admin`  
**Rate Limiting**: 100 req/min per tenant (authenticated)  
**Authentication**: JWT Bearer token (24h access, 30d refresh)  
**RBAC Roles**: SUPER_ADMIN (platform), ADMIN (tenant manager), OPERATOR (read-only)

---

## Table of Contents

1. [Overview & Auth](#overview--auth)
2. [Gira Management](#gira-management)
3. [Ticket Management](#ticket-management)
4. [Consulente Management](#consulente-management)
5. [Branding & Configuration](#branding--configuration)
6. [Analytics & Reports](#analytics--reports)
7. [Error Handling](#error-handling)
8. [Examples](#examples)

---

## Overview & Auth

### Authentication Flow

1. **Login** (POST /auth/login) → Returns access_token (24h) + refresh_token (30d)
2. **Authenticated Requests**: Include `Authorization: Bearer {access_token}` header
3. **Token Refresh** (POST /auth/refresh) → New access_token before expiration
4. **Logout** (POST /auth/logout) → Invalidate refresh token

### JWT Payload

```json
{
  "sub": "user_123abc",
  "email": "admin@templo.org.br",
  "tenant_id": "tenant_456def",
  "role": "ADMIN",
  "iat": 1709631000,
  "exp": 1709717400,
  "scope": ["read:giras", "write:giras", "read:tickets"]
}
```

### Role-Based Access Control (RBAC)

| Role | Giras | Tickets | Consulentes | Branding | Users |
|------|-------|---------|-------------|----------|-------|
| SUPER_ADMIN | ✓ (all) | ✓ (all) | ✓ (all) | ✓ (all) | ✓ (all) |
| ADMIN | ✓ (tenant) | ✓ (tenant) | ✓ (tenant) | ✓ (tenant) | ✓ (tenant) |
| OPERATOR | ✓ (read) | ✓ (read) | ✓ (read) | ✗ | ✗ |

### Standard Headers

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Request-ID: req_550e8400
X-Idempotency-Key: idempotency_123abc  (optional, for POST/PUT/DELETE)
Content-Type: application/json
Accept: application/json
```

### Multi-Tenancy Enforcement

All endpoints follow pattern: `/api/v1/admin/{slug}/{resource}`

- `{slug}`: Tenant identifier from JWT decoded token
- **Rule**: Tenant_id from JWT must match slug, or user is SUPER_ADMIN

---

## Gira Management

### `GET /admin/{slug}/giras`

List all giras for tenant with filtering and pagination.

#### Query Parameters

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `page` | int | 1 | 1-∞ | Pagination page number |
| `page_size` | int | 20 | 1-100 | Items per page |
| `status` | enum | - | - | Filter: `upcoming`, `completed`, `cancelled` |
| `event_date_from` | date | - | - | ISO 8601: YYYY-MM-DD |
| `event_date_to` | date | - | - | ISO 8601: YYYY-MM-DD |
| `sort_by` | str | `event_date` | - | Sort field: `event_date`, `created_at`, `total_tickets_issued` |
| `sort_order` | enum | `asc` | - | `asc`, `desc` |

#### Request

```bash
curl -X GET "https://api.senhas.app/api/v1/admin/templo-de-luz/giras?status=upcoming&page=1&page_size=20" \
  -H "Authorization: Bearer {access_token}"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "giras": [
      {
        "id": "gira_123abc",
        "number": 101,
        "title": "Segunda Espírita - Consultas",
        "description": "Atendimento com Caboclo Sete Flechas",
        "event_date": "2026-03-12",
        "event_time": "19:00",
        "duration_minutes": 180,
        "location": "Centro Espírita de Umbanda",
        "capacity": 100,
        "tickets_issued": 58,
        "tickets_used": 45,
        "tickets_available": 42,
        "cancelled_at": null,
        "completed_at": null,
        "created_at": "2026-02-20T10:00:00Z",
        "updated_at": "2026-03-05T14:30:00Z",
        "notes": "Trazido por Caboclo Sete Flechas",
        "tags": ["segunda", "consultas", "atendimento"]
      },
      {
        "id": "gira_456def",
        "number": 102,
        "title": "Quarta Espírita",
        "event_date": "2026-03-19",
        "event_time": "19:30",
        "duration_minutes": 180,
        "capacity": 150,
        "tickets_issued": 0,
        "tickets_used": 0,
        "tickets_available": 150,
        "cancelled_at": null,
        "completed_at": null,
        "created_at": "2026-02-20T10:00:00Z",
        "updated_at": "2026-02-20T10:00:00Z",
        "notes": null,
        "tags": ["quarta", "regular"]
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total_items": 42,
      "total_pages": 3,
      "has_next": true,
      "has_previous": false
    }
  },
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400",
    "rate_limit": { "limit": 100, "remaining": 98 }
  }
}
```

---

### `POST /admin/{slug}/giras`

Create a new gira (event).

#### Request Body

```json
{
  "number": 103,
  "title": "Sexta Espírita",
  "description": "Atendimento com Pretos Velhos",
  "event_date": "2026-03-21",
  "event_time": "19:00",
  "duration_minutes": 180,
  "location": "Centro Espírita de Umbanda",
  "capacity": 120,
  "tickets_limit": null,
  "notes": "Evento especial - Trazido por os Pretos Velhos",
  "tags": ["sexta", "atendimento", "especial"]
}
```

#### Validation

```python
class GiraCreateRequest(BaseModel):
    number: int = Field(..., gt=0, description="Gira sequential number")
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    event_date: date = Field(..., description="Must be >= today")
    event_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(None, ge=30, le=480)
    location: str = Field(..., min_length=3, max_length=255)
    capacity: int = Field(..., gt=0, description="Max capacity")
    tickets_limit: Optional[int] = Field(None, ge=1, le=10000)
    notes: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(None, max_items=10)
    
    @validator("event_date")
    def event_date_not_past(cls, v):
        if v < date.today():
            raise ValueError("Event date must be >= today")
        return v
    
    @validator("number")
    def number_unique_per_tenant(cls, v, values):
        # Checked at DB constraint level
        return v
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "gira": {
      "id": "gira_789ghi",
      "number": 103,
      "title": "Sexta Espírita",
      "event_date": "2026-03-21",
      "event_time": "19:00",
      "capacity": 120,
      "tickets_issued": 0,
      "created_at": "2026-03-05T14:35:00Z"
    }
  },
  "meta": {
    "timestamp": "2026-03-05T14:35:00Z",
    "request_id": "req_550e8401"
  }
}
```

#### Error Responses

| Status | Code | Scenario |
|--------|------|----------|
| 400 | `VALIDATION_ERROR` | Invalid date, past event, etc. |
| 409 | `DUPLICATE_NUMBER` | Gira number already exists for tenant |
| 403 | `FORBIDDEN` | User role is OPERATOR |
| 401 | `UNAUTHORIZED` | Invalid or expired token |

---

### `PUT /admin/{slug}/giras/{id}`

Update an existing gira.

#### Mutable Fields

- `title`, `description`, `notes`, `tags`
- `capacity`, `tickets_limit`
- `event_time`, `duration_minutes` (before event only)
- Cancel/complete gira

#### Request Body

```json
{
  "title": "Sexta Espírita - Consultas e Passes",
  "capacity": 150,
  "notes": "Reforço: trazer documento de identidade",
  "cancelled": false,
  "completed": true
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "gira": {
      "id": "gira_789ghi",
      "number": 103,
      "title": "Sexta Espírita - Consultas e Passes",
      "capacity": 150,
      "tickets_issued": 45,
      "completed_at": "2026-03-21T22:30:00Z",
      "updated_at": "2026-03-21T22:30:00Z"
    }
  },
  "meta": { "...": "..." }
}
```

---

### `DELETE /admin/{slug}/giras/{id}`

Soft-delete a gira (mark cancelled, immutable after).

#### Response (204 No Content)

```
Status: 204 No Content
```

#### Business Logic

- Mark `cancelled_at` with current timestamp
- Emit audit log: `action: 'GIRA_COMPLETE'`
- Cascade: All related tickets remain (immutable audit trail)

---

## Ticket Management

### `GET /admin/{slug}/tickets`

List tickets with advanced filtering.

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `gira_id` | string | - | Filter by gira |
| `consulente_id` | string | - | Filter by consulente |
| `email` | string | - | Search by email (contains) |
| `number` | int | - | Filter by ticket number |
| `status` | enum | - | `emitted`, `used`, `expired` |
| `date_from` | date | - | Ticket issued >= date |
| `date_to` | date | - | Ticket issued <= date |
| `include_deleted` | bool | false | Include soft-deleted tickets |
| `page` | int | 1 | Pagination |
| `page_size` | int | 50 | Items per page (1-500) |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "id": "tick_123abc",
        "gira": { "id": "...", "number": 101, "event_date": "2026-03-12" },
        "consulente": { "id": "...", "name": "João Silva", "email": "joao@example.com" },
        "number": 42,
        "sequence": 41,
        "email_address": "joao@example.com",
        "email_sent_at": "2026-03-05T14:30:00Z",
        "is_used": false,
        "used_at": null,
        "resend_count": 0,
        "created_at": "2026-03-05T14:30:00Z",
        "updated_at": "2026-03-05T14:30:00Z"
      }
    ],
    "pagination": { "page": 1, "total_items": 127 }
  },
  "meta": { "...": "..." }
}
```

---

### `POST /admin/{slug}/tickets`

Manually issue a ticket (bypass public flow).

#### Request Body

```json
{
  "gira_id": "gira_123abc",
  "consulente_email": "joao@example.com",
  "consulente_name": "João Silva",
  "skip_email": false
}
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_456def",
      "number": 43,
      "gira": { "id": "...", "number": 101 },
      "email_sent": true,
      "created_at": "2026-03-05T14:40:00Z"
    }
  },
  "meta": { "...": "..." }
}
```

#### Note

- ADMIN/OPERATOR can issue tickets
- Auditable: Logged with `action: TICKET_EMIT` and `user_id`
- Increments `gira.total_tickets_issued` atomically

---

### `PUT /admin/{slug}/tickets/{id}`

Mark a ticket as used (consulente arrived).

#### Request Body

```json
{
  "mark_used": true
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_456def",
      "number": 43,
      "is_used": true,
      "used_at": "2026-03-12T19:15:00Z",
      "updated_at": "2026-03-12T19:15:00Z"
    }
  },
  "meta": { "...": "..." }
}
```

---

### `POST /admin/{slug}/tickets/bulk-resend`

Resend emails to multiple tickets (e.g., if earlier batch failed).

#### Request Body

```json
{
  "ticket_ids": ["tick_123", "tick_456", "tick_789"],
  "reason": "batch_retry"
}
```

#### Response (202 Accepted)

```json
{
  "success": true,
  "data": {
    "job_id": "job_550e8400",
    "status": "queued",
    "total_tickets": 3,
    "message": "Bulk resend queued for processing"
  },
  "meta": { "...": "..." }
}
```

---

## Consulente Management

### `GET /admin/{slug}/consulentes`

List consulentes (guests/visitors).

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `email` | string | - | Search by email |
| `name` | string | - | Search by name (contains) |
| `subscription_type` | enum | - | Filter: `none`, `weekly`, `monthly`, `each_gira` |
| `has_tickets` | bool | - | Only consulentes with issued tickets |
| `sort_by` | str | `created_at` | Sort by: `created_at`, `total_tickets`, `last_ticket_date` |
| `page` | int | 1 | - |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "consulentes": [
      {
        "id": "cons_123abc",
        "name": "João Silva",
        "email": "joao@example.com",
        "phone": "+5511987654321",
        "birth_date": "1980-05-15",
        "document_number": "12345678901",
        "total_tickets": 12,
        "first_ticket_date": "2025-01-10T19:00:00Z",
        "last_ticket_date": "2026-03-05T14:30:00Z",
        "subscription_type": "monthly",
        "tags": ["regular", "vip"],
        "created_at": "2025-01-10T19:00:00Z"
      }
    ],
    "pagination": { "page": 1, "total_items": 342 }
  },
  "meta": { "...": "..." }
}
```

---

### `PUT /admin/{slug}/consulentes/{id}`

Update consulente profile (notes, tags, subscription).

#### Request Body

```json
{
  "name": "João Silva Santos",
  "phone": "+5511987654322",
  "subscription_type": "weekly",
  "tags": ["regular", "vip", "frequent"],
  "notes": "Consulente frequente, sempre comparece"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "consulente": {
      "id": "cons_123abc",
      "name": "João Silva Santos",
      "subscription_type": "weekly",
      "tags": ["regular", "vip", "frequent"],
      "updated_at": "2026-03-05T14:45:00Z"
    }
  },
  "meta": { "...": "..." }
}
```

---

### `DELETE /admin/{slug}/consulentes/{id}`

Soft-delete consulente (GDPR/LGPD compliance).

#### Response (204 No Content)

---

## Branding & Configuration

### `GET /admin/{slug}/branding`

Get tenant branding config.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "branding": {
      "logo_url": "https://cdn.example.com/logo.png",
      "primary_color": "#6366f1",
      "secondary_color": "#4f46e5",
      "support_email": "suporte@templo.org.br",
      "terms_url": "https://templo.org.br/terms",
      "footer_text": "Centro Espírita de Umbanda - Todos os direitos reservados"
    }
  },
  "meta": { "...": "..." }
}
```

---

### `PUT /admin/{slug}/branding`

Update tenant branding.

#### Request Body

```json
{
  "logo_url": "https://cdn.example.com/new-logo.png",
  "primary_color": "#ff6b35",
  "secondary_color": "#f7931e",
  "support_email": "contato@templo.org.br",
  "terms_url": "https://templo.org.br/termos-e-condicoes",
  "footer_text": "Templo de Luz - Centrado em Coragem e Fé"
}
```

#### Validation

```python
class BrandingUpdate(BaseModel):
    logo_url: Optional[str] = Field(None, pattern=r'^https://')
    primary_color: Optional[str] = Field(None, regex=r'^#[0-9a-fA-F]{6}$')
    secondary_color: Optional[str] = Field(None, regex=r'^#[0-9a-fA-F]{6}$')
    support_email: Optional[EmailStr] = None
    terms_url: Optional[str] = Field(None, pattern=r'^https://')
    footer_text: Optional[str] = Field(None, max_length=500)
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "branding": {
      "primary_color": "#ff6b35",
      "updated_at": "2026-03-05T14:50:00Z"
    }
  },
  "meta": { "...": "..." }
}
```

---

## Analytics & Reports

### `GET /admin/{slug}/analytics/overview`

Dashboard metrics snapshot.

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | enum | `month` | `week`, `month`, `quarter`, `year` |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "analytics": {
      "period": "2026-02-01 to 2026-02-28",
      "statistics": {
        "total_giras": 8,
        "completed_giras": 5,
        "cancelled_giras": 1,
        "total_tickets_emitted": 342,
        "total_tickets_used": 315,
        "email_delivery_rate": 0.95,
        "unique_consulentes": 127,
        "avg_tickets_per_gira": 42.75,
        "avg_attendees_per_gira": 39.4
      },
      "trends": {
        "tickets_emitted_day": [
          { "date": "2026-02-01", "count": 10 },
          { "date": "2026-02-02", "count": 15 }
        ]
      },
      "top_consulentes": [
        { "name": "João Silva", "tickets": 12 },
        { "name": "Maria Santos", "tickets": 10 }
      ],
      "email_status": {
        "delivered": 325,
        "failed": 17,
        "pending": 0
      }
    }
  },
  "meta": { "...": "..." }
}
```

---

### `GET /admin/{slug}/reports/tickets`

Export tickets data as CSV.

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `gira_id` | string | - | Filter by gira |
| `date_from` | date | - | Start date |
| `date_to` | date | - | End date |
| `format` | enum | `csv` | `csv`, `json`, `excel` |

#### Response (200 OK - CSV)

```
ticket_id,gira_number,gira_date,consulente_name,email,ticket_number,emitted_at,used
tick_123,101,2026-03-12,João Silva,joao@example.com,42,2026-03-05T14:30:00Z,false
tick_456,101,2026-03-12,Maria Santos,maria@example.com,43,2026-03-05T14:35:00Z,true
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Human-readable message",
      "field": "field_name",
      "detail": "Additional context"
    }
  ],
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid JWT token |
| `FORBIDDEN` | 403 | User role lacks permissions (RBAC) |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `RESOURCE_NOT_FOUND` | 404 | Gira/ticket/consulente not found |
| `DUPLICATE_RESOURCE` | 409 | Unique constraint violation (e.g., gira number) |
| `RATE_LIMIT_EXCEEDED` | 429 | >100 req/min for tenant |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected error |

---

## Examples

### Example 1: List Upcoming Giras

```bash
curl -X GET "https://api.senhas.app/api/v1/admin/templo-de-luz/giras?status=upcoming&sort_by=event_date&sort_order=asc" \
  -H "Authorization: Bearer {access_token}"
```

Response:
```json
{
  "success": true,
  "data": {
    "giras": [
      { "id": "gira_123", "number": 101, "event_date": "2026-03-12" },
      { "id": "gira_456", "number": 102, "event_date": "2026-03-19" }
    ]
  },
  "meta": { "...": "..." }
}
```

### Example 2: Create New Gira

```bash
curl -X POST "https://api.senhas.app/api/v1/admin/templo-de-luz/giras" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "number": 104,
    "title": "Domingo Espírita",
    "event_date": "2026-03-29",
    "event_time": "10:00",
    "capacity": 200,
    "location": "Centro de Umbanda"
  }'
```

### Example 3: Mark Ticket as Used

```bash
curl -X PUT "https://api.senhas.app/api/v1/admin/templo-de-luz/tickets/tick_123abc" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{ "mark_used": true }'
```

### Example 4: Export Tickets Report

```bash
curl -X GET "https://api.senhas.app/api/v1/admin/templo-de-luz/reports/tickets?format=csv&gira_id=gira_123&date_from=2026-03-01&date_to=2026-03-31" \
  -H "Authorization: Bearer {access_token}" \
  -o tickets_report.csv
```

---

## Implementation Checklist

- [ ] Implement JWT token generation and validation
- [ ] Add RBAC role checks on all endpoints (middleware)
- [ ] Implement rate limiting (100 req/min per tenant)
- [ ] Add request logging and correlation ID tracking
- [ ] Generate OpenAPI/Swagger documentation
- [ ] Create Python/TypeScript SDK stubs
- [ ] Implement CSV export with pagination (streaming for large datasets)
- [ ] Monitor endpoint performance: <300ms for 95% of requests
- [ ] Add webhook support for event notifications (gira completed, email failed)
- [ ] Implement audit log retention policy (immutable, indexed by created_at)

