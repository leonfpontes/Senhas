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
- Painel platform (super admin) para gestao de tenants, usuarios globais, billing e feature flags.

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
- Login seta 3 cookies: `access_token` (HttpOnly, Secure, SameSite=Strict), `refresh_token` (HttpOnly), `auth_state=1` (nao-HttpOnly — legivel por JS para verificar login).
- `/auth/refresh` implementado: le `refresh_token` do cookie, valida com `decode_refresh_token` (requer `type=refresh`), emite novo access + rotaciona refresh.
- `jwt_middleware` extrai token do header `Authorization: Bearer` primeiro (impersonacao via sessionStorage), depois fallback para cookie `access_token`.
- `jwt_middleware` public_paths inclui `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`.
- Frontend usa `withCredentials: true` no axios — nao ha token no header para sessoes normais.
- Impersonacao usa sessionStorage e header Bearer — fluxo preservado separado.
- `hasAuthToken()` checa: `sessionStorage.getItem('access_token')` OR `document.cookie.includes('auth_state=1')` OR `localStorage.getItem('user')`.
- Logout DEVE chamar `POST /api/v1/auth/logout` para limpar cookies no servidor.

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
- Tickets, tickets_bulk, validate_bulk, email_resend → `PermissionFeature.TICKETS`
- Mediuns → `PermissionFeature.MEDIUNS`
- Associados → `PermissionFeature.ASSOCIADOS`
- Usuarios → `PermissionFeature.USUARIOS`
- Estoque → `PermissionFeature.ESTOQUE`
- Mensalidades (financeiro/config/resumo/relatorio) → `PermissionFeature.FINANCEIRO`
- Contas a Pagar/Receber, Fluxo de Caixa, Config Financeira → `PermissionFeature.CONTAS_FINANCEIRAS`
- Configuracoes do Tenant → `PermissionFeature.CONFIGURACOES`
- Auditoria → `PermissionFeature.AUDITORIA`
- Analytics → `PermissionFeature.ANALYTICS`
- Relatorio de Gira / exports CSV → `PermissionFeature.RELATORIO_GIRA`
- Cursos Presenciais / Sites → `PermissionFeature.CURSOS_PRESENCIAIS`

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
  (`_PLAN_TIER` / `plan_tier()`); o frontend espelha o catalogo em `frontend/src/hooks/useSubscription.tsx`.
- Semantica unica: plano inclui a feature (senao **403**, mensagem "disponivel a partir do plano X")
  **e** status da assinatura permite uso (senao **402**). Super admin sem tenant → 400.
- Status (`subscription_block_reason`): SUSPENDED bloqueia; CANCELLED/EXPIRED bloqueiam plano pago (com
  FREE e o estado normal pos-`reset_to_free`); trial local (sem `stripe_subscription_id`) vencido bloqueia
  mesmo antes do trial_scheduler rebaixar; trial Stripe e decidido pelo webhook; `is_bonus` segue o status
  normalmente mas nao sofre corte de fim de trial; `cancel_at_period_end` mantem acesso ate o webhook
  `customer.subscription.deleted`.
- Limites numericos (usuarios, giras/mes, mediuns) ficam no endpoint, mas leem `effective_limit(sub, campo)`:
  SUSPENDED → 402; CANCELLED/EXPIRED de plano pago ou trial vencido → limites do FREE.
- `GET /api/v1/admin/subscription` devolve `features` via `get_effective_plan_features(sub)` — a UI esconde o
  que o backend nega. `PermissionService.is_feature_enabled_for_plan` (operadores) usa a mesma funcao.
- Modulos gated hoje: estoque (`estoque_controle`), sites e cursos presenciais (`site_builder`), contas
  financeiras (`contas_financeiras`), rastreio/reenvio de e-mail (`email_transacional`), mensalidades
  (`mensalidade_mediun` / `mensalidade_associado`), mediuns (`mediuns`, em aniversariantes e criacao),
  toggles de fila de espera e agendamento por horario em config.
- Rotas `/api/v1/platform/*`: `Depends(require_super_admin)` importado de `src.api.dependencies` (copia unica).

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

### 11.3 Giras
- Campo "Local" removido do formulario de criacao/edicao e da tabela — endereco agora vem da config do tenant.

### 11.4 Porta (Visao da Porta)
- Gestao da fila de atendimento via **polling HTTP a cada 8s** (`POLLING_INTERVAL_MS`) — NAO ha
  WebSocket no codigo atual (zero `@router.websocket` no backend; o hook `useWebSocket` foi
  removido). A location de proxy WebSocket no nginx e legado sem efeito.
- Modo TV/Kiosk fullscreen em `porta/kiosk.tsx` (mesmo polling).
- Modais: AttendModal, WalkInModal.

### 11.5 Layout Admin (Sidebar)
- Header redesenhado: fundo gradiente com cores do tenant, logo circular 52px (ou avatar fallback com inicial), nome do terreiro como texto principal (ate 2 linhas), "Senhas Admin" como label secundario.
- Navegacao: Dashboard, Giras, Tickets, Porta, Usuarios, Analytics, Auditoria, Configuracoes.
- Item selecionado com gradiente do tenant.
- Footer: "Senhas v1.1 — Admin Edition".
- Responsivo: drawer temporario no mobile, permanente no desktop.
- Suporte a impersonacao (banner amarelo no topo).

### 11.6 Perfil do Usuario
- Upload de foto como BYTEA (armazenado no banco).
- Avatar exibido no AppBar e no sidebar.

### 11.7 Homepage Publica
- Favicon personalizado.
- Meta tags com Head do Next.js.

### 11.8 Cadeia de Migracoes Alembic
- 64 migracoes; head atual: `054_purge_soft_deleted_gira_time_slots` (2026-08-26).
- Historico com 4 merge revisions (010, 030, 037, d9fafadd9261) — prefixos numericos ja
  colidiram 3x (009, 028, 030). Por isso a regra do §4.3: `alembic heads` ANTES de criar
  qualquer migracao nova.
- Migracoes corretivas notaveis (post-mortems nos docstrings): 044b (largura de
  alembic_version.version_num — banco zerado quebrava no upgrade), 052 (dedup de consulentes +
  unique parcial por tenant+email), 054 (purga de time slots soft-deletados que colidiam na
  unique).

### 11.10 Financeiro — Controle de Mensalidade de Mediuns (branch 002-financeiro-mensalidade)
- **Feature PRO+**: `mensalidade_mediun` e PRO+ no catalogo desde 2026-06-27; os endpoints exigiam PREMIUM ate o P-05 (2026-10-05), que passou a usar `require_plan_feature("mensalidade_mediun")`.
- **Modelos**: `MensalidadeConfig` (valor_mensal, dia_vencimento, 1:1 tenant), `MensalidadePagamento` (UNIQUE mediun_id+mes, BYTEA comprovante), `MensalidadeStatus` enum (PENDENTE/PAGO/ISENTO).
- **Endpoints** (prefixo `/api/v1/admin/financeiro`): config GET/PUT, mensalidades GET/POST por mes, comprovante GET/DELETE, resumo GET (6 hist + 3 proj), relatorio POST enviar / GET download.
- **Regras de acesso**: leitura para OPERATOR+ADMIN, escrita (PUT config, POST pagamento, DELETE comprovante, POST relatorio) somente ADMIN/SUPER_ADMIN.
- **Comprovante**: BYTEA no banco, limite 5MB, tipos aceitos: jpeg/png/webp/pdf.
- **Relatorio**: email HTML gerado por `render_mensalidade_report()` com KPI cards + tabela inadimplentes.
- **Frontend**: `/admin/financeiro/mensalidades` (tabs Mediuns + Grafico com Recharts) e `/admin/financeiro/config`; sidebar com grupo Financeiro (gate `can('mensalidade_mediun')`).
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

### 11.12 Checklist de primeira gira (Dashboard) — item P-06 do plano
- **Backend**: `GET /api/v1/admin/dashboard-summary` devolve `onboarding` (`has_gira`, `public_tickets`, `door_used`, `public_link`, `completed`), calculado por `_get_onboarding_status` em `dashboard_summary.py` numa única consulta filtrada por `tenant_id`. `public_tickets` conta só senhas emitidas pelo próprio consulente (`emitido_por_id IS NULL`); `door_used` = alguma senha com check-in ou chamada. Sem endpoint novo, sem migração.
- **Frontend**: `components/admin/FirstGiraChecklist.tsx`, montado no topo de `/admin/dashboard` para quem tem `giras:view` (botão "Criar gira" só com `giras:insert`, "Abrir a Porta" só com `porta:view`).
- **Visibilidade**: some quando `completed`, quando `public_tickets >= 20` (`ACTIVATED_PUBLIC_TICKETS` — terreiro já ativado, ex.: pagante que não usa a Porta) ou quando o admin oculta. "Ocultar" e "já compartilhei" ficam no `localStorage` por tenant; o passo de compartilhar também se completa sozinho na primeira senha pelo link.
- **Analytics**: `services/analytics.ts` (`trackEvent`, `setAnalyticsTag`) envia `onboarding_share_whatsapp`, `onboarding_copy_link`, `onboarding_show_qr`, `onboarding_test_link`, `onboarding_cta_create_gira`, `onboarding_cta_porta` e `onboarding_dismiss` para GA4 e Clarity, e marca a sessão do Clarity com a tag `onboarding_step` (1–4).
- **QR code**: `qrcode.react` (SVG local, sem chamada externa).
- **Padrões de senhas** (`frontend/src/utils/giraSenhaDefaults.ts`): ao criar uma gira, a tela abre na sequência o drawer "Configurar Senhas" da gira nova. Gira sem configuração (`max_tickets` 0) vem preenchida com a mediana das quantidades do terreiro (`DEFAULT_MAX_TICKETS` = 30 sem histórico) e liberação de agora (próximos 5 min) até o início da gira; o estado "inicial" fica vazio, então salvar fica habilitado e fechar pede confirmação. Janela menor que `SHORT_WINDOW_HOURS` (3h) mostra aviso com "Usar sugestão" — vale para todos os terreiros (os ativos têm janela mediana de 5h a 48h, então o aviso quase nunca aparece para eles).
- **Tela de giras**: sem nenhuma gira, `/admin/giras` mostra `components/admin/GirasEmptyState.tsx` (ciclo em 3 passos + "Criar primeira gira" com `giras:insert`; bloqueado pelo plano mostra o motivo e "Ver planos"). Erro ao carregar mostra `Alert` com "Tentar novamente" — nunca o empty state. `/admin/giras?nova=1` abre o formulário de criação direto (respeita permissão e limite do plano) e remove o parâmetro da URL; o botão "Criar gira" do checklist usa esse link. Evento `giras_empty_create`.

### 11.13 Pergunta de dor no cadastro + tour de boas-vindas — item P-07 do plano
- **Cadastro** (`/cadastro`, passo 1): select obrigatório "O que você mais precisa resolver?". Valores em `backend/src/core/onboarding.py` (`PRINCIPAL_DOR_VALUES`), espelhados em `frontend/src/constants/onboarding.ts` — `test_onboarding_signup.py` falha se as listas divergirem. O schema aceita ausência (compatibilidade), o formulário exige.
- **Armazenamento**: `tenant_configs.custom_settings.principal_dor` (JSON, junto do `como_conheceu`; sem migração). Leitura sempre via `read_principal_dor()`, que ignora valores fora da lista.
- **Exposição**: `onboarding.principal_dor` no `GET /api/v1/admin/dashboard-summary`, na mesma consulta do checklist (§11.12).
- **Tour** (`frontend/src/tours/welcomeTour.tsx`): `useWelcomeTour` no dashboard abre sozinho **uma vez por usuário** (flag `girahub:welcome-tour:seen:{userId}` no localStorage), só para `role === 'admin'` e só se o tenant tem `principal_dor`; tenants antigos não veem. Trilhas: senhas/outro → checklist + Porta; médiuns, financeiro, divulgação, estoque → passo com botão para o módulo (ou "Ver planos" se a feature do plano não estiver liberada) e um passo lembrando do checklist. Todas terminam no botão "?" (`data-tour="topbar-help"`).
- **Passos centralizados** usam `CENTER_SELECTOR` (seletor sem elemento) + `position: 'center'` + `padding.mask: 0`: com `body` o reactour não escurece o fundo e rola a página. Não ancorar no menu lateral: muda por plano/permissão e fica escondido no celular.
- **Analytics**: `signup_completed {principal_dor}` no cadastro, `welcome_tour_open {trilha}`, `welcome_tour_cta {trilha, href}`, e tag de sessão `principal_dor` no Clarity.

### 11.14 E-mails de onboarding D+1/D+3 — item P-08 do plano
- **Agendador**: `backend/src/services/onboarding_email_scheduler.py`, iniciado no lifespan de `main.py`, roda às 10:00 BRT. Regras em `classify()`: D+1 = conta com 20h–68h e sem gira; D+3 = conta com 68h–7 dias e zero senhas pelo link (`emitido_por_id IS NULL`). Conta com 7+ dias nunca recebe.
- **Modelos**: `services/email/templates/onboarding_nudge.py` (D+1 com P.S. do módulo da trilha `principal_dor`; D+3 com link público e botão de WhatsApp com o mesmo texto do checklist). Links com UTM `utm_source=email&utm_medium=onboarding&utm_campaign=onboarding_d1|d3`.
- **Anti-duplicação — obrigatório em agendador novo**: o backend roda `uvicorn --workers 2` e cada worker executa o lifespan, então **estado em memória não evita envio duplicado**. Aqui: `pg_try_advisory_lock(0x6769726168756201)` por rodada (só um worker processa) + marca persistente em `tenant_configs.custom_settings.onboarding_emails` (`{"d1": iso, "d3": iso}`) gravada sob `SELECT ... FOR UPDATE` **antes** do envio (no máximo uma vez; falha de provedor não reenvia). `trial_scheduler` e `birthday_scheduler` usam o mesmo esquema via `services/scheduler_guard.py` desde 2026-10-05 (ver §11.9); este agendador ainda tem o lock e a marca em código próprio e pode migrar para o módulo comum.
- **Operação**: desligar com `ONBOARDING_EMAILS_ENABLED=false` no `.env` + restart do backend. Listar quem receberia na próxima rodada, sem enviar nem marcar: `docker compose -f docker-compose.prod.yml exec backend python -m src.services.onboarding_email_scheduler --dry-run`.
- Contato principal do tenant: `get_tenant_primary_contact()` em `trial_scheduler.py` (admin mais antigo ativo), compartilhado pelos dois agendadores.

### 11.15 Painel de ativação na tela Hoje (super-admin)
- **Onde**: tela "Hoje" de `/platform` (o antigo `/platform/observatory` redireciona para ela, mantendo a âncora), componente `frontend/src/components/platform/ActivationSection.tsx`. Dados em `activation` do `GET /api/v1/platform/tenant-observatory` (protegido por `require_super_admin`), calculados por `backend/src/services/activation_service.py`.
- **Conteúdo**: cadastros dos últimos 60 dias (`WINDOW_DAYS`), do mais recente ao mais antigo, cada um num estágio — `sem_gira` → `sem_senhas` (gira criada sem `max_tickets`, nada aparece no link) → `aguardando_senha` → `recebendo` → `usou_porta` → `ativado` (20+ senhas pelo link, mesmo limiar do checklist). Mostra também giras configuradas/total e próxima gira, senhas pelo link, trial (dias restantes) ou pagante, e-mails de onboarding enviados (D+1/D+3, de `custom_settings.onboarding_emails`), dor do cadastro, última atividade (sessão ou ação auditada) e contato do admin mais antigo com links de WhatsApp (`wa.me`, DDI 55 acrescentado) e e-mail.
- **Consulta**: uma ida ao banco com subconsultas correlacionadas por tenant + uma para os contatos. Visão cross-tenant por desenho (super-admin), sem filtro de tenant.

### 11.16 Frontend — shadcn/ui + Tailwind (migração M-01 concluída em 2026-10-06, interface v2.0.0)
- **Sem MUI.** `@mui/*`, `@emotion/*`, `stylis`, `dayjs`, `react-number-format` e `packages/shared-ui` saíram. Toda tela
  usa Tailwind v4 + shadcn/ui (Radix, estilo new-york, `data-slot`). **Não criar `sx` nem reintroduzir MUI.**
- **CSS global** (`src/styles/globals.css`, importado só no `_app.tsx`): camadas `theme < base < components < utilities`,
  preflight completo do Tailwind, `body` com `--background/--foreground/--font-sans`. Breakpoints iguais aos antigos do
  MUI (`sm 600 / md 900 / lg 1200 / xl 1536`, sem `2xl`). Tokens shadcn em `:root`/`.dark`, mais `--success`, `--warning`,
  `--info` (com `-foreground`) e `--chart-grid`/`--chart-tick`. Fonte da interface: pilha do sistema (sem Roboto global).
- **Cores do terreiro**: `src/lib/brand.ts` → `applyBrand(document.documentElement, {primary, secondary, font})`, chamado
  pelo `TenantAwareThemeProvider` a cada mudança de branding; escreve `--primary`, `--primary-foreground`, `--secondary`,
  `--secondary-foreground`, `--ring`, `--sidebar-primary`. Texto sobre a marca: a cor de fonte do terreiro se o contraste
  for ≥ 4,5, senão preto/branco. Default `#4f46e5` (= backend). Telas públicas: texto na cor da marca usa
  `text-(color:--brand-text)` (primária escurecida até AA, definida pelo `PublicShell`), nunca `text-primary`.
- **Claro/escuro**: classe `dark` em `<html>` (não no layout — Radix porta overlays para o `<body>`), aplicada por
  `AdminThemeProvider`/`PlatformThemeProvider` (chaves `admin_theme_mode`/`platform_theme_mode`); páginas públicas sempre claras.
- **Overlays**: Sheet/Dialog/AlertDialog/Select/Popover/DropdownMenu usam o z-index padrão do Radix (`z-50`); quem abre por
  último fica por cima, então calendário e Combobox dentro do `CrudDrawer` funcionam. Barras fixas: topbar `z-30`,
  `MobileTabBar` e `BulkActionsBar` `z-40`. Não usar `z-[1300]`/`z-[1400]` (eram para ficar acima do AppBar do MUI).
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
- **Versão**: `frontend/package.json` `version` → `NEXT_PUBLIC_UI_VERSION` (`next.config.js`) → `src/lib/version.ts`
  (`APP_VERSION`, "GiraHub v2.0.0" no rodapé da sidebar, menu do usuário e plataforma). Backend `APP_VERSION` 2.0.0;
  a tag das imagens Docker vem de `APP_VERSION` no `.env` do servidor.
- **Testes**: por papel/texto (nunca classes). `jest.setup.js` tem polyfills do Radix (`hasPointerCapture`,
  `scrollIntoView`, `ResizeObserver`, `matchMedia`). Bundle antes/depois em `docs/bundle-baseline.md`.

### 11.9 Infraestrutura e Deploy
- Docker Compose com: postgres, redis, backend (FastAPI/Uvicorn), frontend (Next.js), nginx (reverse proxy + SSL).
- VPS: 76.13.231.19 (Hostinger), projeto em /opt/senhas.
- Dominio: girahub.com.br com SSL (Let's Encrypt).
- nginx: proxy reverso, terminacao SSL, WebSocket proxy para /door/ws.

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
- Backend: `sentry-sdk[fastapi]>=1.39.0` — inicializado em `main.py` quando `SENTRY_DSN` definido.
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
