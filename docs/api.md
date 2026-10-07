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
  "role": "super_admin|admin|operator",
  "iat": 1646416200,
  "exp": 1646502600,
  "type": "access"
}
// Only `type: "access"` authenticates requests (see docs/authentication.md, T-02).
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

**Endpoint**: `GET /public/next-gira`

**Parameters**:
- `tenant_slug` (query, required): Tenant slug (e.g. `terreiro-caboclo-tupinamba`)
- `tipo` (query, optional): `regular` (default) or `associado` (sponsor window)

**Response** (200 OK) — mirror of `GiraPublicResponse`
(`backend/src/api/v1/public/next_gira.py`) and the shared frontend type
`GiraPublic` (`packages/shared-types/src/index.ts`):
```json
{
  "id": "gira-uuid",
  "nome": "Gira de Caboclos",
  "descricao": "Trabalho espiritual com a linha dos Caboclos.",
  "data_inicio": "2026-03-06T18:00:00+00:00",
  "local": "Terreiro ABC",
  "release_start_at": "2026-03-01T08:00:00+00:00",
  "release_end_at": "2026-03-06T18:00:00+00:00",
  "max_tickets": 100,
  "current_tickets": 45,
  "tickets_available": 55,
  "is_open": true,
  "is_exhausted": false,
  "waitlist_available": false,
  "is_sponsor": false,
  "tenant_slug": "terreiro-abc",
  "tenant_name": "Terreiro ABC",
  "logo_url": null,
  "primary_color": "#2E7D32",
  "secondary_color": "#1565C0",
  "use_time_slots": false,
  "time_slots": [],
  "allow_acompanhantes": false,
  "max_acompanhantes": 0
}
```

Notes:
- `max_tickets: null` means uncapped; the backend then reports
  `tickets_available: 0` with `is_exhausted: false` — key "sold out" UI off
  `is_exhausted`, never off `tickets_available === 0`.
- `release_start_at`/`release_end_at` are non-null in practice for this
  endpoint (giras without a configured emission window are filtered out).

**Error Responses**:
- `404 Not Found`: two distinct details — `"Tenant '<slug>' not found"`
  (unknown slug) vs `"No active gira scheduled for this tenant"` (tenant
  exists, no gira with an emission window)
- `429 Too Many Requests`: Rate limit exceeded

**cURL Example**:
```bash
curl -X GET \
  "https://api.senhas.com/api/v1/public/next-gira?tenant_slug=terreiro-abc" \
  -H "Accept: application/json"
```

---

### 2. Emit Ticket

**Endpoint**: `POST /public/emit-ticket?tenant_slug={slug}&gira_id={gira_uuid}&tipo=comum|associado`

**Request Body**:
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "phone": "11999999999",
  "priority_category": null,
  "time_slot_id": "slot-uuid",
  "acompanhantes": []
}
```

- `time_slot_id`: exigido só quando a gira usa agendamento por horário **e** a senha tem vaga; com a
  gira lotada e fila de espera ligada, a pessoa entra na fila sem horário.

**Response** (200 OK):
```json
{
  "ticket_number": "0042",
  "rescue_link": "https://app.example.com/public/{slug}/ticket/{ticket_uuid}",
  "message": "...",
  "waitlisted": false,
  "waitlist_position": null,
  "priority_upgraded": false,
  "acompanhantes": []
}
```

**Error Responses**:
- `409 Conflict`: e-mail já tem senha nesta gira (`{"detail": "..."}`)
- `410 Gone`: senhas esgotadas (sem fila de espera)
- Horário — corpo `{"error_code": "...", "message": "..."}`: `400 TIME_SLOT_REQUIRED`,
  `404 TIME_SLOT_INVALID`, `410 TIME_SLOT_FULL`, `409 TIME_SLOT_UNAVAILABLE`
- `429 Too Many Requests`: rate limit (30/min por IP)

---

### 3. Resend Ticket Email

**Endpoint**: `POST /public/resend-ticket-email?tenant_slug={slug}`

**Request Body**:
```json
{
  "email": "joao@example.com",
  "gira_id": "gira-uuid"
}
```

Reenvia o e-mail original (emissão, fila de espera ou promoção) só das senhas ativas (emitida ou na
fila) — da gira informada; sem `gira_id`, das giras de hoje em diante. O e-mail vai para o endereço
gravado na senha.

**Response** (200 OK):
```json
{
  "tickets_count": 1,
  "email_sent": true,
  "message": "Reenviamos o e-mail da sua senha."
}
```

**Error Responses**:
- `404 Not Found`: terreiro inexistente ou nenhuma senha ativa para o e-mail
- `429 Too Many Requests`: rate limit (15/hora por IP)

---

### 4. Agenda pública do terreiro

**Endpoint**: `GET /public/agenda/{tenant_slug}`

Próximas giras ativas (mesmo filtro do calendário do site). Usada por `/{slug}` quando o terreiro
ainda não publicou o site.

---

### 5. Convite da casa — Área do Médium (AM-03)

O link do convite (`{FRONTEND_URL}/convite/{token}`, página `pages/convite/[token].tsx`) leva um
token opaco (`secrets.token_urlsafe(32)`); só o sha256 fica no banco (`medium_convites.token_hash`).
Vale 7 dias e é de uso único. Token inexistente, vencido, usado ou revogado (ou médium que ficou
inativo, já tem acesso ou trocou de e-mail) → **sempre** a mesma resposta:

```json
// 404
{ "detail": { "message": "Este convite não vale mais. Peça um novo convite à casa.", "error_code": "CONVITE_INVALIDO" } }
```
Terreiro sem a Área (plano sem `area_medium`, assinatura bloqueada ou chave do piloto desligada) →
403 `AREA_INDISPONIVEL`.

**`GET /api/v1/public/convite/{token}`** (30/min por IP)
```json
{
  "terreiro": { "nome": "Tenda Luz da Mata", "slug": "luz-da-mata" },
  "marca": { "logo_url": null, "primary_color": "#4f46e5", "secondary_color": "#818cf8", "font_color": null },
  "medium_primeiro_nome": "Ana",
  "email_mascarado": "an•••••••@gmail.com",
  "conta_existente": false,
  "expira_em": "2026-10-14T12:00:00Z",
  "consentimento_versao": "1"
}
```
`conta_existente` = já existe conta do painel (admin/operador, não excluída) com o e-mail do
convite no terreiro: o aceite pede a senha dessa conta.

**`POST /api/v1/public/convite/{token}/aceitar`** (10/min por IP)
```json
{ "senha": "...", "aceite_termo": true }
```
- Sem conta do painel: cria `User(role=medium)` com a senha (política `validate_password_policy`,
  422 `VALIDATION_ERROR`). Conta `medium` antiga (acesso retirado) ou excluída do mesmo e-mail no
  terreiro volta com a senha nova (o convite prova a posse do e-mail, como o "esqueci a senha").
- Conta do painel: confere a senha dela (errada → **400** `SENHA_INCORRETA`, não 401; desativada →
  403 `CONTA_INATIVA`); o papel não muda.
- `aceite_termo` falso → 422 `TERMO_OBRIGATORIO`. Conta já ligada a outro médium → 409
  `CONTA_JA_LIGADA`.
- Sucesso: `mediuns.user_id`, `area_consentimento_em` e `area_consentimento_versao` gravados,
  convite marcado como usado e sessão aberta (`issue_session`: os 3 cookies do login).
```json
{ "redirect": "/medium", "user": { "id": "...", "role": "medium", "tenant_id": "..." }, "areas": { "admin": false, "medium": { "medium_id": "...", "nome": "Ana Paula" } } }
```

---

## Admin Endpoints

### Authentication Required
All admin endpoints require:
- Valid JWT token with `role: ADMIN`
- `Authorization: Bearer {token}` header
- `tenant_id` claim must match request tenant

Every `/api/v1/admin/*` route also goes through `require_backoffice` (AM-02): a user with
`role = medium` (Área do Médium only) gets **403** (`error_code: BACKOFFICE_REQUIRED`) on all of
them — the role is read from the database, not from the token.

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

**Acesso**: plano com `auditoria` (Pro+) e grupo de permissão AUDITORIA:view (admin faz bypass do grupo).

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

### 9. Acesso do médium à Área do Médium (AM-03)

Todas com `MEDIUNS:edit` + `require_plan_feature("area_medium")` (plano Basic+, assinatura em dia
e chave do piloto `tenants.area_medium_liberada`; sem a chave → 403). Médium de outro terreiro → 404.

- `POST /admin/mediuns/{medium_id}/convite` — convida ou reenvia (revoga o convite em aberto e cria
  outro). 422 sem e-mail válido no cadastro ou médium inativo; 409 se já tem acesso. Enfileira o
  e-mail discreto (assunto "Convite de {terreiro} para acessar sua área no GiraHub").
  ```json
  {
    "link": "https://girahub.com.br/convite/<token>",
    "mensagem_whatsapp": "Oi, Ana! Tenda Luz da Mata convidou você para acessar sua área no GiraHub: ...",
    "whatsapp_url": "https://wa.me/5511987654321?text=...",
    "email_mascarado": "an•••••••@gmail.com",
    "expira_em": "2026-10-14T12:00:00Z",
    "acesso_area": { "status": "convite_enviado", "convite_enviado_em": "...", "convite_expira_em": "..." }
  }
  ```
  `whatsapp_url` usa o telefone do médium (DDI 55 quando falta); sem telefone, `https://wa.me/?text=`.
- `POST /admin/mediuns/convite/lote` — convida por e-mail todos os médiuns ativos com e-mail, sem
  acesso e sem convite em aberto: `{"convidados": 3, "sem_email": 2, "ja_convidados": 1}`.
- `DELETE /admin/mediuns/{medium_id}/acesso` (204) — cancela o convite em aberto e desfaz o vínculo.
  Conta `medium` pura é desativada e perde as sessões na hora; operador/admin ligado só perde a Área.
- `GET /admin/mediuns` passa a trazer `acesso_area` em cada médium:
  `{"status": "sem_acesso" | "convite_enviado" | "ativo", "desde", "convite_enviado_em", "convite_expira_em"}`
  (`ativo` = vínculo `mediuns.user_id`; `desde` = data do consentimento). Convite vencido conta como
  `sem_acesso`. Trocar o e-mail do médium, inativar ou excluir revoga o convite em aberto.

---

### 9. Área do Médium configuration (AM-10)

`GET /api/v1/admin/config/area-medium` (CONFIGURACOES `view`) ·
`PUT /api/v1/admin/config/area-medium` (CONFIGURACOES `edit`). Both require the plan feature
`area_medium` (Basic+ **and** the pilot switch `tenants.area_medium_liberada`), otherwise 403.

**Response** (200 OK):
```json
{
  "ativa": true,
  "boas_vindas": "Que bom ter você na corrente!",
  "whatsapp": "5511987654321",
  "modulos": { "agenda": true, "avisos": true, "mensalidade": true },
  "mensalidade_no_plano": true
}
```
**PUT body** (partial — only sent fields change): `ativa` (bool), `boas_vindas` (≤ 500, empty
clears), `whatsapp` (Brazilian number with DDD, any mask; stored as digits with `55`; empty clears;
invalid → 422), `modulos` (`{agenda?, avisos?, mensalidade?}`). Audited as `TenantConfig` /
`config_type: "area_medium"`.

### 10. PIX key for the mensalidade (AM-10)

`GET /api/v1/admin/financeiro/config/pix` (FINANCEIRO `view` + plan `mensalidade_mediun`):
```json
{
  "configurada": true,
  "tipo": "cpf",
  "chave_mascarada": "***.456.789-**",
  "chave": "12345678909",
  "nome_recebedor": "Casa de Oxalá",
  "cidade": "São Paulo",
  "instrucoes": "Mande o comprovante pela Área.",
  "alterado_em": "2026-10-07T20:00:00Z",
  "brcode_previa": "00020126330014br.gov.bcb.pix0111123456789095204000053039865404..." ,
  "valor_previa": 50.0
}
```
`chave`, `brcode_previa` and `valor_previa` are only filled for users with FINANCEIRO `edit`
(admins bypass); view-only users get the masked key. `brcode_previa` is the static BR Code
("PIX copia e cola", `services/pix_brcode.py`) of the **saved** key with the monthly value
(R$ 1,00 when none) — the same payload the Área will show to the médium.

`PUT /api/v1/admin/financeiro/config/pix` (FINANCEIRO `edit` + plan `mensalidade_mediun`,
refused while impersonating — 403, rate limit 10/hour per IP):
```json
{
  "tipo": "cpf | cnpj | email | telefone | aleatoria",
  "chave": "123.456.789-09",
  "nome_recebedor": "Casa de Oxalá",
  "cidade": "São Paulo",
  "instrucoes": "opcional, até 500",
  "senha": "password of the user making the change"
}
```
- Wrong `senha` → **401** `INVALID_PASSWORD` (business rule — the frontend calls with
  `skipAutoLogout`, the session stays valid).
- The key is validated per type and stored in DICT format: CPF/CNPJ (numeric or alphanumeric)
  with check digits, lowercase e-mail, mobile `+55DD9XXXXXXXX`, random key (UUID with hyphens).
  `nome_recebedor` ≤ 25 and `cidade` ≤ 15 characters (BR Code limits). Invalid → 422.
- Audit `mensalidade_pix` with the old and new key **masked** (never the password).
- When `tipo`/`chave` change: `pix_alterado_em` is updated and an e-mail ("Chave PIX da
  mensalidade alterada") goes to every active admin of the tenant through the e-mail queue,
  with the masked old/new key.

### 11. Avisos da casa (comunicados, AM-09)

On screen it is **"Avisos"** (decision D-16); the API keeps `comunicados`. Every route requires the
plan feature `area_medium` (Basic+ **and** the pilot switch `tenants.area_medium_liberada`, otherwise
403) and the permission group `COMUNICADOS` ("Avisos da Área"):

| Method | Path | Group action |
|---|---|---|
| GET | `/api/v1/admin/comunicados` | `view` |
| GET | `/api/v1/admin/comunicados/{id}` | `view` |
| GET | `/api/v1/admin/comunicados/{id}/leituras` | `view` |
| POST | `/api/v1/admin/comunicados` (201) | `insert` |
| PUT | `/api/v1/admin/comunicados/{id}` | `edit` |
| DELETE | `/api/v1/admin/comunicados/{id}` (204, soft delete) | `delete` |

**Item** (list ordered by `fixado` desc, then `publicar_em` desc):
```json
{
  "id": "uuid",
  "titulo": "Gira de sexta começa às 20h30",
  "corpo": "A corrente chega às 19h30.\nVeja https://exemplo.com.br",
  "publico": "todos",
  "fixado": true,
  "publicar_em": "2026-10-07T12:00:00Z",
  "expira_em": null,
  "situacao": "publicado",
  "created_at": "...",
  "updated_at": "...",
  "leituras": { "lidos": 9, "total": 20 }
}
```
- **Body** (POST; PUT is partial): `titulo` (≤ 120), `corpo` (≤ 5000), `publico`
  (`todos` | `atendimento` | `cambones`; other values → 422), `fixado`, `publicar_em` (absent/null =
  now; future = scheduled; naive datetimes are Brasília time) and `expira_em` (optional; must be after
  `publicar_em` and, when set, in the future → else 422). On PUT, `publicar_em: null` publishes now and
  `expira_em: null` removes the expiry.
- **Plain text only**: HTML tags and control characters are stripped on save (line breaks are kept);
  empty title/text after cleaning → 422. The screens render text nodes only and auto-link
  `http(s)://`/`www.` addresses.
- `situacao`: `agendado` (before `publicar_em`), `publicado`, `expirado` (after `expira_em`).
- `leituras.total` ("lido por N de M") counts only médiuns who can read it: active, in the audience
  (`atendimento` = `mediuns.is_atendimento`, `cambones` = not), and with access to the Área (linked to
  an active account).
- `GET /{id}/leituras` → `{ "total", "lidos", "leram": [{ "medium_id", "nome", "lido_em" }],
  "nao_leram": [{ "medium_id", "nome", "lido_em": null }] }` (D-28; only names — no contact data).
- Another tenant's id → 404. Audited as `comunicado` (create/update/delete; title, audience and
  dates — not the text).

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
    "role": "admin",
    "tenant_id": "tenant-uuid"
  },
  "areas": {
    "admin": true,
    "medium": null
  }
}
```

`areas` (AM-02) is computed on the server on every call — never stored in the JWT:
`admin` = role `admin`/`operator`; `medium` = an active, non-deleted médium of the same tenant
linked to the user (`mediuns.user_id`) **and** the tenant's effective plan includes
`area_medium` (Basic+), otherwise `null`. The same `areas` object is returned by
`GET /auth/me` and `GET /auth/profile`.

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

## Área do Médium Endpoints (AM-02)

All `/api/v1/medium/*` routes go through `require_medium`: authenticated user, an active
médium linked to that user in the user's own tenant, and a plan with `area_medium` with the
subscription in good standing. Routes are "mine": they **never** accept `medium_id` in the
path or body. Writes made while impersonating are refused (403, `require_not_impersonated`).

| Status | When |
|---|---|
| 401 | No session / inactive user |
| 403 | No active link to a médium (`error_code: MEDIUM_AREA_UNAVAILABLE`) or plan without `area_medium` |
| 402 | Subscription suspended / expired / trial ended |

### 1. Who am I

**Endpoint**: `GET /api/v1/medium/me`

**Response** (200 OK):
```json
{
  "nome": "Maria de Oxum",
  "foto_url": null,
  "terreiro": { "id": "tenant-uuid", "nome": "Tenda Pai Joaquim", "slug": "tenda-pai-joaquim" },
  "marca": { "logo_url": null, "primary_color": "#4f46e5", "secondary_color": "#818cf8", "font_color": null },
  "areas": {
    "admin": false,
    "medium": { "medium_id": "medium-uuid", "nome": "Maria de Oxum" }
  },
  "modulos": ["agenda", "avisos", "mensalidade"],
  "boas_vindas": "Que bom ter você na corrente!",
  "whatsapp_casa": "5511987654321",
  "avisos_nao_lidos": 2
}
```
`marca` is the same public subset served by the branding endpoint. `modulos` lists the modules
the terreiro left on (AM-10, in bottom-bar order); `mensalidade` also requires `mensalidade_mediun`
in the plan. `boas_vindas` and `whatsapp_casa` (digits with country code, for "Falar com a casa")
come from the Área configuration and may be `null`. `avisos_nao_lidos` feeds the badge on the
"Avisos" tab (AM-09; `0` when the module is off). Internal médium fields (`observacoes`,
contacts, payments) are never returned.

If the terreiro turns the Área off (`PUT /api/v1/admin/config/area-medium` with `"ativa": false`),
every `/api/v1/medium/*` route answers 403 (`MEDIUM_AREA_UNAVAILABLE`) and `areas.medium` becomes
`null` in `/auth/me`.

### 2. Home screen (Início, AM-06)

**Endpoint**: `GET /api/v1/medium/inicio` — no parameters (everything is "mine": tenant and
médium come from the session; a `medium_id` in the query string is ignored).

**Response** (200 OK):
```json
{
  "hoje": "2026-10-15",
  "pendencias": [
    {
      "tipo": "mensalidade",
      "situacao": "atrasada",
      "mes": "2026-10",
      "valor": 50.0,
      "vencimento": "2026-10-10",
      "dias_para_vencer": -5
    }
  ],
  "proxima_gira": {
    "id": "gira-uuid",
    "nome": "Gira de Caboclos",
    "data_inicio": "2026-10-16T23:00:00Z",
    "data_fim": null,
    "local": "Salão principal",
    "orientacoes": null
  },
  "mensalidade": {
    "mes": "2026-10",
    "status": "atrasada",
    "valor": 50.0,
    "vencimento": "2026-10-10",
    "data_pagamento": null
  },
  "avisos": { "nao_lidos": 0, "ultimos": [] }
}
```
- `pendencias`: already in screen order (decision D-24): `escala` (AM-17) → `mensalidade`
  (`situacao` `atrasada`, or `pendente` only from 5 days before the due date — `DIAS_AVISO_MENSALIDADE`;
  earlier it stays out and the screen shows it under "Acompanhando") → `aviso` (AM-09:
  `{"tipo": "aviso", "quantidade": N}` with the unread count). Escala is never returned yet.
- `proxima_gira`: the tenant's next active gira (future, or in progress: `data_fim` not reached,
  or started less than 6 h ago when there is no `data_fim`). Only name, times and place — no
  tickets, consulente data or `recados`. `orientacoes` (what to bring) is `null` until AM-07.
- `mensalidade`: current month in Brasília time, `null` when the plan has no
  `mensalidade_mediun`, the house has no active mensalidade config, the médium joined after the
  month, or the house never set a value. `status`: `isento` (permanent exemption or ISENTO record),
  `paga` (PAGO record; `valor` = amount paid), `pendente` (until the due day, inclusive) or
  `atrasada` (after it). `valor` is the amount captured on the month's first record, else the
  configured monthly value.
- `avisos` (AM-09): `{nao_lidos, ultimos}` — unread count and the 3 newest unread
  (`{id, titulo, fixado, publicado_em}`); `{0, []}` when the house turned the "avisos" module off.

### 3. Avisos (AM-09)

- `GET /api/v1/medium/avisos` → `{ "itens": [{ "id", "titulo", "resumo", "fixado", "publicado_em",
  "lido" }], "nao_lidos": N }` — published, not expired, not archived, for the médium's audience
  (`todos` plus `atendimento` or `cambones` by `mediuns.is_atendimento`); pinned first, then newest.
- `GET /api/v1/medium/avisos/{id}` → `{ "id", "titulo", "corpo", "fixado", "publicado_em", "lido",
  "lido_em" }`. Scheduled, expired, archived, other audience or other tenant → 404.
- `POST /api/v1/medium/avisos/{id}/lido` → `{ "lido": true, "lido_em": "..." }` — idempotent (keeps
  the first reading). Refused while impersonating (403, D-06).
- The house module "avisos" off (`PUT /admin/config/area-medium` with `modulos.avisos = false`) →
  403 (`error_code: MEDIUM_MODULO_DESLIGADO`) on these three routes. Nothing here reveals who else
  read it or who wrote it.

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
| `/public/convite/{token}` | 30 | 1 minute per IP |
| `/public/convite/{token}/aceitar` | 10 | 1 minute per IP |
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

