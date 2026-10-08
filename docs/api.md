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

### 6. Confirmação do novo e-mail de login (AM-13)

**`POST /api/v1/public/email/confirmar`** (10/min por IP) — `{"token": "..."}`. A página
`pages/confirmar-email/[token].tsx` só chama depois de um toque em "Confirmar meu novo e-mail"
(leitor de link de e-mail não gasta o token).
```json
{ "email": "nova@example.com", "terreiro_nome": "Tenda Luz da Mata" }
```
- O token (sha256 em `users.email_pendente_token_hash`) é a busca raiz; vale 24 h e é de uso único
  (as colunas `email_pendente*` são limpas). Token inexistente, vencido, já usado, substituído por
  um pedido novo ou de conta inativa/excluída → sempre 404
  `{"detail": {"error_code": "LINK_INVALIDO", "message": "Este link não vale mais. Peça a troca de novo pelo seu perfil."}}`.
- E-mail tomado por outra conta do terreiro entre o pedido e o clique → 409 `EMAIL_EM_USO`.
- Sucesso: `users.email` = novo (login passa a ser com ele), `mediuns.email` do médium ligado
  acompanha, link de "esqueci a senha" pendente deixa de valer, auditoria `medium_perfil` sem os
  endereços e aviso ao endereço ANTIGO (novo mascarado). As sessões abertas continuam.

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

### 1. Create / update Gira

**Endpoints**: `POST /admin/giras` (GIRAS `insert`; monthly limit of the plan → 422) ·
`PUT /admin/giras/{gira_id}` (GIRAS `edit`; only the fields sent change).

**Request Body**:
```json
{
  "nome": "Gira de Caboclos",
  "descricao": "Gira aberta ao público",
  "data_inicio": "2026-10-09T23:30:00Z",
  "data_fim": null,
  "local": null,
  "is_active": true,
  "recados": "Investimento sugerido: R$ 20. Trazer uma vela branca.",
  "orientacoes_corrente": "Roupa branca e guias. A corrente chega às 19h30."
}
```
- `local`: only when different from the terreiro address (`tenant_configs.endereco`).
- `recados`: goes to the consulente (ticket e-mail and public ticket page).
- `orientacoes_corrente` (AM-07, ≤ 2000 chars, trimmed; blank → `null`): what to bring / arrival
  time for the corrente. Shown **only** in the Área do Médium (Agenda detail, `.ics` and Início) —
  never in public routes, the site, e-mails or the ticket. Accepted regardless of plan; the
  screen only shows the field with `can('area_medium')`.

**Response** (201 Created / 200 OK): `GiraResponse` — `id`, `nome`, `descricao`, `data_inicio`,
`data_fim`, `local`, `is_active`, `recados`, `orientacoes_corrente`, `allow_acompanhantes`,
`max_acompanhantes`, `max_tickets`, `release_start_at`, `release_end_at`, `sponsor_*`,
`created_at`, `updated_at`. Senhas are configured separately (`PUT /admin/giras/{id}/senhas`).

---

### 2. Get All Giras

**Endpoint**: `GET /admin/giras` (GIRAS, RELATORIO_GIRA, PORTA or TICKETS `view`)

**Query Parameters**: `is_active` (optional), `date_from` / `date_to` (`YYYY-MM-DD`, Brasília
days), `skip` (default 0), `limit` (1-100, default 50).

**Response** (200 OK): list of `GiraResponse`, newest first.

---

### 3. Get Gira by ID

**Endpoint**: `GET /admin/giras/{gira_id}` (GIRAS `view`) → `GiraResponse`; another tenant's
gira → 404.

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

### 10. Área do Médium configuration (AM-10)

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

### 11. PIX key for the mensalidade (AM-10)

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

### 12. Receipts sent by médiuns (AM-12)

Both with plan `mensalidade_mediun`.

`GET /api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir` (FINANCEIRO `view`) —
receipts sent through the Área and not yet checked, every month, oldest first:
```json
[{ "pagamento_id": "uuid", "mediun_id": "uuid", "mediun_nome": "Elaine Souza", "mes": "2026-10",
   "valor": 50.0, "comprovante_enviado_em": "2026-10-08T17:05:00Z",
   "comprovante_filename": "comprovante.jpg", "comprovante_mime": "image/jpeg" }]
```
The file is the existing `GET .../mensalidades/{mediun_id}/{mes}/comprovante`.
`GET /api/v1/admin/financeiro/mensalidades?mes=` items also carry `comprovante_enviado_em`,
`comprovante_para_conferir`, `recusa_motivo` and `recusado_em`.

- **Confirm** = the existing `POST /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}` with
  `status=PAGO` (FINANCEIRO `insert`): the month becomes paid, the médium's file is kept and the
  account receivable mirror is updated as usual.
- **Do not confirm**: `PATCH /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/recusa`
  (FINANCEIRO `edit`), body `{"motivo": "até 500 caracteres"}` → `{mediun_id, mes, recusa_motivo,
  recusado_em}`. The médium sees the reason and can send another receipt. 404 when there is no record
  (or the médium belongs to another tenant), 409 `COMPROVANTE_NAO_PENDENTE` when nothing is waiting
  (already confirmed, refused or removed), 422 for an empty reason. Audited as
  `mensalidade_comprovante_medium`.

### 13. Avisos da casa (comunicados, AM-09)

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
  "grupos": [],
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
  (`todos` | `atendimento` | `cambones` | `grupos`; other values → 422), `grupo_ids` (only with
  `publico: "grupos"`, AM-23: at least one active group of the tenant — empty, archived or another
  tenant's group → 422; ignored for the other audiences; on PUT, sent = replaces the groups, and
  switching to another audience clears them), `fixado`, `publicar_em` (absent/null =
  now; future = scheduled; naive datetimes are Brasília time) and `expira_em` (optional; must be after
  `publicar_em` and, when set, in the future → else 422). On PUT, `publicar_em: null` publishes now and
  `expira_em: null` removes the expiry.
- **Plain text only**: HTML tags and control characters are stripped on save (line breaks are kept);
  empty title/text after cleaning → 422. The screens render text nodes only and auto-link
  `http(s)://`/`www.` addresses.
- `situacao`: `agendado` (before `publicar_em`), `publicado`, `expirado` (after `expira_em`).
- `grupos`: `[{ "id", "nome", "cor" }]` — the active groups chosen (empty for the other audiences).
- `leituras.total` ("lido por N de M") counts only médiuns who can read it: active, in the audience
  (`atendimento` = `mediuns.is_atendimento`, `cambones` = not, `grupos` = members of at least one of the
  aviso's active groups), and with access to the Área (linked to an active account).
- `GET /{id}/leituras` → `{ "total", "lidos", "leram": [{ "medium_id", "nome", "lido_em" }],
  "nao_leram": [{ "medium_id", "nome", "lido_em": null }] }` (D-28; only names — no contact data).
- Another tenant's id → 404. Audited as `comunicado` (create/update/delete; title, audience, group
  names and dates — not the text).

### 14. Grupos da corrente (AM-23)

G1, G2, "Ogãs", "Desenvolvimento": one concept for the audience of avisos and, next, for schedules
(AM-08/AM-25). Every route requires the plan feature `area_medium` (Basic+ **and** the pilot switch)
and the permission group `MEDIUNS` (no new feature — §6.7 of the Área plan):

| Method | Path | Group action |
|---|---|---|
| GET | `/api/v1/admin/corrente-grupos[?incluir_arquivados=true]` | `MEDIUNS:view` **or** `ESCALAS:view` (AM-08) |
| GET | `/api/v1/admin/corrente-grupos/opcoes` | `MEDIUNS:view` **or** `COMUNICADOS:view` **or** `ESCALAS:view` |
| GET | `/api/v1/admin/corrente-grupos/{id}` | `MEDIUNS:view` **or** `ESCALAS:view` (AM-08) |
| POST | `/api/v1/admin/corrente-grupos` (201) | `MEDIUNS:insert` |
| PUT | `/api/v1/admin/corrente-grupos/{id}` | `MEDIUNS:edit` |
| POST | `/api/v1/admin/corrente-grupos/{id}/membros` | `MEDIUNS:edit` |
| DELETE | `/api/v1/admin/corrente-grupos/{id}/membros/{medium_id}` (204) | `MEDIUNS:edit` |
| POST | `/api/v1/admin/corrente-grupos/{id}/desarquivar` | `MEDIUNS:edit` |
| DELETE | `/api/v1/admin/corrente-grupos/{id}` (204, archive) | `MEDIUNS:delete` |
| PUT | `/api/v1/admin/corrente-grupos/mediuns/{medium_id}` | `MEDIUNS:edit` |

**Group**: `{ "id", "nome", "cor", "descricao", "arquivado_em", "total_membros", "membros": [{ "medium_id",
"nome", "desde" }], "created_at", "updated_at" }` — list ordered by name (case-insensitive), archived
last and only with `incluir_arquivados=true`; members are active médiuns, by name.

- **Body** (POST; PUT is partial): `nome` (1–60 after removing HTML/control chars), `cor` (closed palette
  `ambar` | `petroleo` | `violeta` | `azul` | `verde` | `vinho` | `terra` | `grafite`, default `ambar`;
  other → 422), `descricao` (≤ 300, optional), `medium_ids` (POST: initial members; PUT: when sent,
  replaces the member set). Name already used by another non-archived group of the tenant, ignoring case
  → **409**. Members must be active, non-deleted médiuns of the tenant → else **422** (nothing is saved).
- `POST /{id}/membros` `{ "medium_ids": [...] }` adds (idempotent); `DELETE /{id}/membros/{medium_id}`
  removes one (not a member → 404).
- `DELETE /{id}` archives: the group leaves the lists, the options and the audience of avisos; members
  stay stored and come back with `POST /{id}/desarquivar` (409 if the name was taken meanwhile). An
  archived group cannot be edited or receive members (404).
- `GET /opcoes` → `[{ "id", "nome", "cor", "total_membros" }]` (active groups, no médium names) — for the
  "Grupos" audience of avisos, so whoever only has `COMUNICADOS` can choose a group.
- `PUT /mediuns/{medium_id}` `{ "grupo_ids": [...] }` — the "Grupos" field of the médium form: sets the
  active groups the médium is in (memberships in archived groups are kept). Médium of another tenant or
  deleted → 404; active groups only → else 422; groups for an inactive médium → 422 (`[]` is allowed).
  Returns `[{ "id", "nome", "cor", "total_membros" }]`.
- Inactivating (`PATCH /admin/mediuns/{id}` with `is_active: false`) or deleting a médium removes them
  from every group (reactivating does not put them back).
- Another tenant's id → 404 (path) / 422 (body). Audited as `corrente_grupo` (name, color, description,
  member counts) and, for the médium field, as `Medium` with the group names.

### 15. Atividades da casa (AM-08)

Faxina, ritual coletivo/individual, organização interna, preparação de curso, desenvolvimento,
reunião… Internal activities live in their own table (`atividades`, decision D-03): they **never**
count toward the monthly gira limit and **never** reach the public site, the public agenda or the
sitemap. Every route requires the plan features `area_medium` (Basic+ **and** the pilot switch)
**and** `atividades_corrente` (Basic+), plus the permission group `ESCALAS` ("Atividades e escalas",
group "Corrente" in the profiles screen). Every `tipo_id`/`grupo_id`/`gira_id` and path id is checked
in the tenant before writing (another tenant's id → 404 in the path / 422 in the body).

| Method | Path | Group action |
|---|---|---|
| GET | `/api/v1/admin/atividades/calendario?inicio&fim[&tipo_id]` | `ESCALAS:view` |
| GET | `/api/v1/admin/atividades/tipos[?incluir_arquivados=true]` | `ESCALAS:view` |
| POST | `/api/v1/admin/atividades/tipos` (201) | `ESCALAS:insert` |
| PUT | `/api/v1/admin/atividades/tipos/{id}` | `ESCALAS:edit` |
| POST | `/api/v1/admin/atividades/tipos/{id}/desarquivar` | `ESCALAS:edit` |
| DELETE | `/api/v1/admin/atividades/tipos/{id}` (204, archive) | `ESCALAS:delete` |
| GET | `/api/v1/admin/atividades/funcoes[?incluir_arquivadas=true]` | `ESCALAS:view` |
| POST | `/api/v1/admin/atividades/funcoes` (201) | `ESCALAS:insert` |
| PUT | `/api/v1/admin/atividades/funcoes/{id}` | `ESCALAS:edit` |
| POST | `/api/v1/admin/atividades/funcoes/{id}/desarquivar` | `ESCALAS:edit` |
| DELETE | `/api/v1/admin/atividades/funcoes/{id}` (204, archive) | `ESCALAS:delete` |
| POST | `/api/v1/admin/atividades/da-gira/{gira_id}` | `ESCALAS:insert` |
| GET | `/api/v1/admin/atividades?inicio&fim` | `ESCALAS:view` |
| GET | `/api/v1/admin/atividades/{id}` | `ESCALAS:view` |
| POST | `/api/v1/admin/atividades` (201) | `ESCALAS:insert` |
| PUT | `/api/v1/admin/atividades/{id}` | `ESCALAS:edit` |
| POST | `/api/v1/admin/atividades/{id}/cancelar` | `ESCALAS:edit` |
| POST | `/api/v1/admin/atividades/{id}/reativar` | `ESCALAS:edit` |
| DELETE | `/api/v1/admin/atividades/{id}` (204, soft delete) | `ESCALAS:delete` |

`inicio`/`fim` (Brasília days) follow the Área agenda rule: default current month + 2, at most 6
months, bad range → 400.

**Type** (`/tipos`): `{ "id", "nome", "natureza": "gira"|"atividade", "icone", "cor", "controla_presenca",
"pede_confirmacao", "exige_justificativa", "checkin_pelo_medium", "checkin_antes_min",
"checkin_depois_min", "elegiveis", "grupos": [{ "id", "nome", "cor" }], "convocacao_padrao",
"modo_escala", "hora_padrao": "HH:MM"|null, "duracao_min", "visibilidade_padrao", "is_sistema",
"visivel_no_site", "ordem", "arquivado_em" }` — ordered by `ordem` (Gira first), archived last.
- Every tenant has the 8 suggested types (plan §8.2: Gira, Faxina, Ritual coletivo, Ritual individual,
  Organização interna, Preparação de curso, Desenvolvimento, Reunião) and the suggested functions
  (Cambone, Porteiro, Ogã/Atabaque, Cozinha, Limpeza pós-gira): migration 078 for existing tenants,
  `ensure_default_atividade_tipos` on signup and on platform creation (and, as a safety net, on
  `GET /tipos` of a tenant with no types at all).
- **Gira** (`natureza = gira`, `is_sistema`, `visivel_no_site: true`) is the house type: it can be
  renamed and get another icon/colour/options, but `DELETE` → **422** (and a DB CHECK). It is the only
  type that corresponds to what goes to the site (the real gira, table `giras`); it cannot be used for
  an internal activity (422).
- Body (POST; PUT is partial — field absent = unchanged): `nome` (1–60, no HTML), `icone` (closed list
  `gira` · `faxina` · `vela` · `flor` · `organizacao` · `curso` · `desenvolvimento` · `reuniao` ·
  `atabaque` · `cozinha` · `estudo` · `estrela` · `folha` · `agua`), `cor` (the corrente-group palette or
  `null` = terreiro colour), the four booleans, `checkin_antes_min`/`checkin_depois_min` (0–1440, default
  60/180), `elegiveis` (`todos` · `atendimento` · `cambones` · `grupos`), `grupo_ids` (required — at least
  one ACTIVE group of the tenant — when `elegiveis = grupos`; switching to another value clears them),
  `convocacao_padrao` (`todos_elegiveis` · `so_escalados`), `modo_escala` (`nenhuma` · `grupos_por_dia` ·
  `funcoes`), `hora_padrao` (`HH:MM` or null), `duracao_min` (15–1440 or null), `visibilidade_padrao`
  (`corrente` · `convocados`). Any value outside the lists → 422. Name already used by another
  non-archived type of the tenant, ignoring case → **409** (archived names are free;
  `desarquivar` → 409 if the name was taken meanwhile).
- `DELETE /tipos/{id}` archives: the type leaves the options for new activities; existing activities
  keep it.

**Function** (`/funcoes`): `{ "id", "nome", "descricao", "ordem", "arquivado_em" }` — `nome` 1–60, unique
per tenant among the active ones (409), `descricao` ≤ 300.

**Activity**: `{ "id", "tipo": { "id", "nome", "icone", "cor" }, "gira_id", "titulo", "inicio", "fim",
"local", "descricao", "orientacoes", "visibilidade", "origem": "manual"|"plano_escala"|"gira",
"cancelada_em", "cancelamento_motivo", "created_at", "updated_at" }`.
- Body: `tipo_id` (active type of the tenant with `natureza = atividade`; else 422), `titulo` (≤ 120;
  empty → the type name), `inicio` (required; naive = Brasília), `fim` (optional, after `inicio`; empty →
  `inicio + duracao_min` of the type when it has one), `local` (≤ 200), `descricao`/`orientacoes` (plain
  text), `visibilidade` (`corrente` = whoever the type reaches sees it in the Área agenda;
  `convocados` = only who is on the schedule — hidden from everyone until AM-17 creates participations;
  default: the type's `visibilidade_padrao`).
- `POST /{id}/cancelar` `{ "motivo" }` (1–300, required): keeps the activity, marked as cancelled — the
  corrente sees the reason in the Área. A cancelled activity cannot be edited (409) until
  `POST /{id}/reativar`. `DELETE` is a soft delete (gone from the admin and the Área).
- `POST /da-gira/{gira_id}` returns (creating on first call — `INSERT … ON CONFLICT (gira_id) DO
  NOTHING`, idempotent) the gira's **anchor** in the activity layer, used by schedule/attendance
  (AM-17/AM-18). Title, date and place come from the gira. Anchors are not internal activities: the
  routes `/{id}` answer 404 for them.

**Calendar** (`/calendario`): `{ "inicio", "fim", "itens": [{ "origem": "gira"|"atividade", "id", "tipo":
{ "id", "nome", "icone", "cor" }, "titulo", "inicio", "fim", "local", "visibilidade", "cancelada" }] }` —
active giras (typed with the house Gira type) and internal activities (cancelled ones marked), by start.
`tipo_id` = the Gira type → only giras; another type → only its activities.

Audited as `atividade_tipo`, `funcao_corrente` and `atividade` (title, dates, place, visibility; the
cancel reason).

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

**Same e-mail in more than one terreiro (AM-05)**: users are unique per `(tenant_id, email)`, so
the password is checked against **every** active account with that e-mail (active, non-deleted
user in a tenant that is not self-deactivated/deleted), at most **5**, oldest first. One match →
the response above (cookies set). More than one match → `200` with **no cookies**:

```json
{
  "choose_account": true,
  "selection_token": "eyJhbGc...",
  "options": [
    {
      "user_id": "user-uuid",
      "terreiro_nome": "Casa da Ana",
      "terreiro_slug": "casa-da-ana",
      "logo_url": null,
      "areas": { "admin": true, "medium": false }
    }
  ]
}
```

Only terreiros whose password matched are listed (anti-enumeration). `selection_token` is a JWT
with `type: "account_select"`, valid for 5 minutes, carrying the allowed `user_id`s and the
"remember me" flag; it is rejected as an access or refresh token. Cost: one bcrypt verification per
active account (max 5); an unknown e-mail runs one dummy verification (same as a wrong password on
a single account). No active account → single-account rule (`TENANT_DEACTIVATED` for a
self-deactivated terreiro, after the password is checked).

**Error Responses**:
- `401 Unauthorized`: Invalid credentials (or `detail.error_code = "TENANT_DEACTIVATED"`)
- `429 Too Many Requests`: Too many login attempts (10/minute per IP)

---

### 1b. Choose the terreiro (AM-05)

**Endpoint**: `POST /auth/login/select` (public, 10/minute per IP)

**Request Body**:
```json
{ "selection_token": "eyJhbGc...", "user_id": "user-uuid" }
```

**Response** (200 OK): same as a direct login (3 cookies in the login's "remember me" mode,
`user`, `areas`).

**Error Responses**:
- `401 Unauthorized` with `detail.error_code = "SELECTION_INVALID"`: invalid/expired token,
  `user_id` not in the token's list, account no longer active, or sessions revoked after the token
  was issued (password change/reset).

---

### 1c. Forgot password

**Endpoint**: `POST /auth/forgot-password` (public, 5/hour per IP) — always the same generic
message. With several active accounts for the e-mail (AM-05), **one** e-mail lists each terreiro
with its own reset link (one token per account); `POST /auth/reset-password` resets only the
account that owns the token.

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
  "avisos_nao_lidos": 2,
  "grupos": [{ "id": "grupo-uuid", "nome": "G2", "cor": "petroleo" }]
}
```
`marca` is the same public subset served by the branding endpoint. `modulos` lists the modules
the terreiro left on (AM-10, in bottom-bar order); `mensalidade` also requires `mensalidade_mediun`
in the plan. `boas_vindas` and `whatsapp_casa` (digits with country code, for "Falar com a casa")
come from the Área configuration and may be `null`. `avisos_nao_lidos` feeds the badge on the
"Avisos" tab (AM-09; `0` when the module is off). `grupos` (AM-23) lists the active groups of the
corrente the médium is in, by name — only name and color, never the other members (D-07).
Internal médium fields (`observacoes`, contacts, payments) are never returned.

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
    "orientacoes": "Roupa branca e guias."
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
  (`situacao` `atrasada` or `nao_confirmada` (the house did not confirm the receipt, AM-12), or
  `pendente` only from 5 days before the due date — `DIAS_AVISO_MENSALIDADE`; earlier it stays out
  and the screen shows it under "Acompanhando"; `em_conferencia` is never a pendência) → `aviso`
  (AM-09: `{"tipo": "aviso", "quantidade": N}` with the unread count). Escala is never returned yet.
- `proxima_gira`: the tenant's next active gira (future, or in progress: `data_fim` not reached,
  or started less than 6 h ago when there is no `data_fim`). Only name, times and place — no
  tickets, consulente data or `recados`. `orientacoes` = `giras.orientacoes_corrente` (AM-07,
  what to bring; `null` when the house left it blank).
- `mensalidade`: current month in Brasília time, `null` when the plan has no
  `mensalidade_mediun`, the house has no active mensalidade config, the médium joined after the
  month, or the house never set a value. `status`: `paga` (PAGO record; `valor` = amount paid),
  `isento` (permanent exemption or ISENTO record), `em_conferencia` (receipt sent through the Área,
  waiting for the house — AM-12), `nao_confirmada` (the house did not confirm it), `pendente`
  (until the due day, inclusive) or `atrasada` (after it). `valor` is the amount captured on the
  month's first record, else the configured monthly value. Same rule as the Mensalidade screen
  (`services/medium_inicio.situacao_mensalidade`).
- `avisos` (AM-09): `{nao_lidos, ultimos}` — unread count and the 3 newest unread
  (`{id, titulo, fixado, publicado_em}`); `{0, []}` when the house turned the "avisos" module off.

### 3. Avisos (AM-09)

- `GET /api/v1/medium/avisos` → `{ "itens": [{ "id", "titulo", "resumo", "fixado", "publicado_em",
  "lido" }], "nao_lidos": N }` — published, not expired, not archived, for the médium's audience
  (`todos` plus `atendimento` or `cambones` by `mediuns.is_atendimento`, plus `grupos` when the médium
  is in one of the aviso's active groups — AM-23); pinned first, then newest.
- `GET /api/v1/medium/avisos/{id}` → `{ "id", "titulo", "corpo", "fixado", "publicado_em", "lido",
  "lido_em" }`. Scheduled, expired, archived, other audience or other tenant → 404.
- `POST /api/v1/medium/avisos/{id}/lido` → `{ "lido": true, "lido_em": "..." }` — idempotent (keeps
  the first reading). Refused while impersonating (403, D-06).
- The house module "avisos" off (`PUT /admin/config/area-medium` with `modulos.avisos = false`) →
  403 (`error_code: MEDIUM_MODULO_DESLIGADO`) on these three routes. Nothing here reveals who else
  read it or who wrote it.

### 4. Agenda (AM-07)

All three routes also require the house to keep the **agenda** module on (AM-10,
`tenant_configs.area_medium_agenda`); otherwise **403** with the neutral message "A agenda não
está disponível na Área do Médium desta casa." (`details.error_code: MEDIUM_MODULO_INDISPONIVEL`).
Giras are the tenant's own, active and not deleted; anything else → **404**. Internal activities
(AM-08) follow the visibility rule below; anything else → **404**.

**Endpoint**: `GET /api/v1/medium/agenda?inicio=YYYY-MM-DD&fim=YYYY-MM-DD`

Both optional, Brasília days, inclusive. Default: first day of the current month → end of the
third month (current + 2). `inicio` alone → 3 months from it. `fim < inicio`, a range of 6 months
or more, or a bad date → **400**. Past and future giras and visible activities of the range,
ordered by start.

An internal activity (AM-08) is visible to the médium when it is not deleted, `visibilidade =
corrente` and its type reaches them: `elegiveis = todos`; `atendimento` for médiuns de atendimento;
`cambones` for cambones; `grupos` for members of one of the type's ACTIVE corrente groups. Cancelled
activities stay listed with `cancelada: true`. `visibilidade = convocados` ("só quem estiver na
escala") is hidden until AM-17 (it will show through an `EXISTS` on the médium's own participation).

```json
{
  "inicio": "2026-10-01",
  "fim": "2026-12-31",
  "itens": [
    {
      "origem": "gira",
      "id": "gira-uuid",
      "tipo": { "nome": "Gira", "icone": "gira", "cor": null },
      "titulo": "Gira de Caboclos",
      "inicio": "2026-10-09T23:30:00Z",
      "fim": null,
      "local": null,
      "cancelada": false,
      "minha_participacao": null
    },
    {
      "origem": "atividade",
      "id": "atividade-uuid",
      "tipo": { "nome": "Faxina", "icone": "faxina", "cor": "petroleo" },
      "titulo": "Faxina · G1",
      "inicio": "2026-10-10T12:00:00Z",
      "fim": "2026-10-10T15:00:00Z",
      "local": "Terreiro",
      "cancelada": false,
      "minha_participacao": null
    }
  ]
}
```
Unified item shape (plan §8.2/§8.3): `tipo` of giras is the house's system type "Gira" (renameable,
AM-08); `cor: null` = terreiro colour. AM-17 fills `minha_participacao` without changing the shape.

**Endpoint**: `GET /api/v1/medium/agenda/gira/{gira_id}` — the item above plus:

```json
{
  "descricao": "Gira aberta ao público.",
  "orientacoes_corrente": "Roupa branca e guias. A corrente chega às 19h30.",
  "endereco": "Rua das Palmeiras, 120",
  "mapa_url": "https://www.google.com/maps/search/?api=1&query=Rua%20das%20Palmeiras%2C%20120",
  "senhas": { "situacao": "abrem_em", "abrem_em": "2026-10-07T12:00:00Z" },
  "link_publico": "https://girahub.com.br/public/gira/gira-uuid",
  "agenda_celular": {
    "ics_path": "/api/v1/medium/agenda/gira/gira-uuid/ics",
    "google_url": "https://calendar.google.com/calendar/render?action=TEMPLATE&..."
  }
}
```
- `senhas.situacao`: `abertas` · `esgotadas` · `abrem_em` (with `abrem_em`) · `encerradas` ·
  `sem_senhas` (no ticket window configured). Only the situation — never counts or consulente data.
- `link_publico`: the gira's public ticket page, or the terreiro's public agenda (`/{slug}`) when
  the gira has no tickets. `mapa_url` uses the terreiro address (or the gira `local`).
- `recados`, ticket limits and consulente data are never returned.

**Endpoint**: `GET /api/v1/medium/agenda/gira/{gira_id}/ics` — `text/calendar` (RFC 5545, UTC
times, 3 h when the gira has no end), `Content-Disposition: inline; filename="<gira>-<date>.ics"`,
`Cache-Control: private, no-store`. Inline on purpose: Safari on iPhone offers "Add to Calendar";
Chrome on Android downloads it and opens the calendar app. The description carries the
orientações and the link to the gira in the Área.

**Endpoint**: `GET /api/v1/medium/agenda/atividade/{atividade_id}` (AM-08) — the item plus
`descricao`, `orientacoes_corrente`, `endereco`, `mapa_url`, `cancelamento_motivo` (only when
cancelled) and `agenda_celular` (`ics_path`, `google_url`). No `link_publico` and no `senhas`:
activities are internal. `GET /api/v1/medium/agenda/atividade/{atividade_id}/ics` — same as the
gira one (`UID:atividade-<id>@girahub`). Same visibility rule → otherwise 404.

### 5. Mensalidade (AM-11/AM-12)

Besides `require_medium`, these routes need the **mensalidade module visible** in the Área
(`area_medium_mensalidade` on AND the effective plan has `mensalidade_mediun`); otherwise **403**
`details.error_code: MEDIUM_MODULO_INDISPONIVEL` (neutral — no plan offer to the médium). The month
`AAAA-MM` is the only parameter; the médium never marks a month as paid.

**`GET /api/v1/medium/mensalidades`**
```json
{
  "hoje": "2026-10-08",
  "isento": false,
  "valor_mensal": 50.0,
  "dia_vencimento": 10,
  "pix": { "tipo": "cpf", "chave": "12345678909", "nome_recebedor": "Casa de Oxala", "chave_alterada_em": null },
  "meses": [
    { "mes": "2026-10", "status": "pendente", "valor": 50.0, "vencimento": "2026-10-10",
      "data_pagamento": null, "comprovante_enviado_em": null, "recusa_motivo": null,
      "recusado_em": null, "atual": true },
    { "mes": "2026-09", "status": "nao_confirmada", "valor": 50.0, "vencimento": "2026-09-10",
      "comprovante_enviado_em": "2026-09-12T17:05:00Z",
      "recusa_motivo": "O valor é diferente da mensalidade.", "recusado_em": "2026-09-13T10:00:00Z",
      "data_pagamento": null, "atual": false }
  ]
}
```
- `meses`: newest first (current month first). From the médium's `data_entrada` month (reference
  month rule, §11.10 of AGENTS.md) to the current month, but never before the house created its
  mensalidade config nor more than 12 months back; months with a record (paid, exempt, receipt)
  always appear. Permanent exemption (`isento: true`) shows only the current month (+ records).
  Months without a record and without a configured value are skipped.
- `status`: same values as the Início (`pendente`, `atrasada`, `em_conferencia`, `nao_confirmada`,
  `paga`, `isento`).
- `pix`: `null` when the house has no PIX key ("Combine o pagamento com a casa").
  `chave_alterada_em` is filled only for 30 days after the key changed (§7.3).
- Never returned: `observacao`, `registrado_por`, the receipt file.

**`GET /api/v1/medium/mensalidades/{AAAA-MM}/pix`** — "PIX copia e cola" of an open month
(`pendente`, `atrasada` or `nao_confirmada`):
```json
{
  "mes": "2026-10", "valor": 50.0,
  "copia_e_cola": "00020126...6304ABCD",
  "txid": "MENS2026100A1B2C3D4E",
  "tipo": "cpf", "chave": "12345678909", "nome_recebedor": "Casa de Oxala", "cidade": "Sao Paulo",
  "instrucoes": null, "chave_alterada_em": null
}
```
The BR Code is built on the server (`services/pix_brcode.build_static_brcode`) with the month's
value, txid `MENS` + AAAAMM + 10 hex of the médium id (`txid_mensalidade`) and the description
"Mensalidade MM/AAAA"; the same text is the QR payload. Errors: 404 `MES_SEM_MENSALIDADE` (month
outside the list), 409 `MES_FECHADO` (`paga`, `isento` or `em_conferencia` — `details.status`), 409
`PIX_NAO_CONFIGURADO`, 409 `MENSALIDADE_SEM_VALOR`, 422 `MES_INVALIDO`.

**`POST /api/v1/medium/mensalidades/{AAAA-MM}/comprovante`** (multipart, field `arquivo`) —
JPEG, PNG, WebP or PDF up to **2 MB**, type checked by the file's first bytes. Creates the month's
record (PENDENTE, `valor_vigente` = configured value, like the first record in the panel) or updates
it, stores the file, sets `comprovante_enviado_em/_por` and clears a previous refusal. The month
becomes `em_conferencia`; the response is the month item. Errors: 422 `COMPROVANTE_GRANDE` /
`COMPROVANTE_TIPO` / `COMPROVANTE_VAZIO`, 404 `MES_SEM_MENSALIDADE`, 409 `MES_FECHADO` (paid or
exempt), 403 while impersonating, 429 above 20 uploads/hour per IP. Audited as
`mensalidade_comprovante_medium` with month, type and size only (never the file).

### 6. Perfil — "Meus dados" (AM-13)

Everything is "mine" (`ctx.medium`, `ctx.user`): no id in the URL or body. Every write is refused
while impersonating (**403**) and goes to the terreiro audit log as `resource_type =
"medium_perfil"` with `new_state = {"acao": "médium atualizou o telefone", "campos": [...]}` —
never the values (phone, address, e-mail).

**`GET /api/v1/medium/perfil`**
```json
{
  "casa": { "nome": "Ana Paula Ribeiro", "data_entrada": "2019-03-10", "tipo": "cambone", "isento_mensalidade": false },
  "telefone": "11987654321",
  "data_nascimento": "1985-04-20",
  "cep": "01310100", "logradouro": "Avenida Paulista", "numero": "1000", "bairro": "Bela Vista", "cidade": "São Paulo",
  "foto_url": "https://.../api/v1/public/user/{user_id}/photo",
  "email": "ana@example.com",
  "email_pendente": null,
  "email_pendente_expira_em": null
}
```
- `casa` is read-only for the médium (only the house edits name, entry date, type and exemption).
- Closed list: `observacoes`, `data_saida`, `registrado_por` and any internal field never appear
  (`tests/unit/test_medium_perfil.py` locks the schema).
- `email_pendente` only while a change request is still valid (24 h).

**`PATCH /api/v1/medium/perfil`** (30/hour per IP) — any subset of `telefone`, `data_nascimento`,
`cep`, `logradouro`, `numero`, `bairro`, `cidade` (`""`/`null` clears). Phone and CEP are stored
digits-only like the panel (phone 10–13 digits, CEP 8); birth date not in the future. Any other
field (`nome`, `data_entrada`, `is_atendimento`, `mensalidade_isento`, `observacoes`...) → **422**
and nothing changes. Invalid value → 422 `VALIDATION_ERROR` with a field message
(`details.campo`). Returns the profile; no change → no audit entry.

**`POST /api/v1/medium/perfil/foto`** (multipart, field `file`; 20/hour) — the account photo (the
same as the panel profile): JPG/PNG/WEBP up to 5 MB (`auth/profile.read_profile_photo`).
`{"message": "Foto atualizada.", "foto_url": "..."}`.

**`POST /api/v1/medium/perfil/senha`** (10/hour) — `{"senha_atual", "nova_senha"}`. Same rules as
`POST /auth/change-password` (`auth/profile.apply_password_change`): password policy, must differ,
revokes **every** session (this one included: `sessions_revoked_at`, `user_sessions`) and clears
the 3 auth cookies. Wrong current password → **400** `SENHA_INCORRETA` (never 401, so the front
does not log out by mistake).

**`POST /api/v1/medium/perfil/email`** (5/hour) — `{"novo_email", "senha_atual"}`. Stores the
request on the user (`email_pendente`, sha256 of an opaque `token_urlsafe(32)`, 24 h — a new
request replaces the previous link) and e-mails the link `{FRONTEND_URL}/confirmar-email/{token}`
to the **new** address only. The login e-mail does not change yet.
```json
{ "message": "Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar.",
  "email_pendente": "nova@example.com", "email_pendente_expira_em": "2026-10-08T12:00:00Z" }
```
Errors: 400 `SENHA_INCORRETA`, 400 `MESMO_EMAIL`, 409 `EMAIL_EM_USO` (another account of the
terreiro — deleted ones included — already uses it; other terreiros may use the same e-mail).

**`DELETE /api/v1/medium/perfil/email`** → 204: gives up the pending change (the link stops
working).

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
| `/auth/login` | 10 | 1 minute per IP |
| `/auth/login/select` | 10 | 1 minute per IP |
| `/auth/forgot-password` | 5 | 1 hour per IP |
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

