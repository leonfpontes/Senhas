# AGENTS.md - Guia Operacional para Agentes de IA

Last Updated: 2026-08-26 (correcao de docs divergentes do codigo: Porta usa polling e nao
WebSocket; pilha Prometheus/Grafana removida (I-03); cadeia de migracoes atualizada ate a 054.
Plano de execucao vigente: docs/plano-execucao.md)
Project: Senhas / GiraHub - Multi-Tenant SaaS para emissão de tickets
Repository: leonfpontes/Senhas
Default Branch: master
Working Branch (atual): master
VPS: 76.13.231.19 (Hostinger) — projeto clonado em /opt/senhas

Este arquivo define como agentes de IA devem entender o sistema e como agir ao implementar mudanças com seguranca, qualidade e consistencia arquitetural.

---

## 1) Objetivo do Produto

Senhas e um SaaS multi-tenant para emissao e gestao de tickets (senhas) para atendimento em giras.

Principais modulos:
- API publica de emissao e reenvio de senha.
- Painel admin do tenant (giras, porta, tickets, analytics, config, auditoria).
- Painel platform (super admin) para gestao de tenants, usuarios globais e billing (a aba de
  feature flags saiu em 2026-10-06 — ver §11.18).

---

## 2) Mapa Rapido do Monorepo

- backend/: FastAPI + SQLAlchemy async + Alembic + testes Pytest.
- frontend/: Next.js (Pages Router) + TypeScript + Tailwind v4 + shadcn/ui + Jest/RTL.
- packages/shared-types: contratos tipados compartilhados.
- docs/: arquitetura, API, auth, multi-tenancy, deploy e testes.
- e2e/: cenarios E2E.
- load_tests/: testes de carga.
- security/: scripts/checklist de seguranca.

---

## 3) Arquitetura e Regras Nao Negociaveis

### 3.1 Multi-tenancy (obrigatorio)

Toda operacao sensivel deve respeitar isolamento por tenant em 3 camadas:
1. JWT carrega tenant_id no payload.
2. Middleware coloca tenant_id em request.state.
3. Repository filtra por tenant_id em query.

Regra critica:
- Nenhuma leitura/escrita de entidade de tenant sem filtro explicito de tenant_id.
- Evite bypass de repository para logica de negocio, exceto quando realmente necessario e com filtro de tenant preservado.

Auditor no CI (Q-02, ampliado em 2026-10-05): `backend/scripts/audit_tenant_isolation.py`
(bloqueante no job `test-backend`). Modelos multi-tenant e FKs sao descobertos sozinhos em
`backend/src/models/`. Quatro checagens:
1. `src/api/v1/admin/`: todo `select()`/`update()`/`delete()`/`exists()` (ou `session.get`) sobre
   modelo com `tenant_id` filtra por tenant na mesma cadeia/variavel/lista de condicoes.
2. `src/repositories/` e `src/services/`: metodo que recebe `tenant_id`/`tenant` filtra por valor
   derivado DESSE parametro (ou delega a chamada que o recebe); metodo sem parametro de tenant
   precisa de filtro ou de entrada em `EXEMPT_SCOPED_QUERIES` (cross-tenant por design) ou
   `RESOLVED_ID_QUERIES` (so recebe id ja resolvido no tenant; lista os chamadores e o auditor
   falha se surgir chamador novo).
3. `src/api/v1/public/`: filtro de tenant ou "busca raiz" (`Modelo.id`/`slug`/`*token*` == parametro
   da requisicao); query filha por objeto carregado filtra pelo tenant do pai
   (`Gira.tenant_id == ticket.tenant_id`). Excecoes em `EXEMPT_PUBLIC_QUERIES`.
4. FKs da requisicao em rotas admin: campo do body/parametro `*_id` que e coluna FK para tabela
   multi-tenant e e gravado (construtor, `obj.x_id = ...`, `setattr` do `model_dump()`, chamada
   `create*`/`update*`/`registrar*`...) precisa de busca escopada no tenant ANTES:
   `_validar_*_do_tenant(db, current_user.tenant_id, body.x_id)`,
   `repo.get_by_id(body.x_id, current_user.tenant_id)` ou `select` com tenant comparando `.id`.
   Excecoes em `EXEMPT_BODY_FKS`.
Heuristica AST com limites documentados no docstring do script. Acesso cross-tenant legitimo →
entrada na lista de excecoes certa com justificativa de uma linha, apos ler o codigo e os
chamadores; para reload de objeto recem-criado ou filho de pai ja validado, preferir um filtro de
tenant redundante (barato) a uma excecao.

### 3.2 Auth e autorizacao

- Roles principais: SUPER_ADMIN, ADMIN, OPERATOR.
- Endpoints admin so para escopo do tenant atual.
- Endpoints platform so para super admin (escopo global).

**Fluxo de autenticacao via cookie HttpOnly (desde 2026-06-27):**
- Login seta 3 cookies: `access_token` (HttpOnly, Secure, SameSite=Strict), `refresh_token` (HttpOnly), `auth_state=1` (nao-HttpOnly — legivel por JS para verificar login). Cadastro (`/public/onboarding`) e reativacao de conta setam os mesmos 3 (helper unico `core/auth_cookies.set_auth_cookies`). `remember_me=false` no login → cookies de sessao (sem max_age), mantido no `/auth/refresh` (ver §11.22).
- `/auth/refresh` implementado: le `refresh_token` do cookie, valida com `decode_refresh_token` (requer `type=refresh`), emite novo access + rotaciona refresh.
- `jwt_middleware` extrai token do header `Authorization: Bearer` primeiro (impersonacao via sessionStorage), depois fallback para cookie `access_token`.
- `jwt_middleware` public_paths inclui `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`.
- Frontend usa `withCredentials: true` no axios — nao ha token no header para sessoes normais.
- Impersonacao usa sessionStorage e header Bearer — fluxo preservado separado.
- `hasAuthToken()` checa: `sessionStorage.getItem('access_token')` OR `document.cookie.includes('auth_state=1')` OR `localStorage.getItem('user')`.
- Logout DEVE chamar `POST /api/v1/auth/logout` para limpar cookies no servidor.
- Apagar os cookies de auth: SEMPRE `clear_auth_cookies(response)` de `src/core/auth_cookies.py` (junto com `set_auth_cookies`)
  (os 3 cookies, com os mesmos atributos do login — `secure` depende de DEBUG). Usado por logout,
  logout-all, change-password, delete account e deactivate account.
- Impersonacao: os cookies do navegador sao do SUPER-ADMIN. Endpoint que revoga sessoes ou apaga
  cookies recusa token com `impersonated_by` (403, `is_impersonated_request(request)`): logout-all,
  change-password, delete account, deactivate account. No front, o "Sair" do topo chama
  `endImpersonation()` (nunca `/auth/logout`) e o perfil nao grava o usuario impersonado no
  `localStorage['user']` (so no `sessionStorage` da aba).

### 3.3 Grupos de Permissao — OBRIGATORIO em toda funcionalidade

O sistema implementa RBAC fino via `PermissionGroup` / `GroupPermission`. Todo endpoint admin e toda
tela admin DEVEM respeitar esse sistema. Ignorar esse requisito e considerado um bug critico de seguranca.

#### Backend — todo novo endpoint admin precisa de:

```python
from src.models import PermissionFeature
from src.api.dependencies import require_group_permission

@router.get("/recurso", dependencies=[Depends(require_group_permission(PermissionFeature.FEATURE, "view"))])
@router.post("/recurso", dependencies=[Depends(require_group_permission(PermissionFeature.FEATURE, "insert"))])
@router.put("/recurso/{id}", dependencies=[Depends(require_group_permission(PermissionFeature.FEATURE, "edit"))])
@router.delete("/recurso/{id}", dependencies=[Depends(require_group_permission(PermissionFeature.FEATURE, "delete"))])
```

Acoes mapeadas por tipo de endpoint:
- GET (listagem/detalhe) → "view"
- POST (criar/registrar) → "insert"
- PUT/PATCH (atualizar) → "edit"
- DELETE (remover) → "delete"

Rotas existentes e suas features:
- Giras, Porta (door_control) → `PermissionFeature.GIRAS` / `PermissionFeature.PORTA`
- Tickets, tickets_bulk, validate_bulk → `PermissionFeature.TICKETS` (email_resend e so admin — isento do guard de grupo)
- Mediuns → `PermissionFeature.MEDIUNS`
- Associados → `PermissionFeature.ASSOCIADOS`
- Usuarios → `PermissionFeature.USUARIOS`
- Estoque → `PermissionFeature.ESTOQUE`
- Mensalidades (financeiro/config/resumo/relatorio) → `PermissionFeature.FINANCEIRO`
- Contas a Pagar/Receber, Fluxo de Caixa, Config Financeira → `PermissionFeature.CONTAS_FINANCEIRAS`
- Configuracoes do Tenant → `PermissionFeature.CONFIGURACOES`
- Auditoria → `PermissionFeature.AUDITORIA`
- Analytics → `PermissionFeature.ANALYTICS`
- Relatorio de Gira → `PermissionFeature.RELATORIO_GIRA`; export CSV de senhas (`exports.py`) → TICKETS ou RELATORIO_GIRA (+ plano `export_csv`)
- Cursos Presenciais / Sites → `PermissionFeature.CURSOS_PRESENCIAIS`

Nao empilhe `if not current_user.is_admin` sobre `require_group_permission`: o operador com o grupo
leva 403 enquanto a UI (que usa `canGroup`) mostra o botao. Admin ja faz bypass dos grupos. Se a acao
pode virar escalada de privilegio, escreva a protecao especifica — ex.: `users.py` (operador com
USUARIOS nao cria/promove/edita/remove administrador; SUPER_ADMIN nunca e atribuivel; ninguem se
exclui/desativa/rebaixa; o ultimo admin ativo fica) e `config.py` (cores/logo exigem plano).

Para nova feature sem equivalente existente:
1. Adicionar valor ao enum `PermissionFeature` em `backend/src/models/permission_groups.py`.
2. Criar migracao Alembic para adicionar o valor ao tipo ENUM no banco (`ALTER TYPE ... ADD VALUE`).
3. Adicionar entrada em `frontend/src/constants/permissionFeatures.ts` (type union + FEATURE_LABELS com label e group).
4. Mapear no `permission_service.py` se a feature requer restricao de plano, e proteger os endpoints com
   `require_plan_feature` (ver §3.4).

#### Frontend — toda nova tela admin precisa de:

```tsx
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/useSubscription';

const { can: canGroup } = usePermissions();    // grupo de permissao (RBAC)
const { can } = useSubscription();             // feature flag de plano

// Gate de plano (se a feature tiver restricao de plano)
if (!can('nome_da_feature_no_plano')) {
  return <UpgradePrompt ... />;
}

// Gate de grupo de permissao (OBRIGATORIO)
if (!canGroup('feature_enum_value', 'view')) {
  return <Alert severity="warning">Sem permissao para visualizar.</Alert>;
}

// Guard de acoes destrutivas/escrita
const canInsert = canGroup('feature_enum_value', 'insert');
const canEdit   = canGroup('feature_enum_value', 'edit');
const canDelete = canGroup('feature_enum_value', 'delete');
```

Regras de UI:
- Botoes de criar/editar/excluir devem ser ocultados (nao apenas desabilitados) quando sem permissao.
- Fetchers que chamam endpoints protegidos devem checar `canGroup` antes do request.
- A coluna de acoes em tabelas deve ser omitida quando `canInsert && canEdit && canDelete` sao todos false.

#### Checklist especifico para grupos de permissao

Ao criar ou modificar qualquer funcionalidade:
- [ ] Backend: todos os endpoints novos tem `require_group_permission` com feature e acao corretos.
- [ ] Backend: feature existente ou nova foi criada no enum `PermissionFeature`.
- [ ] Frontend: hook `usePermissions` importado e `canGroup` checado antes de fetch e render de acoes.
- [ ] Frontend: tela exibe mensagem de "sem permissao" (nao erro 403) quando grupo nao autoriza view.
- [ ] Frontend: `permissionFeatures.ts` atualizado se nova feature foi criada (label + group).
- [ ] Rotas de sistema (health, billing, subscription_info, permission_groups) sao excecao — nao precisam de guard de grupo.

### 3.3 Integridade de emissao de senha

- Emissao deve permanecer atomica/confiavel sob concorrencia.
- Em contadores de senha, use padroes com lock transacional (ex.: SELECT FOR UPDATE) ja adotados no projeto.

### 3.4 Gate de plano — `require_plan_feature` (P-05, desde 2026-10-05)

Feature restrita por plano usa SEMPRE o gate unico de `backend/src/api/dependencies.py` — nunca um
`_require_pro`/`plan in {...}`/tier local:

```python
from src.api.dependencies import require_plan_feature

# modulo inteiro gated: no APIRouter
router = APIRouter(prefix=..., dependencies=[Depends(require_plan_feature("estoque_controle"))])
# so algumas rotas: no decorator, junto do require_group_permission
@router.get("/x", dependencies=[Depends(require_plan_feature("mensalidade_mediun")), Depends(require_group_permission(...))])
# gate que depende do body (ex.: ligar toggle): await check_plan_feature(current_user, db, "fila_espera")
```

- `feature` e um campo de `PlanFeatures` em `backend/src/services/plan_features.py` (catalogo unico;
  nome invalido quebra na importacao). Esse arquivo e o UNICO lugar com a hierarquia de planos
  (`_PLAN_TIER` / `plan_tier()`) e com o plano minimo de cada feature (`_FEATURE_MIN_TIER` /
  `feature_min_plan()`); o frontend espelha catalogo, limites e plano minimo em
  `frontend/src/constants/plans.ts` (teste-espelho `__tests__/constants/plans.test.ts`) e le as
  features efetivas via `frontend/src/hooks/useSubscription.tsx`. Na tela, `minPlan` de
  `PlanLocked`/`UpgradePrompt` vem sempre de `minPlanFor(feature).label` — nunca nome fixo.
- Semantica unica: plano inclui a feature (senao **403**, mensagem "disponivel a partir do plano X")
  **e** status da assinatura permite uso (senao **402**). Super admin sem tenant → 400.
- Status (`subscription_block_reason`): SUSPENDED bloqueia; CANCELLED/EXPIRED bloqueiam plano pago (com
  FREE e o estado normal pos-`reset_to_free`); trial local (sem `stripe_subscription_id`) vencido bloqueia
  mesmo antes do trial_scheduler rebaixar; trial Stripe e decidido pelo webhook; `is_bonus` segue o status
  normalmente mas nao sofre corte de fim de trial; `cancel_at_period_end` mantem acesso ate o webhook
  `customer.subscription.deleted`.
- Limites numericos (giras/mes, mediuns) ficam no endpoint, mas leem `effective_limit(sub, campo)` — usuarios
  NAO tem limite desde out/2026 (ilimitados em todos os planos; `users.py` nao checa nada ao criar/reativar):
  SUSPENDED → 402; CANCELLED/EXPIRED de plano pago ou trial vencido → limites do FREE. `max_mediuns` vale
  na criacao E na reativacao (`PATCH is_active=true`) de medium.
- `GET /api/v1/admin/subscription` devolve `features` via `get_effective_plan_features(sub)` — a UI esconde o
  que o backend nega. `PermissionService.is_feature_enabled_for_plan` (operadores) usa a mesma funcao.
- Mensagem de 403: derivada do catalogo (`plan_feature_denied_message`): "X disponivel a partir do plano
  Pro" ou "X disponivel apenas no plano Premium".
- Toggles de config com gate (fila de espera, horario marcado, validar associado, mensalidade de
  associados) so checam o plano ao LIGAR (False → True): a tela reenvia todos os toggles a cada salvar,
  e tenant que perdeu a feature com o toggle gravado ligado nao pode levar 403. Em runtime toggle sem
  plano vale como desligado (`waitlist_service`, `time_slot_service`, `public/emit_ticket.py`,
  `mensalidades._assoc_enabled`).
- Modulos gated hoje: estoque (`estoque_controle`), sites e cursos presenciais (`site_builder`), contas
  financeiras (`contas_financeiras`), rastreio/reenvio de e-mail (`email_transacional`), mensalidades
  (`mensalidade_mediun` / `mensalidade_associado`), mediuns (`mediuns`, em aniversariantes, criacao,
  edicao e exclusao — listar/consultar fica livre: modo somente leitura P-09), associados
  (`associados`, router inteiro; Premium desde out/2026), analytics (`analytics_basico`) e auditoria (`auditoria`) — ambos no
  router desde 2026-10-06 (antes so a tela checava o plano), toggles de fila de espera e agendamento
  por horario em config, marca do terreiro (`tema_personalizado`: so quando o PUT /tenant/config MUDA
  cor principal/de apoio/cor do texto, e no POST /tenant/logo; remover logo e os demais campos salvam
  em qualquer plano) e exportacao CSV (`export_csv`: CSV da gira e da posicao de estoque).
- Excecao no gate de plano para operadores: `view` de `MEDIUNS` NAO passa por
  `is_feature_enabled_for_plan` (`_VIEW_SEM_GATE_DE_PLANO` em `permission_service.py`) — fora do plano o
  operador com o grupo continua consultando os mediuns; insert/edit/delete seguem zerados.
- `bulk_operations` vale em TODOS os planos (always-on desde 88dbc25; `plan_features.py` devolve
  True): nao e vendido — fica fora do quadro (`UNSOLD_FEATURES` em `constants/plans.ts`), junto com
  `export_csv` (segue no Pro+, mas nao e diferencial no segmento), `analytics_avancado` e
  `suporte_prioritario` (nada implementado). So exibicao: gates e campos seguem no catalogo `PlanFeatures`.
- Rotas `/api/v1/platform/*`: `Depends(require_super_admin)` importado de `src.api.dependencies` (copia unica).

#### Matriz de planos (reestruturacao de out/2026)

Limites (`PLAN_LIMITS`, copiados para a linha de `subscriptions` na troca de plano — mudou numero,
crie migracao de dados como a `059_planos_limites_out_2026` e a `060_usuarios_ilimitados`):

| | Gratuito | Basic | Pro | Premium |
|---|---|---|---|---|
| Preco/mes | R$ 0 | R$ 49 | R$ 79 | R$ 99 |
| Usuarios | ilimitado | ilimitado | ilimitado | ilimitado |
| Giras/mes | 2 | 3 | 4 | ilimitado |
| Mediuns | — | 15 | 30 | ilimitado |

Recursos (plano minimo em `_FEATURE_MIN_TIER`):
- **Todos**: link de senhas para enviar via WhatsApp, Porta, painel, usuarios ilimitados e
  `bulk_operations` (always-on, fora do quadro).
- **Basic+**: `mediuns`, `relatorio_gira`, `mensalidade_mediun`.
- **Pro+**: `email_transacional`, `tema_personalizado` (no quadro: "Personalizacao da plataforma"),
  `analytics_basico`, `export_csv` (fora do quadro), `auditoria`, `site_builder` (site e cursos).
- **So Premium**: `associados`, `mensalidade_associado`, `estoque_controle`, `contas_financeiras`
  (lancamentos, fluxo de caixa, categorias, contas bancarias), `fila_espera`, `agendamento_por_horario`.
- Fora do quadro (`UNSOLD_FEATURES`): `bulk_operations`, `export_csv`, `analytics_avancado` (Pro+ no
  catalogo) e `suporte_prioritario` (Premium no catalogo) — nada implementado nos dois ultimos.
- **Por que mensalidade de mediuns no Basic**: o 1o gatilho de upgrade e o numero de giras/mes; o 2o e
  o numero de mediuns. Com a mensalidade ja no Basic e o limite de 15 mediuns, o dirigente sobe de
  plano para continuar controlando a mensalidade de todo mundo. A de associados segue Premium.
- **Por que usuarios ilimitados**: quem opera a plataforma (muitas vezes um filho da casa, nao o
  dirigente que assinou) e quem sente falta dos recursos novos — mais usuarios = mais promotores
  internos do upgrade. `max_users` segue na assinatura com o sentinela 99999 (linhas antigas com -1
  tambem sao "ilimitado"); `effective_limit` nao e mais chamado para usuarios.
- O espelho de mensalidade em contas a receber (`mensalidade_contas_service`) so nasce com a feature
  no plano: criar medium/associado num plano sem `mensalidade_mediun`/`mensalidade_associado` nao gera
  conta, mesmo com config gravada.
- A landing (`pages/index.tsx`) mostra os cartoes e o comparativo completo (`PlanComparisonTable`, o
  mesmo da pagina /planos, derivado de `constants/plans.ts`); no celular ele fica atras de
  "Ver comparativo completo".
- Dados de modulo que saiu do plano ficam no banco (sem grandfathering): a tela mostra `PlanLocked`
  (nao ha modo so-leitura) e a API responde 403; limites menores so bloqueiam CRIAR (422), nada e apagado.

---

## 4) Convencoes de Implementacao

### 4.1 Backend

- Stack alvo: Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2.
- Fluxo padrao:
	- Modelo ORM em backend/src/models.
	- Regra de acesso em backend/src/repositories.
	- Endpoint em backend/src/api/v1/{public|admin|platform|auth}.
	- Migracao Alembic em backend/alembic/versions.
	- Testes em backend/tests.
- Nao quebrar contratos de resposta sem atualizar frontend, shared-types e docs.
- Erros HTTP devem ser claros, consistentes e com status code adequado.

### 4.2 Frontend

- Stack: Next.js + TypeScript + Tailwind v4 + shadcn/ui (kit em `frontend/src/components/README.md`, ver §11.16).
- Preferir componentes reutilizaveis e hooks existentes.
- Evitar duplicacao de chamadas API; centralizar em services/client.
- Garantir estado de loading, erro e sucesso em telas administrativas.
- Responsividade obrigatoria (desktop e mobile).

### 4.3 Banco e migracoes

- Toda mudanca de schema exige migracao Alembic.
- Migracoes devem ser reversiveis (downgrade coerente sempre que possivel).
- Nomes de colunas/indices/constraints devem ser claros e estaveis.
- **OBRIGATORIO antes de criar qualquer migracao**: verificar se ha multiplas heads com `alembic heads`. Se houver mais de uma, criar merge revision primeiro (`alembic merge heads -m "merge"`) antes de adicionar nova migracao. Nunca criar duas migracoes com o mesmo `down_revision` em branches diferentes sem merge.

### 4.4 Convencao de Enums SQLAlchemy 2.0 (CRITICA)

O SQLAlchemy 2.0 usa o `.name` do enum Python para lookup no banco por padrao. Para enums com valores
lowercase no banco, e obrigatorio usar `values_callable=lambda x: [e.value for e in x]` no SQLEnum.

**Enums com valores lowercase no banco** (obrigatorio `values_callable`):
- `user_role`: super_admin, admin, operator
- `ticket_status`: emitted, called, completed, cancelled, no_show
- `subscription_status`: active, suspended, cancelled, expired
- `invoice_status`: draft, sent, paid, overdue, cancelled
- `audit_action`: create, read, update, delete, login, logout, token_refresh, TENANT_DELETED
- `estoque_movimentacao_tipo`: entrada, saida

**Enums com valores UPPERCASE no banco** (NAO usar values_callable):
- `plan_type`: FREE, BASIC, PRO, PREMIUM
- `mensalidade_status`: PENDENTE, PAGO, ISENTO
- `site_status`, `site_section_type`: UPPERCASE

**Regra para novos enums**: decidir antes de criar se serao lowercase ou UPPERCASE e manter consistencia.
Misturar (DB uppercase + values_callable, ou DB lowercase sem values_callable) causa LookupError em runtime.

---

## 5) Politica de Seguranca (OBRIGATORIA)

### 5.1 Proibido commitar segredos

Nunca subir no repositorio:
- Senhas reais.
- JWTs reais.
- API keys reais (Brevo, Resend, etc.).
- Connection strings reais com credenciais.
- Arquivos .env com valores reais.

Permitido:
- Placeholders explicitos (ex.: your_api_key_here).
- Dados de teste claramente nao produtivos.

### 5.2 Redacao segura em codigo/docs

- Ao documentar, use exemplos anonimizados/placeholders.
- Nunca logar credenciais, tokens ou payloads sensiveis completos.
- Se detectar segredo no historico da branch em trabalho, interrompa fluxo de push/PR e sanitize antes.

---

## 6) Qualidade, Testes e Validacao

Antes de concluir implementacao, executar validacoes proporcionais ao impacto:

Backend:
- Testes unitarios/integracao afetados.
- Verificacao de imports, tipagem e lint (quando configurado).
- **Suite com Postgres real** (`backend/tests/integration_pg/`, item Q-01, bloqueante no CI no job
  "Backend Integration (Postgres)"): app FastAPI inteiro via httpx (middlewares, JWT, `Depends` de RBAC)
  contra Postgres 15 com schema criado pelas migracoes. Cobre emissao concorrente, isolamento de tenant
  por modulo, RBAC por HTTP, webhook Stripe e migracoes em banco zerado. Obrigatoria ao mexer em emissao,
  contadores, RBAC, filtros de tenant, webhook ou migracoes. Rodar localmente:
  ```bash
  docker run -d --rm --name senhas-test-pg -e POSTGRES_USER=senhas_test -e POSTGRES_PASSWORD=senhas_test \
    -e POSTGRES_DB=senhas_test -p 55432:5432 postgres:15-alpine
  cd backend && INTEGRATION_PG=1 DEBUG=true STRIPE_WEBHOOK_SECRET=whsec_integration \
    DATABASE_URL=postgresql+asyncpg://senhas_test:senhas_test@localhost:55432/senhas_test \
    python -m pytest tests/integration_pg --no-cov
  ```
  A suite apaga o schema do banco apontado: so roda com `INTEGRATION_PG=1` e recusa banco cujo nome nao
  termine em `_test`. Sem a flag, os arquivos nem sao coletados. Ler sempre numa sessao nova
  (`AsyncSessionLocal()`), nunca reler objetos expirados da sessao do teste (MissingGreenlet).
  Testes `xfail` estritos marcam furos conhecidos (Q-05): quando o item for feito, o teste passa,
  o build quebra e o marcador deve ser removido.

Frontend:
- Testes de componentes/paginas afetadas.
- Build/typecheck quando mudancas forem amplas.

Fluxo minimo recomendado por mudanca:
1. Implementar.
2. Rodar testes alvo.
3. Revisar diff para regressao e segredos.
4. Atualizar docs quando contrato/comportamento mudar.

---

## 7) Boas Praticas de Desenvolvimento para Agentes

- Fazer mudancas pequenas e focadas por commit sempre que possivel.
- Preservar padroes existentes do repositorio.
- Evitar refactors amplos sem necessidade funcional clara.
- Manter compatibilidade retroativa quando viavel.
- Explicar no PR o que mudou, risco e como validar.
- Se encontrar alteracoes inesperadas nao relacionadas durante a tarefa, pausar e alinhar com o usuario.

---

## 8) Checklist de Implementacao (Use Sempre)

Antes de abrir PR, confirme:
- [ ] Isolamento multi-tenant preservado.
- [ ] Nao ha segredo hardcoded nos arquivos alterados.
- [ ] Migracao criada/aplicavel para mudanca de schema.
- [ ] `alembic heads` retorna exatamente UMA head (sem divergencias).
- [ ] `alembic check` sem diferencas num banco migrado do zero (modelos = schema migrado; gate no CI). Divergencia: ajustar o MODELO; migracao so se o banco estiver errado.
- [ ] Testes relevantes executados e passando.
- [ ] Docs atualizadas (API, comportamento ou operacao).
- [ ] Frontend funciona em desktop/mobile para a funcionalidade alterada.
- [ ] Logs/erros sem vazamento de dados sensiveis.
- [ ] **Grupos de permissao**: todos os novos endpoints tem `require_group_permission` com feature e acao corretos (ver secao 3.3).
- [ ] **Grupos de permissao**: frontend usa `canGroup` para bloquear a tela (view) e ocultar acoes (insert/edit/delete).
- [ ] **Grupos de permissao**: se feature nova, enum atualizado no backend e `permissionFeatures.ts` atualizado no frontend.

---

## 9) Convencoes de PR e Commit

### Commit

- Mensagens claras no estilo conventional commits (ex.: feat:, fix:, refactor:, docs:, test:, chore:).

### PR

Incluir obrigatoriamente:
- Contexto do problema.
- Escopo da solucao.
- Arquivos/areas impactadas.
- Evidencias de teste.
- Riscos e mitigacoes.
- Passo a passo rapido para validacao manual.

---

## 10) Referencias de Documentacao do Projeto

- docs/plano-execucao.md — plano de execucao vigente (fases, itens, criterios de aceite e
  regras de trabalho R-01..R-04; consultar antes de propor feature nova)
- docs/architecture.md
- docs/api.md
- docs/database.md
- docs/authentication.md
- docs/multi-tenancy.md
- docs/email.md
- docs/testing.md
- docs/deployment.md
- RELEASE.md

---

## 11) Estado Atual do Sistema (Funcionalidades Implementadas)

### 11.1 Envio de senhas por e-mail
- **Provider primario**: Resend (API key via RESEND_API_KEY, from via RESEND_FROM_EMAIL).
- **Fallback**: Brevo (BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME).
- **Templates HTML profissionais**:
  - Template regular: cores do tenant (primary/secondary), logo grande circular com borda, info do consulente (nome, email, telefone), botao "Como chegar" via Google Maps, numero da senha em destaque.
  - Template patrocinador: paleta ouro/preto, mensagem de gratidao especial.
- **Seguranca**: HTML escaping em todos os campos de texto do usuario.
- Sem QR code. Sem botao de resgate. Nome do tenant no cabecalho do email.

### 11.2 Configuracao do Tenant (Admin)
- **Campos de branding**: nome, slug, logo (upload de imagem como BYTEA), cores (primary, secondary, font).
- **Endereco**: campo `endereco` em tenant_configs (migracao 011) — usado nos emails para o botao "Como chegar".
- **Feature flags**: habilitacao de walk-in, patrocinadores, etc.
- **Marca**: mudar cores/logo exige `tema_personalizado` (Pro+); quem ja tinha marca propria
  continua exibindo. As respostas de PUT /tenant/config e POST/DELETE /tenant/logo trazem
  `tenant_nome`. A previa da tela usa `pickForeground` (mesma regra do `applyBrand`).
- **"Conferir e-mail de associado"** (`validate_associado_on_emit`): na emissao publica, quem se
  DECLARA associado precisa usar um e-mail cadastrado em Associados; quem nao se declara pega senha
  normalmente (nao restringe a emissao a associados).

### 11.3 Giras
- Campo "Local" opcional no criar/editar ("Local (se diferente do endereco do terreiro)"). Vazio →
  vale `TenantConfig.endereco` no cartao da gira e nos e-mails (templates: `gira_location` tem
  precedencia sobre `tenant_address`).
- `GET /api/v1/admin/giras` (lista, so leitura) aceita GIRAS, RELATORIO_GIRA, PORTA ou TICKETS
  (`require_any_group_permission`) — Porta, modo TV, Senhas e o GiraProvider escolhem a gira por ela.
  Detalhe/criar/editar/excluir e `/senhas` continuam so com GIRAS. `date_from`/`date_to` sao dias
  de Brasilia (America/Sao_Paulo), nao dias UTC.
- `GET /api/v1/admin/giras/settings` (GIRAS:view): `enable_time_slot_scheduling` + `endereco` para a
  tela de Giras de quem nao tem CONFIGURACOES; `GET /config/time-slot-templates` aceita GIRAS:view
  (o PUT segue so com CONFIGURACOES:edit).
- Compartilhar no cartao/drawer da gira usa o `public_link` DA GIRA (`/public/gira/{id}`); o link
  unico do terreiro (`/giras/unified-links`, resolve a gira aberta mais antiga) fica em "Link e QR".
- Criar gira sem `giras:edit` pula o passo "Senhas" (o PUT `/senhas` exige edit) e avisa.
- "Gira de hoje": `GiraRepository.get_upcoming_giras` inclui gira que comecou ha ate 12h (mesma
  janela do GiraCard e de `pickTodayGira`). O seletor do topo vale para Dashboard, Senhas e Porta
  (`GIRA_CONTEXT_ROUTES`); a tela de Giras nao usa.

### 11.4 Porta (Visao da Porta)
- Gestao da fila de atendimento via **polling HTTP a cada 8s** (`POLLING_INTERVAL_MS`) — NAO ha
  WebSocket no codigo atual (zero `@router.websocket` no backend, nenhuma rota `/door/ws`; o hook
  `useWebSocket` foi removido). A location `/ws/` do nginx e legado sem efeito.
- **Fluxo de um passo**: "Chamar" abre o AttendModal e `PATCH /door/tickets/{id}/attend` grava
  EMITTED → COMPLETED (chamado/atendido/finalizado no mesmo instante). O app nao grava mais
  `called`: a interface nao tem "Em atendimento" (cartao, contador, filtro). `called` legado e
  tratado como aguardando (front: `normalizeLegacyStatus`; back: `_WAITING_STATUSES` em checkin,
  desfazer chegada, attend e no contador `awaiting`). `/complete` e `in_progress` ficam no backend
  por compatibilidade, sem uso na interface.
- Modo TV/Kiosk fullscreen em `porta/kiosk.tsx` (mesmo polling). Sem `?gira=` usa `pickTodayGira`.
  Privacidade: mostra so primeiro nome + inicial do sobrenome (`nomeParaTv`).
- Aviso sonoro: base = primeira fila carregada de cada gira (nao toca ao abrir nem ao trocar de gira).
- Modais: AttendModal, WalkInModal. Editar "sem senha" com `priority_category: null` tira a prioridade
  (campo omitido mantem a atual).

### 11.4.1 Senhas (tickets)
- Busca no servidor: `GET /giras/{id}/tickets?search=` (numero exato "42"/"0042"/"#42", "P001" =
  associado, ou trecho de nome/e-mail). Resposta traz `numero_formatado` (P001/0001).
- Rastreio/reenvio de e-mail so para admin (`email_resend.py` exige `is_admin`).
- "Exportar CSV": `GET /giras/{id}/export-csv` com `require_plan_feature("export_csv")` +
  TICKETS ou RELATORIO_GIRA (view); o botao segue o mesmo plano.
- Cancelamento em lote cancela em cascata os acompanhantes do titular e devolve as vagas (igual a
  exclusao individual).

### 11.5 Layout Admin (Sidebar)
- Header redesenhado: fundo gradiente com cores do tenant, logo circular 52px (ou avatar fallback com inicial), nome do terreiro como texto principal (ate 2 linhas), "Senhas Admin" como label secundario.
- Navegacao "por trabalho a fazer" em `frontend/src/components/admin/layout/navConfig.ts` (grupos Hoje,
  Giras e senhas, Corrente, Casa, Conta), usada pela Sidebar, pela busca de acoes (⌘K) e pela barra do
  celular. Todo item checa plano (`can`) E grupo da mesma feature da tela (`view(...)`); nada de
  `!isOperator` para tela que tem feature de grupo. Analytics fica em "Giras e senhas" e Auditoria em
  "Conta" (voltaram ao menu em 2026-10-06).
- `getFeatureForPath` (admin_layout) tem de usar a MESMA feature da tela/backend: Lancamentos, Fluxo e
  contas-pagar/receber → `contas_financeiras`; Mensalidades → `financeiro`; Configuracao financeira sem
  feature no layout (cada aba se protege).
- Item selecionado com gradiente do tenant.
- Footer: "Senhas v1.1 — Admin Edition".
- Responsivo: drawer temporario no mobile, permanente no desktop.
- Suporte a impersonacao (banner amarelo no topo).

### 11.6 Perfil do Usuario
- Upload de foto como BYTEA (armazenado no banco).
- Avatar exibido no AppBar e no sidebar; salvar dados/foto chama `useProfile().refresh()` (o topo
  atualiza na hora).
- Trocar senha, excluir e desativar conta encerram a sessao (backend apaga os 3 cookies; o front
  chama `/auth/logout` com `skipAutoLogout`). "Desativar conta e terreiro" so aparece para admin.
- Impersonando, a tela esconde trocar senha, sair de todos os aparelhos, desativar e excluir (o
  backend recusa com 403).

### 11.7 Homepage Publica
- Favicon personalizado.
- Meta tags com Head do Next.js.

### 11.8 Cadeia de Migracoes Alembic
- Head atual: `060_usuarios_ilimitados` (2026-10-07, so dados: `max_users` = 99999 em todas as
  assinaturas), apos `059_planos_limites_out_2026` (limites da reestruturacao de planos) e
  `058_associados_email_unique_ativo` (2.2.0).
- Historico com 4 merge revisions (010, 030, 037, d9fafadd9261) — prefixos numericos ja
  colidiram 3x (009, 028, 030). Por isso a regra do §4.3: `alembic heads` ANTES de criar
  qualquer migracao nova.
- Migracoes corretivas notaveis (post-mortems nos docstrings): 044b (largura de
  alembic_version.version_num — banco zerado quebrava no upgrade), 052 (dedup de consulentes +
  unique parcial por tenant+email), 054 (purga de time slots soft-deletados que colidiam na
  unique), 058 (e-mail de associado unico so entre ativos — recadastrar excluido dava 500).

### 11.10 Financeiro — Controle de Mensalidade de Mediuns (branch 002-financeiro-mensalidade)
- **Feature Basic+**: `mensalidade_mediun` foi PRO+ de 2026-06-27 ate a reestruturacao de out/2026, quando passou a valer a partir do Basic (decisao do dono, ver §3.4; a de associados segue Premium). Endpoints usam `require_plan_feature("mensalidade_mediun")`; config e relatorio ficam nesse gate e a parte de associados so vale com `mensalidade_associado` no plano.
- **Modelos**: `MensalidadeConfig` (valor_mensal, dia_vencimento, 1:1 tenant), `MensalidadePagamento` (UNIQUE mediun_id+mes, BYTEA comprovante), `MensalidadeStatus` enum (PENDENTE/PAGO/ISENTO).
- **Endpoints** (prefixo `/api/v1/admin/financeiro`): config GET/PUT, mensalidades GET/POST por mes, comprovante GET/DELETE, resumo GET (6 hist + 3 proj), relatorio POST enviar / GET download. Associados espelham em `/associados*`.
- **Regras de acesso** (desde 2026-10-06): so `require_group_permission(FINANCEIRO, ...)` + gate de plano — nao ha mais checagem de perfil ADMIN (`_require_admin` removido; contradizia o grupo). Registrar/editar pagamento e POST (upsert) → acao `insert`; a tela mostra "Registrar"/lote so com `canGroup('financeiro','insert')`. PUT config → `edit`.
- **Mes de referencia (mediuns)**: entra quem estava na casa em algum dia do mes (`data_entrada` <= fim do mes ou nula E ativo ou `data_saida` >= inicio do mes) e quem ja tem registro de pagamento no mes. Associados nao tem datas: todos os nao excluidos.
- **Registro**: `valor_vigente` e capturado no PRIMEIRO registro do mes e nao muda em edicoes; `observacao` so muda quando o formulario envia o campo (vazio limpa; o lote "Marcar como pago" nao envia). O lote so seleciona linhas pendentes/inadimplentes.
- **Espelho em contas a receber** (`services/mensalidade_contas_service.py`, `external_ref = mensalidade:{mediun|associado}:{id}:{YYYY-MM}`): PAGO grava `valor_pago` informado (sem ele, o vigente); PENDENTE → pendente/vencido; ISENTO cancela a conta do mes. Cadastro de medium/associado (nao isento) cria a conta do mes seguinte; inativar (referencia = `data_saida`), excluir ou marcar `mensalidade_isento` cancela as contas pendentes dos meses seguintes. Datas de "hoje" via `core.tz.today_local()` (Brasilia). Nos Lancamentos essas contas sao somente leitura: PUT/baixa/DELETE → 409 e a listagem traz `origem_mensalidade: true` (a tela mostra "Editar em Mensalidades").
- **Isencao permanente**: `mensalidade_isento` em Medium/Associado e editavel nos dois cadastros (switch "Isento de mensalidade"); isento nao gera conta e nao entra no esperado/inadimplentes.
- **Config**: `enable_mensalidade_associado` e ligado so em Financeiro → Configuracao → Mensalidade (saiu de Configuracoes). `email_relatorio_ativo` nao tem mais toggle na tela (nenhum job lia e nao havia botao de envio); a coluna continua e `POST /relatorio/enviar` nao depende mais dela.
- **Comprovante**: BYTEA no banco, limite 5MB, tipos aceitos: jpeg/png/webp/pdf.
- **Relatorio**: email HTML gerado por `render_mensalidade_report()` com KPI cards + tabela inadimplentes.
- **Frontend**: `/admin/financeiro/mensalidades` (tabs Mediuns / Associados / Historico; KPIs com o dia de vencimento de cada grupo, "Inadimplentes" so apos o vencimento) e `/admin/financeiro/config`; sidebar com grupo Financeiro (gate `can('mensalidade_mediun')`). `/admin/associados` carrega todas as paginas da API (limit 200) para a busca local.
- **Migration 027**: ENUM `mensalidade_status`, tabelas `mensalidade_configs` + `mensalidade_pagamentos`, coluna `mediuns.mensalidade_isento BOOLEAN DEFAULT false`.
- **Dependencia**: `python-dateutil` (usado em `mensalidade_repo.get_resumo` via `dateutil.relativedelta`).

### 11.11 Grupos de Permissão — Controle Fino de Acesso (branch 003-rbac-grupos-permissao)
- **Modelos**: `PermissionGroup` (1:M tenant), `GroupPermission` (grupo + feature + can_view/can_insert/can_edit/can_delete), `UserGroupMembership` (M:N associando users a grupos).
- **Regras de Acesso e Isolamento**: 
  - Apenas para operadores (`OPERATOR` role). Admins, Super Admins e sessões sob impersonation têm bypass total de grupos.
  - Multi-tenancy isolado estritamente no banco via queries com filtros `tenant_id` em repositório e serviços.
  - Consolidação acumulativa via lógica OR permissiva quando o operador pertence a múltiplos grupos.
  - **Fail-closed (Q-05, 2026-10-05)**: operador sem grupo não acessa nada. Todo tenant tem o grupo padrão "Acesso total" (`is_default`, um por tenant via índice único parcial), criado no cadastro (`public/onboarding.py`) e na criação pela plataforma (`tenant_service`). `PermissionGroupRepository.assign_default_group_if_groupless` põe nele o operador criado em `POST /admin/users` e o admin rebaixado a operador em `PUT /admin/users/{id}`. O grupo padrão pode ser editado e não pode ser excluído (400). `ensure_default_group` completa com acesso total as features ainda sem linha no grupo.
- **Endpoints** (prefixo `/api/v1/admin/permission-groups`): CRUD completo de grupos, atribuição em massa de permissões (`/permissions`), associação/remoção de membros (`/members`), e retorno de permissões do usuário autenticado (`/me/permissions`).
- **Migração Alembic**: `b6d4a9b749d5_create_permission_groups.py` (tabelas e chaves estrangeiras com cascades).
- **Hooks e Providers**: `usePermissions` / `PermissionsProvider` gerenciando caching local (TTL 5 minutos), revalidação automática em focos de página ou eventos customizados de atualização de tenant.
- **Frontend / UI**:
  - `/admin/permission-groups`: listagem com filtros, alertas para operadores sem grupos (G1) e exclusão com proteção/força (G2).
  - `/admin/permission-groups/[id]`: detalhes do grupo, matriz de permissões (`PermissionMatrix`) com presets rápidos (G4), autocompletes de operadores e visualizador de permissões consolidadas (G3/G13).

### 11.12 Checklist de primeiros passos (Dashboard) — item P-06 do plano + trilhas por dor (2026-10-07)
- **Backend**: `GET /api/v1/admin/dashboard-summary` devolve `onboarding` (`has_gira`, `public_tickets`, `door_used`, `public_link`, `principal_dor`, `trilha`, `steps: [{key, done}]`, `completed`), calculado por `_get_onboarding_status` em `dashboard_summary.py` numa única consulta (subqueries `EXISTS`/contagem, todas filtradas por `tenant_id` e sem soft-deleted). `public_tickets` conta só senhas emitidas pelo próprio consulente (`emitido_por_id IS NULL`); `door_used` = alguma senha com check-in ou chamada. Sem endpoint novo, sem migração.
- **Trilhas** (`TRILHA_POR_DOR`/`TRILHA_PASSOS`, espelhadas em `frontend/src/components/admin/onboardingTrilhas.ts` — teste confere): a resposta do cadastro escolhe a trilha; sem resposta (tenants antigos) ou "Ainda estou conhecendo" (`outro`) → `gira` = criar gira → compartilhar o link → 1ª senha pelo link → Porta. `senhas` → gira, configurar senhas (gira com `max_tickets` > 0), compartilhar, 1ª senha. `mediuns` → 1º médium, mensalidade com valor (`mensalidade_configs.valor_mensal` > 0, ativa), gira. `financeiro` → mensalidade, 1º pagamento (`mensalidade_pagamentos` PAGO), 1º lançamento manual (`contas_financeiras` fora do espelho `external_ref` "mensalidade:..."), gira. `divulgacao` → trilha `site`: site salvo (alguma `site_versions`) ou publicado, publicar (`tenant_sites.status` PUBLISHED), gira. `estoque` → grupo, item, movimentação, gira. Toda trilha leva à primeira gira. `completed` = todos os passos da trilha feitos (na trilha `gira`, o mesmo de antes).
- **Frontend**: `components/admin/FirstGiraChecklist.tsx` (textos, links e travas em `onboardingTrilhas.ts`), montado no topo de `/admin/dashboard` para quem tem `giras:view`. Cada passo tem trava de plano (`useSubscription().can`, ex.: mensalidade `mensalidade_mediun`, lançamento `contas_financeiras`, site `site_builder`, estoque `estoque_controle`, médium `mediuns`) e de grupo (`usePermissions().can`): fora do plano mostra "Disponível a partir do X" + "Ver planos"; sem permissão, "Peça a um administrador…". Passo travado pelo plano não segura a conclusão (depois do mês grátis o terreiro não conseguiria fazê-lo); travado só por permissão continua contando. Enquanto a assinatura carrega, nada é tratado como travado.
- **Visibilidade**: some quando a trilha está concluída, quando `public_tickets >= 20` (`ACTIVATED_PUBLIC_TICKETS` — terreiro já ativado, ex.: pagante que não usa a Porta) ou quando o admin oculta. "Ocultar" e "já compartilhei" ficam no `localStorage` por tenant; o passo de compartilhar também se completa sozinho na primeira senha pelo link.
- **Analytics**: `services/analytics.ts` (`trackEvent`, `setAnalyticsTag`) envia `onboarding_share_whatsapp`, `onboarding_copy_link`, `onboarding_show_qr`, `onboarding_test_link`, `onboarding_cta_create_gira`, `onboarding_cta_porta` e `onboarding_dismiss` para GA4 e Clarity, e marca a sessão do Clarity com a tag `onboarding_step` (1–4).
- **QR code**: `qrcode.react` (SVG local, sem chamada externa).
- **Padrões de senhas** (`frontend/src/utils/giraSenhaDefaults.ts`): ao criar uma gira, a tela abre na sequência o drawer "Configurar Senhas" da gira nova. Gira sem configuração (`max_tickets` 0) vem preenchida com a mediana das quantidades do terreiro (`DEFAULT_MAX_TICKETS` = 30 sem histórico) e liberação de agora (próximos 5 min) até o início da gira; o estado "inicial" fica vazio, então salvar fica habilitado e fechar pede confirmação. Janela menor que `SHORT_WINDOW_HOURS` (3h) mostra aviso com "Usar sugestão" — vale para todos os terreiros (os ativos têm janela mediana de 5h a 48h, então o aviso quase nunca aparece para eles).
- **Tela de giras**: sem nenhuma gira, `/admin/giras` mostra `components/admin/GirasEmptyState.tsx` (ciclo em 3 passos + "Criar primeira gira" com `giras:insert`; bloqueado pelo plano mostra o motivo e "Ver planos"). Erro ao carregar mostra `Alert` com "Tentar novamente" — nunca o empty state. `/admin/giras?nova=1` abre o formulário de criação direto (respeita permissão e limite do plano) e remove o parâmetro da URL; o botão "Criar gira" do checklist usa esse link. Evento `giras_empty_create`.

### 11.13 Pergunta de dor no cadastro + tour de boas-vindas — item P-07 do plano
- **Cadastro** (`/cadastro`, passo 4 "Para começar"): "O que você mais precisa resolver?" e "Como nos conheceu?" são **obrigatórias** (decisão do dono, 2026-10-07), em cartões de escolha única (`components/auth/ChoiceCards`). "Ainda estou conhecendo" (`outro`) e "Outro" valem. Valores em `backend/src/core/onboarding.py` (`PRINCIPAL_DOR_VALUES`, `COMO_CONHECEU_VALUES`), espelhados em `frontend/src/constants/onboarding.ts` — `test_onboarding_signup.py` falha se as listas divergirem. O backend exige as duas (`Field(default=None, validate_default=True)` + validador → 422 "Conte o que você mais precisa resolver" / "Conte como você conheceu o GiraHub", com `loc` no campo).
- **Armazenamento**: `tenant_configs.custom_settings.principal_dor` (JSON, junto do `como_conheceu`; sem migração). Leitura sempre via `read_principal_dor()`, que ignora valores fora da lista.
- **Exposição**: `onboarding.principal_dor` no `GET /api/v1/admin/dashboard-summary`, na mesma consulta do checklist (§11.12).
- **Tour** (`frontend/src/tours/welcomeTour.tsx`): `useWelcomeTour` no dashboard abre sozinho **uma vez por usuário** (flag `girahub:welcome-tour:seen:{userId}` no localStorage), só para `role === 'admin'` e só se o tenant tem `principal_dor`; tenants antigos não veem. Usa a **mesma trilha do checklist** (§11.12): trilhas `gira`/`senhas` → boas-vindas, roteiro, Porta, ajuda e "Criar gira"; trilhas de módulo (médiuns, financeiro, site, estoque) → roteiro com os títulos dos passos do checklist e o último passo com o botão do primeiro passo pendente (ex.: "Cadastrar médium"); se o módulo estiver fora do plano, cai no roteiro da gira com "depois, quando quiser… (disponível a partir do plano X)".
- **Passos centralizados** usam `CENTER_SELECTOR` (seletor sem elemento) + `position: 'center'` + `padding.mask: 0`: com `body` o reactour não escurece o fundo e rola a página. Não ancorar no menu lateral: muda por plano/permissão e fica escondido no celular.
- **Analytics**: `signup_step_completed {passo, etapa}` e `signup_completed {principal_dor}` no cadastro, `welcome_tour_open {trilha}`, `welcome_tour_cta {trilha, href}`, e tag de sessão `principal_dor` no Clarity.

### 11.14 E-mails de onboarding D+1/D+3 — item P-08 do plano
- **Agendador**: `backend/src/services/onboarding_email_scheduler.py`, iniciado no lifespan de `main.py`, roda às 10:00 BRT. Regras em `classify()`: D+1 = conta com 20h–68h e sem gira; D+3 = conta com 68h–7 dias e zero senhas pelo link (`emitido_por_id IS NULL`). Conta com 7+ dias nunca recebe.
- **Modelos**: `services/email/templates/onboarding_nudge.py` (D+1 com P.S. do módulo da trilha `principal_dor`; D+3 com link público e botão de WhatsApp com o mesmo texto do checklist). Links com UTM `utm_source=email&utm_medium=onboarding&utm_campaign=onboarding_d1|d3`.
- **Anti-duplicação — obrigatório em agendador novo**: o backend roda `uvicorn --workers 2` e cada worker executa o lifespan, então **estado em memória não evita envio duplicado**. Aqui: `pg_try_advisory_lock(0x6769726168756201)` por rodada (só um worker processa) + marca persistente em `tenant_configs.custom_settings.onboarding_emails` (`{"d1": iso, "d3": iso}`) gravada sob `SELECT ... FOR UPDATE` **antes** do envio (no máximo uma vez; falha de provedor não reenvia). `trial_scheduler` e `birthday_scheduler` usam o mesmo esquema via `services/scheduler_guard.py` desde 2026-10-05 (ver §11.9); este agendador ainda tem o lock e a marca em código próprio e pode migrar para o módulo comum.
- **Operação**: desligar com `ONBOARDING_EMAILS_ENABLED=false` no `.env` + restart do backend. Listar quem receberia na próxima rodada, sem enviar nem marcar: `docker compose -f docker-compose.prod.yml exec backend python -m src.services.onboarding_email_scheduler --dry-run`.
- Contato principal do tenant: `get_tenant_primary_contact()` em `trial_scheduler.py` (admin mais antigo ativo), compartilhado pelos dois agendadores.

### 11.15 Painel de ativação na tela Hoje (super-admin)
- **Onde**: tela "Hoje" de `/platform` (o antigo `/platform/observatory` redireciona para ela, mantendo a âncora), componente `frontend/src/components/platform/ActivationSection.tsx`. Dados em `activation` do `GET /api/v1/platform/tenant-observatory` (protegido por `require_super_admin`), calculados por `backend/src/services/activation_service.py`.
- **Conteúdo**: cadastros dos últimos 60 dias (`WINDOW_DAYS`), do mais recente ao mais antigo, cada um num estágio — `sem_gira` → `sem_senhas` (gira criada sem `max_tickets`, nada aparece no link) → `aguardando_senha` → `recebendo` → `usou_porta` → `ativado` (20+ senhas pelo link, mesmo limiar do checklist). Mostra também giras configuradas/total e próxima gira, senhas pelo link, trial (dias restantes) ou pagante, e-mails de onboarding enviados (D+1/D+3, de `custom_settings.onboarding_emails`), dor do cadastro, última atividade (sessão ou ação auditada — logs com `details.platform_action`, ações do super-admin, não contam) e contato do admin mais antigo com links de WhatsApp (`wa.me`, DDI 55 acrescentado) e e-mail.
- **Consulta**: uma ida ao banco com subconsultas correlacionadas por tenant + uma para os contatos. Visão cross-tenant por desenho (super-admin), sem filtro de tenant.

### 11.17 MRR e categorias de cobrança da plataforma (2026-10-06)
- Regra única em `backend/src/services/billing_metrics.py`: **pagante** = assinatura ACTIVE, com
  `stripe_subscription_id`, sem trial, sem bônus, fora do FREE e com terreiro não excluído. Só pagante
  gera MRR. As outras categorias são em_teste (mostra o MRR potencial), bonificado (pilotos e
  testadores), gratuito, suspensa, cancelada, sem_cobranca (plano pago sem Stripe) e excluido.
- Quem usa: `/billing/statistics/summary`, `/billing/subscriptions` (com `category`, `mrr`,
  `potential_mrr`, usuários ativos reais e `include_deleted`), `GET /platform/subscriptions/{id}`,
  `_mrr` do `/platform/dashboard` (`paying_clause()`) e o MRR em risco da retenção.
- Nunca somar `monthly_price` direto para falar de receita: use `effective_mrr`/`paying_clause`.
  O contador `subscriptions.current_users` não é mantido; conte usuários ativos na tabela `users`.
  `GET/PUT/POST /platform/subscriptions/{id}*` já devolvem `current_users` contado e `is_bonus`.

### 11.18 Jornadas de conta, plano e plataforma (2026-10-06)
- **Pessoas e acessos** (`users.py` + `users.tsx`): gate só por grupo USUARIOS (sem `is_admin`
  extra), com as proteções do §3.3; senha de criar/editar passa por `validate_password_policy`;
  usuarios sao ilimitados em todos os planos (out/2026), entao criar e reativar nao checam limite;
  a tela busca a lista completa (o filtro de perfil é visual).
- **Configurações** (`config.py`): gate só por grupo CONFIGURACOES; marca gated por plano (§3.4).
- **`GET /admin/subscription`** traz `has_stripe_subscription` e `is_bonus`; o aviso de trial no topo
  usa a mesma regra do `inLocalTrial` de billing.tsx (trial local, sem Stripe e sem bônus), mostra o
  plano real e não aparece para operador.
- **Billing**: `/billing/cancel` com cancelamento já agendado → 409 (sem reenviar e-mail);
  `/billing/reactivate` converte erro da Stripe (`_reraise_stripe_error`). Se `GET /admin/billing`
  falha, a tela mostra erro com "Tentar de novo" (nunca "Assinar agora"); `?plan=` é ignorado para
  cortesia.
- **Rótulos de plano**: fonte única `constants/plans.ts` ("Gratuito"); `useSubscription().planLabel`
  e `platform/planMeta.ts` (rótulo, preço e limites) derivam dela; a tabela de planos da plataforma
  usa `BASE_FEATURES` + `FEATURE_CATALOG`.
- **Feature flags da plataforma**: a aba saiu de `/platform/settings` porque NADA no backend lê a
  tabela `feature_flags` (ligar/desligar não mudava nada). A API `/api/v1/platform/feature-flags` e a
  tabela continuam; se um dia forem usadas, ligar a leitura antes de devolver a aba.

### 11.19 Lancamentos, fluxo de caixa, analytics e auditoria (2026-10-06)
- **Auditoria antes do commit**: `AuditLogRepository.create` so faz flush e `get_db` fecha a sessao sem
  commit. Log gravado depois do ultimo commit e descartado — grave o log antes do commit, ou comite de novo
  depois dele (repositorios que comitam sozinhos, ex. `PermissionGroupRepository`). Corrigido em
  contas_financeiras, permission_groups e no envio do relatorio de mensalidade.
- **Status vencido e derivado** (`contas_financeiras.py`): em aberto (pendente/vencido gravado) com
  vencimento antes de hoje em Brasilia (`core.tz.today_local()`) aparece como vencido na listagem, no
  filtro `?status=` e no resumo. Nenhum GET grava status.
- **PUT parcial**: lancamento, categoria e conta bancaria usam `model_dump(exclude_unset=True)` — null
  explicito limpa campo opcional; null em campo obrigatorio → 422. `ativo` e editavel e as listagens
  aceitam `?incluir_inativos=true` (a tela de configuracao usa; o formulario de lancamento nao).
- **Recorrencia mensal/anual**: dar baixa gera a proxima ocorrencia uma unica vez, com
  `external_ref = "recorrencia:{id_origem}:d{dia}"` (checado por prefixo, inclusive soft-deleted). O dia
  original da serie e preservado (31/jan → 28/fev → 31/mar). Cancelar nao gera; estornar e dar baixa de
  novo nao duplica.
- **Cancelar / reabrir**: `POST /contas/{id}/cancelar` (so em aberto) e `POST /contas/{id}/reabrir`
  (estorna baixa ou reabre cancelado), ambos `edit` e auditados; recusados (409) para espelho de
  mensalidade (`external_ref mensalidade:*`).
- **Fluxo de caixa**: com `data_inicio`/`data_fim`, o primeiro e o ultimo mes sao recortados pelas datas
  exatas. `saldo_acumulado` parte do saldo de abertura = soma do `saldo_inicial` das contas bancarias
  ativas + realizado (pago) antes do inicio do intervalo.
- **Analytics**: `total_cancelled` conta status CANCELLED (era emitidos − usados) e ha `total_no_show`;
  limites de data em dias inteiros de Brasilia (`core.tz.local_day_bounds_utc`). O toggle
  `enable_analytics` saiu da tela de configuracao (era salvo e lido por ninguem; coluna mantida).
- **Auditoria**: `GET /admin/audit-logs` = plano `auditoria` + grupo AUDITORIA:view (sem `is_admin` extra).

### 11.20 Casa — Estoque, Cursos presenciais e Meu Site (revisão de jornada, 2026-10-06)
- **Cursos presenciais**: autorização é só `require_group_permission(CURSOS_PRESENCIAIS, ...)` + gate de plano
  `site_builder` — não há checagem de cargo no corpo (operador com o grupo cria/edita/inscreve; admin faz bypass).
  Decimais (`valor_mensalidade_padrao`, `valor_mensalidade`, `valor_pago`) chegam como string ("120.00"): no
  frontend sempre `toNum` de `@/lib/dateBr`. `data_pagamento` do pagamento único é enviado como
  `YYYY-MM-DDT12:00:00-03:00` e exibido com `formatDateBr` (data pura). `aceita_uso_dados_saude` (LGPD art. 11) é
  o checkbox do formulário (admin e público) — nunca inferido das respostas de saúde. Pagamento único
  (`pago`/`valor_pago`/`data_pagamento`) e mensalidades (`curso_participante_pagamentos`) coexistem no modelo; a UI
  mostra o pagamento único só quando o curso NÃO gera mensalidade (coluna, cartão e drawer), então as duas
  informações nunca aparecem juntas.
- **Listagens sem corte silencioso**: telas de Cursos, Participantes, Estoque (itens e movimentações) usam
  `services/fetchAllPages.ts` (pede `skip`/`limit` no máximo do endpoint até uma página vir incompleta). As queries
  têm desempate por `id` no `ORDER BY` para o offset não repetir/pular linha.
- **Estoque**: CSV de posição exige `export_csv` também no backend; `ItemUpdate.estoque_minimo >= 0`; editar grupo
  com `descricao: null` limpa o campo (`model_dump(exclude_unset=True)`); o "saldo após" do `MovimentacaoDrawer` na
  edição desfaz a movimentação original antes de aplicar os valores novos (`saldoAposMovimentacao`).
- **Meu Site — lock otimista**: toda resposta que muda o site (PUT/GET `/sections`, `publish`, `unpublish`,
  `PUT /sites`, `restore`) devolve `updated_at`/`site_updated_at` sempre com offset (`_iso_utc`) e o backend compara
  `site_version` por instante (`_same_version`), não por texto. `useSiteEditor` adota a versão de toda resposta
  (`adoptVersion`). O assistente de primeiro uso não grava mais `template` (o site público não o lê).
- **Meu Site — configurações**: `PUT /sites` aplica só os campos enviados (null limpa título/descrição SEO). `slug`
  é somente leitura: o backend ignora o do body e sincroniza com o slug do tenant em `PUT /sites` e `publish`
  (`_sync_slug_with_tenant`), porque o botão "Retirar senha" monta `/{slug}/...`. O seletor de estilo saiu das
  configurações (continua no assistente, só para montar as seções iniciais).
- **Meu Site — histórico** (máx. 10, snapshot = estado ANTES da operação, sem duplicar o último idêntico):
  "Publicado" ao publicar e a cada salvamento com o site no ar; "Rascunho" no salvamento fora do ar, no máximo a
  cada 10 min (`DRAFT_SNAPSHOT_INTERVAL`); "Antes de restaurar" antes de aplicar uma versão. `GET /versions` não
  devolve o snapshot.
- **Meu Site — imagens**: o editor não apaga imagem ao trocar/remover (ela pode estar no histórico). No limite de 50,
  o upload primeiro apaga as órfãs (`_prune_unreferenced_images`: nenhum UUID nas seções atuais — que são o conteúdo
  publicado — nem em versão do histórico, e com mais de 1 h). `DELETE /sites/images/{id}` devolve 409 se a imagem
  ainda está nas seções.

### 11.21 Jornadas do super-admin (revisão de 2026-10-06)
- **Auditoria das ações da plataforma**: o middleware só audita `/api/v1/admin`. Impersonação, suspender/reativar,
  troca de plano, criar/editar terreiro, CRUD de super-admin e redefinir senha de usuário de terreiro gravam
  `AuditLog` via `services/platform_audit.py::log_platform_action` (só `db.add`; o commit da ação vem DEPOIS, na
  mesma transação). Sem valor novo no enum: action genérica (`login` para impersonação, `update`, `create`,
  `delete`) + `details.platform_action` (id estável) e `details.description` (frase pronta; a tela de auditoria
  mostra com o selo "Plataforma"). `tenant_id` = terreiro afetado; `None` no CRUD de super-admin.
- **Terreiro excluído no Tenant 360**: `GET /platform/tenants/{id}` e `/users` incluem soft-deleted e devolvem
  `deleted_at`/`self_deactivated_at`; a tela mostra "Desativado pelo terreiro"/"Excluído", desliga
  impersonação/edição e oferece "Excluir permanentemente". O hard delete (LGPD) aceita terreiro já excluído
  logicamente (`include_deleted=True` em `get_by_id_with_subscription`/`hard_delete`).
- **Novo terreiro**: a resposta traz `temp_password` do admin; o painel mostra UMA vez com botão de copiar (não
  vai por e-mail nem para log). `data_retention_days` saiu do contrato (era ignorado).
- **Editar terreiro**: só os campos enviados (`exclude_unset`); `description: null` limpa.
- **Super-admins**: política de senha no cadastro; não dá para excluir/desativar a si mesmo nem o último
  super-admin ativo (`PlatformUserRepository.count_active`).
- **Impersonação** (`components/platform/impersonate.ts`): token só no fragmento (`#token=…`); a aba abre no
  clique, antes do `await`, e recebe o endereço depois — pop-up bloqueado vira erro com orientação.
- **Auditoria consolidada**: data sem hora é dia de Brasília; o fim cobre o dia inteiro (o último dia aparecia vazio).
- **Hoje**: o risco de churn vem só do `/tenant-observatory` (`retention_summary.total_at_risk`,
  `retention_grace_days` = `GRACE_DAYS`); o `/dashboard` não calcula mais (`alerts.no_activity_30d` saiu).
- **Tenant 360 > Giras**: `GET /platform/tenant-observatory/tenants/{id}/giras` (giras do terreiro nos próximos 30 dias).
- **Suporte**: `GET /platform/support-chat/conversations/{id}`; a lista traz a prévia numa consulta
  (`last_message_previews`, `DISTINCT ON`); conversa aberta é marcada como lida quando chega mensagem.
- **Planos (Configurações)**: a tabela deriva de `FEATURE_CATALOG`/`FEATURE_MIN_PLAN` de `constants/plans.ts`.
- **Rotas**: `tests/unit/test_route_shadowing.py` também testa rota com segmento fixo depois de parâmetro
  (pegou `/feature-flags/{tenant_id}/enabled` engolida por `/{tenant_id}/{feature}`).
- `PUT /platform/subscriptions/{id}/upgrade` (usado pelo drawer para qualquer troca de plano) não cria mais fatura.

### 11.22 Jornadas públicas e de conta (2026-10-06)
- **Emissão com horário + fila**: o horário (`time_slot_id`) só é exigido quando a senha tem vaga; com a
  gira lotada e fila de espera ligada, a pessoa entra na fila sem horário. Recusas por horário saem como
  `APIException` (`{error_code, message}`): 400 `TIME_SLOT_REQUIRED`, 404 `TIME_SLOT_INVALID`,
  410 `TIME_SLOT_FULL`, 409 `TIME_SLOT_UNAVAILABLE` — o formulário limpa o horário e recarrega as vagas
  (`isTimeSlotError` em `components/public/public-errors.ts`). `email_sent` saiu da resposta do emit.
- **Reenvio de e-mail** (`POST /public/resend-ticket-email`, body `{email, gira_id}`; `phone` removido):
  só senhas EMITTED/WAITLISTED, da gira informada (sem `gira_id`, giras de hoje em diante). Reenvia o
  e-mail original: emitida → `waitlist_service.send_confirmed_ticket_email` (número com P do associado,
  horário, acompanhantes); fila promovida → e-mail da promoção; fila → e-mail da fila com a posição.
- **Logo**: URL pública da logo vem de `core/public_links.public_tenant_logo_url` (prefere `logo_data`,
  que o upload grava, ao `logo_url` legado) — usada no `GET /public/gira/{id}` e `/next-gira`.
- **Agenda pública**: `GET /public/agenda/{tenant_slug}` (próximas giras ativas, mesmo filtro do
  calendário do site — `SiteRepository.list_upcoming_giras`, "hoje" em Brasília, sem gira inativa).
  `/{slug}` mostra o site publicado e, sem site, essa agenda; "Ver próximas giras" (bilhete, cancelar,
  fila, emissão) aponta para `/{slug}` (`tenantAgendaPath`), nunca para `/public/{slug}` (que redireciona
  à próxima gira). O WhatsApp do bilhete leva a página do bilhete (`rescue_link`/`ticketPagePath`).
- **Curso**: a inscrição pública enfileira o e-mail "Inscrição confirmada" (`email_queue`, sem CPF/RG/
  endereço/saúde — minimização). `valor_mensalidade` só volta quando `gerar_mensalidade`. "Como
  conheceu" só é exigido quando "Já conhece o terreiro" = Sim; perguntas de saúde começam sem resposta.
- **Conta**: e-mail de login sem diferença de maiúsculas (`func.lower(User.email)`; cadastro e
  `UserRepository.create` gravam minúsculo — sem migração, linhas antigas cobertas pela comparação).
  Login, esqueci a senha e reativação usam `login.user_by_login_email_stmt` (conta mais antiga se o
  e-mail existir em mais de um terreiro). Cadastro valida a senha com `validate_password_policy`.
  Sessão aberta por `login.issue_session` + `core/auth_cookies.set_auth_cookies` em login, cadastro e
  reativação (3 cookies, `secure=not DEBUG`). "Lembrar-me" desmarcado (`remember_me=false`) → cookies
  sem `max_age`; o refresh token carrega `persist: false` e o `/auth/refresh` renova no mesmo modo.
  Reativação: 401 se credenciais inválidas, 409 `NOT_DEACTIVATED` se a conta não está desativada,
  200 já logado; no `/login`, o alerta de conta desativada tem "Reativar e entrar" (senha digitada uma vez).
- **Telas de conta (2026-10-07)**: `/login`, `/cadastro`, `/forgot-password`, `/reset-password` e
  `/reactivate-account` usam `components/auth/AuthShell` com a identidade da landing (cabeçalho café com a
  marca → `/`, fundo areia, Fraunces nos títulos, cartão branco, campos e botões de 48px; no desktop, painel
  da marca com foto de gira, promessa `AUTH_PANEL` de `constants/landingCopy.ts` e o depoimento mais recente).
  A classe `auth-terra` (globals.css) põe o kit (Button, Checkbox, foco, `text-brand`) na paleta terra,
  independente da cor do último terreiro no `:root`.
- **Cadastro em 4 passos** (`CADASTRO_STEPS` em `components/auth/cadastroForm.ts`): Seu terreiro (nome, com
  prévia do link) → Você (nome, WhatsApp, e-mail) → Acesso (senha com a regra visível, CPF/CNPJ) → Para
  começar (dor e "como conheceu", obrigatórias, + aceite). Um formulário só (react-hook-form + zod):
  "Continuar" valida só o passo, Enter avança, foco no 1º campo, "Voltar" mantém tudo, passo na URL
  (`?passo=N`, shallow; voltar do navegador volta um passo; `?plan=` preservado), rascunho na aba
  (sessionStorage, **sem senha, CPF/CNPJ nem aceite**). Recusa do backend volta ao passo do campo
  (`parseOnboardingError`: 409 e-mail → passo Você com "Entrar com este e-mail"; 409 nome de terreiro →
  passo 1; 422 → campo do `loc`). Payload igual (`buildOnboardingPayload`). Evento `signup_step_completed
  {passo, etapa}` a cada passo, além do `signup_completed`.
- **Passagem marketing ⇄ conta** (`lib/passagem.ts` + `components/shared/PassagemDeEntrada`, no `_app`):
  desenho da entrada do ATRAIR — a marca voa entre as páginas (`.marca-girahub` = `view-transition-name`), na
  ida o escuro recua até o painel (5/12) com o fio dourado e o formulário surge; na volta (marca, "Voltar ao
  site", voltar do navegador via `router.beforePopState`) o escuro avança e só então a landing entra. Só age
  entre `/`, `/planos` e as telas de conta; sem a View Transitions API, troca direta; com
  `prefers-reduced-motion`, nada é interceptado nem anima. Promessas da transição tratadas (cancelamento
  não vira erro).

### 11.16 Frontend — shadcn/ui + Tailwind (migração M-01 concluída em 2026-10-06, interface v2.0.0)
- **Sem MUI.** `@mui/*`, `@emotion/*`, `stylis`, `dayjs`, `react-number-format` e `packages/shared-ui` saíram. Toda tela
  usa Tailwind v4 + shadcn/ui (Radix, estilo new-york, `data-slot`). **Não criar `sx` nem reintroduzir MUI.**
- **CSS global** (`src/styles/globals.css`, importado só no `_app.tsx`): camadas `theme < base < components < utilities`,
  preflight completo do Tailwind, `body` com `--background/--foreground/--font-sans`. Breakpoints iguais aos antigos do
  MUI (`sm 600 / md 900 / lg 1200 / xl 1536`, sem `2xl`). Tokens shadcn em `:root`/`.dark`, mais `--success`, `--warning`,
  `--info` (com `-foreground`) e `--chart-grid`/`--chart-tick`. Fonte da interface: pilha do sistema (sem Roboto global).
- **Contraste (2.1.0)** — travado por `__tests__/styles/{contrast,colorUsage}.test.ts` (WCAG AA 4,5:1 nos dois modos):
  - texto na cor da marca é **`text-brand`** (`--primary-text`), nunca `text-primary`: `applyBrand` calcula
    `--brand-text-light`/`--brand-text-dark` escurecendo/clareando a primária até ler no fundo e no `bg-primary/15`;
  - fundo suave da mesma cor (`bg-warning/15`, `bg-info/10`...) leva **`text-{success,warning,info,destructive}-strong`**;
  - `text-*-foreground` só em cima do fundo sólido `bg-*` (é branco no claro e preto no escuro — some em fundo suave);
  - claro: `--warning` #c2410c e `--info` #0369a1 (os do MUI ficavam em ~3:1); escuro: `--destructive` #f87171 com
    `--destructive-foreground` escuro; ícones do `KpiCard` com marca usam `var(--primary-text)`.
- **Cores do terreiro**: `src/lib/brand.ts` → `applyBrand(document.documentElement, {primary, secondary, font})`, chamado
  pelo `TenantAwareThemeProvider` a cada mudança de branding; escreve `--primary`, `--primary-foreground`, `--secondary`,
  `--secondary-foreground`, `--ring`, `--sidebar-primary`. Texto sobre a marca: a cor de fonte do terreiro se o contraste
  for ≥ 4,5, senão preto/branco. Default `#4f46e5` (= backend). Telas públicas: texto na cor da marca usa
  `text-(color:--brand-text)` (primária escurecida até AA, definida pelo `PublicShell`), nunca `text-primary`.
- **Páginas de marketing (V-08, out/2026)**: `/` e `/planos` usam `components/landing/MarketingShell` (cabeçalho,
  rodapé com créditos das fotos, WhatsApp flutuante) e a paleta **"terra"** — tokens ESTÁTICOS `areia/tinta/barro/
  café/ouro/folha` no `@theme` de `globals.css` (só marketing; nunca no painel; pares AA travados em
  `__tests__/styles/marketingContrast.test.ts`) + serifa Fraunces (`font-display`, via `next/font`). A marca do
  GiraHub (ticket âmbar + "GiraHub" sans) **não muda** (`components/landing/GiraHubLogo`). Fotos reais em
  `constants/landingPhotos.ts` (Pexels, licença comercial) e telas reais do terreiro demo em
  `constants/landingScreens.ts`; **regra do dono: a imagem precisa mostrar o que o texto ao lado diz** —
  funcionalidade do sistema usa a tela real, não foto ilustrativa. Textos em `constants/landing{Copy,Faq,Stats}.ts`
  (FAQ = mesma fonte do JSON-LD). Depoimentos (`constants/testimonials.ts`) só reais e autorizados
  (`docs/marketing/kit-depoimentos.md`); lista vazia = seção oculta. Números de uso: `GET /api/v1/public/stats`.
  WhatsApp comercial: `NEXT_PUBLIC_SUPPORT_WHATSAPP` é **ARG de build** do frontend (vazio = sem botões).
  Página nova de primeiro nível → `backend/src/core/reserved_slugs.py` (teste quebra se faltar) e
  `STATIC_ROUTES` do `pages/sitemap.xml.tsx`.
- **Claro/escuro**: classe `dark` em `<html>` (não no layout — Radix porta overlays para o `<body>`), aplicada por
  `AdminThemeProvider`/`PlatformThemeProvider` (chaves `admin_theme_mode`/`platform_theme_mode`); páginas públicas sempre claras.
- **Overlays**: Sheet/Dialog/AlertDialog/Select/Popover/DropdownMenu usam o z-index padrão do Radix (`z-50`); quem abre por
  último fica por cima, então calendário e Combobox dentro do `CrudDrawer` funcionam. Barras fixas: topbar `z-30`,
  `MobileTabBar` e `BulkActionsBar` `z-40`. Não usar `z-[1300]`/`z-[1400]` (eram para ficar acima do AppBar do MUI).
  Barra fixa embaixo numa tela admin fica **acima da `MobileTabBar` no celular** (`bottom-[calc(env(safe-area-inset-bottom)+56px)]
  md:bottom-0`). Nada flutuante por cima do conteúdo: o antigo balão "Ajuda" saiu em 2.1.0.
- **Menu do perfil** (`AdminTopbar`): Perfil, Mostrar primeiros passos, **Falar com o suporte** (abre o `SupportChatWidget`;
  resposta não lida acende um ponto no avatar) e **Novidades da versão** (`components/admin/ReleaseNotesDialog`, conteúdo em
  `constants/releaseNotes.ts`). O modal abre sozinho uma vez por login enquanto a versão atual não for dispensada
  ("Não mostrar novamente" vale por versão, localStorage por usuário); não abre na impersonação nem por cima do tour de
  boas-vindas. **Ao subir a versão, acrescente a entrada no topo de `RELEASE_NOTES`** (um teste exige que a primeira seja
  `APP_VERSION`).
- **Kit** (`frontend/src/components/README.md`): `components/ui/*`, `fields/*` (`TextField`, `PasswordField`, `MoneyInput`,
  `MaskedInput` + `maskTelefone/maskCpf/unmask`, `DateField`, `DateTimeField`, `Combobox`), `CrudDrawer`, `ConfirmDialog`,
  `DataTable` (TanStack v8, `renderCard` no celular), `EmptyState`, `PageHeader`, `KpiCard` (único), `Stepper`,
  `gates/{PermissionDenied,ReadOnlyNotice,PlanLocked}`, `charts/ChartCard` + `lib/chartTokens.ts`, `lib/icons.ts`,
  `lib/dateBr.ts` (datas no fuso de Brasília), `useSnackbar()` → Sonner. `TooltipProvider` não é global: quem usa `Tooltip`
  monta um. `TabsContent` com `flex` precisa de `data-[state=inactive]:hidden`.
- **Por área** (compostos próprios): público `components/public/*` (`PublicShell`, `Bilhete` + `bilhete-utils`,
  `public-errors`); operação `components/admin/{GiraCard,ShareLinkDialog,GiraContext,CommandPalette,MobileTabBar,
  TicketDetailSheet,TicketEmailPanel,senhaFormat}` e `layout/navConfig.ts` (menu por trabalho: Hoje · Giras e senhas ·
  Corrente · Casa · Conta); casa `components/financeiro/{CobrancaMensal,MonthNavigator}`, `components/estoque/MovimentacaoDrawer`;
  conta `constants/plans.ts` (fonte única de planos, testada contra o backend), `constants/passwordPolicy.ts`,
  `components/{auth,billing}/*`; site `components/site/{sections,editor}/*` (mesmas seções no site público e na prévia);
  plataforma `components/platform/{planMeta,format,impersonate,passwordPolicy,CommandPalette,...}`.
- **Rotas que viraram redirecionamento**: `/admin/plano` → `/admin/billing`; `/admin/financeiro/contas-pagar|contas-receber`
  → `/admin/financeiro/lancamentos?tipo=`; `/admin/estoque/relatorio` → `/admin/estoque/itens`; `/platform/observatory` →
  `/platform`; `/platform/billing` → aba Assinaturas de `/platform/tenants`; `/platform/users_global` e `/platform/profile`
  → abas de `/platform/settings`. Parâmetros: `?nova=1`/`?compartilhar=1` em Giras, `?passos=1` no Início, `?gira=` em
  Porta/Senhas/modo TV, `?plan=` no billing e no cadastro. Impersonação aceita `#token=` (e ainda a query string).
- **PWA (P-01)**: `public/manifest.webmanifest` (`start_url` `/admin/porta?source=pwa`, `standalone`), ícones gerados
  de `public/favicon.svg` por `scripts/generate-icons.mjs`, `public/sw.js` escrito à mão (sem workbox/next-pwa) registrado por
  `components/shared/ServiceWorkerRegistrar` só em produção + contexto seguro (`?v=<buildId>`; caches antigos apagados no
  `activate`), `/offline` como fallback de navegação. **Regra: o SW nunca cacheia `/api/*`** (nem `/ws/*`, `/_next/data/*`,
  POST, outra origem, `Authorization` ou HTML de página) — testado em `__tests__/pwa/sw.test.ts`. Na Porta: `PortaOfflineNotice`
  (offline ou 2 falhas seguidas da fila) e `InstallPortaHint`. Sem sincronização offline de emissão.
- **Versão**: `frontend/package.json` `version` → `NEXT_PUBLIC_UI_VERSION` (`next.config.js`) → `src/lib/version.ts`
  (`APP_VERSION`, "GiraHub v2.2.0" no rodapé da sidebar, menu do usuário e plataforma). Backend `APP_VERSION` 2.2.0;
  a tag das imagens Docker vem de `APP_VERSION` no `.env` do servidor.
- **Testes**: por papel/texto (nunca classes). `jest.setup.js` tem polyfills do Radix (`hasPointerCapture`,
  `scrollIntoView`, `ResizeObserver`, `matchMedia`). Bundle antes/depois em `docs/bundle-baseline.md`.

### 11.9 Infraestrutura e Deploy
- Docker Compose com: postgres, redis, backend (FastAPI/Uvicorn), frontend (Next.js), nginx (reverse proxy + SSL).
- VPS: 76.13.231.19 (Hostinger), projeto em /opt/senhas.
- Dominio: girahub.com.br com SSL (Let's Encrypt).
- nginx: proxy reverso, terminacao SSL. (A location `/ws/` e legado sem efeito: nao existe WebSocket no backend — a Porta usa polling, ver §11.4.)

**Deploy automatizado via GitHub Actions (`.github/workflows/deploy.yml`):**
1. Job `security-audit` (paralelo, nao-bloqueante): `pip-audit` + `npm audit --audit-level=high`.
2. Job `deploy` (SSH no VPS):
   - `pg_dump` backup antes de qualquer mudanca (mantém 10 backups em `/opt/senhas/backups/`).
   - `git pull` do repositorio.
   - Build das imagens com containers antigos AINDA rodando (zero-downtime durante build).
   - Migracao Alembic em container temporario (`--rm`).
   - Swap dos containers com `up -d`.
   - Health check com 5 retentativas antes de declarar sucesso.

**Deploy manual sem downtime (alternativa):**
```bash
cd /opt/senhas
# 1) Backup do banco:
docker exec senhas_postgres pg_dump -U senhas_user senhas_prod > /opt/senhas/backups/manual_$(date +%Y%m%d_%H%M%S).sql
# 2) Atualizar codigo:
git pull origin master
# 3) Build com containers antigos rodando:
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml build backend frontend
# 4) Migracoes:
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml run --rm backend alembic upgrade head
# 5) Swap:
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d backend frontend
```
NUNCA usar `up --build` direto — causa 503 prolongado durante o build.

**Agendadores in-process e múltiplos workers (desde 2026-10-05):**
- O backend roda `uvicorn --workers 2` e **cada worker executa o lifespan de `main.py`**, então todo agendador asyncio (`trial_scheduler`, `birthday_scheduler`, ...) existe uma vez por worker. Estado em memória não evita envio duplicado nem sobrevive a deploy — até 2026-10-05 os lembretes/avisos de trial e o digest de aniversários saíam uma vez por worker.
- Regra para agendador que envia algo: usar `backend/src/services/scheduler_guard.py` — `advisory_lock(KEY)` envolvendo a rodada (só um worker processa) e `claim_once(tenant_id, namespace, item, scope)` gravado **antes** do envio (marca em `tenant_configs.custom_settings[namespace]` sob `SELECT ... FOR UPDATE`; `scope` diferente reinicia as marcas). Chaves de lock listadas no docstring do módulo; nova chave = novo número.
- Trial: marcas em `custom_settings.trial_reminders` (escopo = `trial_ends_at`); dias restantes arredondados para cima e expiração só depois de `trial_ends_at` (antes podia expirar ~1 dia cedo). Aniversário: `custom_settings.birthday_digest` (escopo = data BRT).

**Rate limiter distribuído via Redis (desde 2026-06-27):**
- `REDIS_URL` adicionado ao `config.py` e ao `docker-compose.prod.yml` (backend environment).
- `limiter.py` usa `storage_uri=REDIS_URL` quando configurado; fallback in-memory em dev (REDIS_URL vazio).
- `limits[redis]` adicionado como dependencia em `pyproject.toml`.
- Hierarquia de roles refatorada em `dependencies.py`: `OPERATOR=0 < ADMIN=1 < SUPER_ADMIN=2` (dict `_ROLE_HIERARCHY`).
- PostgreSQL com `deploy.resources.limits.memory: 8G` no `docker-compose.prod.yml`.
- Backup retention aumentado de 10 para 30 no workflow CI.

**Prometheus/Grafana — REMOVIDOS (2026-08-26, item I-03 do plano de execucao):**
- A pilha nunca ficou operacional (backend nao expunha `/metrics`, modulo orfao, 0 dashboards,
  0 alertas) e foi removida por completo: containers fora do compose, diretorios `prometheus/`
  e `grafana/` apagados, `src/monitoring/prometheus.py` deletado, env vars `PROMETHEUS_*` e
  `GRAFANA_PASSWORD` eliminadas. Se um dia houver necessidade de metricas de infra, religar e
  um item novo — feito de verdade, com `/metrics` exposto e alertas.

**Monitoramento de erros — Sentry (desde 2026-06-27):**
- Backend: `sentry-sdk[fastapi]>=2.63.0` (piso exigido pelo roteamento do fastapi ≥ 0.137) — inicializado em `main.py` quando `SENTRY_DSN` definido. O OpenTelemetry nativo do fastapi 0.142 fica desligado (`telemetry=` em `create_app`).
- Frontend: `@sentry/nextjs ^10` (upgrade 8.55 → 10.76 em 2026-10-05):
  - Navegador: `frontend/src/instrumentation-client.ts` (convenção `instrumentation-client` do Next 15.3+; substituiu o
    `sentry.client.config.ts`, deprecado desde o SDK 9). Replay só em erro (`maskAllText`/`blockAllMedia`),
    `sendDefaultPii: false`, `ignoreErrors`. Exporta `onRouterTransitionStart = Sentry.captureRouterTransitionStart`
    — só o App Router chama esse hook; no Pages Router as navegações são instrumentadas pelo `browserTracingIntegration`,
    mas sem o export o build imprime aviso "ACTION REQUIRED".
  - Servidor e edge: `frontend/sentry.server.config.ts` / `frontend/sentry.edge.config.ts`, que **só rodam porque
    `frontend/src/instrumentation.ts` os importa** em `register()` (exigência do Next 15; antes de 2026-10-05 o Sentry do
    lado servidor do frontend não inicializava). `onRequestError = Sentry.captureRequestError` captura erros de
    request/renderização no servidor.
  - `instrumentation.ts` e `instrumentation-client.ts` ficam em `src/` porque o Next os procura na pasta pai de
    `src/pages` — na raiz de `frontend/` são ignorados.
  - `next.config.js` importa `withSentryConfig` de `@sentry/nextjs/config` (import pela raiz é deprecado no 10 e quebra
    no 11). `hideSourceMaps` saiu no SDK 9: source maps do cliente são sempre "hidden" e
    `sourcemaps.deleteSourcemapsAfterUpload: true` os apaga após o upload (que exige `SENTRY_AUTH_TOKEN`).
  - Mock do Jest em `frontend/__mocks__/sentry-nextjs-mock.js` (mapeado em `jest.config.js`).
- DSNs ja configurados no VPS em `/opt/senhas/.env`.
- Variaveis: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`.
- `NEXT_PUBLIC_SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_ENVIRONMENT` sao **build-time** (ARG em `frontend/Dockerfile`,
  build args em `docker-compose.prod.yml`). Ate 2026-10-05 so existiam no environment do container e o DSN
  saia vazio do bundle: o Sentry do frontend esteve desligado em producao desde a configuracao inicial.
- Em producao: `SENTRY_ENVIRONMENT=production`, `SENTRY_TRACES_SAMPLE_RATE=0.1`.
- MCP do Sentry disponivel via `.claude/settings.json` (url: `https://mcp.sentry.dev/mcp`).

**Analytics de produto — GA4 + Microsoft Clarity (Clarity desde 2026-10-05):**
- GA4: tag `G-BF9G0RFCDB` hardcoded em `frontend/src/pages/_app.tsx` (pageviews + evento `click_powered_by_girahub`).
- Clarity (gravação de sessão, heatmaps, funis — gratuito): `frontend/src/components/shared/ClarityAnalytics.tsx`,
  montado em `_app.tsx`. Só injeta o script quando `NEXT_PUBLIC_CLARITY_PROJECT_ID` está definido.
- A variável é **build-time** (ARG em `frontend/Dockerfile`, passada por `docker-compose.prod.yml` a partir do
  `/opt/senhas/.env`). Trocar o ID exige rebuild do frontend; o deploy.yml já faz `build frontend` a cada push.
- Cada sessão recebe tags (`scope`, `tenant_id`, `tenant`, `plan`, `trial`, `role`) e `identify` com o UUID do
  usuário (hash feito pelo SDK). Nunca enviar e-mail/CPF/nome como tag — filtrar por tenant no painel usa `tenant`.
- CSP do nginx libera `www.clarity.ms` / `scripts.clarity.ms` (script-src) e `*.clarity.ms` (connect-src).

---

## 12) Diretriz Final

Ao agir como agente de IA neste repositorio:
- Priorize seguranca e isolamento de tenant acima de velocidade.
- Nao suba segredos em nenhuma hipotese.
- Entregue mudancas testaveis, rastreaveis e bem documentadas.

---

## 13) Fluxo Operacional Padrao (SOP para Agentes)

Use este fluxo em toda implementacao, do inicio ao PR:

1. Entender o pedido e mapear impacto:
- Quais modulos serao tocados (backend, frontend, docs, migracoes)?
- Ha mudanca de contrato de API ou schema?

2. Levantar contexto minimo necessario:
- Ler arquivos diretamente relacionados.
- Identificar padroes existentes para manter consistencia.

3. Implementar em fatias pequenas:
- Aplicar mudancas objetivas e evitar refactor amplo sem necessidade.
- Preservar estilo e convencoes do repositorio.

4. Validar funcionalmente:
- Executar testes afetados (unitarios/integracao/componentes).
- Se mudanca ampla, rodar validacao adicional (build/typecheck/lint quando aplicavel).

5. Revisar seguranca e multi-tenancy:
- Conferir filtros de tenant_id em todas operacoes sensiveis.
- Verificar ausencia de segredos em codigo, docs e scripts.

6. Revisar diff final:
- Confirmar que nao ha alteracoes acidentais fora do escopo.
- Garantir mensagens de erro e logs sem dados sensiveis.

7. Preparar PR com contexto claro:
- Problema, solucao, impacto, testes, riscos, mitigacoes e passos de validacao.

### 13.1 Gate obrigatorio antes de push/PR

Antes de qualquer push:
- Confirmar que nao existem valores reais de senha, token, API key ou credenciais.
- Se houver qualquer suspeita de segredo no historico da branch, parar e sanitizar antes.

---

## 14) Template de PR para Agentes

Use este modelo ao abrir PR:

Titulo sugerido:
- tipo(escopo): resumo curto

Descricao:

### Contexto
- Problema de negocio/tecnico:
- Impacto atual:

### Solucao aplicada
- O que foi alterado:
- Decisoes tecnicas principais:
- Alternativas consideradas (se houver):

### Arquivos/areas impactadas
- Backend:
- Frontend:
- Banco/migracoes:
- Documentacao:

### Seguranca e multi-tenant
- Como tenant isolation foi preservado:
- Confirmacao de ausencia de segredos no diff/historico da branch:

### Evidencias de teste
- Testes executados:
- Resultado:
- Evidencias (logs/prints/saidas relevantes):

### Riscos e mitigacoes
- Riscos conhecidos:
- Mitigacoes aplicadas:

### Validacao manual rapida
1. Passo 1
2. Passo 2
3. Resultado esperado

### Checklist final
- [ ] Isolamento multi-tenant validado
- [ ] Sem segredos no repositorio
- [ ] Migracoes criadas (quando necessario)
- [ ] Testes relevantes passando
- [ ] Docs atualizadas (quando necessario)
- [ ] Grupos de permissao: backend com `require_group_permission` em todos os endpoints novos/alterados
- [ ] Grupos de permissao: frontend com `canGroup` bloqueando view e ocultando acoes sem permissao
- [ ] Grupos de permissao: nova feature adicionada ao enum e ao `permissionFeatures.ts` (se aplicavel)
