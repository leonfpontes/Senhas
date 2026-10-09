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

- Roles principais: SUPER_ADMIN, ADMIN, OPERATOR — e MEDIUM (AM-02), conta so da Area do Medium,
  fora da hierarquia de back-office (`_ROLE_HIERARCHY` nivel -1; `is_operator_or_admin` falso).
- Endpoints admin so para escopo do tenant atual. O `admin_router` inteiro tem
  `Depends(require_backoffice)`: o papel `medium` leva 403 em TODA rota `/api/v1/admin/*` (o papel
  vem do usuario no banco, nao do token — rebaixar vale na hora; impersonando um `medium` tambem).
- Area do Medium (`/api/v1/medium/*`, AM-02): `medium_router` com `Depends(require_medium)` →
  `MediumContext(user, tenant_id, medium, token)` — medium ativo e nao excluido com
  `mediuns.user_id = user.id` no tenant do usuario + `check_plan_feature("area_medium")` (403/402) +
  Area ligada pela casa (`tenant_configs.area_medium_ativa`, AM-10 → senao 403). Vale para qualquer
  papel (operador/admin ligado a um medium tem as duas areas). Rotas da Area nunca recebem `medium_id`.
- `areas` (`{"admin": bool, "medium": {"medium_id", "nome"} | null}`) vem em `GET /auth/me`,
  `GET /auth/profile` e na resposta do login, calculadas no servidor a cada chamada
  (`services/medium_area.compute_areas`) — nunca no JWT. `admin` = papel admin/operator;
  `medium` so com vinculo ativo E plano efetivo com `area_medium` E Area ligada pela casa (AM-10).
- Endpoints platform so para super admin (escopo global).

**Fluxo de autenticacao via cookie HttpOnly (desde 2026-06-27):**
- Login seta 3 cookies: `access_token` (HttpOnly, Secure, SameSite=Strict), `refresh_token` (HttpOnly), `auth_state=1` (nao-HttpOnly — legivel por JS para verificar login). Cadastro (`/public/onboarding`) e reativacao de conta setam os mesmos 3 (helper unico `core/auth_cookies.set_auth_cookies`). `remember_me=false` no login → cookies de sessao (sem max_age), mantido no `/auth/refresh` (ver §11.22).
- `/auth/refresh` implementado: le `refresh_token` do cookie, valida com `decode_refresh_token` (requer `type=refresh`), emite novo access + rotaciona refresh.
- Claim `type` do JWT (T-02): todo access token sai de `create_access_token` com `type=access`
  (login, refresh, impersonacao, reativacao, cadastro). `decode_token` (usado pelo `jwt_middleware`)
  e ALLOWLIST: so `type=access`; `refresh`, `account_select` (AM-05) e tipos desconhecidos (`mfa_pending`,
  convite...) dao 401. Tipo novo de JWT = `type` proprio + decoder proprio, nunca `decode_token`.
  Janela de compatibilidade: token SEM `type` so passa se `iat < LEGACY_UNTYPED_ACCESS_CUTOFF`
  (2026-10-08T00:00Z) e ainda dentro de `ACCESS_TOKEN_EXPIRE_HOURS` do `iat`; ramo legado
  removivel a partir de 2026-10-10 (detalhes em `docs/authentication.md`).
- `jwt_middleware` extrai token do header `Authorization: Bearer` primeiro (impersonacao via sessionStorage), depois fallback para cookie `access_token`.
- `jwt_middleware` public_paths inclui `/auth/login`, `/auth/login/select`, `/auth/refresh`, `/auth/logout`,
  `/auth/forgot-password`, `/auth/reset-password`, `/auth/reactivate-account`.
- **Mesmo e-mail em mais de um terreiro (AM-05)**: usuario e unico por `(tenant_id, email)`. O login confere a
  senha em TODAS as contas ativas com o e-mail (`login.active_login_accounts_stmt`: usuario ativo e nao excluido,
  terreiro sem `self_deactivated_at`/`deleted_at`; max. `MAX_LOGIN_ACCOUNTS = 5`, mais antigas primeiro) — uma
  verificacao bcrypt por conta; sem conta ativa, 1 verificacao (falsa ou a da conta inativa), o mesmo custo de
  senha errada numa conta so. Confere em uma → sessao direta. Em mais de uma → 200 `{choose_account, selection_token,
  options:[{user_id, terreiro_nome, terreiro_slug, logo_url, areas:{admin, medium}}]}` SEM cookies; so lista os
  terreiros cuja senha conferiu (anti-enumeracao). `selection_token` = JWT `type=account_select`, 5 min, `uids` +
  `remember` (sem `sub`/`role`; so `decode_account_select_token` aceita). `POST /auth/login/select
  {selection_token, user_id}` (publico, 10/min por IP no slowapi e no nginx — `location = /api/v1/auth/login/select`
  com a zona `login_limit` do login, `burst=5 nodelay`, AM-29): valida tipo/validade/lista, conta ainda ativa e sem
  `sessions_revoked_at` posterior ao token → `issue_session` como o login (401 `SELECTION_INVALID` em qualquer
  recusa). Nao e de uso unico. Sem nenhuma conta ativa vale a regra de conta unica do #85
  (`user_by_login_email_stmt`): conta inativa → 401 generico; terreiro desativado pelo dono → `TENANT_DEACTIVATED`
  so depois de conferir a senha (a reativacao usa a mesma regra). Esqueci a senha com varias contas → UM e-mail com
  um link por terreiro (um `reset_token_hash` por conta; `render_password_reset_multi_email`). Front: passo "Em qual
  terreiro voce quer entrar?" no `/login` (`components/auth/AccountChoiceList`, `authSession.selectAccount` com
  `skipAutoLogout`) e depois o mesmo `completeLogin` por `areas`.
- **Casa nova com e-mail que ja tem conta (decisao do dono, 2026-10-08)**: `POST /public/onboarding` com e-mail
  que tem conta ATIVA (mesma `active_login_accounts_stmt`, inclusive `medium`) exige `conta_existente: true` +
  a senha dessa conta (sem a regra de senha nova; `matching_accounts`, ate 5 bcrypt). Sem a marca → 409
  `EMAIL_JA_TEM_CONTA`; senha errada → 400 `SENHA_CONTA_INCORRETA` (nunca 401), nada criado; 5 contas ativas →
  409 `LIMITE_CONTAS_EMAIL` (so depois da senha certa; limite = `MAX_LOGIN_ACCOUNTS`, mantido em 5). Admin novo
  com o MESMO `password_hash` da conta conferida (uma senha; o login pergunta o terreiro). Sem conta ativa mas
  com conta inativa/terreiro desativado → 409 "Este email ja esta cadastrado" de sempre (o login oferece
  reativar); so conta excluida nao barra. Rate limit igual ao do login: `@limiter.limit("10/minute")` +
  `location = /api/v1/public/onboarding` na zona `login_limit` do nginx. Trial segue por documento/e-mail.
  Front (`/cadastro`): a resposta `EMAIL_JA_TEM_CONTA` volta ao passo Acesso com aviso e campo unico "Senha da
  sua conta GiraHub" (`cadastroSchemaContaExistente`, "Esqueci a senha", "Usar outro e-mail"); trocar o e-mail
  desliga o modo. Sem consulta antecipada de e-mail (seria oraculo). Detalhes em `docs/api.md` (Public §8).
- Frontend usa `withCredentials: true` no axios — nao ha token no header para sessoes normais.
- Impersonacao usa sessionStorage e header Bearer — fluxo preservado separado.
- `hasAuthToken()` checa: `sessionStorage.getItem('access_token')` OR `document.cookie.includes('auth_state=1')` OR `localStorage.getItem('user')`.
- Logout DEVE chamar `POST /api/v1/auth/logout` para limpar cookies no servidor.
- Apagar os cookies de auth: SEMPRE `clear_auth_cookies(response)` de `src/core/auth_cookies.py` (junto com `set_auth_cookies`)
  (os 3 cookies, com os mesmos atributos do login — `secure` depende de DEBUG). Usado por logout,
  logout-all, change-password, delete account e deactivate account.
- Conta excluida perde o acesso na hora: `get_current_user` e `/auth/refresh` recusam `deleted_at` preenchido
  (alem de `is_active` falso e token anterior a `sessions_revoked_at`), e `User.soft_delete()` desativa a conta e grava
  `sessions_revoked_at`. Assim o token antigo nao volta a valer quando `POST /admin/users` ressuscita a linha com o
  mesmo e-mail. Nunca apagar usuario com `deleted_at = ...` direto: usar `soft_delete()`.
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
- Relatorio de Gira → `PermissionFeature.RELATORIO_GIRA`; listagem de senhas para o PDF (`exports.py`, `export-listagem`) → TICKETS ou RELATORIO_GIRA (+ plano `export_csv`)
- Cursos Presenciais → `PermissionFeature.CURSOS_PRESENCIAIS`
- Site do terreiro (Meu Site, `sites.py`, inclusive imagens) → `PermissionFeature.SITE` (T-06; antes usava
  CURSOS_PRESENCIAIS — as migracoes 061/062 copiaram as permissoes de Cursos para `site` em todo grupo)
- Avisos da Area do Medium (`comunicados.py`, AM-09) → `PermissionFeature.COMUNICADOS` ("Avisos e estudos da
  Area", grupo "Corrente" na tela de perfis; publicar = insert, editar = edit, arquivar = delete, lista e quem
  leu = view) + `require_plan_feature("area_medium")` no router (migracoes 070/071)
- Estudos e documentos da casa (`materiais.py`, AM-21) → `PermissionFeature.COMUNICADOS` (sem feature nova:
  listar/detalhe = view, criar = insert, editar e reordenar (`PUT /ordem`) = edit, arquivar = delete) +
  `require_plan_feature("area_medium")` e `require_plan_feature("biblioteca_medium")` no router (migracao 090)
- Grupos da corrente (`corrente_grupos.py`, AM-23) → `PermissionFeature.MEDIUNS` (sem feature nova, §6.7 do
  plano: listar/detalhe = view, criar = insert, editar/por e tirar medium/desarquivar/campo "Grupos" do medium =
  edit, arquivar = delete; `GET /opcoes` = MEDIUNS **ou** COMUNICADOS view via `require_any_group_permission`,
  sem nomes de mediuns, para quem so publica avisos) + `require_plan_feature("area_medium")` no router (075).
  Desde o AM-08 a leitura (`GET` lista/detalhe) aceita tambem `ESCALAS:view` e `GET /opcoes` aceita
  MEDIUNS, COMUNICADOS ou ESCALAS view
- Atividades da casa (`atividades.py`, AM-08) → `PermissionFeature.ESCALAS` ("Atividades e escalas", grupo
  "Corrente"; migracoes 077/078): tipos e funcoes (listar = view, criar = insert, editar/desarquivar = edit,
  arquivar = delete), atividades internas (view/insert/edit/delete; cancelar e reativar = edit), calendario da
  casa (view) e ancora da gira `POST /da-gira/{gira_id}` (insert) + `require_plan_feature("area_medium")` E
  `require_plan_feature("atividades_corrente")` no router. Operador: `ESCALAS` segue `atividades_corrente` em
  `PermissionService.is_feature_enabled_for_plan`. Escalas, confirmacoes e chamada (AM-17/AM-18/AM-25) usam a
  mesma feature
- Presenca (`atividades_presenca.py`, AM-17/AM-28) → `PermissionFeature.ESCALAS`, mesmo prefixo e mesmos gates
  de plano: confirmacoes = view, convocar (e `GET /convocar/mediuns`, AM-29) = insert, dispensar = edit, chamada (GET/PUT/encerrar) = edit, QR =
  edit. **Excecao da gira**: a chamada de uma gira aceita tambem `PORTA:edit` e o QR da gira `PORTA:view` —
  guard `require_any_group_permission(ESCALAS, PORTA, action=...)` + checagem interna (`_exigir_chamada`/
  `_exigir_qr`: PORTA so vale quando a atividade e ancora de gira). `POST /da-gira/{id}/chamada` (ESCALAS ou
  PORTA edit) cria a ancora para o porteiro abrir a chamada; `GET /da-gira/{id}/qr` serve a Porta/TV sem
  criar ancora. A justificativa so sai com `ESCALAS:view` (quem abriu pela Porta ve `tem_justificativa`)
  Convocar grupos inteiros (AM-29): `grupo_ids` no corpo, cada um conferido no terreiro e nao arquivado
  (`corrente_grupos.validar_grupos_ativos_do_tenant`, checagem 4 do auditor) antes de gravar; expande para os
  membros ATIVOS que o tipo alcanca (`presenca.planejar_convocacao`, origem "grupo" + `grupo_id`), sem
  duplicar nem rebaixar quem ja estava na escala
- Escala de faxina (`escala_planos.py`, AM-25) → `PermissionFeature.ESCALAS` + `require_plan_feature("area_medium")`
  E `require_plan_feature("escalas")` (Pro) no router: ver o mes = view; rascunho (PUT), copiar do mes anterior,
  girar e distribuir = edit; publicar e "Atualizar convocacoes" = insert E edit (dois guards empilhados: criam
  atividades/convocam e cancelam/dispensam). `tipo_id` do caminho buscado no tenant (404) e com modo "grupos por
  dia" (422); `grupo_id` do corpo conferido no tenant e nao arquivado (`validar_grupos_ativos_do_tenant` /
  `_validar_grupos_do_plano`) antes de gravar
- Assiduidade (`atividades_assiduidade.py`, AM-26) → `PermissionFeature.ESCALAS` view, mesmo prefixo e mesmos
  gates de plano: `GET /assiduidade` (por medium; `agrupar=grupo` exige tambem o plano `escalas` (Pro) via
  `check_plan_feature` → 403) e `GET /assiduidade/medium/{medium_id}` (detalhe com o texto da justificativa —
  so na tela; o agregado, que vai para o PDF, so tem contagens). `tipo_id`/`grupo_id`/`medium_id` conferidos
  no tenant (404). Router registrado ANTES do `atividades.py` (senao `/assiduidade` cai no `GET /{atividade_id}`)
- Escala por funcao (`atividades_escala.py`, AM-18) → `PermissionFeature.ESCALAS`, mesmo prefixo, e o router
  exige tambem `require_plan_feature("escalas")` (Pro; fora do plano → 403): `GET /{id}/escala` = view,
  `PUT /{id}/escala`, `POST /{id}/escala/copiar-anterior` e `POST /{id}/escala/rodizio` = edit;
  `POST /da-gira/{gira_id}/escala` = **view** (so cria/devolve a ancora da gira, sem dado de negocio, para abrir a
  aba). Tipo sem `modo_escala = 'funcoes'` → 409
- Troca na escala (`atividades_trocas.py`, AM-27) → `PermissionFeature.ESCALAS`, mesmo prefixo, router com
  `require_plan_feature("area_medium")` + `("atividades_corrente")` + `("escalas")` (Pro; troca so existe nas
  escalas): `GET /trocas` = view; `GET /trocas/{id}/substitutos`, `POST /trocas/{id}/aprovar|recusar|cancelar` =
  edit. `substituto_id` do corpo conferido no tenant (`trocas_escala.validar_substituto_do_tenant`: ativo,
  alcancado pelo tipo, fora da escala → 422 sem gravar); troca de outro terreiro → 404. Router registrado ANTES do
  `atividades.py`. Abono (`PUT /{id}/justificativas/{medium_id}`, em `atividades_presenca.py`) = `ESCALAS:edit`
  com os gates de plano da presenca (`area_medium` + `atividades_corrente`; nao exige `escalas`). Area:
  `api/v1/medium/trocas.py` com `require_plan_feature("atividades_corrente")` + `("escalas")` e
  `require_not_impersonated` nas escritas; `PUT /medium/preferencias/colegas` (opt-in do D-07) tambem recusa
  impersonando
- Ficha espiritual do medium (`ficha_espiritual.py`, F-05) → `PermissionFeature.FICHA_ESPIRITUAL` ("Ficha espiritual",
  grupo "Corrente"; migracoes 088/089) + `require_plan_feature("ficha_espiritual")` (Pro) no router. Prefixo
  `/api/v1/admin/mediuns`: campos (`/ficha-campos*`: listar/modelos = view, criar/aplicar modelo = insert, editar/
  desarquivar = edit, arquivar = delete), pendencias (`GET /ficha-pendencias` = view; aceitar/recusar sugestao =
  edit), ficha do medium (`GET/PUT/DELETE /{id}/ficha` = view/edit/delete; autorizacao `POST/DELETE
  /{id}/ficha/consentimento` = edit) e caminhada (`/{id}/marcos*` = view/insert/edit/delete). Dado religioso (LGPD
  art. 11): gravar valor, marco ou aceitar sugestao exige o consentimento do medium (409 `FICHA_SEM_CONSENTIMENTO`);
  sem consentimento em vigor (nunca dado ou retirado) os valores e marcos NAO saem nem pelo painel. Auditoria so com
  ids/contagens; nada da ficha em `MediumResponse`, exportacao, CSV ou e-mail. Ids do caminho/corpo conferidos no
  tenant (`services/ficha_espiritual.medium_do_tenant`/`validar_campos_ativos_do_tenant`/`campo_do_tenant`). Admin e
  impersonacao passam por cima do grupo como em todo o painel (`PermissionService.check_permission`)
- **Excecao consciente ao roteiro "nova feature" (F-05)**: `FICHA_ESPIRITUAL` NAO entra no grupo padrao "Acesso
  total" — nem pela migracao (a 089 nao da acesso; nao existe a "segunda migracao" de grant) nem pelo
  `PermissionGroupRepository.ensure_default_group`, que pula `FEATURES_FORA_DO_GRUPO_PADRAO`
  (`models/permission_groups.py`). Operador so ve a ficha num grupo marcado a mao; na matriz de permissoes
  (`PermissionMatrix`) os atalhos (Só ver/Operação do dia/Tudo) e o "Tudo" da area nao ligam modulo de
  `SENSITIVE_FEATURES` (`constants/permissionFeatures.ts`). Testes: `tests/integration_pg/test_rbac_grupo_padrao.py`
  e `test_f05_am19_ficha.py`

Nao empilhe `if not current_user.is_admin` sobre `require_group_permission`: o operador com o grupo
leva 403 enquanto a UI (que usa `canGroup`) mostra o botao. Admin ja faz bypass dos grupos. Se a acao
pode virar escalada de privilegio, escreva a protecao especifica — ex.: `users.py` (operador com
USUARIOS nao cria/promove/edita/remove administrador; SUPER_ADMIN nunca e atribuivel; ninguem se
exclui/desativa/rebaixa; o ultimo admin ativo fica) e `config.py` (cores/logo exigem plano).

Area do Medium (AM-02) — excecao ao guard de grupo, com guard proprio:
- `src/api/v1/medium/*` NAO e rota admin: o `medium_router` (prefixo `/api/v1/medium`) inteiro
  passa por `Depends(require_medium)`; o medium nao tem grupo. Rotas "minhas": nunca recebem
  `medium_id` (usam `ctx.medium.id`/`ctx.tenant_id`); escrita sob impersonacao →
  `Depends(require_not_impersonated)`; campos internos (`observacoes`, comprovantes de outros,
  `registrado_por`) nunca saem por ali.
- `scripts/audit_permission_guards.py` falha se o `admin_router` perder o `require_backoffice`, se o
  `medium_router` perder prefixo/`require_medium` ou se um router de `medium/` ficar fora dele.
  `scripts/audit_tenant_isolation.py` (modo "medium") exige filtro por tenant e, em modelo do
  medium (`Medium` e FK para `mediuns`), por `ctx.medium.id`; e acusa `medium_id` vindo da requisicao.
- Dado so da Area: `giras.orientacoes_corrente` (AM-07) sai apenas por `/api/v1/medium/*` e pelo painel
  (GIRAS); rota publica, e-mail e bilhete nunca o leem (teste de integracao trava).
- Frontend da Area (AM-04/AM-06, detalhes em §11.23): toda pagina de `src/pages/medium/` renderiza
  `<MediumLayout>` (gate de area; `frontend/scripts/audit-permission-guards.js` falha sem ele) e so chama
  `/api/v1/medium/*`. Conta sem painel nunca chama `/api/v1/admin/*` (providers do painel so em `/admin/*`;
  `api_client` cancela). Telas do medium nao usam `canGroup`/`PlanLocked`: sem area → aviso neutro.
- Papel `medium` em `users.py`: a lista de Usuarios esconde `medium` (so com `?role_filter=medium`);
  `medium` nao se cria nem se atribui sem vinculo (422 — a conta nasce do convite, AM-03); "Adicionar"
  com o e-mail de um `medium` do terreiro promove a MESMA conta (papel pedido, grupo padrao, senha e
  username mantidos — quem cadastra nao fica sabendo a senha do medium; anti-escalada igual);
  remover (DELETE) operador/admin ligado a medium ativo rebaixa para `medium` e tira dos grupos em vez
  de excluir; desativar (`PUT is_active=false`) operador/admin ligado a medium ativo tambem so tira o painel
  (vira `medium`, continua ativo na Area — decisao do dono, 07/10); excluir de verdade solta o vinculo. Medium nao entra em grupo (`add_member` → 403) e
  `PermissionService.check_permission` nega tudo a `medium`, mesmo impersonado.
- Inativar/excluir medium (`mediuns.py`) desativa a conta `medium` pura ligada (e derruba as sessoes);
  reativar religa. Operador/admin ligado so perde/recupera a Area.
- Convite (AM-03, `admin/mediuns_acesso.py` + `public/convite.py` + `services/medium_convite.py`):
  `POST /admin/mediuns/{id}/convite`, `POST /admin/mediuns/convite/lote` e `DELETE /admin/mediuns/{id}/acesso`
  usam `MEDIUNS:edit` + `require_plan_feature("area_medium")`. O vinculo `mediuns.user_id` SO nasce no aceite
  publico (`/public/convite/{token}/aceitar`): token opaco `token_urlsafe(32)` guardado como sha256
  (`medium_convites.token_hash`), 7 dias, uso unico, um convite em aberto por medium (indice unico parcial;
  reenviar revoga o anterior). Resposta generica 404 `CONVITE_INVALIDO` para token inexistente/vencido/usado/
  revogado. Sem conta do painel com o e-mail → cria `User(role=medium)` (conta `medium` antiga ou excluida do
  mesmo e-mail volta com senha nova); com conta admin/operador → pede a senha DELA (errada = 400
  `SENHA_INCORRETA`, nunca 401) e nao muda o papel. Consentimento obrigatorio (`area_consentimento_em/_versao`,
  versao `CONSENTIMENTO_AREA_VERSAO` espelhada em `frontend/src/constants/areaMedium.ts`). Tirar o acesso
  (`services/medium_convite.tirar_acesso`) revoga o convite, desfaz o vinculo e desativa a conta `medium` pura
  (sessoes caem na hora). Trocar o e-mail, inativar ou excluir o medium revoga o convite em aberto. E-mail e
  texto de WhatsApp discretos (sem termo religioso alem do nome do terreiro, §6.8 do plano). A busca pelo
  token e a "busca raiz" isenta em `EXEMPT_PUBLIC_QUERIES` (`_convite_pelo_token`).
- **Lancamento em piloto (decisao do dono, 07/10)**: a Area do Medium vai para a producao desligada.
  `tenants.area_medium_liberada` (padrao false) e ligado por terreiro pelo super admin no Tenant 360
  (`PUT /platform/tenants/{id}` com `area_medium_liberada`). `check_plan_feature(..., "area_medium")` exige
  plano Basic+ E a chave (403 "ainda nao foi liberada"), entao todo `require_plan_feature("area_medium")` ja
  respeita; `GET /admin/subscription` devolve `features.area_medium = false` sem a chave (a tela esconde as
  entradas da Area com `can('area_medium')`, sem PlanLocked no piloto) e `areas.medium` fica null. No
  lancamento: ligar para todos (migracao de dados) ou remover a chave.
- **Configuracao da Area (AM-10)**: `GET/PUT /admin/config/area-medium` (`area_medium_config.py`,
  CONFIGURACOES view/edit + `require_plan_feature("area_medium")`, logo respeita a chave do piloto).
  Colunas `area_medium_*` em `tenant_configs` (068): ligada (o liga/desliga DA CASA; a chave da
  plataforma vale por cima), boas-vindas, WhatsApp da casa (digitos com DDI) e modulos visiveis
  (agenda, avisos, mensalidade). Leitura unica em `services/medium_area`: `area_medium_enabled_by_tenant`
  (usado pelo `require_medium` e pelo `compute_areas`), `get_area_medium_config` e
  `area_medium_modulos`/`modulos_visiveis` (mensalidade so com `mensalidade_mediun` no plano).
  `GET /medium/me` devolve `modulos`, `boas_vindas`, `whatsapp_casa` e `avisos_nao_lidos` (AM-09). Card
  novo da Area que tem modulo: esconder/recusar quando o modulo estiver fora de `area_medium_modulos`
  (modelos: `require_modulo_avisos` em `api/v1/medium/avisos.py` → 403 neutro `MEDIUM_MODULO_DESLIGADO`;
  `require_agenda_ligada` em `api/v1/medium/agenda.py` → 403 neutro `MEDIUM_MODULO_INDISPONIVEL`;
  no front, `modulo` na entrada de `MEDIUM_TABS`).
- **Avisos (AM-09)**: `/api/v1/admin/comunicados*` (COMUNICADOS view/insert/edit/delete + `area_medium`;
  `GET /{id}/leituras` = quem leu e quem nao leu, so nomes) e `/api/v1/medium/avisos*` (so publicados, nao
  expirados, do publico do medium; `POST /{id}/lido` com `require_not_impersonated`; leituras sempre por
  `ctx.medium.id`). O medium nunca ve quem mais leu (D-07). Detalhes em §11.23.
- **Estudos (AM-21)**: `/api/v1/admin/materiais*` (COMUNICADOS + `area_medium` + `biblioteca_medium`) e
  `/api/v1/medium/materiais*` (`require_plan_feature("biblioteca_medium")` no router; so publicados, nao
  arquivados, do publico do medium — mesma regra dos avisos). Detalhes em §11.23.
- **Grupos da corrente (AM-23)**: `/api/v1/admin/corrente-grupos*` (MEDIUNS + `area_medium`, acima). Todo
  `grupo_id`/`medium_id` da requisicao passa por `services/corrente_grupos.validar_*_do_tenant` (ou busca
  escopada) antes de gravar — checagem 4 do auditor, com teste de mutacao em `tests/unit/test_am23_grupos.py`
  e regressao em `test_fk_cross_tenant.py`. So medium ativo entra; inativar/excluir medium (`mediuns.py`) chama
  `remover_medium_dos_grupos`. Publico `grupos` dos avisos: `comunicado_grupos` + filtro `EXISTS` por
  `ctx.medium.id` em `api/v1/medium/avisos._no_publico_do_medium` (grupo arquivado nao conta). `GET /medium/me`
  devolve `grupos` = so nome/cor dos PROPRIOS grupos, nunca os outros membros (D-07).
- **Atividades da casa (AM-08)**: tipos (`atividade_tipos`, 8 sugeridos; "Gira" e de sistema — renomeia, nunca
  arquiva: API 422 + CHECK), funcoes da corrente e atividades internas em `/api/v1/admin/atividades*` (ESCALAS +
  `area_medium` + `atividades_corrente`). Todo `tipo_id`/`grupo_id` do corpo passa por
  `services/atividades.validar_tipo_ativo_do_tenant` / `_validar_grupos_elegiveis_do_tenant` antes de gravar
  (checagem 4, teste de mutacao em `tests/unit/test_am08_atividades.py`, regressao em
  `test_fk_cross_tenant.py`); ids de caminho (tipo, funcao, atividade, gira) sao buscados no tenant. Atividade
  interna e tabela propria (D-03): nunca conta no limite de giras/mes e nenhuma rota publica, site ou sitemap
  le `atividades` (teste em `tests/integration_pg/test_am08_atividades.py`). Terreiro novo ganha tipos e
  funcoes em `ensure_default_atividade_tipos` (cadastro `public/onboarding.py` e `tenant_service.create_tenant`,
  como o grupo padrao). Ancora da gira: `services/atividades.atividade_da_gira` (`ON CONFLICT (gira_id) DO
  NOTHING`).
- **Escala por funcao (AM-18)**: `api/v1/admin/atividades_escala.py` confere todo `funcao_id` (no terreiro;
  rodizio so nao arquivada — `_validar_funcoes_do_tenant`), `medium_id` (ativo, `validar_mediuns_ativos_do_tenant`)
  e `grupo_id` (nao arquivado, `validar_grupos_ativos_do_tenant`) do corpo antes de gravar; atividade/gira do
  caminho buscadas no tenant (404). O corpo do PUT e aninhado (`funcoes[].medium_ids`) e o rodizio passa os ids
  por um plano puro, entao a checagem 4 do auditor NAO rastreia essas gravacoes: a cobertura e o teste
  cross-tenant em `tests/integration_pg/test_am18_escala_gira.py` (422/404 sem gravar nada).
- **Agenda (AM-07)**: `GET /medium/agenda` (+ `/agenda/gira/{id}` e `/agenda/gira/{id}/ics`) so le giras
  ativas do tenant do `ctx`; formato unificado `{origem, id, tipo{nome, icone, cor}, titulo, inicio, fim,
  local, cancelada, minha_participacao}` que o AM-17 estende. Desde o AM-08 traz tambem as atividades internas
  visiveis ao medium (`/agenda/atividade/{id}` e `/ics`): nao excluida, `visibilidade = 'corrente'` e o tipo
  alcanca o medium (`elegiveis` todos · atendimento · cambones · grupos ATIVOS dele, por `EXISTS` filtrado por
  `ctx.medium.id`) — ou o medium tem participacao nela (AM-17: assim `convocados` chega a quem esta na escala).
  Cada item traz `minha_participacao` (AM-17, com o plano `atividades_corrente`). O tipo das giras
  e o tipo de sistema "Gira" da casa. `giras.orientacoes_corrente` (073) e dado SO da
  Area: nunca em `public/*`, site, e-mail ou bilhete (o consulente ve `recados`) — teste em
  `tests/integration_pg/test_am07_agenda.py`. Detalhe nunca devolve contagem/dado de consulente (so a
  situacao das senhas).
- **Chave PIX da mensalidade (AM-10, decisao D-05)**: `GET/PUT /admin/financeiro/config/pix`
  (`mensalidade_pix.py`, FINANCEIRO view/edit + `mensalidade_mediun`). A protecao especifica no lugar
  de `is_admin`: senha de quem altera no corpo (errada → 401 `INVALID_PASSWORD`; o front chama com
  `skipAutoLogout`), `require_not_impersonated`, limite 10/h por IP, auditoria `mensalidade_pix` com a
  chave antiga e a nova MASCARADAS (`pix_chave.mascarar_chave`; nunca a senha), e-mail
  (`templates/pix_chave_alterada.py`) a TODOS os admins ativos quando tipo/chave mudam, e
  `pix_alterado_em` (a Area mostra "Chave alterada em dd/mm" por 30 dias — AM-11; o e-mail aos
  mediuns com acesso a Area — sem a chave, "confira na Area" — sai pelo agendador do AM-15). Chave inteira e previa do QR so para FINANCEIRO:edit; quem so ve recebe a
  mascarada. Validacao/normalizacao no formato do DICT em `services/pix_chave.py` (CPF/CNPJ com DV,
  CNPJ alfanumerico incluso; e-mail minusculo; celular `+55DD9…`; EVP com hifens) e espelho em
  `frontend/src/lib/pixChave.ts`. BR Code estatico ("PIX copia e cola") so no servidor:
  `services/pix_brcode.build_static_brcode` (+ `txid_mensalidade`), testado contra os exemplos do
  Manual de Padroes para Iniciacao do Pix (BCB v2.10.0) — nunca montar o payload no front.
- **Mensalidade na Area (AM-11/AM-12, decisao D-25)**: `api/v1/medium/mensalidades.py` —
  `GET /medium/mensalidades`, `GET /medium/mensalidades/{AAAA-MM}/pix` e
  `POST /medium/mensalidades/{AAAA-MM}/comprovante`. Alem do `require_medium`, exigem o modulo
  "mensalidade" visivel (`require_modulo_mensalidade` → `area_medium_modulos`: casa ligou E plano
  efetivo com `mensalidade_mediun`; senao 403 neutro `MEDIUM_MODULO_INDISPONIVEL`). O mes `AAAA-MM`
  e o unico parametro. O medium NUNCA marca pago: o comprovante deixa o registro PENDENTE com
  `comprovante_enviado_em` ("em conferencia"); o envio e recusado sob impersonacao, limitado a
  20/h por IP, JPEG/PNG/WebP/PDF ate 2 MB conferido pelos bytes (`services/medium_mensalidade.
  validar_comprovante`) e auditado sem o arquivo (`mensalidade_comprovante_medium`). Status por mes
  = `services/medium_inicio.situacao_mensalidade` (a MESMA regra do Inicio); meses exibidos =
  `medium_mensalidade.meses_da_area`. Lado do painel (`admin/mensalidade_comprovantes.py`,
  FINANCEIRO + `mensalidade_mediun`): fila `GET .../mensalidades/comprovantes-para-conferir` (view),
  "Confirmar pagamento" = o POST de registro de sempre com PAGO (insert; espelha em contas a
  receber) e "Nao confirmar" = `PATCH .../mensalidades/{mediun_id}/{mes}/recusa` com motivo (edit).
- **Perfil do medium (AM-13)**: `api/v1/medium/perfil.py` — `GET/PATCH /medium/perfil`, `POST|DELETE /medium/perfil/foto`
  (DELETE = tirar a foto, AM-29: `auth/profile.clear_profile_photo`, sem foto → 200 sem auditoria),
  `POST /medium/perfil/senha`, `POST|DELETE /medium/perfil/email`; regras puras em `services/medium_perfil.py`. O medium
  edita telefone, endereco e nascimento (`mediuns`, so digitos como o painel), a foto e a senha da conta (helpers
  `auth/profile.read_profile_photo`/`set_profile_photo`/`apply_password_change`, os mesmos do perfil do painel: a troca de
  senha derruba TODAS as sessoes e apaga os cookies; senha atual errada → 400 `SENHA_INCORRETA`) e o e-mail de login.
  Nome, entrada, tipo e isencao vem em `casa` (travados); campo da casa ou desconhecido no PATCH → 422
  (`extra="forbid"`); a resposta e lista fechada (teste do schema). Toda escrita: `require_not_impersonated`, limite
  por IP e auditoria `medium_perfil` com `{acao: "medium atualizou o telefone", campos}` — nunca o valor. Troca de
  e-mail: pede a senha atual; `users.email_pendente` + sha256 do `token_urlsafe(32)` (24 h, uso unico; pedir de novo
  troca o link); e-mail unico no terreiro (conta excluida conta; 409 `EMAIL_EM_USO`); link so para o endereco NOVO
  (`/confirmar-email/{token}`, `templates/email_troca.py`, discreto); `POST /public/email/confirmar` (busca raiz
  isenta em `EXEMPT_PUBLIC_QUERIES`) troca `users.email`, espelha em `mediuns.email`, invalida o reset de senha
  pendente, audita sem enderecos e avisa o endereco antigo (novo mascarado). Sessoes continuam (a senha nao mudou).
- **Presenca (AM-17/AM-28)**: `api/v1/medium/presencas.py` — `POST /medium/atividades/{origem}/{id}/resposta`
  (vou/nao vou; motivo obrigatorio quando o tipo exige; ate o inicio), `.../checkin` ("Cheguei": modo `app` na
  janela do tipo; modo `qr` com o codigo do QR do dia conferido no servidor para AQUELA atividade e janela;
  modo `confianca` → 409; 60/min por IP), `.../justificativa` ("Conte o motivo" depois de ausente, ate o prazo
  da casa) e `GET /medium/presencas`. Todas com `require_plan_feature("atividades_corrente")`; escritas com
  `require_not_impersonated`; so a propria linha (`AtividadeParticipacao.medium_id == ctx.medium.id`, modo
  "medium" do auditor). `origem = gira` usa o id da gira e cria a ancora (`atividade_da_gira`). Atividade
  `convocados` aparece para quem tem participacao (`presencas.atividade_visivel_ao_medium`, usada tambem pela
  Agenda). Regras em `services/presenca.py` (situacao derivada, convocacao virtual dos elegiveis
  materializada no encerramento, janela, prazo, QR por HMAC de 60 s sem tabela, `upsert_participacao` com
  `INSERT ... ON CONFLICT DO NOTHING` + `FOR UPDATE` — a unica (`atividade_id`, `medium_id`) segura a corrida
  "Cheguei" × chamada). Justificativa (pode ter dado de saude, §6.8 do plano) ≤ 500, so com `ESCALAS:view`,
  nunca em auditoria (`medium_presenca`/`atividade_chamada` gravam so a acao/ids), e-mail, push ou exportacao.
  Encerramento automatico em 48 h: `services/presenca_scheduler.py` (chave `0x6769726168756204`, §11.9).
- **Assiduidade (AM-26)**: `services/assiduidade.py` — percentual = presentes ÷ convocacoes de atividades com a
  chamada ENCERRADA, sem dispensados/substituidos/cancelados (a mesma regra do "Minhas presencas"); "sem chamada"
  (ja comecou, chamada aberta), avulso (`convocado = false`) e futuras ficam fora da conta. Uma regra so
  (`categoria`, testada sem banco) aplicada a um `GROUP BY` dos fatos de cada linha. Por grupo = membros ATUAIS.
  Justificativa so no detalhe por medium (ESCALAS:view, tela); PDF, CSV, e-mail e auditoria nunca.
- **Lembretes e avisos por e-mail (AM-15)**: `services/medium_lembrete_scheduler.py` (chave `0x6769726168756206`,
  §11.9; regras e consultas em `services/medium_lembretes.py`, textos em
  `services/email/templates/medium_lembretes.py`). So terreiro com a chave do piloto + plano `area_medium` + Area
  ligada pela casa; lembrete de escala (funcao/rodizio/faxina planejada) so com `escalas`, os demais de atividade
  com `atividades_corrente`, mensalidade com o modulo visivel e `area_medium_lembrete_mensalidade` (D-29: D-3 e
  D+3, mes em aberto sem comprovante). Destinatario = medium ativo com vinculo a conta ativa com e-mail. Marca
  `medium_lembretes_enviados` gravada ANTES do envio (`INSERT ... ON CONFLICT DO NOTHING RETURNING`, indice unico
  parcial; commit e so depois enfileira) — uma vez so mesmo com 2 workers. Textos discretos (§6.8 do plano):
  assunto/previa so com o nome do terreiro, nunca o nome da atividade/aviso; o texto do motivo de ausencia nunca
  e lido (`justificativa IS NOT NULL`). Rotas: `GET/PUT /medium/preferencias` (`require_medium`; PUT com
  `require_not_impersonated`, auditoria `medium_perfil` so com os tipos) e publicas `POST
  /public/avisos-email/consultar|desligar` (token `medium_preferencias.token_descadastro` = busca raiz; 404
  generico `LINK_INVALIDO`). Painel: `avisar_email` no aviso (COMUNICADOS insert/edit, mesmo corpo) e
  `lembretes.mensalidade` na config da Area (CONFIGURACOES edit).
- **Notificacao no celular (AM-16, Web Push/VAPID)**: rotas `GET /medium/push`, `POST|DELETE /medium/push/inscricao`,
  `PUT /medium/push/preferencias`, `POST /medium/push/teste` (`api/v1/medium/push.py`; `require_medium`; escritas
  com `require_not_impersonated`; tudo filtrado por `ctx.tenant_id` + `ctx.medium.id` + `ctx.user.id`). Sem
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` o push fica desligado sem erro
  (`services/web_push.disponivel()`: GET diz `disponivel: false`, ligar/testar 409 `PUSH_INDISPONIVEL`, agendador
  so e-mail). O `endpoint` so e aceito de servico de push conhecido (`HOSTS_PUSH`: FCM, Mozilla, WNS, Apple — o
  servidor faz POST nele; nada de URL interna/SSRF); o mesmo endpoint inscrito por outra conta passa a ser dela
  (`ON CONFLICT (endpoint) DO UPDATE`). Envio pelo agendador do AM-15 (mesma marca, §11.9) so para inscricoes do
  usuario HOJE ligado ao medium (`Medium.user_id == PushInscricao.user_id`); texto discreto em
  `services/medium_push.py` (sem nome de atividade/aviso, valor, motivo); 404/410 apagam a inscricao, outras
  falhas somam `failures` (5 seguidas apagam).
- **Meus dados e privacidade (AM-14)**: `api/v1/medium/meus_dados.py` — `GET /medium/meus-dados/exportar` (JSON com
  cadastro SEM os campos internos — `observacoes`, `data_saida`, `registrado_por`, observacao do pagamento —, conta,
  consentimento (aceite e revogacao), grupos, avisos por e-mail, mensalidades com metadados do comprovante (nunca os
  bytes: colunas explicitas), avisos lidos e participacoes com o motivo que o PROPRIO medium contou; so
  `ctx.tenant_id` + `ctx.medium.id`) e `POST /medium/meus-dados/encerrar` (`{senha}`; errada → 400
  `SENHA_INCORRETA`, nunca 401). Encerrar grava `mediuns.area_consentimento_revogado_em/_versao` (o aceite fica
  como historico), desliga `aniversario_visivel` e chama `medium_convite.tirar_acesso` (mesma regra do D-08: conta
  `medium` pura desativada + `sessions_revoked_at` + `end_all_sessions` + `clear_auth_cookies`; operador/admin so
  perde a Area). Cadastro e dados ficam com a casa (controlador). Auditoria `Medium` so com ids/versoes
  (`acesso_area: encerrado_pelo_medium`) e e-mail aos admins ATIVOS (`medium_lembretes.emails_dos_admins`,
  `templates/medium_acesso_encerrado.py`, so o primeiro nome). As duas rotas com `require_not_impersonated`. O
  convite de novo (AM-03) reativa a conta `medium` e grava um aceite novo.
- **Aniversariantes (AM-20)**: opt-in `mediuns.aniversario_visivel` (padrao `false`) por `PUT /medium/perfil/aniversario`
  `{mostrar}` (sem `data_nascimento` → 422; impersonacao → 403; auditoria `medium_perfil`); `GET /medium/perfil`
  devolve `mostrar_aniversario`. `GET /medium/inicio` ganha `aniversariantes` (ativos, com vinculo `user_id`, com o
  opt-in, da MESMA casa, aniversario de segunda a domingo em Brasilia; so `{primeiro_nome, dia, mes, hoje, sou_eu}`,
  nunca o ano nem o id — leitura de outros mediuns isenta em `EXEMPT_MEDIUM_QUERIES` com justificativa) e
  `meu_aniversario` (`{mensagem}` so no dia do PROPRIO aniversario, sem opt-in). Regras puras em
  `services/medium_aniversarios.py` (29/02 vira 01/03 fora do bissexto, semana que cruza o ano). Mensagem da casa:
  `tenant_configs.area_medium_aniversario_mensagem` (≤ 200, texto simples, `{nome}` = primeiro nome; vazio = "A
  <terreiro> deseja um feliz aniversario, <primeiro nome>! Axe!") em `aniversario_mensagem` da config da Area
  (CONFIGURACOES edit).
- **Minha caminhada (AM-19)**: `api/v1/medium/ficha.py` — `GET /medium/ficha` (so campos `visivel_ao_medium`
  nao arquivados com o valor do PROPRIO medium, marcos `visivel_ao_medium` e o estado da autorizacao; sem
  autorizacao em vigor devolve listas vazias), `POST|DELETE /medium/ficha/consentimento` (autoriza/retira; retirar
  deixa os dados inacessiveis e manda e-mail discreto — sem nome do medium nem dado da ficha — a todos os admins
  ativos; a direcao apaga em "Apagar dados") e `POST /medium/ficha/sugestoes` (so campo visivel com
  `medium_pode_sugerir`; vira `ficha_sugestoes` pendente — uma por campo, sugerir de novo troca — e so entra na ficha
  quando a direcao aceita). Alem do `require_medium`, `require_ficha_na_area` exige o plano `ficha_espiritual` (403
  neutro `MEDIUM_MODULO_INDISPONIVEL`); `GET /medium/me` devolve `ficha` (bool) para o Perfil mostrar a entrada.
  Escritas com `require_not_impersonated` e limite por IP; auditoria `medium_ficha` so com a acao e ids. Tela
  `/medium/caminhada` (aberta pelo Perfil)
- Consulta de "qualquer usuario do terreiro" exclui `role = medium`: contato principal
  (`trial_scheduler.get_tenant_primary_contact`, `webhooks._get_tenant_primary_contact`), contagem de
  usuarios (`subscription_info`, dashboard e billing da plataforma).

Para nova feature sem equivalente existente:
1. Adicionar valor ao enum `PermissionFeature` em `backend/src/models/permission_groups.py`.
2. Criar migracao Alembic para adicionar o valor ao tipo ENUM no banco (`ALTER TYPE ... ADD VALUE`, dentro de
   `op.get_context().autocommit_block()` — o `env.py` roda tudo numa transacao so e o Postgres nao deixa usar o
   valor novo antes do commit) e uma SEGUNDA migracao que da o acesso (grupos padrao "Acesso total" ou, quando a
   feature sai de outra, copia as linhas da feature de origem — ex.: `061_permissao_site_enum` +
   `062_permissao_site_copia`). Valor de ENUM nao sai no downgrade (o Postgres nao tem `DROP VALUE`).
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
- [ ] Rota da Area do Medium: no `medium_router` (`require_medium`), sem `medium_id` da requisicao; rota admin: no `admin_router` (`require_backoffice`).

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
  em qualquer plano), exportacao CSV (`export_csv`: CSV da gira e da posicao de estoque) e ficha espiritual
  (`ficha_espiritual`, router `admin/ficha_espiritual.py`; na Area, `require_ficha_na_area` com 403 neutro).
  Area do Medium (`area_medium`, Basic+): checada pelo `require_medium` em todo `/api/v1/medium/*`
  e no calculo de `areas` (AM-02). Atividades da casa (`atividades_corrente`, Basic+): router
  `admin/atividades.py` e `admin/atividades_presenca.py`, junto com `area_medium` (AM-08/AM-17); na Area,
  rota a rota em `medium/presencas.py` (resposta, checkin, justificativa, presencas) — Agenda/Inicio so
  trazem `minha_participacao`/`escalas` com o plano (sem ele, null/vazio).
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
- **Basic+**: `mediuns`, `relatorio_gira`, `mensalidade_mediun`, `area_medium` (Area do Medium,
  AM-02 — decisao D-01 de 2026-10-07; por ora fora do quadro: esta em `UNSOLD_FEATURES` ate o texto
  de venda sair do estudo de UX AM-00/AM-24), `atividades_corrente` (atividades da casa, tipos, presenca —
  AM-08, decisao D-10; tambem em `UNSOLD_FEATURES` no piloto).
- **Pro+**: `email_transacional`, `tema_personalizado` (no quadro: "Personalizacao da plataforma"),
  `analytics_basico`, `export_csv` (fora do quadro), `auditoria`, `site_builder` (site e cursos), `escalas`
  (planejador da faxina, escala de gira por funcao — AM-25/AM-18, decisao D-02; catalogo criado no AM-08; primeira
  rota no AM-18, `atividades_escala.py`; fora do quadro no piloto), `biblioteca_medium` (estudos e documentos da
  casa na Area — AM-21, decisao D-02; em `UNSOLD_FEATURES` no piloto), `ficha_espiritual` (ficha espiritual e caminhada
  do medium — F-05/AM-19, decisao de 2026-10-08; no quadro, grupo "Pessoas"; na Area vale junto com `area_medium`).
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
- `user_role`: super_admin, admin, operator, medium (`medium` desde a 063, AM-02)
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
- Modo TV/Kiosk fullscreen em `porta/kiosk.tsx` (mesmo polling; gate `porta:view` na tela). Sem
  `?gira=` usa `pickTodayGira`. Privacidade (T-04): a TV e publica na sala de espera, entao le SO
  `GET /giras/{id}/door/tv` (PORTA:view, sem gate de plano; gira de outro tenant → 404) — numero
  formatado, nome reduzido NO SERVIDOR (`nome_para_tv`: "Maria S."), proximas 3 senhas e a ultima
  chamada (`chamado_em`). Nunca e-mail, telefone, nome completo nem ids; nao usar `/door/queue` na TV.
  A ordem e a mesma da fila da Porta (`_ordenar_fila` em `door_control.py`).
- Sugestoes de medium/cambone no AttendModal (T-05): `GET /door/mediuns-options` (PORTA:view; so
  `id` + `nome` dos ativos do tenant; `only_atendimento=true` padrao = mediuns de atendimento,
  `false` = todos os ativos para cambone). O porteiro sem MEDIUNS nao cai mais no texto livre;
  erro real vira toast (sem catch silencioso). `/mediuns/options` segue so com MEDIUNS:view.
- Aviso sonoro: base = primeira fila carregada de cada gira (nao toca ao abrir nem ao trocar de gira).
- Modais: AttendModal, WalkInModal. Editar "sem senha" com `priority_category: null` tira a prioridade
  (campo omitido mantem a atual).

### 11.4.1 Senhas (tickets)
- Busca no servidor: `GET /giras/{id}/tickets?search=` (numero exato "42"/"0042"/"#42", "P001" =
  associado, ou trecho de nome/e-mail). Resposta traz `numero_formatado` (P001/0001).
- Rastreio/reenvio de e-mail so para admin (`email_resend.py` exige `is_admin`).
- "Exportar PDF" (substituiu o "Exportar CSV" em out/2026): `GET /giras/{id}/export-listagem`
  (JSON com rotulos e horarios de Brasilia prontos; 404 se a gira nao e do tenant) com
  `require_plan_feature("export_csv")` + TICKETS ou RELATORIO_GIRA (view); o botao segue o mesmo
  plano. O PDF (A4 paisagem, listagem completa) e montado no navegador em
  `lib/pdf/listagemSenhasPdf.ts`.
- PDFs com tabela (`frontend/src/lib/pdf/`): jsPDF + jspdf-autotable, texto de verdade com quebra
  de linha e de pagina automaticas. **Nunca tabela via html2canvas**: a "foto" do HTML cortava o
  texto das celulas com `-webkit-line-clamp` e exigia limite fixo de linhas por pagina (bug do
  Relatorio da gira, out/2026). html2canvas so para a pagina de resumo/graficos do relatorio.
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
- Head atual: `089_ficha_espiritual` (2026-10-08, F-05/AM-19: `ficha_campos`, `ficha_valores`, `medium_marcos`,
  `ficha_sugestoes` (indice unico parcial de pendente por medium + campo) e `mediuns.consentimento_dado_religioso_em/
  _por/_versao/_revogado_em`; SEM acesso nos grupos padrao — excecao consciente, §3.3), apos `088_permissao_ficha_enum`
  (`ALTER TYPE permission_feature ADD VALUE 'ficha_espiritual'` num `autocommit_block()`), apos `087_materiais_corrente` (2026-10-08, AM-21: `materiais_corrente` + `material_grupos` — estudos e
  documentos da casa por publico, CHECK de link http(s)), apos `086_trocas_escala` (2026-10-08, AM-27: `participacao_trocas` — uma aberta por participacao,
  indice unico parcial —, `atividade_participacoes.justificativa_avaliacao/_avaliada_em/_avaliada_por` e origem
  `troca`, `tenant_configs.escala_troca_exige_aprovacao`, `medium_preferencias.mostrar_nome_colegas`, tipos
  `troca_*` em `medium_lembretes_enviados`), apos `085_assinatura_boleto` (2026-10-08, $-04: `subscriptions.collection_method`,
  `pending_stripe_subscription_id` (unico), `pending_invoice_id/_url/_due_at` — assinatura do plano paga por
  fatura/boleto), apos `084_parceiros` (2026-10-08, C-06: tabela da plataforma `parceiro_interesses` — pedidos do
  Programa de Parceiros, sem `tenant_id`, `ip_hash` HMAC, CHECK de `tipo`/`status`), apos
  `083_meus_dados_aniversarios` (2026-10-08, AM-14/AM-20: `mediuns.area_consentimento_revogado_em`/
  `_versao`, `mediuns.aniversario_visivel` (padrao `false`) e `tenant_configs.area_medium_aniversario_mensagem`
  (String 200)), apos `082_push_inscricoes` (2026-10-08, AM-16: tabela `push_inscricoes` — endpoint unico, chaves
  `p256dh`/`auth`, `user_agent` curto, `last_success_at`, `failures`, FKs CASCADE para tenant/usuario/medium — e
  `medium_preferencias.push_<tipo>` (5 booleanos, padrao true)), apos `081_lembretes` (2026-10-08, AM-15: `medium_preferencias`, `medium_lembretes_enviados` com
  indices unicos parciais, `tenant_configs.area_medium_lembrete_mensalidade`, `comunicados.avisar_email`/
  `avisar_email_em`; criada sobre a 079 e re-encadeada depois da 080 no merge), apos `080_escala_planos` (2026-10-08, AM-25: `escala_planos` — um por tipo e mes, rascunho/publicado,
  unico por `tenant_id, tipo_id, mes` — e `escala_plano_dias` — data x grupo x horario, `atividade_id` FK SET NULL,
  `removido`; `atividades.escala_plano_dia_id` segue sem FK de proposito; criada em paralelo com 081/082 a partir da
  079 e pode ser reencadeada no merge), apos `079_presenca` (2026-10-08, AM-17/AM-28: `atividade_participacoes` — unica por atividade +
  medium —, `tenant_configs.presenca_modo_padrao`/`presenca_prazo_justificativa_dias`,
  `atividade_tipos.presenca_modo`; tipo com `checkin_pelo_medium` vira modo `app`), apos `078_atividades`
  (2026-10-08, AM-08: `atividade_tipos`, `atividade_tipo_grupos`,
  `funcoes_corrente`, `atividades`, os 8 tipos e as funcoes sugeridos para todo terreiro e acesso total a
  `escalas` nos grupos padrao), apos `077_permissao_escalas_enum` (`ALTER TYPE permission_feature ADD VALUE
  'escalas'`, sozinha num `autocommit_block()`; criada depois da 075 e reencadeada na 076 no merge), apos
  `076_medium_email_pendente` (2026-10-08, AM-13: `users.email_pendente`, `email_pendente_token_hash`
  (indice unico `uq_users_email_pendente_token_hash`) e `email_pendente_expira_em` — troca do e-mail de login com
  confirmacao no endereco novo; criada como 074 e renumerada no merge), apos `075_corrente_grupos` (2026-10-08, AM-23:
  `corrente_grupos`, `corrente_grupo_membros`, `comunicado_grupos` e `grupos` no CHECK `ck_comunicados_publico`), apos
  `073_giras_orientacoes_corrente` (2026-10-07, AM-07: `giras.orientacoes_corrente`, so na Area do
  Medium), apos `072_mensalidade_comprovante_medium` (2026-10-07, AM-11/AM-12: `comprovante_enviado_em/_por`,
  `recusa_motivo`, `recusado_em` e o indice parcial `ix_mensalidade_pagamentos_conferir` em
  `mensalidade_pagamentos`), apos `071_comunicados` (2026-10-07, AM-09: tabelas `comunicados` e `comunicado_leituras`
  + acesso total a `comunicados` nos grupos padrao), apos `070_permissao_comunicados_enum` (`ALTER TYPE
  permission_feature ADD VALUE 'comunicados'`, sozinha num `autocommit_block()`), apos `068_area_medium_config_pix`
  (2026-10-07, AM-10: colunas `area_medium_*` em `tenant_configs` e `pix_*` em `mensalidade_configs`), apos
  `067_medium_convites` (2026-10-07, AM-03: tabela `medium_convites` —
  convite da casa para a Area do Medium, token sha256 unico, 7 dias, um convite em aberto por medium), apos
  `066_tenant_area_medium` (2026-10-07: `tenants.area_medium_liberada`, chave do piloto da Area do
  Medium), apos `065_mediuns_user_id` (2026-10-07, AM-02: `mediuns.user_id` FK `users.id` ON DELETE
  SET NULL + unico parcial `uq_mediuns_user_id_ativo` e `area_consentimento_em/_versao`), apos
  `064_user_role_medium` (`ALTER TYPE user_role ADD VALUE 'medium'`, sozinha num
  `autocommit_block()`), `063_legal_acceptances` (aceite dos Termos/Privacidade), `062_permissao_site_copia`/`061_permissao_site_enum` (T-06) e
  `060_usuarios_ilimitados` (so dados: `max_users` = 99999 em todas as assinaturas).
- Historico com 4 merge revisions (010, 030, 037, d9fafadd9261) — prefixos numericos ja
  colidiram 3x (009, 028, 030). Por isso a regra do §4.3: `alembic heads` ANTES de criar
  qualquer migracao nova.
- Migracoes corretivas notaveis (post-mortems nos docstrings): 044b (largura de
  alembic_version.version_num — banco zerado quebrava no upgrade), 052 (dedup de consulentes +
  unique parcial por tenant+email), 054 (purga de time slots soft-deletados que colidiam na
  unique), 058 (e-mail de associado unico so entre ativos — recadastrar excluido dava 500).

### 11.10 Financeiro — Controle de Mensalidade de Mediuns (branch 002-financeiro-mensalidade)
- **Feature Basic+**: `mensalidade_mediun` foi PRO+ de 2026-06-27 ate a reestruturacao de out/2026, quando passou a ser Basic+ (a de associados e Premium; ver §3.4). Endpoints usam `require_plan_feature("mensalidade_mediun")`; config e relatorio ficam nesse gate e a parte de associados so vale com `mensalidade_associado` no plano.
- **Modelos**: `MensalidadeConfig` (valor_mensal, dia_vencimento, 1:1 tenant), `MensalidadePagamento` (UNIQUE mediun_id+mes, BYTEA comprovante), `MensalidadeStatus` enum (PENDENTE/PAGO/ISENTO).
- **Endpoints** (prefixo `/api/v1/admin/financeiro`): config GET/PUT, mensalidades GET/POST por mes, comprovante GET/DELETE, resumo GET (6 hist + 3 proj), relatorio POST enviar / GET download. Associados espelham em `/associados*`.
- **Regras de acesso** (desde 2026-10-06): so `require_group_permission(FINANCEIRO, ...)` + gate de plano — nao ha mais checagem de perfil ADMIN (`_require_admin` removido; contradizia o grupo). Registrar/editar pagamento e POST (upsert) → acao `insert`; a tela mostra "Registrar"/lote so com `canGroup('financeiro','insert')`. PUT config → `edit`.
- **Mes de referencia (mediuns)**: entra quem estava na casa em algum dia do mes (`data_entrada` <= fim do mes ou nula E ativo ou `data_saida` >= inicio do mes) e quem ja tem registro de pagamento no mes. Associados nao tem datas: todos os nao excluidos.
- **Registro**: `valor_vigente` e capturado no PRIMEIRO registro do mes e nao muda em edicoes; `observacao` so muda quando o formulario envia o campo (vazio limpa; o lote "Marcar como pago" nao envia). O lote so seleciona linhas pendentes/inadimplentes.
- **Espelho em contas a receber** (`services/mensalidade_contas_service.py`, `external_ref = mensalidade:{mediun|associado}:{id}:{YYYY-MM}`): PAGO grava `valor_pago` informado (sem ele, o vigente); PENDENTE → pendente/vencido; ISENTO cancela a conta do mes. Cadastro de medium/associado (nao isento) cria a conta do mes seguinte; inativar (referencia = `data_saida`), excluir ou marcar `mensalidade_isento` cancela as contas pendentes dos meses seguintes. Datas de "hoje" via `core.tz.today_local()` (Brasilia). Nos Lancamentos essas contas sao somente leitura: PUT/baixa/DELETE → 409 e a listagem traz `origem_mensalidade: true` (a tela mostra "Editar em Mensalidades").
- **Isencao permanente**: `mensalidade_isento` em Medium/Associado e editavel nos dois cadastros (switch "Isento de mensalidade"); isento nao gera conta e nao entra no esperado/inadimplentes.
- **Config**: `enable_mensalidade_associado` e ligado so em Financeiro → Configuracao → Mensalidade (saiu de Configuracoes). `email_relatorio_ativo` nao tem mais toggle na tela (nenhum job lia e nao havia botao de envio); a coluna continua e `POST /relatorio/enviar` nao depende mais dela.
- **Chave PIX (AM-10)**: `mensalidade_configs.pix_*` (067) — tipo, chave (formato do DICT), nome do recebedor (≤ 25), cidade (≤ 15), instrucoes e `pix_alterado_em`. Endpoint proprio `PUT /financeiro/config/pix` com senha + e-mail aos admins + auditoria mascarada (detalhes em §3.3, Area do Medium); o PUT `/financeiro/config` nao toca nesses campos. Tela: card "Chave PIX da mensalidade" (`components/financeiro/PixConfigCard.tsx`) na aba Mensalidade de `/admin/financeiro/config`, com previa do QR (`qrcode.react`) do BR Code gerado no servidor e copia-e-cola.
- **Comprovante**: BYTEA no banco, limite 5MB pelo painel (2 MB pela Area do Medium), tipos aceitos: jpeg/png/webp/pdf.
- **Comprovante enviado pelo medium (AM-11/AM-12, migracao 072)**: o medium envia pela Area e o registro do mes
  fica PENDENTE com `comprovante_enviado_em/_por` (sem valor novo no ENUM; `valor_vigente` capturado no 1o
  registro, como no painel). "Em conferencia" = pendente + enviado + arquivo guardado + sem recusa depois do
  envio (`medium_mensalidade.comprovante_para_conferir`; a lista do mes devolve `comprovante_para_conferir`).
  Na tela, so com `can('area_medium')` (sem a Area ela fica como antes): KPI e fila "Comprovantes para conferir"
  (`components/financeiro/ComprovantesParaConferir`, todos os meses), selo/filtro "Comprovante enviado" e botao
  "Conferir" no `CobrancaMensal` (prop `onConferir`), sheet de conferencia com o comprovante (rota de download
  existente): "Confirmar pagamento" (POST de registro com PAGO, valor esperado e a data do envio — espelha em
  contas a receber; o arquivo do medium fica) e "Nao confirmar" (motivos rapidos + texto → `PATCH .../recusa`,
  FINANCEIRO edit). O medium ve o motivo e pode reenviar (o reenvio limpa a recusa). Desde o AM-15 o resumo
  diario aos admins (8 h, um por terreiro, so contagens) traz quantos comprovantes esperam conferencia.
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
- **Assinatura por boleto ($-04, 2026-10-08)**: em `/admin/billing` o admin escolhe "Cartão de crédito"
  (Checkout, só `card`, renovação automática) ou "Boleto bancário" (`POST /billing/subscribe-invoice`:
  assinatura Stripe `collection_method=send_invoice`, fatura por e-mail todo mês, `days_until_due` =
  `STRIPE_INVOICE_DAYS_UNTIL_DUE` (5), formas em `STRIPE_INVOICE_PAYMENT_METHODS` ("boleto")). Regras:
  (1) o plano só é liberado no `invoice.paid` — antes disso a assinatura fica em
  `pending_stripe_subscription_id`, NUNCA em `stripe_subscription_id` (acesso, MRR, trial_scheduler e
  desativação continuam lendo só o vínculo pago); (2) boleto vencido / `invoice.payment_failed` de fatura
  `send_invoice` não é inadimplência (não suspende nem rebaixa trial); quem suspende é `invoice.overdue` ou a
  assinatura `past_due`, e o `invoice.paid` reativa; (3) `checkout.session.completed` com
  `payment_status=unpaid` não libera nada (libera o `async_payment_succeeded`); (4) `subscription.created/
  updated` de assinatura não ligada que seja `send_invoice` ou `incomplete` é ignorado; (5) o painel mostra
  "Aguardando pagamento" + "Pagar agora" (`pending_invoice_url`, gravado no endpoint e no `invoice.finalized`)
  e "Cancelar pedido" (o `/billing/cancel` com pedido pendente cancela na hora e anula a fatura).
  **Pix**: conta Stripe do Brasil não tem Pix em assinatura/fatura (Pix só avulso, sob convite; Pix
  Automático indisponível no BR — docs.stripe.com/payments/pix). O rótulo "PIX ou boleto" só aparece se
  `pix` entrar em `STRIPE_INVOICE_PAYMENT_METHODS`; nunca escrever "PIX" fixo na tela. O que ligar no
  Dashboard da Stripe está em docs/deployment.md (Stripe).
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
- **Meu Site — permissao propria (T-06)**: `sites.py` (inclusive imagens e historico) usa `PermissionFeature.SITE`
  ("Site do terreiro" na matriz de perfis, area Cadastros) + plano `site_builder`; Cursos segue em
  `CURSOS_PRESENCIAIS`. No front: `canGroup('site', ...)` em `pages/admin/meu-site.tsx`, item "Site do terreiro" do
  `navConfig`, `getFeatureForPath('/admin/meu-site')` e passos "site"/"publicar" do onboarding. Na virada, todo
  grupo ganhou `site` igual ao que tinha em `cursos_presenciais` (ninguem perdeu nem ganhou acesso); dali em diante
  as duas sao independentes.
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
  A reativação (e o login quando não há conta ativa) usa `login.user_by_login_email_stmt`: se o e-mail existir em
  mais de um terreiro, ganha a conta ativa (usuário ativo, terreiro sem `self_deactivated_at`) e, entre
  elas, a mais antiga — conta inativa só quando não há ativa (terreiro de teste desativado não "rouba"
  o login do médium/operador de outro terreiro). Desde o AM-05 o login e o esqueci a senha olham todas as contas
  ativas (escolha do terreiro no login, um link por terreiro no e-mail — §3.2); a regra de conta única ficou para a
  reativação e para o login sem nenhuma conta ativa. Cadastro valida a senha com `validate_password_policy`;
  e-mail com conta ativa em outro terreiro só entra confirmando a senha dessa conta (`conta_existente`, desde
  2026-10-08 — §3.2), e e-mail só com conta inativa/terreiro desativado segue recusado (409).
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
  passo 1; 422 → campo do `loc`; `detail.error_code` → campo do `CODE_FIELD`: `EMAIL_JA_TEM_CONTA` liga o modo
  "Senha da sua conta GiraHub" no passo Acesso, `SENHA_CONTA_INCORRETA` → senha, `LIMITE_CONTAS_EMAIL` → e-mail). Payload igual (`buildOnboardingPayload`). Evento `signup_step_completed
  {passo, etapa}` a cada passo, além do `signup_completed`.
- **Passagem marketing ⇄ conta** (`lib/passagem.ts` + `components/shared/PassagemDeEntrada`, no `_app`):
  desenho da entrada do ATRAIR — a marca voa entre as páginas (`.marca-girahub` = `view-transition-name`), na
  ida o escuro recua até o painel (5/12) com o fio dourado e o formulário surge; na volta (marca, "Voltar ao
  site", voltar do navegador via `router.beforePopState`) o escuro avança e só então a landing entra. Só age
  entre `/`, `/planos` e as telas de conta; sem a View Transitions API, troca direta; com
  `prefers-reduced-motion`, nada é interceptado nem anima. Promessas da transição tratadas (cancelamento
  não vira erro).

### 11.23 Área do Médium — identidade, convite, configuração, escolha de área, casca, Início, Avisos, Mensalidade, Agenda, Grupos da corrente, Perfil, Atividades da casa, Presença, assiduidade, ajustes do piloto, Escala de faxina, lembretes por e-mail, notificação no celular, Escala de gira, divulgação, Meus dados, aniversariantes, troca na escala, Estudos e Minha caminhada (AM-02/03/04/05/06/07/08/09/10/11/12/13/14/15/16/17/18/19/20/21/23/24/25/26/27/28/29 + F-05, 2026-10-08)
Plano completo em `docs/plano-area-do-medium.md` (cards AM-00 a AM-28). Lançamento em piloto: tudo desligado sem a chave `area_medium_liberada` (§3.3).
- **Identidade**: uma pessoa = um `User` por terreiro. O acesso à Área vem do vínculo
  `mediuns.user_id → users.id` (migração 065), não do papel. Papel `medium` (064) só para quem não
  tem painel; operador/admin que é médium mantém o papel e ganha a Área pelo vínculo. O vínculo só
  nasce no aceite do convite (AM-03) — o admin nunca liga conta a médium; até lá nenhuma linha tem
  `user_id`. `area_consentimento_em/_versao` (LGPD art. 11) também são gravados no aceite.
- **Guards** (§3.2/§3.3): `require_backoffice` no `admin_router`; `require_medium` + `MediumContext` no
  `medium_router`; `require_not_impersonated` para as escritas da Área (cards seguintes).
- **API**: só `GET /api/v1/medium/me` (nome, foto da conta, terreiro, marca — o mesmo subconjunto
  público do branding —, `areas`, `modulos`, `boas_vindas` e `whatsapp_casa` da config da Área, AM-10). `areas` também em `/auth/me`,
  `/auth/profile` e no login (front só tipou `UserAreas` em `useProfile.tsx`; quem decide a rota
  pela área é o AM-04).
- **Plano**: `area_medium` Basic+ no catálogo e no espelho `constants/plans.ts` (fora do quadro do painel; no comparativo público só com a chave do AM-24).
- **Escolha de área (AM-04)**: `services/authSession.completeLogin` guarda o `user` COM as `areas`
  e manda pela tabela do plano §6.4 (`lib/areas.routeAfterLogin`): super admin → `/platform`; só
  painel → `/admin/dashboard`; só médium → `/medium`; as duas → escolha lembrada
  (`girahub:area:{userId}` no localStorage, try/catch) ou `/escolher-area` (dois cartões, "Lembrar
  minha escolha neste aparelho" marcado); nenhuma → `/medium`, que mostra o aviso neutro "A Área do
  Médium não está disponível agora. Fale com a direção da casa." (sem oferta de plano). "Trocar de
  área" no menu do perfil do `AdminTopbar` (só com `areas.medium`) e no menu/Perfil da Área (só com
  `areas.admin`): mesma sessão, só muda a rota, atualiza a escolha lembrada se houver. Evento
  `area_escolhida {area, lembrada, origem}`. `/login` tem "Recebi um convite da casa" (o primeiro
  acesso é pelo link do convite). `escolher-area` está em `RESERVED_SLUGS`.
- **Médium puro nunca chama `/api/v1/admin/*`**: `hooks/useAdminDataEnabled` faz
  `SubscriptionProvider`, `PermissionsProvider`, `BirthdayProvider` e o branding do
  `TenantAwareThemeProvider` só buscarem em rota `/admin/*` e quando a conta tem o painel (rota via
  `next/compat/router`; conta = perfil ou `user` guardado); o `api_client` ainda cancela
  (`CanceledError`, sem rede) qualquer `/api/v1/admin/*` de quem sabidamente não tem o painel
  (`lib/areas.knownWithoutAdminArea`, inclusive impersonando um `medium`); o `admin_layout`
  manda essa conta para `/medium` sem montar o painel.
- **Casca e Início (AM-06)**: `MediumProvider` (no `_app`) busca `GET /api/v1/medium/me` só em
  `/medium/*` e com `areas.medium`, e aplica a marca (`applyMediumBrand` = `applyBrand` +
  `applyTerraBrandText`); 403/402 → aviso neutro. `components/medium/MediumLayout` (toda página de
  `pages/medium/` usa — `scripts/audit-permission-guards.js` exige): cabeçalho com logo e nome do
  terreiro e linha da marca, menu "Menu" (Trocar de área, Sair = `services/authSession.logout`, que
  encerra só a impersonação quando há uma), barra inferior Início · Agenda · Avisos · Mensalidade ·
  Perfil (`z-40`, área segura, ícone + texto; aba de módulo — hoje a Mensalidade — some quando
  `modulos` do `/medium/me` não a traz, `visibleMediumTabs`), sempre clara (`useAreaClara`, §11.16), gate (sem sessão → login;
  só painel → painel). `GET /api/v1/medium/inicio` (`api/v1/medium/inicio.py`, regras puras em
  `services/medium_inicio.py`): `pendencias` já ordenadas (D-24: escala → mensalidade atrasada ou
  a até 5 dias do vencimento — antes disso vai para "Acompanhando", decisão do dono 07/10 → aviso novo (AM-09); escala desde o AM-17: `escalas` + pendência `escala`), `proxima_gira` (ativa, futura ou em
  andamento; só nome/horário/local e `orientacoes` = `giras.orientacoes_corrente`, AM-07), `mensalidade` do mês em
  Brasília (só com `mensalidade_mediun` e config ativa; regras do §11.10: isento/paga/pendente até
  o vencimento/atrasada depois; entrou depois do mês ou casa sem valor → null) e `avisos`
  `{nao_lidos, ultimos}` (AM-09; vazio com o módulo desligado). Telas: `/medium` (faixa clara `MediumFaixa` "Olá, <nome>",
  pendências, próxima gira com "O que levar" e "Ver detalhes da gira" — só com o módulo agenda —,
  "Acompanhando", EmptyState), `/medium/perfil` (Meus dados, Aniversário — AM-20 —, dados da casa, conta de acesso — AM-13 —, Meus dados e privacidade — AM-14 —, Ícone na tela inicial, Trocar de área, Sair). Não há mais telas
  provisórias ("Em breve"): Agenda, Avisos e Mensalidade saíram nos AM-07, AM-09 e AM-11.
- **Ícone na tela inicial (D-23)**: `public/manifest-medium.webmanifest` (`id` `/medium`,
  `start_url` `/medium?source=pwa`, ícones do GiraHub), linkado só pelo `MediumLayout`; o
  `_document` não põe o manifesto da Porta nas rotas `/medium/*`. No 1º acesso do aparelho abre o
  passo "Deixe a Área na tela inicial" (`InstallAreaSheet`: Android/iPhone, aviso de quem abriu no
  WhatsApp, prompt nativo quando o Chrome oferece; lembrado em `girahub:medium-instalar-visto`);
  também pelo Perfil. `sw.js` sem mudança (nunca cacheia `/api/*`).
- **Configuração da Área e chave PIX (AM-10)**: aba "Área do Médium" em `/admin/config`
  (`components/admin/AreaMediumConfigSection.tsx`, só com `can('area_medium')`, salva à parte) e card
  "Chave PIX da mensalidade" em Financeiro → Configuração → Mensalidade. Backend e regras em §3.3.
- **Convite (AM-03)**: tela Médiuns ganha a coluna "Acesso à Área" (Sem acesso · Convite enviado · Ativo),
  a ação "Acesso à Área" na linha (sheet `components/admin/mediuns/AcessoAreaSheet`: e-mail mascarado,
  mensagem pronta, "Enviar pelo WhatsApp" abre o `wa.me`, "Copiar link do convite", cancelar convite, tirar
  o acesso com `ConfirmDialog`) e "Convidar todos com e-mail (N)" — tudo só com `can('area_medium')` e
  `canGroup('mediuns','edit')` (no piloto não há PlanLocked: escondido). Página pública
  `pages/convite/[token].tsx` (`AuthShell`): logo e nome da casa, "Crie sua senha de acesso" (ou a senha
  do painel), consentimento + "Ler o termo"; no aceite já entra e vai para `/medium`. Backend em §3.3.
- **Mensalidade (AM-11/AM-12)**: `/medium/mensalidade` (`components/medium/mensalidade/*`): cartão do mês
  (valor em destaque, etiqueta, vencimento) com uma ação principal por situação — em aberto/atrasada → "Pagar com
  PIX" (+ "Já paguei: enviar comprovante"); "Aguardando a casa confirmar"; não confirmado → motivo + "Enviar outro
  comprovante" + "Falar com a casa" (WhatsApp da casa do `/medium/me`); paga; "Você é isento de mensalidade"; sem
  chave PIX → "Combine o pagamento com a casa". Depois: meses em aberto (tocar troca o cartão), "Quer pagar todo mês
  sem lembrar?" (Pix Agendado Recorrente) e meses anteriores. `PagarPixSheet`: copiar o PIX copia e cola
  (`navigator.clipboard`, plano B `execCommand`, e "toque e segure" se nada funcionar — navegador do WhatsApp),
  abrir o banco, enviar comprovante; QR (`qrcode.react`) e chave recolhidos; "A casa trocou a chave PIX em dd/mm"
  por 30 dias. `EnviarComprovanteSheet`: câmera ou foto/PDF, prévia, foto reduzida no navegador para JPEG
  (`prepararComprovante`, até 2 MB), erros com a próxima ação. Início: o botão da pendência é "Pagar com PIX"
  (`/medium/mensalidade?pagar=1` abre o sheet) só quando `mensalidade.pix_disponivel` (AM-29: a casa tem chave
  PIX; só o sim/não sai no `/medium/inicio`) — sem chave, "Ver mensalidade"; "não confirmado" vira pendência ("Ver o motivo"); em conferência
  fica em "Acompanhando". Backend e regras em §3.3 e §11.10.
- **Avisos (AM-09; "Avisos" na tela, D-16 — tabelas e API admin `comunicados`)**: migrações 070 (ENUM) e 071
  (tabelas + acesso total no grupo padrão). Painel `/admin/comunicados` (menu Corrente → "Avisos", só com
  `can('area_medium')` e `canGroup('comunicados','view')`; sem a feature → aviso neutro, sem PlanLocked): lista com
  "lido por N de M" (M = médiuns ativos do público com acesso à Área), `CrudDrawer` (Título, Texto, Para quem
  `todos|atendimento|cambones`, Fixar no topo, Publicar agora/Agendar — aviso já publicado não muda a data —,
  Sai do ar em), "Ver como o médium vê" (prévia `.medium-terra`), detalhe em Sheet com abas "Ainda não leram (N)" /
  "Leram (N)" e "Lembrar quem não leu" (mensagem pronta: copiar ou abrir o `wa.me`). Área: `/medium/avisos`
  (fixados primeiro, ponto de não lido, "Fixado") e `/medium/avisos/[id]` (abrir marca como lido — não envia
  impersonando — e atualiza o selo). Texto SIMPLES: o backend tira HTML/controle ao salvar
  (`services/comunicados.limpar_*`) e o front só renderiza nós de texto (`components/avisos/AvisoLeitura`,
  `lib/autolink`: só `http(s)://`/`www.` viram link, `rel=noopener noreferrer nofollow`). Barra inferior:
  aba de módulo fora de `me.modulos` some (`MEDIUM_TABS[].modulo`) e a aba Avisos tem selo com
  `me.avisos_nao_lidos`. Público "cambones" = `is_atendimento` falso; público "Grupos da corrente" (AM-23,
  abaixo) = `publico = 'grupos'` + `comunicado_grupos`. "Avisar por e-mail também" (AM-15): caixa no drawer
  (só com insert ao criar / edit ao editar), `avisar_email` no corpo; o agendador manda (abaixo).
- **Grupos da corrente (AM-23)**: migração `075_corrente_grupos` (§11.8; tabelas em `docs/database.md`), API
  `/api/v1/admin/corrente-grupos*` (MEDIUNS + `area_medium`, regras em §3.3 e `docs/api.md` §14). Cor = chave
  de paleta fechada (`ambar…grafite`, CHECK no banco) e o hex com contraste AA com branco em
  `constants/correnteGrupos.ts` (teste de contraste; chaves conferidas contra o backend). Painel:
  `/admin/mediuns/grupos` (menu Corrente → "Grupos da corrente" e botão "Grupos" na tela Médiuns, só com
  `can('area_medium')`; gates `mediuns` view/insert/edit/delete): cartões com cor, contagem e nomes,
  `CrudDrawer` (nome, cor sugerida = primeira livre, descrição, `MultiCombobox` de médiuns ativos), arquivar com
  `ConfirmDialog` e "Mostrar arquivados"/"Trazer de volta". Tela Médiuns: etiquetas dos grupos na linha e campo
  "Grupos" no drawer (só com MEDIUNS:edit e médium ativo; grava à parte em `PUT /corrente-grupos/mediuns/{id}`
  quando mudou — `components/admin/mediuns/GruposDoMedium.tsx`). Avisos: opção "Grupos da corrente" no "Para
  quem" com `MultiCombobox` de `/corrente-grupos/opcoes`, etiquetas na lista e "Só G1, G2" na descrição. Área:
  "Seu grupo: G2" no Perfil (`components/medium/MeusGrupos.tsx`, de `me.grupos`). Kit novo:
  `components/fields/MultiCombobox` e `components/grupos/GrupoChip`. Escalas, tipos de atividade e
  `atividade_tipo_grupos` usam estes grupos no AM-08/AM-25.
- **Agenda (AM-07)**: migração `073_giras_orientacoes_corrente` (`giras.orientacoes_corrente`, Text). Painel:
  campo "Orientações para a corrente" no drawer da gira (criar e editar; GIRAS insert/edit como os demais
  campos), componente `components/admin/giras/OrientacoesCorrenteField` — só aparece e só é enviado com
  `can('area_medium')` (no piloto fica escondido; o backend aceita o campo sempre; ≤ 2000, aparado, vazio =
  null). Área: `GET /api/v1/medium/agenda?inicio&fim` (dias de Brasília inclusivos; padrão 1º dia do mês
  corrente até o fim do 3º mês; máx. < 6 meses → senão 400), regras puras em `services/medium_agenda.py`;
  `GET /medium/agenda/gira/{id}` (horário, `local` + endereço do terreiro com `mapa_url`, descrição,
  orientações, `senhas.situacao` abertas/esgotadas/abrem_em/encerradas/sem_senhas, `link_publico` =
  `/public/gira/{id}` ou `/{slug}` sem senhas, `agenda_celular.{ics_path, google_url}`) e
  `GET /medium/agenda/gira/{id}/ics` (`text/calendar` inline: o Safari do iPhone oferece "Adicionar à
  agenda", o Chrome do Android baixa e abre a agenda; 3 h quando a gira não tem fim). Módulo agenda
  desligado → 403 neutro e a aba some. Telas: `pages/medium/agenda.tsx` (lista por mês, filtro Tudo ·
  Giras só com as origens que existem, `DataChip` na cor do terreiro, "Ver os próximos meses") e
  `pages/medium/agenda/[tipo]/[id].tsx` (detalhe; ações "Adicionar à agenda do celular" (.ics, principal),
  "Abrir no Google Agenda" e "Divulgar a gira no WhatsApp" (wa.me com o link público; as orientações não
  vão no texto); dentro do navegador do WhatsApp/Instagram mostra como abrir no navegador). Tipos e textos em
  `components/medium/agenda.ts`. "A corrente chega às…" não é derivável (sem campo próprio): fica no texto
  das orientações.
- **Perfil (AM-13)**: `/medium/perfil` (`components/medium/perfil/*`): cabeçalho com a foto (ou iniciais) e "Trocar foto"
  (foto reduzida no navegador para JPEG de até 800 px, `prepararFotoPerfil`, reaproveitando `redesenharComoJpeg` da
  mensalidade) e, com foto, "Remover foto" (AM-29: `ConfirmDialog` com a paleta `.medium-terra` — prop nova
  `className` do kit — e `DELETE /medium/perfil/foto`; volta às iniciais); "Meus dados" (telefone, endereço, nascimento; "Não informado" quando vazio) com "Editar" →
  `MeusDadosDrawer` (`CrudDrawer` com a paleta `.medium-terra` — prop nova `className` do kit, tela cheia no celular —,
  `MaskedInput` de telefone e de CEP, busca no ViaCEP por `lib/cep.ts`, `DateField` sem data futura); "Dados da casa"
  travados ("Só a direção da casa altera estes dados"); "Conta de acesso": e-mail (→ `TrocarEmailDrawer`: novo e-mail +
  senha; depois "Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar." com "Desistir da
  troca") e "Trocar senha" (`TrocarSenhaDrawer` com `PasswordRules`; deu certo → `logout` → `/login?senha_alterada=1`).
  Impersonando: só leitura (ações somem). Página pública `pages/confirmar-email/[token].tsx` (`AuthShell`; confirma só
  no toque — leitor de link não gasta o token; depois "Entrar" → `/login?email_confirmado=1`). `confirmar-email` está em
  `RESERVED_SLUGS`. A Auditoria do painel rotula `medium_perfil` como "Perfil do médium (Área)". Backend e regras em §3.3.
- **Meus dados e privacidade (AM-14)**: Perfil → "Meus dados e privacidade" abre `/medium/meus-dados`
  (`pages/medium/meus-dados.tsx`, `components/medium/meusDados/*`): "Quem vê o quê" (`quemVeOQue`: a direção da casa,
  os outros médiuns — nada; só o aniversário se ligou o AM-20 —, ninguém de fora da casa), "Baixar meus dados" em PDF
  (`lib/pdf/meusDadosPdf.ts`, base `pdfDoc` com logo/cor do terreiro, montado no aparelho a partir do JSON) e em JSON
  (`baixarJson`), e "Encerrar meu acesso" (`EncerrarAcessoDrawer`: `CrudDrawer` `.medium-terra` com o que acontece +
  senha, `skipAutoLogout`). Depois (`aposEncerrar`): conta só da Área → tira o `user` e a escolha de área do
  localStorage e recarrega em `/login?acesso_encerrado=1` (aviso no login); operador/admin → `areas.medium = null` no
  `user`, escolha lembrada = painel, recarrega em `/admin/dashboard`. Impersonando, baixar/encerrar somem. Backend e
  regras em §3.3.
- **Aniversariantes (AM-20)**: Perfil → seção "Aniversário" (`components/medium/perfil/AniversarioOptIn.tsx`: `Switch`
  "Mostrar meu aniversário para a corrente", muda na hora e volta se der erro; sem data de nascimento fica travado e
  manda preencher em Meus dados; impersonando mostra Ligado/Desligado). Início (`components/medium/Aniversarios.tsx`):
  `MeuAniversarioCard` no topo no dia do próprio aniversário e "Aniversariantes da semana" depois da próxima gira
  (primeiro nome + dd/mm ou "Hoje", "(você)"; some vazio). Painel: campo "Mensagem de aniversário" em Configurações →
  Área do Médium (`AreaMediumConfigSection`, ≤ 200, `{nome}`).
- **Login multi-terreiro (AM-05)**: mesmo e-mail em mais de um terreiro escolhe o terreiro no `/login` antes da
  escolha de área (regras em §3.2).
- **Atividades da casa (AM-08)**: migracoes `077_permissao_escalas_enum` + `078_atividades` (§11.8; tabelas em
  `docs/database.md`), API `/api/v1/admin/atividades*` (ESCALAS + `area_medium` + `atividades_corrente`; regras em
  §3.3 e `docs/api.md` §15), planos `atividades_corrente` (Basic) e `escalas` (Pro, sem rota ainda) no catalogo e
  em `constants/plans.ts` (ambos em `UNSOLD_FEATURES` no piloto). Icone = chave de lista fechada
  (`constants/atividades.ts` + desenho em `lib/icons.ts` → `ICONES_DE_ATIVIDADE`, CHECK no banco); cor = paleta
  dos grupos ou `null` (cor do terreiro). Painel: `/admin/atividades` (menu Corrente → "Atividades e escalas",
  so com `can('area_medium')` e `escalas` view; sem `atividades_corrente` → `PlanLocked`): aba "Agenda da casa"
  (mes a mes, filtro por tipo, giras + atividades, `CrudDrawer` com tipo, titulo, inicio/fim, local, orientacoes,
  descricao e "Quem ve na Agenda"; cancelar pede o motivo num `CrudDrawer`; excluir com `ConfirmDialog`) e aba
  "Tipos e funcoes" (`components/admin/atividades/TiposEFuncoes.tsx`: icone, cor, presenca, "Vou / Nao vou",
  motivo, "Cheguei" + janela, quem pode participar com `MultiCombobox` de grupos, convocacao, escala,
  horario/duracao, visibilidade padrao; funcoes). Area: Agenda com o chip "Atividades", `TipoChip`
  (`components/atividades/TipoChip.tsx`, icone e cor do tipo) e "Cancelada"; detalhe
  `pages/medium/agenda/[tipo]/[id].tsx` com `tipo = atividade` (orientacoes, local, .ics e Google Agenda, motivo do
  cancelamento; sem link publico nem "Divulgar"). Presenca no AM-17/AM-28, planejador da faxina no AM-25 e escala
  de gira no AM-18 (abaixo).
- **Presenca (AM-17/AM-28)**: migracao `079_presenca` (§11.8; tabela em `docs/database.md`), API em §3.3 e
  `docs/api.md` (§16 do painel, §7 da Area). Modo da casa em Configuracoes → Area do Medium
  (`AreaMediumConfigSection`, so com `presenca_no_plano`: confianca · "Cheguei" pelo app · "Cheguei" com QR + prazo
  do motivo 1–30 dias) e ajuste por tipo na aba "Tipos e funcoes" ("Como a presenca e marcada": padrao da casa ou
  um dos tres; a janela so aparece fora da confianca). Area (`components/medium/presenca/*`, `.medium-terra`,
  vocabulario D-17/18/19 — "Voce esta na escala", "Vou"/"Nao vou", "Cheguei", "Conte o motivo"; nunca
  "convocado"/"check-in"; `constants/presenca.ts`): `EscalaCard` no Inicio (escalas que pedem acao no topo; ja
  respondidas em "Acompanhando") e no detalhe da Agenda; `MotivoSheet` (≤ 500, aviso "nao precisa detalhar
  saude"); `ChegueiSheet` (modo QR: camera dentro da Area + `lib/leitorQr` — `BarcodeDetector` nativo quando o
  navegador tem (e le QR); senao (iPhone/Safari, AM-29) o `jsqr` (Apache-2.0) carregado so nessa hora por `import()`
  dinamico, chunk proprio (~130 KB, ~47 KB gzip) fora das rotas, depois de a camera ser liberada; sem camera ou sem
  rede para o chunk, a camera do proprio celular le o QR, que e um link `/medium/agenda/{origem}/{id}?cheguei=<codigo>`
  — o detalhe marca sozinho uma vez —, ou o codigo digitado); selo "Na escala"/"Vou"/"Nao vou" na lista da
  Agenda; `pages/medium/presencas.tsx` (Perfil → "Minhas presencas": percentual, proximas, historico, "Conte o
  motivo (ate dd/mm)"). Impersonando, as acoes somem. Painel: `pages/admin/atividades/[id]/chamada.tsx`
  (gates `area_medium` + `atividades_corrente` + `escalas:edit` ou `porta:edit`; lista com busca, Presente/Ausente
  — tocar de novo desfaz —, "Marcar todos os confirmados como presentes", "Adicionar quem veio", "Encerrar
  chamada" com `ConfirmDialog`, QR do dia com "Mostrar o QR em tela cheia"), `ConfirmacoesSheet` e botoes
  "Confirmacoes"/"Chamada" na Agenda da casa, `ChamadaDaGiraButton` no cartao da gira (`GiraCard.extraAction`,
  do dia da gira em diante) e na Porta, e o QR no canto do modo TV (`components/admin/presenca/QrPresenca`,
  sem dado pessoal; so com a Area liberada e a presenca no plano). "Por na escala" com grupos (AM-29):
  `components/admin/atividades/PorNaEscalaCampos` (`MultiCombobox` de grupos de `/corrente-grupos/opcoes` com
  `GrupoChip` dos escolhidos + `MultiCombobox` de medium) no `ConfirmacoesSheet` e no drawer de criar atividade de
  tipo "so escalados" (medium de `GET /admin/atividades/convocar/mediuns`; cria e depois chama o `convocar`, um
  toast so com o resumo `novos · ja estavam · fora de quem pode participar`); tudo so com `escalas:insert`.
- **Escala de faxina (AM-25)**: migracao `080_escala_planos` (§11.8; tabelas em `docs/database.md`), API
  `/api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}*` (§3.3 e `docs/api.md` §17), regras puras em
  `services/escala_planos.py` (copiar pela ordem do dia da semana — a 5ª ocorrencia some —, girar G1→G2→…→G1,
  distribuir em ciclo, diff da publicacao). Vale para todo tipo com `modo_escala = grupos_por_dia`. Publicar cria uma
  atividade por dia x grupo (`origem = plano_escala`, "Faxina · G2") e convoca os membros ATIVOS do grupo que o tipo
  alcanca (`origem = grupo`); republicar: dia removido → cancelada + dispensados; grupo trocado → mesma atividade, os do
  grupo antigo dispensados e os do novo convocados; o resto mantem respostas e presencas; dia que ja passou (ou com a
  chamada encerrada) nao muda. Plano travado com `FOR UPDATE` (publicar/salvar em serie, publicar de novo nao faz
  nada). "Atualizar convocacoes das proximas faxinas" so mexe no que ainda nao comecou. Avisos: gancho
  `escala_publicada(...)` chamado depois do commit — o envio e do AM-15. Painel: aba "Escala de faxina" em
  `/admin/atividades` (`components/admin/atividades/EscalaFaxina.tsx`, regras/tipos em `lib/escalaFaxina.ts`): sem
  `escalas` no plano → `PlanLocked` (`minPlanFor('escalas')`); mes + tipo, "Copiar do mes anterior"/"Comecar vazio",
  fichas dos grupos com a contagem de dias e "Novo grupo" (`mediuns:insert`, abre Grupos da corrente em outra aba; ao
  voltar, a tela recarrega as fichas), grade do mes 7 colunas com celulas de 44 px (dia passado nao toca), atalhos
  Copiar · Girar grupos (salva antes) · Distribuir (`CrudDrawer`: dias da semana + grupos em ordem + horario),
  "Dias e horarios" com o horario por dia (`CrudDrawer`), resumo em texto, Salvar rascunho (`escalas:edit`) e
  Publicar / Publicar as mudancas (`ConfirmDialog` com as contagens do servidor; `escalas:insert`+`edit`), "Atualizar
  convocacoes das proximas faxinas". Area: nada novo — a faxina publicada aparece na Agenda e no Inicio como
  "Voce esta na escala · G2" com o horario (AM-17), o rascunho nunca.
- **Assiduidade (AM-26)**: aba "Relatorios" em `/admin/atividades` (`components/admin/atividades/RelatorioAssiduidade.tsx`;
  so monta quando a aba abre): periodo (este mes · ultimos 3 meses · este ano · datas, ate 1 ano), tipo (so os que
  controlam presenca, arquivados inclusos), grupo, "Por medium"/"Por grupo" (`ToggleGroup`; sem `can('escalas')`
  → `PlanLocked` com `minPlanFor('escalas').label` e nada de busca), `DataTable` com `renderCard` no celular e
  ordem pelo percentual (clicar de novo inverte, nunca tira a ordem), detalhe por medium num `Sheet` com cada
  atividade, a situacao e o motivo das faltas ("so aqui, nao vai para o PDF"). "Baixar PDF" =
  `lib/pdf/assiduidadePdf.ts` (base `pdfDoc`: logo/cor do terreiro, periodo, filtros, tabela e total) com
  `dadosDoPdf` (`constants/assiduidade.ts`), que copia SO nomes e contagens campo a campo — teste jest trava que o
  texto da justificativa nunca chega ao gerador. API em §3.3 e `docs/api.md` §18.
- **Lembretes e avisos por e-mail (AM-15)**: migracao `081_lembretes` (§11.8; tabelas em `docs/database.md`),
  agendador e regras em §3.3/§11.9, API em `docs/api.md` (§8 da Area e §7 publico), textos e volume em
  `docs/email.md`. Area: secao "Avisos por e-mail" no Perfil (`components/medium/perfil/AvisosPorEmail.tsx`:
  um `Switch` por tipo de `disponiveis`, muda na hora, volta se der erro; impersonando mostra Ligado/Desligado
  sem botao), nomes e textos em `constants/avisosEmail.ts`. Pagina publica `pages/descadastro/[token].tsx`
  (`AuthShell`; abrir so consulta, "Desligar" no toque; `descadastro` em `RESERVED_SLUGS`). Painel: caixa
  "Avisar por e-mail também" no drawer do aviso e "Lembrete da mensalidade por e-mail" em Configuracoes → Area
  do Medium (so com o modulo mensalidade ligado e no plano).
- **Notificacao no celular (AM-16)**: migracao `082_push_inscricoes` (§11.8; tabela em `docs/database.md`), envio
  e regras em §3.3/§11.9, API em `docs/api.md` (Area do Medium §9), chaves VAPID em `docs/deployment.md`. Area: secao "Notificacoes
  no celular" no Perfil (`components/medium/perfil/NotificacoesNoCelular.tsx`), logo abaixo de "Avisos por e-mail" e
  com o mesmo desenho: uma linha "Receber notificacoes neste celular" (a permissao e por aparelho; o pedido do
  navegador so sai no toque) e, com algum aparelho ligado, um `Switch` por tipo (`AVISO_CELULAR_TEXTO` em
  `constants/avisosEmail.ts`) e "Mandar uma notificacao de teste". iPhone fora da tela inicial → explica (iOS 16.4+)
  e abre o `InstallAreaSheet`; sem suporte/permissao bloqueada → texto de como liberar. Ao abrir com o aparelho ja
  inscrito, reenvia a inscricao (idempotente). "Sair" da Area tira o aparelho (`desligarCelularAoSair`, ate 2 s;
  impersonando nao mexe). Helpers do navegador em `lib/webPush.ts`. `public/sw.js`: `push` (titulo/texto/url do
  servidor, icone `/icons/icon-192.png`, `tag` substitui a anterior) e `notificationclick` (foca janela da origem e
  navega, senao abre; `url` de fora vira `/medium`); a regra de nunca cachear `/api/*` segue e o teste
  `__tests__/pwa/sw.test.ts` cobre as rotas `/api/v1/medium/push*`. A caixa "Avisar por e-mail também" do aviso
  tambem dispara o push (texto de ajuda atualizado).
- **Escala de gira por funcao (AM-18)**: sem migracao (usa `funcao_id`/`grupo_id`/`origem` da participacao do
  AM-17). API `api/v1/admin/atividades_escala.py` (gates/permissoes em §3.3, contrato em `docs/api.md` §19),
  regras em `services/escala_gira.py`: a escala grava `funcao_id` na PROPRIA participacao (uma funcao por medium
  por atividade); por funcao, medium um a um (`origem = funcao`, `rodizio` no rodizio) ou grupo inteiro
  (`origem = grupo` + `grupo_id`, membros ATIVOS que o tipo alcanca); pedido um a um ganha do grupo; salvar
  substitui a escala; quem tinha funcao e saiu: em tipo "so escalados" fica com `dispensado_em` (a funcao fica
  gravada), em tipo "todos os elegiveis" (gira) e alcancado pelo tipo so perde a funcao e segue esperado
  (`PlanoEscala.so_sem_funcao`, calculado com `mediuns_esperados`); "Copiar da
  anterior" = ultima do mesmo tipo com escala (grupos com os membros de hoje); rodizio (`escala_gira.rodizio`,
  funcao pura, espelho em `constants/escalaGira.ts`) pelas proximas N (≤ 12) do tipo, so mexendo na funcao do
  rodizio (quem tem outra funcao fica nela). O e-mail de "escala nova" sai pelo agendador do AM-15 (a linha nova
  da participacao), nada e enviado no salvar.
  Painel: `pages/admin/atividades/[id]/escala.tsx` (gates `area_medium` → `escalas` com
  `PlanLocked minPlanFor('escalas')` → `escalas:view`; editar com `escalas:edit`; por funcao o
  `PorNaEscalaCampos` com so os elegiveis e sem quem ja esta em outra funcao; resumo em texto; "Copiar da gira
  anterior" com `ConfirmDialog`; `RodizioDrawer` com previa), aberto pelo `EscalaDaGiraButton` no cartao da gira
  (`?origem=gira` → `POST /da-gira/{id}/escala` e troca a URL) e pelo botao "Escala" da Agenda da casa (tipos com
  `modo_escala = funcoes`). Area: `minha_participacao.funcao` (null quando dispensado) → `EscalaCard` "Voce e
  Cambone na gira de sabado" (`presencaApi.fraseDaFuncao`, D-17), selo da Agenda "Cambone · Vou", linha em
  "Acompanhando" no Inicio e "Funcao: Cambone" no historico de Minhas presencas.
- **Troca na escala e abono (AM-27)**: migracao `086_trocas_escala` (§11.8; tabela em `docs/database.md`), API em
  §3.3 e `docs/api.md` (§21 do painel, §11 da Area), regras em `services/trocas_escala.py`. Troca so na escala de
  verdade (gira com funcao, faxina, atividade "so escalados"), antes do inicio, chamada aberta. Area: detalhe da
  Agenda com `components/medium/troca/TrocaNaAtividade` ("Nao vou poder: pedir troca" → `PedirTrocaSheet`: colegas
  elegiveis que ligaram o opt-in, so o PRIMEIRO nome, e sempre "Deixar a direcao escolher" — sem ninguem com
  opt-in so essa opcao; recado ate 200), `TrocaCard` ("Aceito ir"/"Nao posso", "Cancelar pedido", frases de
  `constants/trocas.fraseDaTroca`: "Voce trocou com Beto" / "Voce esta na escala no lugar de Ana"; sem opt-in,
  "um colega da corrente"); Inicio: pendencia `troca` (cartoes em "Para voce ver agora") e os pedidos abertos em
  "Acompanhando"; Perfil: "Colegas de escala" (`ColegasDeEscala`, padrao desligado); `EscalaCard` diz "Voce
  trocou a escala" e "A casa nao aceitou o motivo". O colega chamado ve a atividade enquanto o pedido esta aberto
  (`atividade_visivel_ao_medium`). Casa: Configuracoes → Area do Medium → "Troca combinada entre mediuns precisa
  da aprovacao da direcao" (padrao ligado; desligado, o aceite do colega ja troca). Aprovada: a linha original
  ganha `substituida_por_id` ("Substituido") e a do substituto nasce/volta com origem `troca`, mesma funcao/grupo e
  "Vou". Painel: aba "Trocas" em `/admin/atividades` (`TrocasDaEscala`, selo com as que esperam a direcao;
  Aprovar/Recusar/Cancelar com `ConfirmDialog`, "Escolher quem vai" em `CrudDrawer` + `Combobox`); chamada e
  Confirmacoes mostram "Trocou com"/"No lugar de"; relatorio conta `substituidos` (nao e falta). Abono:
  `components/admin/presenca/AbonoJustificativa` ("Aceitar motivo"/"Recusar motivo"/"Desfazer", `escalas:edit`) nas
  Confirmacoes, na chamada e no detalhe do relatorio; recusado conta como falta sem justificativa; motivo novo do
  medium volta a "nao avaliado". "Por na escala" um a um devolve quem tinha trocado. E-mails pelo agendador do
  AM-15 (preferencia `escalas`): pedido ao colega, resposta a quem pediu, aprovada aos dois. Sem push (AM-16).
- **Divulgação (AM-24)**: tudo atrás de UMA chave de lançamento, desligada por padrão enquanto a Área é piloto:
  `AREA_MEDIUM_DIVULGADA` (`constants/areaMedium.ts`) = `NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA === 'true'`, **ARG de
  build** do frontend (Dockerfile padrão `false`, `args:` do `docker-compose.prod.yml`, `.env.prod.example`); em
  produção vem da variável homônima do ambiente `Hostinger` no GitHub, que o `deploy.yml` repassa (vazia = vale o
  `.env` da VPS, senão `false`). Ligar = `gh variable set NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA --env Hostinger --body true`
  e redeployar. Ligada: link "Sou médium / Recebi um convite" no topo da landing (`components/landing/SouMedium.tsx`,
  diálogo com os passos e "Entrar") e no `/login` (o "Recebi um convite da casa" do AM-04 vira esse link e abre os
  mesmos passos); linha "Área do Médium" no comparativo público (`PlanComparisonTable.publicComparisonGroups`, depois
  da mensalidade dos médiuns, plano mínimo de `FEATURE_MIN_PLAN.area_medium`; o quadro do painel não muda —
  `area_medium` segue em `UNSOLD_FEATURES`); pergunta "Os médiuns têm acesso?" no FAQ e no JSON-LD
  (`landingFaq.visibleFaq`). Sem página nova (nada em `RESERVED_SLUGS`). Componentes leem a chave na renderização
  (o teste `area_medium_divulgacao.test.tsx` troca o valor por getter).
- **Estudos e documentos (AM-21)**: tabelas `materiais_corrente` e `material_grupos` (migração 087). Tipos `link`
  (Drive, YouTube, site), `texto` e `ponto` (letra + link opcional de áudio/vídeo); categoria em texto livre
  (sugestões Estudos, Pontos cantados, Fundamentos, Rezas, Avisos gerais); público como nos avisos (`todos |
  atendimento | cambones | grupos`, grupos conferidos no terreiro); `publicado` (rascunho só no painel); `ordem`
  (setas no painel → `PUT /admin/materiais/ordem` com todos os ids); excluir = `arquivado_em`. **Sem upload**: o
  banco tem limite de 8 GB e as imagens já ficam em BYTEA — PDF entra como link do Drive (a tela diz isso); upload
  espera armazenamento de objetos. Limites medidos em teste: título 120, categoria 60, link 500, texto 15 000
  caracteres, 300 materiais ativos por casa (~4,5 MB de texto no pior caso). Link: só `http(s)` com domínio, sem
  espaço/aspas/`<>`, sem usuário:senha (`services/materiais.validar_url`; `javascript:`/`data:`/`file:` → 422) e
  CHECK `ck_materiais_corrente_url` no banco. YouTube: o backend extrai o id de 11 caracteres (`youtube_id`) e a
  Área toca no `youtube-nocookie` (o `frame-src` do nginx já libera); outro link abre em outra aba com
  `noopener noreferrer`. Texto: mesma limpeza dos avisos (`limpar_corpo`) e `AvisoTexto` na tela. Plano
  `biblioteca_medium` (Pro): `GET /medium/me` devolve `estudos` e a entrada "Estudos e documentos" aparece no menu
  do cabeçalho e no Perfil (não na barra inferior, que já tem 5 abas); sem o plano a tela da Área mostra aviso
  neutro e o painel `PlanLocked`. Área: `/medium/estudos` (por categoria, busca sem acento) e
  `/medium/estudos/[id]`; seção "Cursos da casa" com os cursos presenciais ativos que não terminaram (só com
  `site_builder` no plano) e o link da inscrição pública (`/public/cursos/{id}/inscricao`), com vagas restantes.
  Painel: `/admin/materiais` (menu Corrente → "Estudos e documentos"; `DataTable` + `CrudDrawer`).

### 11.24 Programa de Parceiros GiraHub (C-06, 2026-10-08)
- **Chave de lançamento** `PARCEIROS_PUBLICADO` (`constants/parceiros.ts`) = `NEXT_PUBLIC_PARCEIROS_PUBLICADO === 'true'`,
  mesmo encanamento da `AREA_MEDIUM_DIVULGADA` (§11.23): ARG de build no `frontend/Dockerfile` (padrão `false`),
  `args:` do `docker-compose.prod.yml` (`${NEXT_PUBLIC_PARCEIROS_PUBLICADO:-false}`), variável do ambiente `Hostinger`
  repassada pelo `deploy.yml` (vazia = vale o `.env` da VPS), `.env*.example`. **Desligada por padrão** (o dono aprova
  os números antes). Desligada: `/parceiros` é 404 (`getStaticProps → notFound`), sem link "Seja parceiro" no rodapé
  do `MarketingShell`, sem `ParceirosChamada` na landing e fora do sitemap (`sitemap.xml.staticRoutes()`). Ligar =
  `gh variable set NEXT_PUBLIC_PARCEIROS_PUBLICADO --env Hostinger --body true` e redeployar.
- **Página** `pages/parceiros.tsx` (identidade da landing, `MarketingShell`): quem pode, vantagens dos dois lados,
  exemplo "Um terreiro no plano X rende R$ Y por mês" e comissão por plano calculados de `constants/plans.ts`
  (`planoExemplo` = plano `popular`), material, como funciona, formulário (`components/landing/ParceiroForm.tsx`) e
  regulamento em acordeão. Regras e números só em `constants/parceiros.ts`; economia e decisões pendentes em
  `docs/programa-parceiros.md`. `parceiros` está em `RESERVED_SLUGS`.
- **API pública** `POST /api/v1/public/parceiros/interesse` (5/hora por IP no slowapi; campo isca `website` →
  201 sem gravar nem avisar; aceite do regulamento obrigatório → 422; WhatsApp só dígitos, UF maiúscula, e-mail
  minúsculo). Grava `parceiro_interesses` (tabela da plataforma, sem `tenant_id` — os auditores não exigem filtro
  de tenant em modelo sem a coluna) com `ip_hash` = HMAC-SHA256 do IP (chave derivada do `SECRET_KEY`; IP nunca em
  claro). Aviso à equipe por `email_queue` para o `ALERT_EMAIL` (o endereço de plataforma que já recebe os alertas
  de 5xx; vazio = só log), `reply_to` = e-mail do interessado, link `/platform/parceiros?pedido=<id>`.
- **Plataforma** `/platform/parceiros` (item "Parceiros" na sidebar e na paleta ⌘K): abas por status com contagem
  (`novo · em_contato · aprovado · recusado`), busca, `DataTable` e `CrudDrawer` com contatos (WhatsApp/e-mail),
  status, cupom (`^[A-Z0-9_-]{3,40}$`, maiúsculo) e observações. API `GET /api/v1/platform/parceiros`
  (`status`, `q`, `limit`, `offset` → `{items, total, counts}`), `GET`/`PATCH /api/v1/platform/parceiros/{id}`, todas
  com `require_super_admin`. Cupom criado à mão no Stripe até o $-05 (o checkout ainda não aceita código promocional).
- **Ficha espiritual (F-05) + Minha caminhada (AM-19)**: migracoes 088/089 (§11.8), plano `ficha_espiritual` (Pro,
  vendido no quadro: "Ficha espiritual e caminhada dos mediuns" em `FEATURE_CATALOG`), grupo `FICHA_ESPIRITUAL` fora
  do grupo padrao (§3.3). Regras em `services/ficha_espiritual.py`: campos por tradicao (texto, data ISO, lista com
  1–30 opcoes, sim/nao) com chave unica no terreiro; modelos de Umbanda e Candomble (`MODELOS`, conservadores: so o
  orixa de cabeca visivel ao medium; nenhum aceita sugestao; aplicar de novo nao duplica); "o medium pode sugerir"
  liga "o medium ve". Consentimento (`CONSENTIMENTO_FICHA_VERSAO`, espelho em `constants/fichaEspiritual.ts`):
  registrado pela direcao (caixa com o texto, `_por` = quem registrou) ou pelo medium na Area; **revogar = parar de
  tratar**: `_em/_por/_versao` limpos + `_revogado_em`, valores/marcos/sugestoes ficam inacessiveis (painel e Area),
  a direcao recebe e-mail discreto (`templates/ficha_autorizacao_retirada.py`) e o aviso "Autorizacao retirada" em
  `/admin/mediuns/ficha` com "Apagar dados" (`DELETE /{id}/ficha`, FICHA delete). Nao apagamos sozinhos: a eliminacao
  e ato consciente da direcao (controladora); um novo consentimento devolve o que nao foi apagado.
  Painel: `/admin/mediuns/ficha` (campos em `CrudDrawer`, modelos, sugestoes e autorizacoes retiradas) e
  `/admin/mediuns/[id]/ficha` (autorizacao, abas "Ficha" e "Caminhada" com linha do tempo e `CrudDrawer` de marco),
  abertos pelo botao "Ficha espiritual" e pela acao da linha em `/admin/mediuns` (com `can('ficha_espiritual')` e
  `ficha_espiritual:view`). Area: `/medium/caminhada` (Perfil → "Minha caminhada", so com `me.ficha`): termo e
  "Autorizar", campos liberados, "Sugerir" (`MediumSheet`), linha do tempo e "Retirar autorizacao"
  (`ConfirmDialog` com `medium-terra`); cores so por token. Politica de Privacidade 2.3 cita a ficha.

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
  WhatsApp comercial: `NEXT_PUBLIC_SUPPORT_WHATSAPP` é **ARG de build** do frontend (vazio = sem botões); em
  produção o valor é a variável homônima do ambiente `Hostinger` no GitHub (`gh variable set --env Hostinger`),
  que o `deploy.yml` repassa ao build — trocar o número = mudar a variável e redeployar.
  Página nova de primeiro nível → `backend/src/core/reserved_slugs.py` (teste quebra se faltar) e
  `STATIC_ROUTES` do `pages/sitemap.xml.tsx`.
- **Área do Médium (AM-06; visual de aplicativo desde out/2026)**: neutra e sempre clara, com a COR E O LOGO DO
  TERREIRO como único destaque — o dono achou a versão anterior (paleta terra da landing, Fraunces, rótulos em
  caixa-alta, faixas com véu) "com cara de IA" e pediu algo perto dos apps de terreiro (Kanzuá: listas agrupadas,
  cartão da próxima gira na cor da casa). Escopo `.medium-terra` (nome histórico; globals.css — `MediumLayout`,
  `/escolher-area` e os overlays que eles abrem — Sheet, DropdownMenu e `ConfirmDialog`/`CrudDrawer` (prop
  `className`, AM-29) recebem a classe, porque são portados para o `<body>`): fundo `#f4f5f7`, cartões/cabeçalho/
  barra inferior brancos, caixas `#eef0f3`, texto `#111827`, apoio `#4b5563`, sem serifa (não usar `font-display`
  na Área). `--primary`/`--primary-foreground` continuam do `applyBrand` (botão principal, pílula da aba ativa,
  cartão "Próxima gira" — sem véu por cima da cor, só fio) e `text-brand` lê `--terra-brand-text-light`, calculada
  por `applyTerraBrandText` (`lib/brand.brandTextColorOn` contra `TERRA_SURFACES`). **Peças de tela** em
  `components/medium/ui.tsx` (toda tela nova da Área usa): `MediumPage`/`MediumPageHeader` (título da tela),
  `MediumSection` (+ `MediumSectionLink`), `MediumList`/`MediumListItem` (lista agrupada sobre o `Item` do
  shadcn, `components/ui/item.tsx`: ícone em caixinha + título + descrição + seta), `IconTile`, `StatusBadge`.
  **Sem modo escuro**: o `MediumLayout` e o `/escolher-area` chamam `useAreaClara` (tira a classe `dark` de
  `<html>` enquanto a Área está aberta e devolve ao sair) e não existe `.dark .medium-terra`. `MediumFaixa` ficou
  só na escolha de área (cartão branco com fio, sem gradiente). `__tests__/styles/colorUsage.test.ts` barra
  `bg-cafe-*`, `text-areia-*`, `text-white` e `dark:` nas telas da Área (exceção: a câmera do "Cheguei"); pares
  travados em `__tests__/styles/marketingContrast.test.ts` (8 cores de terreiro difíceis). Manifesto da Área e
  `<meta name="theme-color">` das rotas `/medium/*` e `/escolher-area`: `#ffffff` (fundo `#f4f5f7`). Só na Área;
  nunca no painel.
- **Claro/escuro**: classe `dark` em `<html>` (não no layout — Radix porta overlays para o `<body>`), aplicada por
  `AdminThemeProvider`/`PlatformThemeProvider` (chaves `admin_theme_mode`/`platform_theme_mode`); páginas públicas e
  a Área do Médium sempre claras (a Área tira a classe com `useAreaClara`).
- **Overlays**: Sheet/Dialog/AlertDialog/Select/Popover/DropdownMenu usam o z-index padrão do Radix (`z-50`); quem abre por
  último fica por cima, então calendário e Combobox dentro do `CrudDrawer` funcionam. Barras fixas: topbar `z-30`,
  `MobileTabBar`, `BulkActionsBar` e a barra inferior da Área do Médium `z-40` (cabeçalho da Área `z-30`). Não usar `z-[1300]`/`z-[1400]` (eram para ficar acima do AppBar do MUI).
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
  Corrente · Casa · Conta); casa `components/financeiro/{CobrancaMensal,MonthNavigator,PixConfigCard}` + `lib/pixChave.ts`, `components/estoque/MovimentacaoDrawer`;
  conta `constants/plans.ts` (fonte única de planos, testada contra o backend), `constants/passwordPolicy.ts`,
  `components/{auth,billing}/*`; site `components/site/{sections,editor}/*` (mesmas seções no site público e na prévia);
  plataforma `components/platform/{planMeta,format,impersonate,passwordPolicy,CommandPalette,...}`.
- **Rotas que viraram redirecionamento**: `/admin/plano` → `/admin/billing`; `/admin/financeiro/contas-pagar|contas-receber`
  → `/admin/financeiro/lancamentos?tipo=`; `/admin/estoque/relatorio` → `/admin/estoque/itens`; `/platform/observatory` →
  `/platform`; `/platform/billing` → aba Assinaturas de `/platform/tenants`; `/platform/users_global` e `/platform/profile`
  → abas de `/platform/settings`. Parâmetros: `?nova=1`/`?compartilhar=1` em Giras, `?passos=1` no Início, `?gira=` em
  Porta/Senhas/modo TV, `?plan=` no billing e no cadastro. Impersonação aceita `#token=` (e ainda a query string).
- **PWA (P-01)**: `public/manifest.webmanifest` (`start_url` `/admin/porta?source=pwa`, `standalone`; nas rotas `/medium/*`
  o `_document` não o linka — lá vale o `manifest-medium.webmanifest` da Área, §11.23), ícones gerados
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
- `presenca_scheduler` (AM-17, desde 2026-10-08): a cada 30 min encerra as chamadas abertas que terminaram ha
  48 h ou mais e tiveram presenca registrada (no modo confianca, um "vou" conta). Nao envia nada: so o
  `advisory_lock(PRESENCA_LOCK_KEY = 0x6769726168756204)` por rodada; a idempotencia vem da propria atividade
  travada com `FOR UPDATE` (`chamada_encerrada_em` preenchido nao muda mais).
- `medium_lembrete_scheduler` (AM-15, desde 2026-10-08): a cada 15 min, so terreiros do piloto; lembretes e avisos
  por e-mail da Area (mensalidade D-3/D+3, troca do PIX, escala nova, vespera 18 h, D-2 sem resposta, convite
  para contar o motivo da falta, aviso com "avisar por e-mail", cancelamento) e o resumo diario aos admins
  (8 h). `advisory_lock(MEDIUM_LEMBRETE_LOCK_KEY = 0x6769726168756206)` por rodada (a `...205` fica reservada
  para o `retorno_scheduler`) e, em vez do `claim_once`, marca POR LINHA em `medium_lembretes_enviados`
  (`INSERT ... ON CONFLICT DO NOTHING RETURNING`, commit antes de enfileirar). Espera a fila de e-mail ficar
  abaixo de 300 antes de enfileirar (`email_queue.qsize()`; acima de 500 a fila descarta).
  Desde o AM-16 a mesma rodada manda a **notificacao no celular** (Web Push) para os aparelhos do medium
  (`push_inscricoes`), com o liga/desliga proprio (`push_<tipo>`): o lembrete e planejado se e-mail OU celular
  estiver ligado, a marca e uma so para os dois canais, e o push sai depois do commit
  (`services/web_push.enviar`, `asyncio.to_thread` + timeout 10 s, TTL 12 h; 404/410 apagam a inscricao). Sem as
  variaveis VAPID, nada de push (so e-mail). Ligar em producao: `docs/deployment.md` (chaves VAPID).
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

**Analytics e marketing — GA4, Google Ads, Meta Pixel e Microsoft Clarity, todos sob consentimento (out/2026):**
- **Banner de cookies** (`frontend/src/components/shared/CookieConsent.tsx`, montado no `_app.tsx`): categorias
  necessários / estatísticas / marketing; "Recusar opcionais" com o mesmo peso de "Aceitar todos"; "Personalizar"
  abre o painel com a lista de cookies. Escolha no cookie `girahub_consent` (180 dias, `lib/consent.ts`; subir
  `CONSENT_VERSION` pergunta de novo a todos). Reabre pelo rodapé ("Preferências de cookies") e por `/cookies`
  (`abrirPreferenciasDeCookies()`). Sem banner só em `ROTAS_SEM_BANNER` (Porta em modo quiosque).
- **Inventário de cookies**: `frontend/src/constants/cookies.ts` (fonte da página `/cookies` e do painel). Cookie novo
  no código → acrescente lá e, se opcional, o padrão de nome em `COOKIES_DA_CATEGORIA` (apagado ao revogar).
- **Tags** (`frontend/src/lib/marketingTags.ts` + `components/shared/MarketingTags.tsx`): gtag.js com **Consent Mode v2**
  (tudo `denied` por padrão, `consent update` na escolha, `ads_data_redaction`, `url_passthrough`); Meta Pixel só
  carrega com marketing aceito. IDs são **ARG de build**: `NEXT_PUBLIC_GA4_ID` (vazio = `G-BF9G0RFCDB`),
  `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`, `NEXT_PUBLIC_META_PIXEL_ID` (vazios = desligados).
- **Conversões**: `trackEvent` (`services/analytics.ts`) repassa `signup_completed` → `sign_up` (GA4), conversão do Ads
  e `CompleteRegistration` (Meta); `whatsapp_click` → `generate_lead` e `Contact`.
- **Clarity** (`components/shared/ClarityAnalytics.tsx`): só com `NEXT_PUBLIC_CLARITY_PROJECT_ID` no build **e**
  consentimento de estatísticas; revogar chama `clarity('consent', false)`. Tags de sessão (`scope`, `tenant_id`,
  `tenant`, `plan`, `trial`, `role`) e `identify` com o UUID do usuário (hash do SDK). Nunca e-mail/CPF/nome como tag.
- CSP do nginx libera Clarity, GA4 (`*.google-analytics.com`), Google Ads (`googleadservices`, `doubleclick`,
  `www.google.com`) e Meta (`connect.facebook.net`, `www.facebook.com`).
- **Documentos legais** (`/termos`, `/privacidade`, `/cookies`): moldura `components/public/LegalPageLayout.tsx`
  (MarketingShell + abas + índice), versão/vigência e razão social/CNPJ em `constants/legal.ts`. O texto descreve o
  que o código faz — mudou operador, retenção, plano ou cookie, revise o documento (R-02).
  **Aceite no cadastro**: `POST /public/onboarding` grava uma linha por documento em `legal_acceptances` (versão, data,
  IP, navegador — migração 063, só acréscimo). As versões vêm de `backend/src/core/legal_versions.py`, espelho de
  `LEGAL_VERSIONS` do frontend (`tests/unit/test_legal_acceptance.py` quebra se divergirem): subiu a versão, suba nos dois. Passagens animadas
  marketing ⇄ documentos e entre documentos em `lib/passagem.ts` (`abrir-/fechar-documento`, `folhear-*`).

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
