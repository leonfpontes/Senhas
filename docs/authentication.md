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
    └── Retorna tokens + user info
```

---

## JWT Tokens

### Access Token

| Campo | Valor |
|-------|-------|
| Algoritmo | HS256 |
| Expiração | 24 horas (1440 min) |
| Transporte | Header `Authorization: Bearer <token>` |

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

// Response 200
{
  "access_token": "eyJhbGciOiJIUzI1NiI...",
  "token_type": "Bearer",
  "expires_in": 86400,
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
Headers: Authorization: Bearer {refresh_token}
  — ou —
Cookie: auth_token={refresh_token}

// Response 200
{
  "access_token": "eyJhbGciOiJIUzI1NiI...",
  "expires_in": 86400
}
```

### POST /api/v1/auth/logout

```
Headers: Authorization: Bearer {access_token}

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

Decodifica o token JWT em cada request autenticado:

```python
class JWTMiddleware:
    async def __call__(self, request, call_next):
        token = extract_token(request)  # Header ou Cookie
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
| Rate limiting login | 10 tentativas / 15 minutos |
| Token no header | `Authorization: Bearer <token>` |
| Refresh via cookie | `HttpOnly`, `SameSite=Strict`, `Secure` |
| CORS | Origins configuráveis via `.env` |
| Audit trail | Toda operação de login/logout registrada |

---

## Criar Super Admin (Bootstrap)

Na primeira instalação, execute o script de seed:

```bash
cd backend
python seed_superadmin.py
```

Isso cria um usuário SUPER_ADMIN que pode acessar o painel de plataforma e criar tenants.
