# Autenticação & Autorização

Sistema de autenticação baseado em JWT com RBAC (Role-Based Access Control).

---

## Visão Geral

```
Login Request (email + password)
    │
    ▼
POST /api/v1/auth/login
    │
    ├── Busca as contas ATIVAS com o e-mail (uma por terreiro; máx. 5, mais antigas primeiro)
    ├── Verifica password com bcrypt em cada uma (sem conta: 1 verificação falsa)
    ├── Senha confere em mais de uma → 200 choose_account + selection_token (SEM cookies)
    │       └── POST /api/v1/auth/login/select {selection_token, user_id} → segue abaixo
    ├── Gera access_token (JWT, 24h)
    ├── Gera refresh_token (JWT, 30d)
    ├── Seta cookie HttpOnly: access_token
    ├── Seta cookie HttpOnly: refresh_token
    ├── Seta cookie não-HttpOnly: auth_state=1  (JS pode ler para detectar login)
    └── Retorna user info (sem tokens no body para sessões normais)
```

> **Nota de segurança (desde 2026-06-27):** o `access_token` não é mais armazenado no `localStorage`. Ele trafega exclusivamente via cookie `HttpOnly`, eliminando a superfície de ataque de XSS que permitia roubo de token por scripts maliciosos.

---

## JWT Tokens

### Access Token

| Campo | Valor |
|-------|-------|
| Algoritmo | HS256 |
| Expiração | 24 horas (1440 min) |
| Transporte | Cookie `HttpOnly; Secure; SameSite=Strict` (sessão normal) |
| Transporte (impersonação) | Header `Authorization: Bearer <token>` via sessionStorage |

**Payload:**
```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "role": "admin",
  "iat": 1709740800,
  "exp": 1709827200,
  "type": "access"
}
```

- `tenant_id` é `null` para `super_admin`.
- Impersonação acrescenta `"impersonated_by": "<super-admin-uuid>"` e expira em 1h; o token
  continua com `"type": "access"` e vai como `Authorization: Bearer` (sessionStorage).
- Todo access token sai de `create_access_token` (`backend/src/security/jwt.py`) — login,
  `/auth/refresh`, impersonação, reativação de conta e cadastro (`issue_session`). Nenhum outro
  módulo chama `jwt.encode` (travado em `test_security_jwt.py::test_so_security_jwt_assina_tokens`).

#### Claim `type` — allowlist (T-02, out/2026)

`decode_token` — o que o `jwt_middleware` usa para autenticar — aceita **só** `type == "access"`.
`refresh`, `account_select` (AM-05) e qualquer outro tipo (os futuros `mfa_pending`, convite...)
dão 401. Tipo novo de JWT deve ter `type` próprio e decoder próprio, nunca passar por `decode_token`.

Token **sem** `type` também dá 401 ("tipo de token ausente"). Os access tokens emitidos antes do
T-02 não tinham `type` e passaram por uma janela de compatibilidade (emitidos antes de
2026-10-08T00:00Z, válidos até o TTL de 24h), que terminou em 2026-10-09T00:00Z; o ramo legado foi
removido do código em 2026-10-09 e o decode é allowlist pura. Um 401 desses no navegador é
renovado sozinho via `/auth/refresh` (sem deslogar), já que o refresh token tem `type: refresh`.

### Refresh Token

| Campo | Valor |
|-------|-------|
| Algoritmo | HS256 |
| Expiração | 30 dias |
| Transporte | HTTP-only cookie (`SameSite=Strict`) |

Usado para renovar o access token sem re-login.

### Token de escolha de terreiro (`account_select`, AM-05)

| Campo | Valor |
|-------|-------|
| Algoritmo | HS256 |
| Expiração | 5 minutos (`ACCOUNT_SELECT_TOKEN_TTL`) |
| Transporte | Corpo da resposta do `/auth/login` → corpo do `/auth/login/select` (nunca cookie) |

```json
{ "type": "account_select", "uids": ["user-uuid-1", "user-uuid-2"], "remember": true, "iat": 0, "exp": 0 }
```

- Sai só de `create_account_select_token` e só é lido por `decode_account_select_token`
  (`backend/src/security/jwt.py`). Sem `sub`/`role`/`tenant_id`: não carrega identidade de acesso.
- `decode_token` e `decode_refresh_token` o recusam pelo `type` (testes em
  `tests/unit/test_am05_login_multi.py` e `tests/integration_pg/test_am05_login_multi.py`).
- `uids` = só as contas cuja senha conferiu; `remember` = o "Lembrar-me" do login.
- Não é de uso único (pode escolher de novo dentro dos 5 min); vale até expirar, desde que a conta
  continue ativa e sem `sessions_revoked_at` posterior ao `iat` (troca/redefinição de senha).

---

## Endpoints de Autenticação

### POST /api/v1/auth/login

```json
// Request
{
  "email": "admin@terreiro.com",
  "password": "SecurePassword123!"
}

// Response 200 — seta 3 cookies + retorna user info
// Set-Cookie: access_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
// Set-Cookie: refresh_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
// Set-Cookie: auth_state=1; Secure; SameSite=Strict; Max-Age=86400
{
  "user": {
    "id": "user-uuid",
    "email": "admin@terreiro.com",
    "role": "admin",
    "tenant_id": "tenant-uuid"
  },
  "areas": { "admin": true, "medium": null }
}

// Response 401
{
  "status": "error",
  "code": "UNAUTHORIZED",
  "message": "Invalid credentials"
}
```

**Mesmo e-mail em mais de um terreiro (AM-05).** O usuário é único por `(tenant_id, email)`, então
uma pessoa pode ter conta em vários terreiros (admin da própria casa e médium de outra, por
exemplo). O login confere a senha em **todas** as contas ativas com o e-mail (usuário ativo e não
excluído, terreiro sem `self_deactivated_at`/`deleted_at`), no máximo **5**, mais antigas primeiro
(`login.active_login_accounts_stmt`, `MAX_LOGIN_ACCOUNTS`):

- nenhuma conta ativa → regra de conta única (`user_by_login_email_stmt`): conta inativa → 401
  genérico; terreiro desativado pelo dono → 401 `TENANT_DEACTIVATED` só depois de conferir a senha;
- senha não confere em nenhuma → 401 "Credenciais inválidas";
- confere em **uma** → sessão nela, como sempre;
- confere em **mais de uma** → 200 sem cookies:

```json
{
  "choose_account": true,
  "selection_token": "eyJ...",
  "options": [
    {
      "user_id": "user-uuid",
      "terreiro_nome": "Casa da Ana",
      "terreiro_slug": "casa-da-ana",
      "logo_url": "https://girahub.com.br/api/v1/public/tenant/<id>/logo",
      "areas": { "admin": true, "medium": false }
    }
  ]
}
```

Só entram em `options` os terreiros cuja senha conferiu (quem não tem a senha não descobre em quais
terreiros o e-mail existe). **Custo/tempo:** uma verificação bcrypt por conta ativa (máx. 5);
e-mail inexistente faz 1 verificação falsa (`DUMMY_BCRYPT_HASH`), o mesmo custo de senha errada
numa conta só. E-mail com várias contas custa uma verificação por conta — o tempo revela que há
mais de uma conta, nunca quais.

### POST /api/v1/auth/login/select

Pública (`public_paths` do `jwt_middleware`) e com rate limit de 10/min por IP em duas camadas (AM-29):
slowapi no app e, no nginx de produção, `location = /api/v1/auth/login/select` com a mesma zona do
login (`login_limit`, 10 r/min por IP, `burst=5 nodelay`).

```json
// Request
{ "selection_token": "eyJ...", "user_id": "user-uuid" }

// Response 200 — igual ao login direto: 3 cookies (no modo do "Lembrar-me" do login) + user + areas

// Response 401 — token inválido/expirado, user_id fora da lista, conta que deixou de estar ativa
// ou sessões revogadas depois da emissão do token
{ "detail": { "error_code": "SELECTION_INVALID", "message": "O tempo para escolher o terreiro acabou. ..." } }
```

No front, o `/login` mostra "Em qual terreiro você quer entrar?" (`components/auth/AccountChoiceList`)
e chama `services/authSession.selectAccount` (com `skipAutoLogout`: o 401 aqui é "escolha
expirada", não sessão vencida); a rota depois segue `completeLogin` pelas `areas`.

### Trocar de terreiro sem sair (2026-10-09)

`GET /api/v1/auth/minhas-contas` e `POST /api/v1/auth/trocar-terreiro {conta_id, senha?}` (autenticadas;
código em `api/v1/auth/trocar_terreiro.py`). A troca nunca abre conta cuja senha não foi conferida:
as contas cuja senha conferiu no login ficam em `user_sessions.verified_accounts` (migração 093,
`{user_id: ISO UTC}`), na linha da sessão achada pelo refresh token do cookie — nada vem do cliente.
Conta conferida (e sem troca de senha depois) → direto; as outras pedem a senha delas (400
`SENHA_OBRIGATORIA`/`SENHA_INCORRETA`, nunca 401). Sucesso: a sessão atual é apagada (o refresh velho
morre), `issue_session` abre a do destino com o mesmo "Lembrar-me" e herda o mapa. Impersonação →
lista vazia / 403; conta da plataforma fora. Rate limit igual ao do login (slowapi 10/min +
`location = /api/v1/auth/trocar-terreiro` na `login_limit`). Detalhes em `docs/api.md` (Auth 1d).

### POST /api/v1/auth/forgot-password (várias contas)

Resposta sempre genérica. Com uma conta ativa, o e-mail de sempre. Com mais de uma (AM-05), **um**
e-mail listando cada terreiro com o link da própria conta — cada conta ganha o seu
`reset_token_hash`, e o `/auth/reset-password` (por token) redefine só aquela conta.

### POST /api/v1/auth/refresh

```
// Sem body — lê automaticamente o cookie HttpOnly 'refresh_token'
// Rota pública (não requer access_token válido — é exatamente para quando ele expirou)

// Response 200 — rotaciona ambos os cookies
// Set-Cookie: access_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
// Set-Cookie: refresh_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
// Set-Cookie: auth_state=1; Secure; SameSite=Strict; Max-Age=86400
{
  "access_token": "eyJhbGciOiJIUzI1NiI...",
  "token_type": "bearer",
  "expires_in": 86400
}

// Response 401 — refresh_token ausente, expirado ou inválido
{ "detail": "refresh_token inválido ou expirado" }
```

> O refresh token tem `type: refresh` no payload. `decode_refresh_token` rejeita qualquer token sem esse campo, impedindo que um access_token seja usado no lugar do refresh e vice-versa.

### POST /api/v1/auth/logout

```
// Sem body necessário — servidor lê o cookie access_token automaticamente
// e limpa os 3 cookies via Set-Cookie com Max-Age=0

// Response 200
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

## RBAC — Papéis e Permissões

### Papéis

| Papel | Descrição | Escopo |
|-------|-----------|--------|
| **SUPER_ADMIN** | Administrador da plataforma | Cross-tenant, gestão global |
| **ADMIN** | Administrador do terreiro | Tenant-specific, gestão completa |
| **OPERATOR** | Operador do terreiro | Tenant-specific, operações limitadas |
| **MEDIUM** (`medium`, AM-02) | Conta só da Área do Médium | Tenant-specific, **sem painel**: 403 em todo `/api/v1/admin/*` (`require_backoffice`) e `/api/v1/platform/*` |

### Áreas da conta (AM-02)

O login, `GET /auth/me` e `GET /auth/profile` devolvem `areas: {"admin": bool, "medium": {medium_id, nome} | null}`,
calculadas no servidor a cada chamada (nunca no JWT — o vínculo pode mudar a qualquer momento):

- `admin`: papel `admin` ou `operator` (super admin usa `/platform`).
- `medium`: médium ativo e não excluído do mesmo tenant com `mediuns.user_id = user.id` **e** plano
  efetivo com `area_medium` (Basic+). Operador/admin ligado a um médium tem as duas áreas; o papel
  `medium` é só para quem não tem painel.

A Área do Médium usa `/api/v1/medium/*` com `require_medium` (`MediumContext`): rotas "minhas",
sem `medium_id` da requisição. As rotas de `/auth/*` (perfil, trocar senha, logout, me) seguem
abertas a qualquer usuário autenticado, inclusive `medium`.

### Matriz de Permissões

| Recurso | OPERATOR | ADMIN | SUPER_ADMIN |
|---------|----------|-------|-------------|
| Emitir senha (público) | — | — | — |
| Ver giras do tenant | ✅ | ✅ | ✅ |
| Criar/editar giras | ❌ | ✅ | ✅ |
| Ver tickets | ✅ | ✅ | ✅ |
| Marcar ticket como usado | ✅ | ✅ | ✅ |
| Bulk operations (tickets) | ❌ | ✅ | ✅ |
| Exportar PDF das senhas | ❌ | ✅ | ✅ |
| Ver analytics | ✅ | ✅ | ✅ |
| Ver audit trail | ❌ | ✅ | ✅ |
| Configurar tenant | ❌ | ✅ | ✅ |
| Gerenciar usuários do tenant | ❌ | ✅ | ✅ |
| Gerenciar tenants | ❌ | ❌ | ✅ |
| Gerenciar assinaturas | ❌ | ❌ | ✅ |
| Gerenciar billing | ❌ | ❌ | ✅ |
| Feature flags | ❌ | ❌ | ✅ |
| Auditoria consolidada | ❌ | ❌ | ✅ |

### Verificação de Permissões

```python
# Nos endpoints admin:
async def admin_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Forbidden")
    # ... lógica

# Nos endpoints platform:
async def platform_endpoint(
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
```

---

## Quando um token deixa de valer antes de expirar

`get_current_user` (toda rota autenticada) e `POST /auth/refresh` carregam o usuário do banco e recusam com 401:
- conta inativa (`is_active = false`);
- conta excluída (`deleted_at` preenchido);
- token emitido antes de `sessions_revoked_at` (troca de senha, "sair de todos os dispositivos" e exclusão).

Excluir um usuário (`User.soft_delete()`, usado pela tela Usuários e pela plataforma) marca `deleted_at`, desativa a
conta e grava `sessions_revoked_at`. O corte vale na próxima requisição, sem esperar as 24 h do access token, e
continua valendo se a conta for recriada com o mesmo e-mail.

## Middleware de Autenticação

### JWTMiddleware

Decodifica o token JWT em cada request autenticado. Ordem de busca do token:
1. Header `Authorization: Bearer <token>` (usado para impersonação via sessionStorage)
2. Cookie `access_token` (HttpOnly — sessões normais)

```python
class JWTMiddleware:
    async def __call__(self, request, call_next):
        # Tenta header Authorization primeiro (impersonação)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split()[1]
        else:
            # Fallback para cookie HttpOnly (sessão normal)
            token = request.cookies.get("access_token")
        if token:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.state.user_id = payload["sub"]
            request.state.tenant_id = payload["tenant_id"]
            request.state.user_role = payload["role"]
        response = await call_next(request)
        return response
```

### TenantContextMiddleware

Garante que `tenant_id` está presente e válido:

```python
class TenantContextMiddleware:
    async def __call__(self, request, call_next):
        # Extrai tenant_id do JWT payload ou URL path
        tenant_id = request.state.tenant_id or extract_from_path(request)
        if not tenant_id:
            raise HTTPException(400, "Tenant context required")
        request.state.tenant_id = tenant_id
        response = await call_next(request)
        return response
```

---

## Hashing de Senhas

| Parâmetro | Valor |
|-----------|-------|
| Algoritmo | bcrypt |
| Rounds | 12 |
| Biblioteca | `bcrypt` (Python nativo) |

```python
import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12)
    ).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"),
        hashed.encode("utf-8")
    )
```

---

## Segurança Adicional

| Controle | Descrição |
|----------|-----------|
| Rate limiting login | Nginx (`nginx/conf.d/senhas.conf`): zona `login_limit` = 10 req/min por IP com `burst=5 nodelay`, em `= /api/v1/auth/login`, `= /api/v1/auth/login/select` (AM-29) e `= /api/v1/auth/trocar-terreiro`; App: slowapi 10/min por IP nas três rotas, com **Redis** (distribuído entre workers) |
| access_token | Cookie `HttpOnly; Secure; SameSite=Strict` — protegido contra XSS |
| auth_state | Cookie não-HttpOnly `auth_state=1` — permite JS detectar login sem expor token |
| refresh_token | Cookie `HttpOnly; Secure; SameSite=Strict`; payload com `type: refresh` |
| Separação de tipos | `decode_token` é allowlist: só `type: access` (token sem `type` é recusado); `decode_refresh_token` exige `type: refresh` |
| CSRF | Mitigado por `SameSite=Strict` — não requer CSRF token separado |
| CORS | Origins configuráveis via `.env` |
| Role hierarchy | `MEDIUM=-1 < OPERATOR=0 < ADMIN=1 < SUPER_ADMIN=2` — hierarquia explícita em `dependencies.py`; `medium` fica fora do back-office (`require_backoffice` no `admin_router`) |
| Audit trail | Toda operação de login/logout/refresh registrada |
| Monitoramento | Erros capturados via Sentry (backend + frontend) |

---

## Criar Super Admin (Bootstrap)

Na primeira instalação, execute o script de seed:

```bash
cd backend
python seed_superadmin.py
```

Isso cria um usuário SUPER_ADMIN que pode acessar o painel de plataforma e criar tenants.
