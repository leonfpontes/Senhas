# Multi-Tenancy

Isolamento completo entre organizações (terreiros) através de 3 camadas de proteção.

---

## Conceito

Cada **tenant** representa um terreiro independente no sistema. Todos os dados são isolados por `tenant_id`, garantindo que nenhum tenant consiga acessar dados de outro.

---

## Arquitetura de Isolamento (3 Camadas)

```
┌─────────────────────────────────────────────┐
│              Request HTTP                    │
└─────────────────┬───────────────────────────┘
                  │
         ┌────────▼─────────┐
         │  CAMADA 1: JWT   │
         │                  │
         │ Token contém:    │
         │  tenant_id: uuid │
         │  user_id: uuid   │
         │  role: ADMIN     │
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │  CAMADA 2:       │
         │  MIDDLEWARE       │
         │                  │
         │ Extrai tenant_id │
         │ do JWT e injeta  │
         │ em request.state │
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │  CAMADA 3:       │
         │  REPOSITORY      │
         │                  │
         │ Toda query SQL:  │
         │ WHERE tenant_id  │
         │   = :tenant_id   │
         └──────────────────┘
```

---

## Camada 1: JWT Payload

Quando um usuário faz login, o `tenant_id` é incluído no token JWT:

```json
{
  "sub": "user-uuid",
  "tenant_id": "terreiro-abc-uuid",
  "email": "admin@terreiro-abc.com",
  "role": "ADMIN",
  "iat": 1709740800,
  "exp": 1709827200
}
```

O `tenant_id` é definido no momento do login e **não pode ser alterado** pelo client.

---

## Camada 2: Tenant Context Middleware

O middleware `TenantContextMiddleware` executa em toda requisição:

```python
class TenantContextMiddleware:
    async def __call__(self, request, call_next):
        # Para endpoints autenticados: extrai do JWT
        if hasattr(request.state, "tenant_id"):
            tenant_id = request.state.tenant_id
        # Para endpoints públicos: extrai da URL
        else:
            tenant_id = extract_tenant_from_path(request.url.path)

        if tenant_id:
            request.state.tenant_id = tenant_id

        return await call_next(request)
```

**Resultado**: `request.state.tenant_id` disponível em todo o ciclo da request.

---

## Camada 3: BaseRepository

Todos os repositórios herdam de `BaseRepository<T>`, que filtra automaticamente:

```python
class BaseRepository(Generic[T]):
    def __init__(self, db: AsyncSession, tenant_id: UUID):
        self.db = db
        self.tenant_id = tenant_id

    async def list(self, offset=0, limit=50):
        query = (
            select(self.model)
            .where(self.model.tenant_id == self.tenant_id)  # ← SEMPRE filtrado
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_id(self, id: UUID):
        query = (
            select(self.model)
            .where(
                self.model.id == id,
                self.model.tenant_id == self.tenant_id  # ← SEMPRE filtrado
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, **kwargs):
        obj = self.model(tenant_id=self.tenant_id, **kwargs)  # ← SEMPRE associado
        self.db.add(obj)
        await self.db.flush()
        return obj
```

**Garantias**:
- `SELECT` sempre inclui `WHERE tenant_id =`
- `INSERT` sempre preenche `tenant_id`
- `UPDATE`/`DELETE` sempre verifica `tenant_id`
- Nenhum repositório permite bypass do filtro

---

## Endpoints Públicos

Os 3 endpoints públicos recebem `tenant_id` na URL:

```
GET  /api/v1/public/{tenant_id}/next-gira
POST /api/v1/public/{tenant_id}/emit-ticket
POST /api/v1/public/{tenant_id}/resend-email
```

O middleware valida que o `tenant_id` existe e está ativo antes de processar a request.

---

## Endpoints Admin vs Platform

| Tipo | Fonte do tenant_id | Acesso |
|------|-------------------|--------|
| **Admin** | JWT payload (`current_user.tenant_id`) | Dados do próprio tenant |
| **Platform** | Parâmetro da query/body | Cross-tenant (SUPER_ADMIN only) |

SUPER_ADMINs podem acessar dados de qualquer tenant através dos endpoints `/api/v1/platform/`.

---

## Prevenção de Ataques

### 1. Tenant ID Spoofing

O `tenant_id` vem do JWT (assinado pelo servidor), não do client. Tentar enviar um `tenant_id` diferente no header/body é ignorado.

### 2. Cross-Tenant Data Access

Mesmo com acesso à API, queries sempre filtram por `tenant_id`, impossibilitando enumeração de dados de outros tenants.

### 3. Privilege Escalation

O `role` no JWT é verificado em cada endpoint. Um OPERATOR não pode executar ações de ADMIN, e um ADMIN não pode acessar endpoints SUPER_ADMIN.

### 4. SQL Injection

SQLAlchemy usa queries parametrizadas, prevenindo injection de `tenant_id` malicioso.

---

## Fluxo Completo (Exemplo)

```
1. Admin do Terreiro ABC faz login
   → JWT: { tenant_id: "abc-uuid", role: "ADMIN" }

2. Admin lista giras
   GET /api/v1/admin/giras
   → Middleware: request.state.tenant_id = "abc-uuid"
   → Repository: SELECT * FROM giras WHERE tenant_id = 'abc-uuid'
   → Retorna APENAS giras do Terreiro ABC

3. Admin tenta acessar dados do Terreiro XYZ
   → Não existe endpoint para isso
   → Mesmo manipulando request, Repository filtra por "abc-uuid"
   → ZERO dados do Terreiro XYZ acessíveis
```

---

## Criação de Novo Tenant

Apenas SUPER_ADMIN pode criar tenants via:

```
POST /api/v1/platform/tenants
{
  "name": "Terreiro Novo",
  "slug": "terreiro-novo"
}
```

Isso cria:
1. Registro na tabela `tenants`
2. `TenantConfig` com configurações padrão
3. Subscription com plano inicial

---

## Testes de Isolamento

A suite de testes verifica:

- ✅ Repositório filtra por `tenant_id` em todas as operações
- ✅ Endpoint admin não retorna dados de outro tenant
- ✅ JWT inválido/expirado é rejeitado (401)
- ✅ Role insuficiente é bloqueado (403)
- ✅ Tenant inexistente retorna 404
- ✅ Tenant suspenso retorna 403
