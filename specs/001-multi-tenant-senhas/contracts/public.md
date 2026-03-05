# Public API Contracts - Multi-Tenant SaaS

**Version**: 1.0  
**Last Updated**: 2026-03-05  
**Base URL**: `https://api.senhas.app/api/v1/public`  
**Rate Limiting**: 5 req/min per IP (distributor), 2 req/min per IP (resend)  
**Authentication**: None (public endpoints)

---

## Table of Contents

1. [Overview](#overview)
2. [Ticket Emission](#ticket-emission)
3. [Next Gira Query](#next-gira-query)
4. [Email Resend](#email-resend)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Examples](#examples)

---

## Overview

### Endpoint Categories

| Cat | Endpoint | Rate Limit | Purpose |
|-----|----------|-----------|---------|
| Emit | `POST /tenants/{slug}/tickets` | 5 req/min | Issue new ticket (senha) |
| Query | `GET /tenants/{slug}/next-gira` | 5 req/min | Get upcoming event info |
| Resend | `POST /tenants/{slug}/tickets/{id}/resend-email` | 2 req/min | Retry email send |

### Response Format

All responses follow JSON:API-inspired format:

```json
{
  "success": true,
  "data": { /* response payload */ },
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_123abc",
    "rate_limit": {
      "limit": 5,
      "remaining": 3,
      "reset_at": "2026-03-05T14:31:00Z"
    }
  },
  "errors": null
}
```

---

## Ticket Emission

### `POST /tenants/{slug}/tickets`

Emit a new ticket (senha) for a consulente. Core business logic.

#### Path Parameters

| Param | Type | Required | Rules |
|-------|------|----------|-------|
| `slug` | string | Yes | Tenant identifier (lowercase, 3-50 chars) |

#### Request Body

```json
{
  "consulente_name": "João da Silva",
  "consulente_email": "joao@example.com",
  "consulente_phone": "11999999999",
  "consulente_subscription": "monthly",
  "document_number": "12345678901",
  "birth_date": "1980-05-15",
  "client_reference_id": "ext_order_789"
}
```

#### Request Validation

```python
class TicketEmissionRequest(BaseModel):
    # Consulente Name
    consulente_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Full name or identifier"
    )
    
    # Email Validation
    consulente_email: EmailStr = Field(
        ...,
        description="Valid RFC 5322 email"
    )
    
    # Phone (Optional)
    consulente_phone: Optional[str] = Field(
        None,
        regex=r'^\+?[0-9\s-()]{7,20}$',
        description="International format optional"
    )
    
    # Subscription Type
    consulente_subscription: Optional[str] = Field(
        "none",
        pattern="^(none|weekly|monthly|each_gira)$"
    )
    
    # Document (Optional, max 20 chars)
    document_number: Optional[str] = Field(
        None,
        max_length=20,
        description="CPF, CNPJ, or national ID"
    )
    
    # Birth Date (Optional, ISO 8601)
    birth_date: Optional[date] = Field(
        None,
        description="YYYY-MM-DD format"
    )
    
    # External Reference (Optional, for deduplication)
    client_reference_id: Optional[str] = Field(
        None,
        max_length=100,
        description="For idempotent retries"
    )
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_550e8400e29b41d4",
      "gira_id": "gira_123abc",
      "number": 42,
      "sequence": 5,
      "consulente": {
        "id": "cons_def789",
        "email": "joao@example.com",
        "name": "João da Silva",
        "phone": "11999999999",
        "subscription_type": "monthly"
      },
      "gira": {
        "id": "gira_123abc",
        "number": 101,
        "title": "Segunda Espírita",
        "event_date": "2026-03-12",
        "event_time": "19:00",
        "location": "Centro de Umbanda"
      },
      "email_sent_at": "2026-03-05T14:30:00Z",
      "email_sent": true,
      "resend_count": 0,
      "created_at": "2026-03-05T14:30:00Z",
      "expires_at": "2026-03-12T19:00:00Z"
    },
    "email_preview": {
      "subject": "Sua Senha para Gira #101 - 12/03/2026",
      "from": "senhas@temple.org.br",
      "delivered": true
    }
  },
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400",
    "rate_limit": {
      "limit": 5,
      "remaining": 4,
      "reset_at": "2026-03-05T14:31:00Z"
    }
  }
}
```

#### Success Criteria

- Consulente created or merged (by email)
- Next gira identified (earliest uncancelled future event)
- Ticket number atomically assigned via SELECT FOR UPDATE
- Email dispatched with max 3 retries over 60s
- Response <5s for 95% of requests

#### Error Responses

| Status | Code | Scenario |
|--------|------|----------|
| 400 | `VALIDATION_ERROR` | Invalid email, name too short, etc. |
| 400 | `NO_UPCOMING_GIRA` | No scheduled giras available |
| 409 | `DUPLICATE_TICKET` | Same email + gira combination exists (idempotent) |
| 429 | `RATE_LIMIT_EXCEEDED` | >5 req/min from IP |
| 404 | `TENANT_NOT_FOUND` | Invalid slug or suspended tenant |
| 500 | `EMAIL_DELIVERY_FAILED` | SMTP timeout, sender blocked (mail queued, async retry) |
| 503 | `SERVICE_UNAVAILABLE` | Database maintenance, circuit breaker open |

#### Example Error Response (400)

```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "Email validation failed",
      "field": "consulente_email",
      "detail": "Invalid email format: 'joao@domain' is not RFC 5322 compliant",
      "hint": "Use format: user@domain.com"
    }
  ],
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

#### Business Logic - Atomic Numbering

```python
# FastAPI endpoint pseudocode
@app.post("/tenants/{slug}/tickets")
async def emit_ticket(slug: str, req: TicketEmissionRequest, db: Session):
    tenant = get_tenant_by_slug(slug)
    
    # Fetch next gira (earliest uncancelled, future event)
    gira = db.query(Gira).filter(
        Gira.tenant_id == tenant.id,
        Gira.cancelled_at.is_(None),
        Gira.event_date >= date.today()
    ).order_by(Gira.event_date, Gira.event_time).first()
    
    if not gira:
        raise HTTPException(404, "NO_UPCOMING_GIRA")
    
    # Merge or create consulente by email
    consulente = upsert_consulente(db, tenant.id, req)
    
    # Check for duplicate ticket (same gira + email within 24h)
    existing = db.query(Ticket).filter(
        Ticket.gira_id == gira.id,
        Ticket.email_address == req.consulente_email,
        Ticket.deleted_at.is_(None),
        Ticket.created_at > NOW() - timedelta(hours=24)
    ).first()
    
    if existing:
        return TicketResponse.from_orm(existing)  # Idempotent
    
    # ATOMIC: Lock gira for update, assign next number
    db.execute(text("SELECT 1 FROM giras WHERE id = :gira_id FOR UPDATE"), 
               {"gira_id": gira.id})
    
    next_number = db.query(func.max(Ticket.number)).filter(
        Ticket.gira_id == gira.id,
        Ticket.deleted_at.is_(None)
    ).scalar() + 1
    
    # Create ticket
    ticket = Ticket(
        tenant_id=tenant.id,
        gira_id=gira.id,
        consulente_id=consulente.id,
        number=next_number,
        sequence=next_number - 1,
        email_address=req.consulente_email,
        request_ip=request.client.host,
        user_agent=request.headers.get("user-agent")
    )
    
    db.add(ticket)
    db.commit()
    
    # Async: Send email, log audit, update counters
    send_ticket_email.delay(ticket.id)
    audit_log.create(action="TICKET_EMIT", entity_id=ticket.id)
    
    return TicketResponse.from_orm(ticket)
```

---

## Next Gira Query

### `GET /tenants/{slug}/next-gira`

Get metadata for the next upcoming gira (next event for ticket emission).

#### Path Parameters

| Param | Type | Required | Rules |
|-------|------|----------|-------|
| `slug` | string | Yes | Tenant identifier |

#### Query Parameters

| Param | Type | Default | Purpose |
|-------|------|---------|---------|
| `include_sold_out` | boolean | false | Include at-capacity giras |
| `limit_days` | int | 90 | Max days ahead to check |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "gira": {
      "id": "gira_123abc",
      "number": 101,
      "title": "Segunda Espírita - Consultas",
      "description": "Atendimento com consultas individuais",
      "event_date": "2026-03-12",
      "event_time": "19:00",
      "duration_minutes": 180,
      "location": "Centro Espírita de Umbanda",
      "capacity": 100,
      "tickets_available": 42,
      "total_emitted": 58,
      "notes": "Trazido por Caboclo Sete Flechas",
      "tags": ["segunda", "consultas", "atendimento"]
    },
    "next_emission_possible": true,
    "upcoming_giras": [
      {
        "id": "gira_456def",
        "event_date": "2026-03-19",
        "number": 102,
        "tickets_available": 75
      },
      {
        "id": "gira_789ghi",
        "event_date": "2026-03-26",
        "number": 103,
        "tickets_available": 100
      }
    ]
  },
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400",
    "rate_limit": {
      "limit": 5,
      "remaining": 4,
      "reset_at": "2026-03-05T14:31:00Z"
    }
  }
}
```

#### Error Responses

| Status | Code | Scenario |
|--------|------|----------|
| 404 | `TENANT_NOT_FOUND` | Invalid slug |
| 404 | `NO_UPCOMING_GIRA` | No giras scheduled in next 90 days |
| 429 | `RATE_LIMIT_EXCEEDED` | >5 req/min from IP |

---

## Email Resend

### `POST /tenants/{slug}/tickets/{id}/resend-email`

Resend ticket email (retry if original delivery failed).

#### Path Parameters

| Param | Type | Required | Rules |
|-------|------|----------|-------|
| `slug` | string | Yes | Tenant identifier |
| `id` | string | Yes | Ticket UUID (format: `tick_*`) |

#### Request Body

```json
{
  "reason": "customer_request"
}
```

#### Validation

```python
class ResendEmailRequest(BaseModel):
    reason: str = Field(
        ...,
        pattern="^(customer_request|delivery_failed|testing)$",
        description="Reason for resend"
    )
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_550e8400",
      "number": 42,
      "resend_count": 2,
      "last_resend_at": "2026-03-05T14:35:00Z",
      "email_address": "joao@example.com",
      "email_sent": true,
      "gira": {
        "number": 101,
        "event_date": "2026-03-12"
      }
    },
    "email": {
      "subject": "Sua Senha para Gira #101 - 12/03/2026 (Reenviado)",
      "sent_at": "2026-03-05T14:35:00Z",
      "delivery_status": "queued"
    }
  },
  "meta": {
    "timestamp": "2026-03-05T14:35:00Z",
    "request_id": "req_550e8401",
    "rate_limit": {
      "limit": 2,
      "remaining": 1,
      "reset_at": "2026-03-05T14:36:00Z"
    }
  }
}
```

#### Error Responses

| Status | Code | Scenario |
|--------|------|----------|
| 400 | `RESEND_LIMIT_EXCEEDED` | >3 resends per ticket |
| 400 | `TICKET_EXPIRED` | Event has already occurred |
| 404 | `TICKET_NOT_FOUND` | Invalid ticket ID or wrong tenant |
| 429 | `RATE_LIMIT_EXCEEDED` | >2 req/min from IP (resend-specific limit) |

#### Business Logic

```python
@app.post("/tenants/{slug}/tickets/{ticket_id}/resend-email")
async def resend_ticket_email(
    slug: str,
    ticket_id: str,
    req: ResendEmailRequest,
    db: Session
):
    tenant = get_tenant_by_slug(slug)
    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.tenant_id == tenant.id,
        Ticket.deleted_at.is_(None)
    ).first()
    
    if not ticket:
        raise HTTPException(404, "TICKET_NOT_FOUND")
    
    # Check resend limit (max 3)
    if ticket.resend_count >= 3:
        raise HTTPException(400, "RESEND_LIMIT_EXCEEDED")
    
    # Check expiration (must be before gira event)
    gira = db.query(Gira).filter(Gira.id == ticket.gira_id).first()
    if gira.event_date < date.today():
        raise HTTPException(400, "TICKET_EXPIRED")
    
    # Update ticket
    ticket.resend_count += 1
    ticket.last_resend_at = datetime.utcnow()
    db.commit()
    
    # Async: Send email
    send_ticket_email.delay(ticket.id, reason=req.reason)
    audit_log.create(
        action="TICKET_RESEND",
        entity_id=ticket.id,
        changes={"reason": req.reason, "resend_count": ticket.resend_count}
    )
    
    return ResendEmailResponse.from_orm(ticket)
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Human-readable message",
      "field": "field_name",
      "detail": "Additional context",
      "hint": "Actionable suggestion"
    }
  ],
  "meta": {
    "timestamp": "2026-03-05T14:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

### Error Codes (Public API)

| Code | HTTP | Meaning | Action |
|------|------|---------|--------|
| `VALIDATION_ERROR` | 400 | Invalid input data | Retry with corrected data |
| `NO_UPCOMING_GIRA` | 404 | No events scheduled | Contact admin |
| `DUPLICATE_TICKET` | 409 | Ticket already exists (same email + event) | Return existing ticket (idempotent) |
| `TENANT_NOT_FOUND` | 404 | Invalid slug or suspended | Verify URL, contact support |
| `TICKET_NOT_FOUND` | 404 | Ticket UUID not found | Verify ticket ID |
| `RESEND_LIMIT_EXCEEDED` | 400 | Max 3 resends reached | Contact support |
| `TICKET_EXPIRED` | 400 | Event already occurred | Request new ticket for next gira |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Exponential backoff, retry after reset_at |
| `EMAIL_DELIVERY_FAILED` | 500 | SMTP error (transient) | Ticket created, email queued for async retry |
| `SERVICE_UNAVAILABLE` | 503 | Maintenance mode | Retry after 60s |

---

## Rate Limiting

### Policies

```
POST /tenants/{slug}/tickets:                  5 req/min per IP
GET  /tenants/{slug}/next-gira:                5 req/min per IP
POST /tenants/{slug}/tickets/{id}/resend-email: 2 req/min per IP
```

### Rate Limit Headers

All responses include rate limit info:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1709631000  (Unix timestamp)
```

### Backoff Strategy

```python
# Client-side retry logic
import time

for attempt in range(3):
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 429:
            reset_at = float(response.headers["X-RateLimit-Reset"])
            wait_time = max(0, reset_at - time.time()) + 1
            print(f"Rate limited. Retrying in {wait_time}s...")
            time.sleep(wait_time)
            continue
        return response
    except requests.Timeout:
        wait = 2 ** attempt + random(0, 1)
        print(f"Timeout. Retrying in {wait}s...")
        time.sleep(wait)
```

---

## Examples

### Example 1: Successful Ticket Emission

**Request**:
```bash
curl -X POST "https://api.senhas.app/api/v1/public/tenants/templo-de-luz/tickets" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: req_550e8400" \
  -d '{
    "consulente_name": "Maria Santos",
    "consulente_email": "maria.santos@email.com",
    "consulente_phone": "+5511987654321",
    "consulente_subscription": "monthly",
    "birth_date": "1975-08-22"
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_a1b2c3d4",
      "number": 23,
      "sequence": 22,
      "consulente": {
        "id": "cons_x9y8z7w6",
        "name": "Maria Santos",
        "email": "maria.santos@email.com"
      },
      "gira": {
        "number": 45,
        "title": "Quarta Espírita",
        "event_date": "2026-03-11",
        "event_time": "19:30"
      },
      "email_sent_at": "2026-03-05T14:30:15.123Z",
      "created_at": "2026-03-05T14:30:15.123Z"
    }
  },
  "meta": {
    "timestamp": "2026-03-05T14:30:15.123Z",
    "request_id": "req_550e8400",
    "rate_limit": { "limit": 5, "remaining": 4, "reset_at": "2026-03-05T14:31:00Z" }
  }
}
```

### Example 2: Duplicate Ticket (Idempotent)

**Request** (same as above within 24h):
```bash
# Same payload sent again
curl -X POST "https://api.senhas.app/api/v1/public/tenants/templo-de-luz/tickets" \
  -d '{
    "consulente_name": "Maria Santos",
    "consulente_email": "maria.santos@email.com",
    ...
  }'
```

**Response** (200 OK - idempotent, returns existing ticket):
```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_a1b2c3d4",
      "number": 23,
      "...": "same as first emission"
    }
  },
  "meta": { "...": "..." }
}
```

### Example 3: Rate Limit Exceeded

**Request** (6th request within 1 minute):
```bash
curl -X POST "https://api.senhas.app/api/v1/public/tenants/templo-de-luz/tickets" \
  -d '{ "consulente_name": "...", ... }'
```

**Response** (429 Too Many Requests):
```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Too many requests",
      "detail": "5 requests allowed per minute",
      "hint": "Retry after 45 seconds"
    }
  ],
  "meta": {
    "timestamp": "2026-03-05T14:31:02.000Z",
    "request_id": "req_550e8401"
  }
}
```

Headers:
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709631060
```

### Example 4: Email Resend

**Request**:
```bash
curl -X POST "https://api.senhas.app/api/v1/public/tenants/templo-de-luz/tickets/tick_a1b2c3d4/resend-email" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "customer_request" }'
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "ticket": {
      "id": "tick_a1b2c3d4",
      "number": 23,
      "resend_count": 1,
      "last_resend_at": "2026-03-05T14:32:00.000Z",
      "email_sent": true
    },
    "email": {
      "subject": "Sua Senha para Gira #45 - 11/03/2026 (Reenviado)",
      "delivery_status": "queued"
    }
  },
  "meta": { "...": "..." }
}
```

---

## Implementation Checklist

- [ ] Validate all inputs against schemas (email RFC 5322, name length, etc.)
- [ ] Implement rate limiting (Redis for distributed systems)
- [ ] Add idempotency key support (client_reference_id or X-Idempotency-Key header)
- [ ] Configure email service (SendGrid, AWS SES, or SMTP)
- [ ] Implement exponential backoff for email retries
- [ ] Add request correlation IDs for logging and debugging
- [ ] Monitor SLA: <5s response time for 95% of requests
- [ ] Log all emissions to audit_logs table
- [ ] Test for race conditions with concurrent emissions
- [ ] Document API in OpenAPI/Swagger for client SDKs

