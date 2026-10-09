# Arquitetura do Sistema

Last Updated: 2026-10-09 (reescrito na varredura R-02: o texto anterior era da v1 — Material-UI, Next 14, Brevo
primário, `BaseRepository` com filtro automático)

**GiraHub (Senhas)** — SaaS multi-tenant para terreiros: senhas e porta da gira, médiuns e corrente, Área do Médium,
financeiro, estoque, cursos e site. Este arquivo é a visão geral; o detalhe vigente fica no
[AGENTS.md](../AGENTS.md) (regras e estado atual, §11), em [api.md](api.md) (rotas) e em [database.md](database.md)
(tabelas).

---

## Visão geral

```
Internet ──► Nginx (TLS Let's Encrypt, :80/:443)
               ├── /        ──► frontend  Next.js (:3000)
               └── /api/*   ──► backend   FastAPI + Uvicorn (:8000)
                                   ├── PostgreSQL 15 (dados; migrações Alembic)
                                   ├── Redis 7 (rate limit distribuído do slowapi)
                                   ├── E-mail: Resend (primário) → Brevo (reserva)
                                   ├── Stripe (assinatura do terreiro) · Stripe Connect / Mercado Pago (mensalidade da casa)
                                   ├── Web Push (VAPID) para a Área do Médium
                                   └── Sentry (erros e traces; front e back)
```

Tudo roda em Docker Compose numa VPS (Hostinger): `postgres`, `redis`, `backend`, `frontend` e `nginx`
(`docker-compose.prod.yml`). Push na `master` = deploy (`.github/workflows/deploy.yml`, depois dos testes). Backup
diário criptografado fora da VPS (Cloudflare R2). Passo a passo em [deployment.md](deployment.md).

---

## Frontend

- **Next.js 15 (Pages Router)**, React 18, TypeScript.
- **Tailwind v4 + shadcn/ui** (Radix) — o MUI saiu na v2.0.0. Kit em `frontend/src/components/` (`CrudDrawer`,
  `DataTable` com TanStack Table, `fields/*` com react-hook-form + zod, `gates/*`, Sonner). Regras em AGENTS.md §11.16.
- Recharts 2, axios com `withCredentials: true` (cookie HttpOnly), `@sentry/nextjs`, PWA (Porta e Área do Médium).

| Área | Rotas de tela | Quem usa |
|---|---|---|
| Público | `/`, `/planos`, `/[tenantSlug]/*`, `/public/*` | Consulentes e visitantes (emissão de senha, site, agenda) |
| Painel | `/admin/*` | Admin e operador do terreiro (gates de plano + grupo de permissão) |
| Área do Médium | `/medium/*` | Médium da corrente (`<MediumLayout>`; só chama `/api/v1/medium/*`) |
| Plataforma | `/platform/*` | Super-admin |

## Backend

- **FastAPI 0.142 / Starlette 1.x**, Python 3.11, SQLAlchemy 2 async, Pydantic v2, Alembic, PyJWT, bcrypt (12 rounds),
  slowapi + Redis, `stripe`, `pywebpush`, `httpx`.
- **Middlewares** (de fora para dentro): CORS → TrustedHost → `tenant_context` → `jwt_middleware` (header Bearer na
  impersonação, senão cookie `access_token`) → `audit_logging` → `error_rate` → rota.
- **Agendadores** no processo (lifespan): aniversários, fim de teste, e-mails de onboarding, presença e lembretes da
  Área do Médium, com trava por linha (`services/scheduler_guard.py`). E-mails saem por uma fila em memória
  (`services/email/email_queue.py`).
- Fluxo padrão: `models/` → `repositories/` ou `services/` → endpoint em `api/v1/...` → migração em `alembic/versions/`.

| Prefixo | Autenticação | Guardas |
|---|---|---|
| `/api/v1/auth/*` | — / cookie | Login, refresh, logout, escolha e troca de terreiro |
| `/api/v1/admin/*` | Usuário do terreiro | `require_backoffice` no router; `require_group_permission` por rota; `require_plan_feature` quando há plano |
| `/api/v1/medium/*` | Médium ativo | `require_medium` no router (vínculo `mediuns.user_id` + plano `area_medium` + Área ligada no terreiro) |
| `/api/v1/platform/*` | Super-admin | `require_super_admin` por rota |
| `/api/v1/public/*` | — | Rate limit nas rotas sensíveis; tenant resolvido pelo slug/gira/token |
| `/api/v1/webhooks/*` | Assinatura do provedor | `stripe`, `stripe-connect`, `mercadopago`; idempotentes |

## Isolamento e permissões

- **Tenant**: toda query sobre modelo com `tenant_id` filtra explicitamente; o auditor AST
  `scripts/audit_tenant_isolation.py` é bloqueante no CI. Detalhe em [multi-tenancy.md](multi-tenancy.md).
- **Permissões**: papéis `super_admin`, `admin`, `operator` e `medium`; o operador acessa só o que os grupos de
  permissão liberam (OR entre grupos, fail-closed desde o Q-05; grupo padrão "Acesso total"). Admin faz bypass dos
  grupos. Regras em AGENTS.md §3.3 e no CLAUDE.md.
- **Plano**: `require_plan_feature("<feature>")` (402/403) com o mínimo em `_FEATURE_MIN_TIER`
  (`services/plan_features.py`), espelhado em `frontend/src/constants/plans.ts` (AGENTS.md §3.4).
- **Sessão**: access token 24 h e refresh 30 d em cookies HttpOnly; access token tipado (`type: "access"`, T-02).
  Detalhe em [authentication.md](authentication.md).

## Emissão de senha (núcleo)

`POST /api/v1/public/emit-ticket` valida o terreiro pelo slug e a gira, trava o contador da gira
(`senha_controls`, `SELECT ... FOR UPDATE`; primeira emissão com `INSERT ... ON CONFLICT DO NOTHING`), grava o ticket
com o próximo número, confirma e enfileira o e-mail. Duplicidade por pessoa e gira é barrada também por constraint
no banco (Q-03). A Porta acompanha a fila por polling (não WebSocket).

## Testes e qualidade

Unitários, integração com Postgres real (`tests/integration_pg`), auditores de tenant e de permissão, e o gate do
front (lint, tipos, Jest, auditor de permissões, build) — todos bloqueantes no CI. Ver [testing.md](testing.md).
