# Estratégia de Testes

Last Updated: 2026-10-09 (reescrito na varredura R-02; o texto anterior era de março/2026 e citava 579 testes,
Cypress e cobertura que não existem mais assim)

Regras de quando rodar o quê ficam em [AGENTS.md](../AGENTS.md) §6. Este arquivo é o mapa das suítes e dos gates.

---

## Visão geral

| Suíte | Onde | Framework | Gate no CI |
|---|---|---|---|
| Unitários do backend | `backend/tests/unit/`, `backend/tests/api/` | pytest + pytest-asyncio (`asyncio_mode = "auto"`) | **Bloqueante** (job "Backend Tests") |
| Auditores estáticos do backend | `backend/scripts/audit_permission_guards.py`, `backend/scripts/audit_tenant_isolation.py` | AST | **Bloqueante** (job "Backend Tests") |
| Integração com Postgres real | `backend/tests/integration_pg/` | pytest + httpx `ASGITransport` | **Bloqueante** (job "Backend Integration (Postgres)") |
| Frontend | `frontend/__tests__/` e `frontend/src/**/*.test.ts(x)` | Jest + React Testing Library | **Bloqueante** (job "Frontend Tests") |
| Lint, tipos, auditor de permissões e build do front | `frontend/` | ESLint (`--max-warnings 0`), `tsc --noEmit`, `scripts/audit-permission-guards.js`, `next build` | **Bloqueante** (job "Frontend Tests") |
| Auditoria de dependências | `deploy.yml`, job "Security Audit" | `pip-audit` e `audit-ci` (`frontend/audit-ci.jsonc`) | Só no deploy, **não bloqueante** (`continue-on-error`) |
| E2E, carga e segurança | `e2e/scenarios/`, `load_tests/`, `security/` | specs TypeScript, Locust, script | Fora do CI; legado, sem manutenção |

Em 2026-10-09: ~120 arquivos e ~1.900 testes unitários no backend, ~60 arquivos e ~540 testes em `integration_pg`
(um arquivo por card ou jornada) e ~170 arquivos de teste no frontend. Nenhum `xfail`.

---

## CI

- `.github/workflows/tests.yml` tem os jobs; é chamado por `ci.yml` (pull request e push em branch que não é a
  master) e por `deploy.yml` (push na master = deploy, só depois dos testes).
- Backend: `pip install -e ".[dev]"`, `pytest tests/unit/ tests/api/ --no-cov` e os dois auditores.
- Integração: service container `postgres:15-alpine`, `alembic upgrade head && alembic check` e depois
  `pytest tests/integration_pg --no-cov`.
- Frontend: `npm ci`, `npm run lint`, `npm run type-check`, `npm run test -- --ci`,
  `node scripts/audit-permission-guards.js` e `npm run build`.

## Backend

```bash
cd backend
pip install -e ".[dev]"
DEBUG=true python -m pytest tests/unit/ tests/api/ --no-cov -q   # o addopts do pyproject liga --cov
python scripts/audit_permission_guards.py
python scripts/audit_tenant_isolation.py
```

- **Unitários**: banco mockado (`AsyncMock`), endpoints chamados como função. `tests/unit/test_area_medium_rotas.py`
  varre o app inteiro (toda rota admin no `admin_router`).
- **Auditores**: `audit_permission_guards.py` exige `require_group_permission` (ou `require_medium` na Área do Médium)
  em toda rota; `audit_tenant_isolation.py` exige filtro por `tenant_id` (admin, repositórios/serviços, público,
  Área do Médium e FKs do corpo/caminho). Isenções só com justificativa no próprio script (CLAUDE.md, checklist de PR).
- **Integração com Postgres real** (Q-01): app inteiro (middlewares, JWT, RBAC) contra Postgres com schema criado
  pelas migrações. Só roda com `INTEGRATION_PG=1` e recusa banco cujo nome não termine em `_test` (a suíte apaga o
  schema). Comando completo no docstring de `tests/integration_pg/conftest.py` e no AGENTS.md §6.

## Frontend

```bash
cd frontend
npm run lint && npm run type-check && npm test && node scripts/audit-permission-guards.js && npm run build
```

- Testes por papel/texto, nunca por classe (AGENTS.md §11.16). Jornadas de uso em `src/__tests__/ux/`.
- `scripts/audit-permission-guards.js` confere `canGroup`/`PermissionDenied` nas telas admin e `<MediumLayout>` nas
  telas da Área do Médium.

## Legado fora do CI

`e2e/scenarios/*.spec.ts`, `load_tests/locust_scenarios.py` e `security/audit.sh` são da v1 (março/2026) e não rodam
em nenhum workflow. Não confie neles como rede de segurança; a cobertura real é a das suítes acima.
