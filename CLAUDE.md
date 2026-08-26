# CLAUDE.md — Instruções para Claude Code

Last Updated: 2026-06-27
Projeto: Senhas — SaaS multi-tenant de emissão de tickets para giras

Este arquivo é lido automaticamente pelo Claude Code em toda sessão. Contém regras não negociáveis
e atalhos de contexto para manter qualidade e consistência ao trabalhar neste repositório.

---

## Regras Absolutas (nunca violar)

1. **Nunca commitar segredos** — senhas, tokens, API keys, connection strings reais. Ver AGENTS.md §5.
2. **Sempre filtrar por tenant_id** em queries de entidades sensíveis. Ver AGENTS.md §3.1.
3. **Sempre aplicar grupos de permissão** em qualquer endpoint admin novo ou modificado.
   Esta é a regra mais frequentemente esquecida — ver seção abaixo e AGENTS.md §3.3.
4. **Sempre criar migração Alembic** para qualquer mudança de schema.
5. **Verificar `alembic heads`** antes de criar nova migração — nunca divergir heads sem merge revision.

---

## Grupos de Permissão — OBRIGATÓRIO em toda funcionalidade

O sistema usa RBAC fino via `PermissionGroup`. Esquecer isso é um bug crítico de segurança.

### Backend — checklist por endpoint

| Tipo | Decorator obrigatório |
|---|---|
| GET listagem/detalhe | `dependencies=[Depends(require_group_permission(PermissionFeature.X, "view"))]` |
| POST criar | `dependencies=[Depends(require_group_permission(PermissionFeature.X, "insert"))]` |
| PUT/PATCH atualizar | `dependencies=[Depends(require_group_permission(PermissionFeature.X, "edit"))]` |
| DELETE remover | `dependencies=[Depends(require_group_permission(PermissionFeature.X, "delete"))]` |

Imports necessários:
```python
from src.models import PermissionFeature
from src.api.dependencies import require_group_permission
```

Feature por módulo:
- Giras → `GIRAS`
- Porta (visão da porta) → `PORTA`
- Tickets, bulk ops, validate-bulk → `TICKETS`
- Médiuns → `MEDIUNS`
- Associados → `ASSOCIADOS`
- Usuários → `USUARIOS`
- Estoque → `ESTOQUE`
- Mensalidades (config/resumo/relatorio/pagamentos) → `FINANCEIRO`
- Contas a Pagar/Receber, Fluxo de Caixa, Config Financeira → `CONTAS_FINANCEIRAS`
- Configurações do Tenant → `CONFIGURACOES`
- Auditoria → `AUDITORIA`
- Analytics → `ANALYTICS`
- Relatório de Gira / exports CSV → `RELATORIO_GIRA`
- Cursos Presenciais / Sites → `CURSOS_PRESENCIAIS`

Exceções (não precisam de guard de grupo):
- `health.py`, `billing_stripe.py`, `subscription_info.py`, `permission_groups.py` — rotas de sistema/plataforma
- `email_resend.py` — já é `is_admin` (admins fazem bypass de grupos automaticamente)
- `dashboard_summary.py` — dashboard agregado geral
- `config.py::get_tenant_branding` (`GET /api/v1/admin/tenant/branding`) — branding
  (logo/cores) já é dado público (servido sem auth em `public/emit_ticket.py`);
  qualquer usuário autenticado do tenant precisa dele pro `ThemeProvider`, não só
  quem tem `CONFIGURACOES:view`
- `support_chat.py` (`GET/POST /api/v1/admin/support-chat/me*`) — chat de
  suporte é canal universal do usuário autenticado com a plataforma, não um
  módulo de negócio gateável por grupo; todo usuário do tenant precisa da
  própria conversa, não só quem tem alguma feature liberada. Os endpoints
  `GET /api/v1/admin/support-chat/conversations*` (visão agregada de todas
  as conversas do tenant) usam check manual `if not current_user.is_admin`
  em vez de `require_group_permission`, já que essa visão é binária
  (admin vê tudo, operator não vê nada) sem granularidade de grupo. Também
  não é gateado por plano/assinatura — disponível em todos os planos.

### Frontend — checklist por tela

Toda tela admin precisa de ambos os hooks:

```tsx
const { can }           = useSubscription();   // feature flag de plano (se aplicável)
const { can: canGroup } = usePermissions();    // RBAC de grupo — SEMPRE necessário

// 1. Gate de plano (se a feature tem restrição de plano)
if (!can('feature_subscription_name')) return <UpgradePrompt />;

// 2. Gate de grupo — OBRIGATÓRIO
if (!canGroup('feature_enum_value', 'view')) {
  return <Alert severity="warning">Você não tem permissão para visualizar este módulo.</Alert>;
}

// 3. Guards de ação — ocultar botões, não apenas desabilitar
const canInsert = canGroup('feature_enum_value', 'insert');
const canEdit   = canGroup('feature_enum_value', 'edit');
const canDelete = canGroup('feature_enum_value', 'delete');
```

Regras de UI:
- Botões de criar/editar/excluir: renderizar condicionalmente (`{canInsert && <Button>}`), nunca apenas `disabled`.
- Fetchers: checar `canGroup(..., 'view')` antes de chamar a API.
- Coluna de ações em tabelas: omitir quando todas as ações são proibidas.
- Mensagem de "sem permissão": usar `<Alert severity="warning">`, nunca deixar erro 403 exposto.

### Adicionando nova feature ao sistema de permissões

Se o módulo novo não se encaixa em nenhuma feature existente:

1. **Backend** — adicionar ao enum em `backend/src/models/permission_groups.py`:
   ```python
   NOVA_FEATURE = "nova_feature"
   ```

2. **Backend** — criar migração Alembic para adicionar o valor ao tipo ENUM:
   ```python
   op.execute("ALTER TYPE permission_feature ADD VALUE 'nova_feature'")
   ```

3. **Backend** — mapear em `permission_service.py` se houver restrição de plano.

4. **Frontend** — atualizar `frontend/src/constants/permissionFeatures.ts`:
   ```ts
   export type PermissionFeature = ... | 'nova_feature';
   
   export const FEATURE_LABELS = {
     ...
     nova_feature: { label: 'Nome Exibido', group: 'Grupo no UI' },
   };
   ```

---

## Padrões Técnicos Rápidos

### Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2 async, Pydantic v2, Alembic
- Frontend: Next.js, TypeScript, Material UI (v5), Recharts
- DB: PostgreSQL com limit de 8G (Docker local / Hostinger VPS em prod)
- Cache/Rate limit: Redis com `RedisStorage` no slowapi (distribuído)
- Monitoramento: Sentry (erros + traces). A pilha Prometheus/Grafana foi removida em
  2026-08-26 (nunca ficou operacional — item I-03 do docs/plano-execucao.md)

### Fluxo padrão backend
```
model (src/models/) → repository (src/repositories/) → endpoint (src/api/v1/admin/) → migration (alembic/versions/)
```

### Componentes frontend reutilizáveis
- `CrudDrawer` — formulários em drawer lateral (480px). **Nunca usar modais para formulários CRUD.**
- `KpiCard` — cards de KPI nas páginas financeiras
- `PageHeader` — cabeçalho de página com título, subtítulo e actions slot
- `UpgradePrompt` — bloqueio de feature por plano

### Drawers vs Modais
- Formulários CRUD → `CrudDrawer` (obrigatório)
- Confirmações de exclusão → `Dialog` do MUI (aceitável)
- Nunca criar novos modais para formulários

---

## Autenticação — Cookie HttpOnly (IMPORTANTE)

O `access_token` é armazenado como **cookie HttpOnly** (não em `localStorage`).

- **Backend login**: seta 3 cookies — `access_token` (HttpOnly), `refresh_token` (HttpOnly), `auth_state=1` (não-HttpOnly, legível pelo JS para detectar login).
- **jwt_middleware**: lê `Authorization: Bearer` header primeiro (impersonação via sessionStorage), depois fallback para cookie `access_token`.
- **Frontend api_client**: usa `withCredentials: true` no axios — cookies enviados automaticamente. Não há token no header para sessões normais.
- **Impersonação**: token fica em `sessionStorage` e vai como `Authorization: Bearer` (fluxo separado preservado).
- **hasAuthToken()**: checa `sessionStorage.getItem('access_token')` (impersonação) OU `document.cookie.includes('auth_state=1')` OU `localStorage.getItem('user')`.
- **Logout**: sempre chamar `POST /api/v1/auth/logout` para limpar cookies HttpOnly no servidor, depois remover `user` do localStorage.

---

## Checklist Rápido Antes de Qualquer PR

- [ ] Tenant isolation em todas as queries
- [ ] `require_group_permission` em todos os novos endpoints admin
- [ ] `canGroup` no frontend para view gate e ocultar ações
- [ ] Sem segredos no diff
- [ ] Migração Alembic criada (se schema mudou)
- [ ] `alembic heads` = uma única head
- [ ] Nova feature adicionada ao enum e ao `permissionFeatures.ts` (se aplicável)
- [ ] Logout chama `/api/v1/auth/logout` antes de limpar localStorage

---

## Plano de Execução Vigente

**docs/plano-execucao.md** é o backlog priorizado do projeto (criado 2026-08-26 após auditoria
completa). Regras de trabalho ativas:
- **R-01**: nenhum módulo/feature novo até Q-01 (testes de integração com Postgres real) e
  Q-02 (auditor de tenant_id) concluídos — exceto itens do plano e correções de produção.
- **R-02**: documentação divergente do código é bug — corrigir na mesma sessão em que for
  encontrada.
- **R-03**: abstração frontend com 0 consumidores — adotar ou deletar na próxima sessão que
  tocar tela relacionada.

---

Para contexto completo: ver **AGENTS.md** (especialmente §3.3 para grupos de permissão, §11 para estado atual e §11.9 para infra/deploy).
