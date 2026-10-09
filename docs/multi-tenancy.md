# Multi-Tenancy

Last Updated: 2026-10-09 (reescrito na varredura R-02: o texto anterior descrevia um `BaseRepository` que filtrava
sozinho pelo `tenant_id` do construtor, o que nunca foi o código)

Cada **tenant** é um terreiro. Os dados de negócio têm coluna `tenant_id` e nenhum terreiro pode ler ou alterar dados
de outro. As regras obrigatórias estão no [AGENTS.md](../AGENTS.md) §3.1 (tenant) e §3.3 (permissões); este arquivo
explica onde o isolamento acontece.

---

## De onde vem o `tenant_id`

| Rota | Origem do tenant | Quem chama |
|---|---|---|
| `/api/v1/admin/*` | Token do usuário logado (`current_user.tenant_id`), nunca o corpo da requisição | Admin e operador do terreiro (`require_backoffice` barra o papel `medium`) |
| `/api/v1/medium/*` (Área do Médium) | `require_medium` → `ctx.tenant_id` e `ctx.medium`; a rota nunca recebe `medium_id` | Médium ativo ligado ao usuário por `mediuns.user_id` |
| `/api/v1/public/*` | O próprio endpoint resolve pelo `tenant_slug` (ou pela gira/token do link) e filtra tudo por esse tenant | Qualquer pessoa, sem login |
| `/api/v1/platform/*` | Parâmetro explícito (cross-tenant por design) | Só `super_admin` |

- **Token**: o access token (`security/jwt.py`) é assinado pelo servidor e carrega `sub`, `tenant_id` (nulo só para
  super-admin), `role` e `type: "access"`; o `decode_token` é allowlist por `type` (T-02). Um `tenant_id` mandado no
  corpo ou no header não substitui o do token.
- **Middleware**: `middleware/jwt_middleware.py` lê o token (header `Authorization` na impersonação, senão o cookie
  HttpOnly) e põe usuário e tenant em `request.state`. `middleware/tenant_context.py` só deixa passar rotas públicas e
  de auth e valida o formato de um `?tenant_id=` quando ele existe.
- **Mesmo e-mail em vários terreiros** (AM-05): cada conta é um usuário por terreiro; escolher ou trocar de terreiro
  emite um token novo para aquela conta (AGENTS.md §3.2). Nada mistura dois tenants no mesmo token.

## Onde o filtro acontece

Não há filtro automático. **Toda query sobre modelo com `tenant_id` filtra explicitamente**:

- nos endpoints admin, com `Modelo.tenant_id == current_user.tenant_id`;
- nos repositórios e serviços, o método **recebe** `tenant_id` como parâmetro e filtra por ele. O
  `repositories/base.py` (`BaseRepository(db, model)`) segue essa convenção: `get_by_id(id, tenant_id)`,
  `list(tenant_id, ...)` etc.;
- na Área do Médium, por `ctx.tenant_id` e, em modelo com FK para `mediuns`, também por `ctx.medium.id`;
- FKs recebidas no corpo ou no caminho (gira, médium, grupo...) são conferidas dentro do tenant antes de gravar.

Quem garante isso é o **auditor AST** `backend/scripts/audit_tenant_isolation.py` (Q-02), bloqueante no CI: ele cobre
endpoints admin, repositórios/serviços, rotas públicas, Área do Médium e FKs do corpo/caminho. Acesso cross-tenant
intencional (schedulers, visão de plataforma) entra numa lista de exceções do script com justificativa de uma linha —
nunca para "fazer passar" (CLAUDE.md, checklist de PR).

## Testes

- `backend/tests/integration_pg/test_tenant_isolation.py` e `test_fk_cross_tenant.py`: app inteiro contra Postgres real,
  tentando ler/alterar dados de outro terreiro por HTTP, com conferência no banco e controle positivo.
- `backend/tests/integration_pg/test_area_medium.py` e os `test_am*.py`: o médium só vê o próprio terreiro e os
  próprios dados.
- Mais em [testing.md](testing.md).

## Criação de terreiro

- Pelo cadastro público (`POST /api/v1/public/onboarding`), que cria tenant, primeiro admin, assinatura e grupo padrão
  de permissões.
- Pela plataforma (`POST /api/v1/platform/tenants`, só super-admin).
