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
    ├── Busca user por email + tenant
    ├── Verifica password com bcrypt
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
  "email": "admin@terreiro.com",
  "role": "ADMIN",
  "iat": 1709740800,
  "exp": 1709827200
}
```

### Refresh Token

| Campo | Valor |
|-------|-------|
| Algoritmo | HS256 |
| Expiração | 30 dias |
| Transporte | HTTP-only cookie (`SameSite=Strict`) |

Usado para renovar o access token sem re-login.

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
    "role": "ADMIN",
    "tenant_id": "tenant-uuid"
  }
}

// Response 401
{
  "status": "error",
  "code": "UNAUTHORIZED",
  "message": "Invalid credentials"
}
```

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

### 3 Papéis

| Papel | Descrição | Escopo |
|-------|-----------|--------|
| **SUPER_ADMIN** | Administrador da plataforma | Cross-tenant, gestão global |
| **ADMIN** | Administrador do terreiro | Tenant-specific, gestão completa |
| **OPERATOR** | Operador do terreiro | Tenant-specific, operações limitadas |

### Matriz de Permissões

| Recurso | OPERATOR | ADMIN | SUPER_ADMIN |
|---------|----------|-------|-------------|
| Emitir senha (público) | — | — | — |
| Ver giras do tenant | ✅ | ✅ | ✅ |
| Criar/editar giras | ❌ | ✅ | ✅ |
| Ver tickets | ✅ | ✅ | ✅ |
| Marcar ticket como usado | ✅ | ✅ | ✅ |
| Bulk operations (tickets) | ❌ | ✅ | ✅ |
| Exportar CSV | ❌ | ✅ | ✅ |
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
| Rate limiting login | Nginx: 5 req/s por IP; App: slowapi com **Redis** (distribuído entre workers) |
| access_token | Cookie `HttpOnly; Secure; SameSite=Strict` — protegido contra XSS |
| auth_state | Cookie não-HttpOnly `auth_state=1` — permite JS detectar login sem expor token |
| refresh_token | Cookie `HttpOnly; Secure; SameSite=Strict`; payload com `type: refresh` |
| Separação de tipos | `decode_refresh_token` rejeita access tokens; `decode_token` rejeita refresh tokens |
| CSRF | Mitigado por `SameSite=Strict` — não requer CSRF token separado |
| CORS | Origins configuráveis via `.env` |
| Role hierarchy | `OPERATOR=0 < ADMIN=1 < SUPER_ADMIN=2` — hierarquia explícita em `dependencies.py` |
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
