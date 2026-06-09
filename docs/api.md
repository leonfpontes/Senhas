# API Reference

## Senhas Multi-Tenant API

**Base URL**: `https://api.senhas.com/api/v1`  
**Version**: 1.0.0  
**Last Updated**: 2026-03-06  
**OpenAPI/Swagger**: Disponível em `/docs` (desenvolvimento)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Public Endpoints](#public-endpoints)
3. [Admin Endpoints](#admin-endpoints)
4. [Webhook Endpoints](#webhook-endpoints)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Examples](#examples)

---

## Authentication

All requests (except public ticket emission) require a valid JWT token.

### JWT Structure
```json
Header:   { "alg": "HS256", "typ": "JWT" }
Payload:  {
  "sub": "user-id",
  "tenant_id": "tenant-uuid",
  "email": "user@example.com",
  "role": "ADMIN|CONSULENTE",
  "iat": 1646416200,
  "exp": 1646502600
}
Signature: HMAC-SHA256(base64(header) + "." + base64(payload), SECRET)
```

### Authorization Header
```
Authorization: Bearer eyJhbGc...
```

### Cookie Authentication (Alternative)
```
Cookie: auth_token=eyJhbGc...
```

---

## Public Endpoints

### 1. Get Next Available Gira

**Endpoint**: `GET /public/{tenant_id}/next-gira`

**Parameters**:
- `tenant_id` (path, required): Tenant UUID

**Response** (200 OK):
```json
{
  "data": {
    "id": "gira-uuid",
    "name": "Gira de Terreiro ABC",
    "description": "Monthly gira event",
    "event_date": "2026-03-06T18:00:00Z",
    "location": "Terreiro ABC",
    "current_number": 45,
    "tickets_limit": 100,
    "remaining_slots": 55,
    "status": "ACTIVE"
  }
}
```

**Error Responses**:
- `404 Not Found`: Tenant or gira not found
- `429 Too Many Requests`: Rate limit exceeded

**cURL Example**:
```bash
curl -X GET \
  "https://api.senhas.com/api/v1/public/uuid-123/next-gira" \
  -H "Accept: application/json"
```

---

### 2. Emit Ticket

**Endpoint**: `POST /public/{tenant_id}/emit-ticket`

**Parameters**:
- `tenant_id` (path, required): Tenant UUID

**Request Body**:
```json
{
  "gira_id": "gira-uuid",
  "consulente_nome": "João Silva",
  "consulente_email": "joao@example.com",
  "consulente_phone": "(11) 99999-9999"
}
```

**Validation**:
- `consulente_nome`: 3-255 characters
- `consulente_email`: Valid email format, unique per gira
- `consulente_phone`: Valid phone format

**Response** (201 Created):
```json
{
  "ticket": {
    "id": "ticket-uuid",
    "number": 46,
    "gira_id": "gira-uuid",
    "consulente_nome": "João Silva",
    "consulente_email": "joao@example.com",
    "status": "PENDING",
    "created_at": "2026-03-05T14:30:00Z",
    "email_sent": true,
    "email_provider": "brevo",
    "qr_code_url": "https://..."
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input (validation error)
- `404 Not Found`: Gira not found
- `409 Conflict`: Gira limit reached / duplicate email
- `429 Too Many Requests`: Rate limit exceeded

**cURL Example**:
```bash
curl -X POST \
  "https://api.senhas.com/api/v1/public/uuid-123/emit-ticket" \
  -H "Content-Type: application/json" \
  -d '{
    "gira_id": "gira-uuid",
    "consulente_nome": "João Silva",
    "consulente_email": "joao@example.com",
    "consulente_phone": "(11) 99999-9999"
  }'
```

---

### 3. Resend Ticket Email

**Endpoint**: `POST /public/{tenant_id}/resend-ticket-email`

**Request Body**:
```json
{
  "email": "joao@example.com"
}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Email resent",
  "email_provider": "brevo",
  "sent_at": "2026-03-05T14:35:00Z"
}
```

**Error Responses**:
- `404 Not Found`: Ticket not found
- `429 Too Many Requests`: Max resend attempts exceeded

---

## Admin Endpoints

### Authentication Required
All admin endpoints require:
- Valid JWT token with `role: ADMIN`
- `Authorization: Bearer {token}` header
- `tenant_id` claim must match request tenant

---

### 1. Create Gira

**Endpoint**: `POST /admin/giras`

**Request Body**:
```json
{
  "name": "Gira Especial",
  "description": "Special event",
  "event_date": "2026-03-06T18:00:00Z",
  "tickets_limit": 100,
  "location": "Terreiro ABC"
}
```

**Response** (201 Created):
```json
{
  "id": "gira-uuid",
  "name": "Gira Especial",
  "description": "Special event",
  "event_date": "2026-03-06T18:00:00Z",
  "tickets_limit": 100,
  "location": "Terreiro ABC",
  "current_number": 0,
  "status": "ACTIVE",
  "created_at": "2026-03-05T14:30:00Z"
}
```

---

### 2. Get All Giras

**Endpoint**: `GET /admin/giras`

**Query Parameters**:
- `status`: ACTIVE | INACTIVE (optional)
- `limit`: 1-100, default 50
- `offset`: pagination, default 0

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "gira-uuid-1",
      "name": "Gira 1",
      "event_date": "2026-03-06T18:00:00Z",
      "tickets_limit": 100,
      "current_number": 45,
      "status": "ACTIVE"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 3. Get Gira by ID

**Endpoint**: `GET /admin/giras/{gira_id}`

**Response** (200 OK):
```json
{
  "id": "gira-uuid",
  "name": "Gira Especial",
  "description": "Special event",
  "event_date": "2026-03-06T18:00:00Z",
  "tickets_limit": 100,
  "current_number": 45,
  "location": "Terreiro ABC",
  "status": "ACTIVE",
  "created_at": "2026-03-05T14:30:00Z",
  "updated_at": "2026-03-05T14:35:00Z"
}
```

---

### 4. List Tickets for Gira

**Endpoint**: `GET /admin/giras/{gira_id}/tickets`

**Query Parameters**:
- `status`: PENDING | USED | CANCELLED (optional)
- `limit`: 1-100, default 50
- `offset`: pagination, default 0

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "ticket-uuid",
      "number": 1,
      "consulente_nome": "João Silva",
      "consulente_email": "joao@example.com",
      "consulente_phone": "(11) 99999-9999",
      "status": "PENDING",
      "created_at": "2026-03-05T14:30:00Z",
      "marked_used_at": null
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 5. Mark Ticket as Used

**Endpoint**: `PUT /admin/giras/{gira_id}/tickets/{ticket_id}/mark-used`

**Request Body**:
```json
{
  "notes": "Optional admin notes"
}
```

**Response** (200 OK):
```json
{
  "id": "ticket-uuid",
  "number": 1,
  "status": "USED",
  "marked_used_at": "2026-03-05T14:40:00Z",
  "marked_used_by": "admin-user-id"
}
```

**Error Responses**:
- `400 Bad Request`: Ticket already used
- `404 Not Found`: Ticket not found

---

### 6. Get Audit Logs

**Endpoint**: `GET /admin/audit-logs`

**Query Parameters**:
- `action`: Filter by action type (TICKET_EMITTED, TICKET_MARKED_USED, GIRA_CREATED, etc.)
- `resource_type`: Filter by resource type
- `start_date`: ISO 8601 timestamp
- `end_date`: ISO 8601 timestamp
- `limit`: 1-1000, default 100

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "audit-uuid",
      "tenant_id": "tenant-uuid",
      "action": "TICKET_EMITTED",
      "resource_type": "ticket",
      "resource_id": "ticket-uuid",
      "user_id": "user-uuid",
      "user_email": "admin@example.com",
      "timestamp": "2026-03-05T14:30:00Z",
      "details": {
        "ticket_number": 1,
        "consulente_email": "joao@example.com",
        "gira_id": "gira-uuid"
      },
      "ip_address": "192.168.1.100",
      "status": "SUCCESS"
    }
  ],
  "pagination": {
    "total": 500,
    "limit": 100,
    "offset": 0
  }
}
```

---

### 7. Get Dashboard Stats

**Endpoint**: `GET /admin/dashboard/stats`

**Response** (200 OK):
```json
{
  "stats": {
    "total_giras": 15,
    "active_giras": 8,
    "total_tickets_emitted": 892,
    "tickets_pending": 45,
    "tickets_used": 820,
    "tickets_cancelled": 27,
    "total_consulentes": 892,
    "avg_tickets_per_gira": 59
  },
  "recent_activity": {
    "last_ticket_emitted": "2026-03-05T14:35:00Z",
    "last_updated": "2026-03-05T14:35:00Z"
  }
}
```

---

### 8. Permission Groups (RBAC)

Endpoints for fine-grained authorization control (Admin role only, operators restricted).

#### 8.1 List Groups
`GET /admin/permission-groups`
- **Response** (200 OK):
```json
[
  {
    "id": "group-uuid",
    "tenant_id": "tenant-uuid",
    "name": "Operadores de Porta",
    "description": "Acesso à visão da porta e chamadas de senhas",
    "version": 1,
    "created_at": "2026-06-09T15:00:00Z",
    "updated_at": "2026-06-09T15:00:00Z",
    "members_count": 2,
    "features_configured_count": 3
  }
]
```

#### 8.2 Create Group
`POST /admin/permission-groups`
- **Request Body**:
```json
{
  "name": "Operadores de Porta",
  "description": "Acesso à visão da porta e chamadas de senhas"
}
```
- **Response** (201 Created): `PermissionGroupResponse`

#### 8.3 Get Group details
`GET /admin/permission-groups/{id}`
- **Response** (200 OK): `PermissionGroupResponse`

#### 8.4 Update Group details
`PUT /admin/permission-groups/{id}`
- **Request Body**:
```json
{
  "name": "Novo Nome",
  "description": "Nova Descrição"
}
```
- **Response** (200 OK): `PermissionGroupResponse`

#### 8.5 Delete Group (Soft delete)
`DELETE /admin/permission-groups/{id}`
- **Query Parameters**: `force` (boolean, default `false`). If the group contains active members, returns `409 Conflict` unless `force=true` is provided.
- **Response** (204 No Content)

#### 8.6 Get Group permissions
`GET /admin/permission-groups/{id}/permissions`
- **Response** (200 OK):
```json
[
  {
    "id": "permission-uuid",
    "group_id": "group-uuid",
    "feature": "porta",
    "can_view": true,
    "can_insert": true,
    "can_edit": true,
    "can_delete": false
  }
]
```

#### 8.7 Update Group permissions
`PUT /admin/permission-groups/{id}/permissions`
- **Request Body**:
```json
{
  "permissions": [
    {
      "feature": "porta",
      "can_view": true,
      "can_insert": true,
      "can_edit": true,
      "can_delete": false
    }
  ],
  "version": 1
}
```
- **Response** (200 OK): `PermissionGroupResponse`

#### 8.8 List Group members
`GET /admin/permission-groups/{id}/members`
- **Response** (200 OK):
```json
[
  {
    "id": "user-uuid",
    "email": "operator@terreiro.com",
    "username": "operator_a"
  }
]
```

#### 8.9 Add member to Group
`POST /admin/permission-groups/{id}/members`
- **Request Body**:
```json
{
  "user_id": "user-uuid"
}
```
- **Response** (200 OK): `GroupMemberResponse`

#### 8.10 Remove member from Group
`DELETE /admin/permission-groups/{id}/members/{user_id}`
- **Response** (204 No Content)

#### 8.11 Get My Consolidated Permissions
`GET /admin/permission-groups/me/permissions`
- **Headers**: Returns `Cache-Control: private, max-age=300`
- **Response** (200 OK):
```json
{
  "giras": { "view": true, "insert": false, "edit": false, "delete": false },
  "tickets": { "view": true, "insert": true, "edit": true, "delete": false }
}
```

---

## Authentication Endpoints

### 1. Login

**Endpoint**: `POST /auth/login`

**Request Body**:
```json
{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "user-uuid",
    "email": "admin@example.com",
    "role": "ADMIN",
    "tenant_id": "tenant-uuid"
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Invalid credentials
- `429 Too Many Requests`: Too many failed login attempts

---

### 2. Refresh Token

**Endpoint**: `POST /auth/refresh`

**Headers**:
```
Authorization: Bearer {refresh_token}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 86400
}
```

---

### 3. Logout

**Endpoint**: `POST /auth/logout`

**Headers**:
```
Authorization: Bearer {access_token}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": {
    "field": "consulente_email",
    "error": "Invalid email format"
  },
  "timestamp": "2026-03-05T14:35:00Z",
  "request_id": "req-abc123"
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Conflict (duplicate, limit exceeded) |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

### Default Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/login` | 10 | 15 minutes |
| `/public/*/emit-ticket` | 5 | 1 hour per email |
| `/admin/*` | 100 | 1 minute |
| `/admin/audit-logs` | 50 | 1 minute |

### Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1646437200
```

---

## Examples

### Example 1: Complete Workflow

```bash
# 1. Public user gets available gira
curl -X GET \
  "https://api.senhas.com/api/v1/public/tenant-uuid/next-gira"

# 2. Public user emits ticket
curl -X POST \
  "https://api.senhas.com/api/v1/public/tenant-uuid/emit-ticket" \
  -H "Content-Type: application/json" \
  -d '{
    "gira_id": "gira-uuid",
    "consulente_nome": "João Silva",
    "consulente_email": "joao@example.com",
    "consulente_phone": "(11) 99999-9999"
  }'

# 3. Admin logs in
curl -X POST \
  "https://api.senhas.com/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!"
  }'

# 4. Admin lists tickets for gira
curl -X GET \
  "https://api.senhas.com/api/v1/admin/giras/gira-uuid/tickets" \
  -H "Authorization: Bearer {access_token}"

# 5. Admin marks ticket as used
curl -X PUT \
  "https://api.senhas.com/api/v1/admin/giras/gira-uuid/tickets/ticket-uuid/mark-used" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Presence verified"
  }'
```

---

### Example 2: Webhook Subscription

```bash
# Register webhook for ticket emissions
curl -X POST \
  "https://api.senhas.com/api/v1/admin/webhooks" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ticket.emitted",
    "url": "https://myapp.com/webhooks/tickets",
    "active": true
  }'
```

---

## Webhooks

### Supported Events

| Event | When | Payload |
|-------|------|---------|
| `ticket.emitted` | New ticket created | Ticket object + Gira info |
| `ticket.marked_used` | Ticket marked as used | Ticket object |
| `gira.created` | New gira created | Gira object |
| `gira.completed` | All tickets used | Gira object |

### Webhook Retry Policy
- Initial: Immediate
- Retry 1: 5 seconds
- Retry 2: 1 minute
- Retry 3: 30 minutes
- Max: 3 retries total

---

## Best Practices

1. **Always use HTTPS** - Encrypt all communications
2. **Store tokens securely** - Use HttpOnly cookies or secure storage
3. **Implement exponential backoff** - For rate-limited responses
4. **Use query parameters for filtering** - Not URL path manipulation
5. **Validate input on client** - Before sending to API
6. **Handle all error codes** - Don't assume 2xx means success
7. **Include request ID in logs** - For debugging with support

---

**For support or questions, contact**: api-support@example.com

