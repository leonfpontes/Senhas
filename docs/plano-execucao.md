# Plano de Execução — GiraHub / Senhas

Criado: 2026-08-26 · Fonte: auditoria completa do projeto (produto, técnico, infra)
Restrição vigente: **custo zero** — nenhum item pode exigir gasto novo de infra. Free tiers são permitidos.
Como usar: os itens são independentes salvo dependência explícita. Escolha um item por vez; cada item
vira uma sessão de implementação com seus critérios de aceite como definição de pronto.

Status possíveis: `pendente` · `em andamento` · `feito` · `descartado`

---

## Fase 0 — Bugs confirmados — `concluída` (2026-08-26)

Os três foram confirmados em código durante a auditoria, corrigidos e deployados no mesmo dia.

### E-01 — Reenvio público de e-mail retorna 500 em toda chamada — `feito` (2026-08-26)
- **Executado**: `6efb0cc` — instanciação de `TicketRepository` corrigida; teste passou a
  exercitar a instanciação real (sem patch da classe).
- **Problema**: `backend/src/api/v1/public/resend_email.py:122` instancia `TicketRepository()` sem
  argumentos (herda `BaseRepository.__init__(self, db, model)`); `TypeError` engolido pelo
  `except Exception` → HTTP 500 sempre. Teste passa verde porque mocka a própria classe.
- **Aceite**: endpoint reenviando e-mail de verdade; teste que exercita a instanciação real
  (sem patch da classe `TicketRepository`).

### E-02 — `decode_token` aceita refresh token como access token — `feito` (2026-08-26)
- **Executado**: `9a3fd36` — `decode_token` rejeita `type == "refresh"`; testes nas duas
  direções; refresh e impersonação preservados.
- **Problema**: `decode_refresh_token` exige `type == "refresh"`, mas `decode_token` não rejeita
  esse tipo — refresh de 30 dias vale como access no `jwt_middleware`. Docstring promete as duas
  direções; só uma existe.
- **Aceite**: `decode_token` rejeita `type == "refresh"`; testes cobrindo as duas direções;
  fluxos de refresh e impersonação intactos.

### E-03 — Rate limit em login / forgot-password / reset-password / resend público — `feito` (2026-08-26)
- **Executado**: `f99fe79` — login 10/min, forgot 5/h, reset 10/h, resend público 5/h (subido
  pra 15/h em `9acb93f` após atrito real), todos por IP. O keying atrás do proxy foi resolvido
  junto: `key_func` usa `X-Real-IP` (nginx sobrescreve com `$remote_addr`, não spoofável);
  deliberadamente sem `FORWARDED_ALLOW_IPS="*"` (pegaria o primeiro IP do `X-Forwarded-For`,
  controlado pelo cliente). Depende do 8000 publicado só em loopback (I-01). Testes de 429 em
  `test_rate_limits.py`.
- **Problema**: nenhum `@limiter.limit` nesses endpoints; resend público dispara até 10 e-mails
  por chamada sem auth. Atenção ao keying: uvicorn roda sem `--forwarded-allow-ips` atrás do
  nginx, então o IP visto pode ser o do próprio nginx (bucket único global) — corrigir o
  encaminhamento de IP **antes** de ligar limites, senão um atacante esgota o limite de todos.
- **Aceite**: limites conservadores ativos e keyed por IP real; teste demonstrando o 429.

---

## Fase 1 — Infra de custo zero (prioridade máxima após Fase 0)

### I-01 — Fechar portas de serviços internos no host — `feito` (2026-08-26)
- **Aceite verificado**: scan externo pós-aplicação — 5432/8000/3000/9091/3001 fechadas,
  apenas 80/443 respondem; site 200 e `/health` ok. Todos os containers recriados com bind
  em `127.0.0.1` (aplicado na VPS às 14:55 UTC pelo deploy, verificado via `docker port` e
  scan externo de outra rede).
- **Bônus na mesma passada**: healthcheck do frontend consertado em duas etapas — a causa
  era dupla. `c421144`: troca de `curl` (inexistente na imagem `node:20-alpine` runner) por
  `wget --spider` do busybox; ainda falhava com connection refused porque `localhost` no
  container resolve pra `::1` e o Next standalone escuta só IPv4 (busybox wget não faz
  fallback). `9810153`: alvo trocado pra `http://127.0.0.1:3000` — container finalmente
  `healthy`, verificado em produção. Regra derivada: healthcheck de container usa
  `127.0.0.1`, nunca `localhost`.
- **Problema**: `docker-compose.prod.yml` publica `postgres:5432`, `backend:8000`,
  `frontend:3000`, `prometheus:9091`, `grafana:3001` no host. UFW **não** protege porta publicada
  por container (a cadeia DOCKER do iptables roda antes do INPUT). Postgres de produção e backend
  cru (sem TLS/rate-limit/CSP) estão alcançáveis pela internet.
- **Entrega**: trocar todos os `ports` internos por bind local (`127.0.0.1:5432:5432` etc.).
  Nginx continua sendo a única porta de entrada (80/443). Verificar de fora com `nmap`/`nc`
  após o deploy.
- **Aceite**: de fora da VPS, apenas 22/80/443 respondem.
- **Esforço**: P (uma edição de compose + deploy + verificação). **Custo**: R$ 0.
- **Risco**: se algo externo hoje depende do 8000/5432 direto (não deveria), quebra — verificar antes.
- **Nota operacional**: o deploy automático só recria backend/frontend/nginx. Após o merge,
  aplicar o bind novo aos demais serviços manualmente na VPS (~segundos de indisponibilidade
  do banco ao recriar o postgres — fazer fora de horário de gira):
  `cd /opt/senhas && docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d postgres prometheus grafana`
  Depois verificar de fora: `nc -zv -w3 76.13.231.19 5432 8000 3000 9091 3001` deve falhar em
  todas; 80/443 devem responder.
- **Verificação pré-mudança feita**: nginx fala com backend/frontend pela rede interna do
  compose (`proxy_pass http://backend:8000`); o health check do deploy roda via SSH dentro da
  VPS (`localhost:8000`) — ambos preservados pelo bind em loopback.

### I-02 — Backup fora da VPS, criptografado, com restore testado — `em andamento` (instalado 2026-10-07)
- **Feito em 2026-10-07**: `devops/backup/` instalado na VPS — `pg_dump | gzip | gpg` (chave pública;
  a privada fica só com o dono; trocamos `age` por gpg) e upload via rclone para o bucket R2
  `girahub-backups`, cron diário às 03:15 UTC; primeiro backup (17 MB) no bucket. Configuração
  em `docs/deployment.md` §7.
- **Restore testado em 2026-10-07** na máquina do dono, com o backup de produção baixado do R2:
  19 tenants, 3746 tickets, 168 médiuns, 115 giras.
- **Falta para `feito`**: 3 dias seguidos de upload visíveis no bucket (até 2026-10-10).
- **Problema**: os dois mecanismos de backup (pré-deploy no CI e cron diário) gravam no mesmo
  disco do Postgres. Perda do volume/VPS = perda de tudo. Nenhum restore jamais testado.
- **Entrega (custo zero)**:
  1. Conta em free tier de object storage — Cloudflare R2 ou Backblaze B2 (10 GB grátis; dumps
     comprimidos do porte atual cabem com folga).
  2. No cron diário da VPS: `pg_dump | gzip | age -r <chave>` (criptografar **antes** de subir —
     o dump tem PII de consulentes) e upload via `rclone`. Retenção: 30 diários + 12 mensais.
  3. **Teste de restore documentado**: procedimento passo a passo em `docs/deployment.md`
     (baixar, decriptar, restaurar em container Postgres descartável, contar linhas de 3 tabelas)
     — executado uma vez por trimestre.
- **Aceite**: um backup real restaurado com sucesso em container local, procedimento documentado,
  upload diário visível no bucket.
- **Esforço**: M. **Custo**: R$ 0 (free tier).

### I-03 — Prometheus/Grafana: desligar (ou assumir de verdade) — `feito` (2026-08-26)
- **Executado**: opção "remover" aplicada por completo — serviços `prometheus` e `grafana`
  fora do `docker-compose.prod.yml` (com volumes `prometheus_data`/`grafana_data`),
  diretórios `prometheus/` e `grafana/` apagados, `src/monitoring/prometheus.py` deletado,
  env vars mortas removidas (`PROMETHEUS_ENABLED`, `PROMETHEUS_PORT`, `GRAFANA_PASSWORD` nos
  `.env.example`), step de instalação removido do `devops/vps_setup.sh`, check do
  `security/audit.sh` trocado para Sentry, e docs atualizados (README, RELEASE, DEPLOYMENT,
  AGENTS, CLAUDE, docs/architecture, docs/deployment).
- **Problema**: a pilha está montada mas não observa nada — o backend não expõe `/metrics`
  (módulo `src/monitoring/prometheus.py` é órfão, nunca importado; `prometheus_client` nem está
  nas dependências), 2 dos 3 scrape targets estão permanentemente DOWN, Grafana tem 0 dashboards,
  0 alertas. Dois containers consumindo RAM da VPS por nada.
- **Decisão recomendada**: **remover** os containers `prometheus` e `grafana` do compose, apagar
  `src/monitoring/prometheus.py`, `prometheus/`, `grafana/` e as env vars mortas
  (`PROMETHEUS_ENABLED`, `PROMETHEUS_PORT`). Sentry segue como observabilidade real (e cobre o
  que importa hoje: erros e traces). Se um dia houver necessidade de métricas de infra, religar
  é um item novo — feito de verdade, com `/metrics` exposto e alertas.
- **Aceite**: containers fora do ar, RAM liberada, nenhuma referência morta no repo/doc.
- **Esforço**: P. **Custo**: negativo (libera recursos).

### I-04 — CI em pull request (separado do deploy) — `feito` (2026-08-26)
- **Executado**: jobs de teste extraídos pra `.github/workflows/tests.yml` (workflow_call);
  `ci.yml` novo roda em `pull_request` pra master e em push de branches, com `concurrency`
  cancelando runs obsoletos da mesma ref; `deploy.yml` chama o mesmo `tests.yml`
  (`needs: tests`) — definição única, sem divergência entre sinal de PR e gate de deploy.
- **Aceite verificado**: PR de fumaça (#8) disparou `Tests / Backend Tests` (pass, 49s) e
  `Tests / Frontend Tests` (pass, 2m48s) automaticamente antes de qualquer merge; PR fechado
  sem merge e branch removida após a verificação.
- **Problema**: o único workflow roda em push na master — merge é deploy, branch não tem sinal
  nenhum. Todo erro só aparece quando já está indo pra produção.
- **Entrega**: `ci.yml` novo com gatilho `pull_request` (e `push` em branches), rodando os mesmos
  jobs `test-backend` + `test-frontend` do deploy.yml (extrair pra workflow reutilizável com
  `workflow_call` pra não duplicar). Deploy continua só em master.
- **Aceite**: abrir um PR de teste e ver os checks rodando antes do merge.
- **Esforço**: P–M. **Custo**: R$ 0 (GitHub Actions free tier cobre).

### Registro de operação — incidente de deploys paralelos (2026-08-26) — `resolvido`
- **O que houve**: dois pushes próximos na master dispararam runs de Deploy → VPS simultâneos
  (32980645099 e 32981679793) intercalando `docker compose` via SSH no mesmo `/opt/senhas`.
  Sequela: o `--force-recreate` intercalado deixou um container backend órfão renomeado
  (`<hash>_senhas-backend`) que bloqueava todo swap seguinte com "Conflict. The container
  name ... is already in use" — e a remoção do órfão derrubou o backend até o deploy seguinte
  recriá-lo.
- **Correções**: `65f177b` adiciona `concurrency: { group: deploy-vps, cancel-in-progress:
  false }` no deploy.yml — deploys agora enfileiram (verificado em produção: fila funcionando
  no mesmo dia); órfão removido manualmente na VPS (`docker rm -f`).
- **Nota**: no fim do dia o GitHub Actions teve `major_outage` oficial — runs com
  `startup_failure` em segundos e sem log são sintoma do incidente deles, não de erro nos
  workflows; re-run após a recuperação resolveu.

### I-05 — Consertos pequenos de operação (lote único) — `feito` (2026-08-26)
- **Executado**: os 7 itens abaixo aplicados num único commit. Validação: `npm ci` resolve o
  lockfile do workspace sem `--legacy-peer-deps`, e o build de produção do frontend passa com
  type-check e lint reativados (`next build` local, exit 0). O `npm audit` sem `|| true` pode
  aparecer vermelho no job (não-bloqueante via `continue-on-error`) — comportamento desejado.
- `backend/entrypoint.sh` roda `alembic upgrade heads` (plural, mascara heads divergentes);
  deploy.yml roda `head` (singular). Unificar em `head`.
- Comentário do backup no deploy.yml diz "10 backups", código mantém 30. Corrigir o comentário.
- `security-audit` no CI tem `continue-on-error: true` **e** `|| true` — nem o log fica vermelho.
  Remover o `|| true` (mantém não-bloqueante, mas passa a ser visível).
- `.husky/pre-commit` está morto (husky/lint-staged não instalados, `core.hooksPath` vazio,
  script `lint-staged` não existe). Remover `.husky/` e `.lintstagedrc.json` — ou instalar de
  verdade. Recomendação: remover (o CI bloqueante já cobre).
- `next.config.js` tem `ignoreBuildErrors: true` + `ignoreDuringBuilds: true` — o strict do
  TypeScript é anulado em qualquer build fora do CI. Remover os dois (o débito de lint/type já
  foi zerado segundo o próprio comentário do workflow).
- Deploy usa `npm install --legacy-peer-deps` → trocar por `npm ci` (build reprodutível).
- Deploy usa `build --no-cache` → remover o `--no-cache` (cache por camada já invalida certo;
  reduz a janela de deploy e a carga na VPS).
- **Esforço**: P cada, M no total. **Custo**: R$ 0.

---

## Fase 2 — Rede de segurança de qualidade (ataca a causa dos 213 commits de fix)

### Q-01 — Testes de integração com Postgres real — `feito` (2026-10-05)
- **Feito**: `backend/tests/integration_pg/` (67 testes + 2 xfail) no job bloqueante "Backend
  Integration (Postgres)" do CI (service container Postgres 15). App inteiro via httpx.ASGITransport,
  schema pelas migrações. Grupos: 1) emissão concorrente (7); 2) isolamento de tenant em 13 módulos/rotas
  com conferência no banco e controle positivo (42); 3) RBAC por HTTP (9 + xfail Q-05); 4) webhook Stripe
  com assinatura real (4 + xfail não estrito Q-04); 5) migrações em banco zerado (5).
  (Números da entrega de 2026-10-05. Os dois xfail saíram com o Q-04 e o Q-05; em 2026-10-09 a suíte tem mais de
  500 testes, um arquivo por card/jornada, e nenhum xfail.)
  `tests/integration/` morta e `tests/fix_quotes.py`/`fix_escaped.py` apagados.
- **Bugs reais achados e corrigidos na mesma entrega**: (a) primeiras emissões simultâneas numa gira
  sem contador (senha de associado, 11 giras antigas em produção) davam 500 por UniqueViolation no
  SenhaControl → `INSERT ... ON CONFLICT DO NOTHING`; (b) o tratamento da corrida de consulente com o
  mesmo e-mail fazia `session.rollback()` completo, expirava tenant/gira e derrubava a emissão com
  MissingGreenlet → savepoint (`begin_nested`), também no walk-in; (c) plano gratuito (`max_mediuns`
  0) criava médiuns pela API → 403.
- **Achado registrado (corrigido em 2026-10-05)**: `alembic check` apontava 10 divergências entre
  modelos e schema migrado. Os MODELOS foram alinhados ao banco (fonte da verdade), sem migração:
  `audit_logs.details` JSONB; ondelete `audit_logs.tenant_id` SET NULL (031),
  `estoque_movimentacoes.item_id` CASCADE (031), `tickets.emitido_por_id` SET NULL (030);
  `contas_financeiras.tipo`/`recorrencia` String(10); índices `ix_consulentes_email_normalized`,
  `ix_tickets_checkin_em` e parciais `uq_consulentes_tenant_email_active` (052) e
  `uq_users_email_superadmin` (039) declarados em `__table_args__`. `alembic check` virou gate no CI
  (job `test-backend-integration`) e teste `test_modelos_batem_com_schema_migrado`.
- **Problema**: 47 dos 56 arquivos de teste mockam o banco; nenhum teste toca Postgres; endpoints
  são chamados como função (Depends nunca roda). A suíte mede execução de linhas, não
  comportamento — todos os incidentes recentes (walk-in, time-slots, consulente duplicado) eram
  violações de constraint que só Postgres real pega. `tests/integration/` atual está morta
  (chama APIs extintas, e rodaria em SQLite, que não tem `SELECT FOR UPDATE`).
- **Entrega**: nova suíte `tests/integration_pg/` (~30 testes), rodando contra Postgres real:
  - Local: `docker compose -f docker-compose.dev.yml` (já existe) ou testcontainers.
  - CI: service container de Postgres no job (free).
  - Cobertura mínima, nesta ordem de valor:
    1. **Emissão concorrente** (N requests simultâneos → sem duplicata, sem furo de capacidade).
    2. **Isolamento de tenant**: autenticado no tenant A, tentar ler/escrever recurso do tenant B
       em cada módulo → 404/403 sempre.
    3. **RBAC via HTTP real** (httpx AsyncClient + app FastAPI): operador sem permissão → 403;
       os `Depends(require_group_permission)` finalmente exercitados.
    4. **Webhook Stripe**: idempotência com entrega duplicada.
    5. **Migrações**: `alembic upgrade head` num banco zerado (o caso que já quebrou na 044b).
  - Apagar `tests/integration/` morta e os scripts one-off `tests/fix_quotes.py`/`fix_escaped.py`.
- **Aceite**: suíte no CI (via I-04), bloqueante; os 5 grupos acima cobertos.
- **Esforço**: G (o maior item do plano — pode ser fatiado em 5 sessões, uma por grupo).
- **Custo**: R$ 0. **Dependência**: I-04 (pra rodar em PR).

### Q-02 — Auditor AST de `tenant_id` no CI — `feito` (2026-10-05)
- **Executado**: `backend/scripts/audit_tenant_isolation.py` + step "Audit — isolamento de tenant
  em queries admin" no job `test-backend` de `tests.yml` (bloqueante, logo após o auditor de RBAC).
  Descobre sozinho os modelos com coluna `tenant_id` (36 hoje) lendo `src/models/` via AST e, em
  cada arquivo de `api/v1/admin/`, exige filtro de tenant (`<M>.tenant_id == <valor de tenant>`,
  `filter_by(tenant_id=...)`, `.tenant_id.in_(...)`) para todo `select/update/delete/exists` — e
  `session.get(Modelo, id)` — sobre esses modelos, olhando a cadeia do statement, as extensões da
  variável (`stmt = stmt.where(...)`), listas de condições e, por fluxo de dados, pai carregado
  por select filtrado na mesma função. 77 queries checadas; 3 exceções justificadas em
  `EXEMPT_QUERIES` (impersonadores no audit trail, unicidade global de slug de site, ramo
  super_admin de `list_users`). 7 queries ganharam filtro de tenant redundante em vez de exceção
  (reloads pós-criação em contas/estoque, lookups de usuário e limpeza de memberships em
  permission_groups). Testes em `tests/unit/test_audit_tenant_isolation.py`.
- **Cobertura ampliada em 2026-10-05** (mesmo script, mesmo step do CI, renomeado para "Audit —
  isolamento de tenant (admin, repositories/services, public, FKs da requisição)"):
  - **repositories/services** (190 queries): método que recebe `tenant_id`/`tenant` tem que filtrar
    por valor DERIVADO desse parâmetro (`Modelo.tenant_id == current_user.tenant_id` num método que
    ignorou o `tenant_id` recebido não passa) ou delegar a uma chamada que o recebe
    (`self._build_conditions(tenant_id)`); método sem parâmetro de tenant precisa de filtro ou de
    entrada em `EXEMPT_SCOPED_QUERIES` (29: plataforma/super_admin, schedulers, site público por
    slug, sessões por `user_id`, EXISTS correlacionado) ou `RESOLVED_ID_QUERIES` (2: só recebe id já
    resolvido no tenant — o auditor lista TODOS os chamadores em `src/` e falha com chamador novo).
    `self.model` de repository genérico é auditado.
  - **rotas public** (25 queries): filtro de tenant ou "busca raiz" (`Modelo.id`/`slug`/`*token*`
    comparado direto com parâmetro da requisição — o objeto endereçado por UUID/slug é o recurso
    público); query filha por objeto carregado (`Gira.id == ticket.gira_id`) exige
    `Gira.tenant_id == ticket.tenant_id`. 3 exceções (unicidade global de e-mail/username/trial no
    onboarding).
  - **FKs da requisição** (29 gravações): em rota admin, campo do body ou parâmetro de path/query
    cujo nome é coluna FK para tabela multi-tenant (inferido dos `ForeignKey` dos modelos) e chega
    a um construtor de modelo, `obj.<coluna> = ...`, `setattr` sobre `body.model_dump()` ou chamada
    de escrita (`create*`/`update*`/`registrar*`/`get_or_create*`...) precisa de busca escopada no
    tenant antes (`select` com tenant comparando `.id`, `_validar_*_do_tenant(...)`,
    `repo.get_by_id(id, tenant_id)` — resolvendo o callee para conferir que ele busca PELO id) ou
    de o callee validar o parâmetro (`PermissionGroupRepository.add_member`). 0 exceções.
  - **Achados corrigidos**: `PermissionService.get_user_effective_permissions` recebia `tenant_id` e
    não filtrava o usuário por ele — com usuário de outro tenant caía no ramo "sem grupos = acesso
    total de operador" (não explorável hoje: o único chamador passa o próprio usuário logado;
    regressão em `tests/integration_pg/test_fk_cross_tenant.py`). Filtro de tenant redundante em
    `add_member` (checagem de duplicata), `SiteRepository.save_sections`,
    `SiteVersionRepository.create`, `waitlist_service.send_confirmed_ticket_email` e
    `public/waitlist_confirm.py`. Varredura dos FKs de body/path de todas as rotas admin (estoque,
    mensalidades, cursos, walk-in, bulk de tickets, permission_groups, time slots, associados) não
    achou vazamento novo além dos já corrigidos no Q-02; regressão HTTP de cada um contra Postgres
    real em `test_fk_cross_tenant.py`.
  - Testes: `tests/unit/test_audit_tenant_isolation_ampliado.py` (snippets sintéticos + mutação em
    arquivos reais: remover validador/filtro de `contas_financeiras`, `estoque`, `mensalidades`,
    `cursos_presenciais`, `base.py`, `gira_repo`, `permission_service`, `waitlist_confirm` ou do
    `add_member` do repository faz o auditor falhar).
- **Limites** (docstring do script): rotas `platform/` e `auth/` não auditadas; não valida o valor
  comparado no admin/public (no scoped só exige derivação do parâmetro, por fluxo de dados
  generoso); filtro dentro de `if` conta como sempre aplicado (parâmetro de tenant `Optional`
  com default `None`, como em `TicketAnalyticsRepository`, não é detectado); delegação confia na
  função chamada; checagem de FK só em rotas admin, só schemas do próprio arquivo, só campos com o
  nome exato da coluna, body inteiro passado a service não é seguido, chamada de busca não
  resolvida é aceita pelo nome; exceção vale para a função inteira.
- **Aceite verificado**: teste de mutação remove um filtro de tenant de arquivos admin reais
  (`giras_crud.py`, `contas_financeiras.py`) e o auditor falha; varredura removendo cada um dos
  73 filtros `<Modelo>.tenant_id == ...` de uma linha: 70 detectados, 3 não detectados por design
  (query filha de pai já filtrado na mesma função — o acesso segue restrito ao tenant).
- **Vazamento real encontrado na revisão** (fora do alcance do auditor, corrigido junto):
  `contas_financeiras.py` (`create_conta`/`update_conta`/`dar_baixa`) aceitava
  `categoria_id`/`conta_bancaria_id` de outro tenant, e `estoque.py` (`create_item`/`update_item`)
  aceitava `grupo_id` de outro tenant — o registro passava a apontar para o alheio e a resposta
  devolvia o nome dele. Exigia conhecer o UUID (v4), então impacto baixo; agora responde 422.
  Regressão em `tests/unit/test_admin_fk_tenant_validation.py`.
- **Problema**: isolamento multi-tenant depende de 428 repetições manuais de
  `current_user.tenant_id`; esquecer uma não quebra nada — vaza silenciosamente. Sem RLS, sem
  filtro de sessão.
- **Entrega**: `backend/scripts/audit_tenant_isolation.py`, espelhando o padrão do
  `audit_permission_guards.py` que já existe e funciona: para cada endpoint em `admin/` que monta
  `select()` sobre modelo com coluna `tenant_id`, exigir que a query filtre por tenant (heurística
  AST + lista de exceções justificadas, como o auditor de RBAC já faz). Bloqueante no CI.
- **Aceite**: auditor no CI; remover um filtro de tenant de propósito quebra o build.
- **Esforço**: M–G. **Custo**: R$ 0.
- **Nota**: RLS no Postgres ou `with_loader_criteria` global são a solução definitiva, mas são
  refactor de risco — o auditor dá 80% da proteção por 20% do custo. Reavaliar RLS depois de Q-01.

### Q-03 — Constraint de dedup de emissão no banco — `feito` (2026-10-05)
- **Feito**: migração 056 cria `uq_tickets_gira_consulente_ativo`, índice único parcial em
  `(gira_id, consulente_id, is_sponsor)` para senhas não canceladas, não soft-deleted e que não
  são acompanhantes (espelha `check_duplicate_in_gira`). Antes do índice, duplicatas existentes
  são canceladas mantendo a mais antiga (produção tinha 1 par: walk-in duplo com 92s de
  diferença). A emissão pública e o walk-in da Porta criam a senha dentro de savepoint e
  traduzem a violação em 409, a mesma resposta do pré-check (não devolvem o ticket existente,
  para não mudar o contrato do link público). O walk-in passou a fazer o pré-check também.
  Testes em `tests/integration_pg/test_ticket_dedup.py`, incluindo rajada de walk-ins e a
  migração deduplicando dados existentes.
- **Problema**: o dedup de ticket é check-then-act sem backstop — não existe `UniqueConstraint`
  em `(gira_id, consulente_id)`. Duas requisições simultâneas com o mesmo e-mail passam ambas.
  Mesma família do incidente que gerou a migração 052.
- **Entrega**: migração com índice único parcial (tickets ativos; definir semântica com
  cancelados/no-show antes — provavelmente `WHERE status NOT IN ('cancelled')`), + tratamento de
  `IntegrityError` no `emit_ticket` devolvendo o ticket existente (mesmo padrão do fix do
  walk-in). **Pré-requisito**: query de produção pra medir duplicatas existentes e dedup prévio
  (aprender com a 052).
- **Aceite**: teste de integração de emissão concorrente (Q-01 grupo 1) passa com a constraint.
- **Esforço**: M. **Custo**: R$ 0. **Dependência**: idealmente depois de Q-01 grupo 1.

### Q-04 — Fechar idempotência do webhook Stripe — `feito` (2026-10-05)
- **Feito**: `INSERT ... ON CONFLICT DO NOTHING RETURNING` da marca em `stripe_events_processed`
  antes de processar, na mesma transação do efeito. Entrega simultânea: a 2ª espera o lock do
  índice único e pula. Falha no processamento: rollback desfaz a marca e o reenvio é reprocessado.
  O teste de entrega simultânea do grupo 4 do Q-01 deixou de ser xfail.
- **Problema**: `webhooks.py` faz SELECT → processa → INSERT; duas entregas concorrentes do mesmo
  `event_id` aplicam o efeito duas vezes (o `except IntegrityError` só evita a linha duplicada).
- **Entrega**: inverter para `INSERT ... ON CONFLICT DO NOTHING` **antes** de processar; se a
  linha já existia, retornar 200 sem reprocessar.
- **Aceite**: teste de integração com entrega duplicada simultânea (Q-01 grupo 4).
- **Esforço**: P–M. **Custo**: R$ 0.

### Q-05 — RBAC fail-open → fail-closed — `feito` (2026-10-05)
- **Feito**: operador sem grupo não acessa nada (`PermissionService.check_permission` e
  `get_user_effective_permissions`). Migração 057 adiciona `permission_groups.is_default`, cria em
  todo tenant o grupo "Acesso total" (ver/criar/editar/excluir em todas as features; o plano
  continua limitando por cima) e põe nele todo operador ativo sem grupo — em produção eram 5
  operadores em 4 tenants, incluindo 2 do pagante. Operadores já em grupo não mudam. O grupo padrão
  nasce com o tenant (cadastro e criação pela plataforma), recebe operadores novos e admins
  rebaixados, pode ser editado e não pode ser excluído. Telas de grupos deixaram de dizer que
  "sem grupo = acesso total". Testes em `tests/integration_pg/test_rbac_grupo_padrao.py`; o xfail
  estrito do grupo 3 do Q-01 saiu.
- **Feature nova no enum**: a migração que acrescenta o valor deve também inserir a linha com
  acesso total nos grupos `is_default` (senão o grupo padrão não a vê até o próximo operador ser
  criado, quando `ensure_default_group` completa).
- **Problema**: operador sem nenhum grupo tem acesso total ("backward compatibility"). Usuário
  novo criado sem grupo = permissão irrestrita no tenant.
- **Esforço**: M. **Custo**: R$ 0.

### Q-06 — Atualização de dependências (staged) — `feito` (2026-10-06; lotes 1-3 em 2026-10-05, PR #40 e lote 3 já no master; etapa final fastapi 0.142.2 + starlette 1.7.0 em 2026-10-06)
- **Feito (lotes 1-2, 2026-10-05)**:
  - Lote 1: `passlib` removido (o código já usava `bcrypt` puro; `bcrypt==5.0.0` agora declarado
    e pinado — antes vinha transitivo e sem pin). A troca `python-jose` → `PyJWT` já tinha entrado
    em 2026-09-06 (commit 7a93037); agora há prova de compatibilidade:
    `tests/unit/test_security_jwt_compat_jose.py` decodifica tokens gerados pelo próprio
    `python-jose==3.3.0` (access, impersonação, super_admin, refresh, expirado) e confirma que o
    PyJWT emite bytes idênticos para o mesmo payload — sessões abertas antes do deploy seguem válidas.
  - Lote 2 (antes → depois): fastapi 0.118.3 → **0.136.3**; starlette 0.48.0 → **0.52.1**;
    sqlalchemy 2.0.23 → **2.0.54** (agora `sqlalchemy[asyncio]`, greenlet explícito); alembic
    1.12.1 → **1.20.0**; pydantic 2.5.0 → **2.13.5**; pydantic-settings 2.1.0 → **2.15.0**;
    uvicorn 0.24.0 → **0.54.0**; httpx 0.25.2 → **0.28.1**; asyncpg 0.29.0 → **0.31.0**;
    pytest-asyncio 0.21.1 → **0.26.0** (exigiu pytest 7.4.3 → **8.4.2**).
  - Quebras tratadas: override de `event_loop` de sessão em `tests/integration_pg/conftest.py`
    (depreciado) migrado para `loop_scope="session"`; `asyncio.get_event_loop()` em teste síncrono →
    `asyncio.run`; `Query(regex=)` → `pattern=`; `HTTP_422_UNPROCESSABLE_ENTITY`/`HTTP_413_REQUEST_ENTITY_TOO_LARGE`
    → `..._CONTENT`/`HTTP_413_CONTENT_TOO_LARGE` (depreciados no starlette).
  - Teto deliberado (superado na etapa final, abaixo): fastapi parado em 0.136.x — o 0.137 refatora o roteamento (`router.routes`
    vira árvore, breaking declarado) e o 0.142 liga OpenTelemetry nativo; starlette segue em 0.x.
    Os dois sobem juntos numa migração própria. O starlette 0.52.1 corrigiu PYSEC-2026-1942 (saiu
    das exceções do pip-audit no deploy.yml); seguem ignoradas 161/248/249/2280/2281, todas só
    corrigidas no starlette 1.x — incluindo PYSEC-2026-249 (DoS em `request.form`, CVSS alto).
- **Feito (lote 3, 2026-10-05)** — idioma Pydantic v2 em `backend/src`, refactor puro:
  - 37 `Model.from_orm(x)` → `Model.model_validate(x)` (todos os schemas alvo já tinham
    `from_attributes`).
  - 30 `class Config:` → `model_config = ConfigDict(...)` (29 `BaseModel`: 27 `from_attributes`,
    2 `json_schema_extra`) e `SettingsConfigDict` no `Settings` (`core/config.py`).
  - 9 `.dict(` → `.model_dump(` — só em objetos Pydantic; os 4 `.json()` restantes são respostas
    httpx (Resend/Brevo) e ficaram.
  - Validators já estavam em `@field_validator`/`@model_validator`; não havia `parse_obj`,
    `.copy(update=)`, `@validator` nem `@root_validator`.
  - Prova de "zero mudança de contrato": o OpenAPI gerado (`app.openapi()`) é byte a byte igual
    antes/depois. Suíte unit+api roda com `-W error::pydantic.warnings.PydanticDeprecatedSince20`
    sem nenhum aviso Pydantic restante.
  - Os únicos hits de `grep "class Config"` em `src` são `ConfigResponse`/`ConfigUpdate`
    (nomes de modelo em `mensalidades.py`, não config de classe).
- **Feito (etapa final, 2026-10-06)** — fastapi 0.136.3 → **0.142.2**; starlette 0.52.1 → **1.7.0**;
  piso do `sentry-sdk[fastapi]` 1.39.0 → **2.63.0** (resolve 2.71.0). Fontes: release notes do
  fastapi 0.137.0–0.142.2 (`gh release view <tag> -R fastapi/fastapi`) e do starlette 1.0.0rc1–1.7.0
  (`docs/release-notes.md` em github.com/Kludex/starlette).
  - **Roteamento (fastapi 0.137)**: `include_router` não copia mais as rotas — `app.routes` vira
    árvore com nós `_IncludedRouter`, e `r.path` neles levanta `AttributeError`. Quebrou
    `tests/unit/test_main.py` (2 testes) e, pior, deixou `tests/unit/test_route_shadowing.py`
    **verde sem checar nada** (o filtro `isinstance(r, APIRoute)` só via as 2 rotas do próprio app).
    Solução: percorrer com `fastapi.routing.iter_route_contexts(app.routes)` (API pública desde o
    0.137.2), que achata a árvore na ordem de despacho com o path efetivo (prefixado) e o
    `matches()` da rota incluída. O teste de sombreamento ganhou guarda (`> 200` rotas) e um
    caso sintético com router aninhado que prova que o detector ainda acha a rota engolida.
    `tests/plan_gate_helpers.py` percorre `router.routes` de routers soltos (não incluídos) e
    seguiu funcionando. Código de produção não percorria rotas.
  - **OpenTelemetry nativo (fastapi 0.142)**: `opentelemetry-api` virou dependência direta do
    fastapi (leve, só `typing-extensions`); SDK/exporters seguem no extra `fastapi[opentelemetry]`,
    não instalado. Por padrão é no-op sem provider global nem `OTEL_EXPORTER_OTLP_*`, mas fica
    **desligado explicitamente** em `src/main.py` (`telemetry={"tracing": False, "metrics": False,
    "logs": False, "auto_configure": False}`) — tracing/erros continuam no Sentry e não há coletor
    OTLP na infra. Religar = item novo com coletor.
  - **Sentry**: o `sentry-sdk` < 2.63 nomeia a transação pela URL concreta quando a rota está num
    router prefixado (alta cardinalidade) e embrulha duas vezes handlers sync no fastapi ≥ 0.137;
    piso subiu pra 2.63.0. Verificado com transport falso: integrações `fastapi`+`starlette`
    ativas, erro capturado e transação `/api/v1/platform/tenants/{tenant_id}` (template).
  - **Starlette 1.0** removeu `on_startup`/`on_shutdown`/`on_event`/`add_event_handler`,
    `@app.route`, `@app.middleware`/`@app.exception_handler` *do Starlette* e o
    `TemplateResponse(name, ctx)`. Nada disso afetou: o app já usava `lifespan`, e
    `app.middleware("http")`/`app.exception_handler` são os do próprio `FastAPI` (mantidos).
    `TrustedHostMiddleware`, CORS, slowapi e uploads (`UploadFile`/`Form`, inclusive arquivo de
    1,8 MB com campos de formulário) seguem iguais; multipart malformado continua 422.
  - **Contrato**: `app.openapi()` byte a byte igual antes/depois (sha256 `2f91670f…`, 184 paths,
    190 schemas). Mesmas 247 rotas.
  - **pip-audit**: sem nenhuma `--ignore-vuln` no `deploy.yml` → "No known vulnerabilities found".
    As 5 ignoradas (PYSEC-2026-161, 248, 249, 2280, 2281) eram todas do starlette 0.52.1
    (corrigidas em 1.0.1/1.3.0/1.3.1/1.1.0/1.1.0).
  - **Fica fora**: o `TestClient` do starlette 1.x avisa (`StarletteDeprecationWarning`) que usar
    `httpx` está depreciado em favor do `httpx2`. É só aviso; trocar mexe nos testes que usam
    `httpx.AsyncClient`/`ASGITransport` e nos mocks de `httpx` dos clientes Resend/Brevo — item
    próprio quando o starlette anunciar a remoção.
- **Problema**: backend congelado em 2023 (`fastapi==0.104.1`, `sqlalchemy==2.0.23`,
  `pydantic==2.5.0`); `python-jose==3.3.0` com CVE-2024-33663/33664; `passlib` é dependência
  morta (código usa `bcrypt` puro) e incompatível com bcrypt 5; Pydantic rodando em idioma v1
  (37 `from_orm`, 30 `class Config`, zero `ConfigDict`).
- **Entrega em 3 lotes** (cada um com a suíte verde antes de seguir):
  1. Remover `passlib`; trocar `python-jose` por `PyJWT` (API quase idêntica, mantido ativamente).
  2. Bump de patch/minor: fastapi, sqlalchemy, alembic, pydantic dentro das majors atuais.
  3. Modernizar Pydantic pra idioma v2 (`ConfigDict`, `model_validate`, `model_dump`) — mecânico
     mas espalhado; fazer por módulo.
- **Aceite**: `pip-audit` sem HIGH conhecidos; suíte verde; lote 3 sem `from_orm`/`class Config`.
- **Esforço**: lotes 1-2 M, lote 3 G. **Custo**: R$ 0.
- **Dependência**: Q-01 (não atualizar framework sem teste de integração real como rede).
- **Frontend (fora dos 3 lotes, feito em 2026-10-05)**: `@sentry/nextjs` 8.55 → 10.76. Init do
  navegador migrado para `frontend/src/instrumentation-client.ts`, `withSentryConfig` importado de
  `@sentry/nextjs/config`, `hideSourceMaps` (removido no SDK 9) trocado por
  `sourcemaps.deleteSourcemapsAfterUpload`. Tirou do allowlist do `audit-ci` o rollup
  (GHSA-mw96-cpmx-2vgc) e o braces (GHSA-vfj7-8cjw-p6xm).

---

## Fase 3 — Produto

### P-01 — PWA da Visão da Porta — `feito` (2026-10-06)
- **Racional**: a Porta é usada em pé, em tablet, durante a gira — o caso perfeito de PWA
  (ícone na home, fullscreen, sobrevive a oscilação de rede). Antes não havia manifest nem
  service worker (e o `favicon.ico` tinha 0 bytes).
- **O que entrou**:
  - Ícones gerados de `frontend/public/favicon.svg` por `frontend/scripts/generate-icons.mjs`
    (`node frontend/scripts/generate-icons.mjs`; usa o `sharp` que já vem com o `next`, sem
    dependência nova): `favicon.ico` 16/32/48, `icons/icon-192.png`, `icons/icon-512.png`,
    `icons/icon-maskable-512.png` (bilhete a 78% dentro do círculo seguro), `apple-touch-icon.png`
    180 (fundo até a borda). O `generate_favicons.py` da raiz foi apagado (desenhava outro ícone e
    apontava para um caminho do Windows).
  - `frontend/public/manifest.webmanifest`: `start_url` `/admin/porta?source=pwa`, `scope` `/`,
    `display` `standalone` (mantém a barra de status com relógio, bateria e sinal — útil na gira;
    o iOS não tem `fullscreen` e o Android esconderia as barras do sistema), `orientation` `any`,
    atalhos Porta/Giras/Senhas. Linkado no `_document.tsx` com as meta tags do iOS.
  - `frontend/public/sw.js` escrito à mão: `/_next/static/*` cache-first, ícones/manifest
    stale-while-revalidate, navegação sempre pela rede com fallback para `/offline`
    (`src/pages/offline.tsx`). **Nunca** cacheia `/api/*`, `/ws/*`, `/_next/data/*`, POST, outra
    origem, requisição com `Authorization` nem resposta `no-store`/`private`; HTML não é guardado.
    Cache `girahub-shell-<buildId>` (registro com `?v=<buildId>`), versões antigas apagadas no
    `activate`. Registro em `components/shared/ServiceWorkerRegistrar` (no `_app`), só em produção
    e contexto seguro; em dev desregistra. `next.config.js`: `Cache-Control: no-cache` +
    `Service-Worker-Allowed: /` no `sw.js`.
  - Porta: aviso fixo "Sem conexão — mostrando a última fila carregada" (`navigator.onLine` falso
    ou 2 falhas seguidas da atualização; um toast de erro só), toast "Conexão de volta" e
    atualização imediata ao voltar a rede; dica "Instalar a Porta na tela inicial"
    (`beforeinstallprompt` no Android/Chrome, Popover com Compartilhar → Adicionar à Tela de
    Início no iOS), escondida no app instalado e dispensável (`localStorage`).
  - Lighthouse 11.7 (última versão com a categoria PWA; o 12 a removeu) em `next start`:
    PWA 100 — installable-manifest, maskable-icon, splash-screen, themed-omnibox, viewport e
    content-width passam. Conferido também em Chrome headless: SW ativo controlando a página,
    nenhuma entrada `/api/*` no cache, navegação offline para `/admin/porta` mostra `/offline`
    com estilo.
- **Fora desta fase**: emissão/ações offline com sincronização; cache da última fila em
  armazenamento (a fila "mostrada" é a que está na memória da aba); push notifications.
- **Entrega**: `manifest.json` + ícones reais (o `generate_favicons.py` da raiz nunca rodou —
  consertar ou substituir), service worker mínimo (cache de shell + fallback offline com aviso
  "sem conexão" na Porta; **sem** tentar sincronização offline de emissão nesta fase), meta tags
  de instalação iOS.
- **Aceite**: "Adicionar à tela inicial" funcional em Android e iOS; Porta abre fullscreen;
  Lighthouse PWA verde.
- **Esforço**: M. **Custo**: R$ 0.

### P-02 — WhatsApp como canal de senha — `pendente` (decisão antes de código)
- **Status (2026-10-09)**: o dono quer a API oficial da Meta e decide depois (aguardando). Custos e caminho em
  `docs/custos-whatsapp-meta.md`; card P-02 do [plano-benchmark-2026-10.md](plano-benchmark-2026-10.md).
- **Racional**: público-alvo é mobile-first e nem sempre lê e-mail; todo o investimento em
  template de e-mail atende o canal errado pra parte da audiência. Provável maior alavanca de
  produto do plano.
- **Decisão a tomar** (custo zero de infra, mas exige escolha):
  - **Meta WhatsApp Cloud API**: oficial, tem faixa gratuita de conversas de serviço; exige
    número dedicado, verificação de negócio e template aprovado. Recomendado, mas o free tier e
    as regras de template mudam — **validar os limites atuais antes de especificar**.
  - Alternativas não-oficiais (Evolution API etc.) são custo zero mas violam ToS do WhatsApp —
    risco de banir o número. **Não recomendado** para o canal principal do produto.
  - Meio-termo imediato (custo zero, sem API): botão "receber no WhatsApp" pós-emissão com
    `wa.me` click-to-chat pré-preenchido — o consulente inicia a conversa e manda a senha pra
    si mesmo. Feio, mas resolve o "perdeu o e-mail" hoje.
- **Entrega da fase de decisão**: spec curta com fluxo escolhido, custos reais verificados e
  limites do free tier — só então virar item de implementação.
- **Esforço**: decisão P; implementação M–G. **Custo**: R$ 0 na decisão; validar na implementação.

### P-03 — API Premium: remover ou implementar — `feito` (2026-10-06, removida)
- **Feito**: decisão do dono do produto pela recomendação (remover). `api_access` saiu de `PlanFeatures`
  (`backend/src/services/plan_features.py`), da fonte única de planos do frontend (`constants/plans.ts`,
  que alimenta landing, assinatura e comparativo), do tipo `PlanFeatures` do `useSubscription` e da tabela
  de planos da plataforma. A chave gerada em `TenantService.create_tenant`, que nunca era persistida nem
  validada, deixou de ser gerada e devolvida. Para recolocar: projeto deliberado com chave persistida
  (hash), escopo read-only primeiro e documentação.
- **Problema**: o plano Premium anuncia `api_access` que não existe — a flag não tem consumidor,
  a chave gerada nunca é persistida, `/docs` é desabilitado em produção. Vender o que não existe
  é passivo comercial.
- **Recomendação custo-zero**: **remover** da tabela comparativa de planos e do
  `plan_features.py` agora (30 min de trabalho); recolocar no dia em que houver demanda real de
  cliente, como projeto deliberado (chave persistida + hash, escopo read-only primeiro, docs).
- **Aceite**: nenhuma menção a API/api_access visível pra cliente; flag removida ou marcada
  interna.
- **Esforço**: P. **Custo**: R$ 0.

### P-04 — Unificar renderers do Site Builder — `feito` (2026-10-06, fase 7 da M-01: `frontend/src/components/site/sections/*`)
- **Problema**: ~2.500 linhas duplicadas entre `admin/meu-site.tsx` (previews) e
  `[tenantSlug]/index.tsx` (site público) — 8 seções paralelas + 5 helpers byte-a-byte idênticos.
  Toda mudança visual precisa ser feita duas vezes ou o preview mente.
- **Entrega**: extrair `src/components/site-sections/` com um componente por seção usado pelos
  dois lados (prop `mode: 'preview' | 'live'` onde precisar); helpers num módulo único. Reduzir
  `meu-site.tsx` (4.608 linhas) no processo.
- **Aceite**: `diff` conceitual zero entre preview e site publicado; nenhum helper duplicado.
- **Esforço**: G (fatiar por seção: uma sessão pra infra + 2 seções, depois lotes).
- **Custo**: R$ 0.

### P-05 — Gate de plano único no backend — `feito` (2026-10-05)
- **Problema**: 6 variações de gate de plano (`_require_pro`, `_require_pro_or_premium`,
  `_require_estoque_plan`…) com semânticas divergentes — um checa status da assinatura, outro
  não (tenant PRO cancelado mantém Contas Financeiras); `_PLAN_TIER` copiado 4×;
  `require_super_admin` copiado 9×.
- **Entrega**: um `require_plan_feature(feature)` em `api/dependencies.py` com semântica única
  (plano **e** status da assinatura), adotado nos 6 módulos; `_PLAN_TIER` só em
  `plan_features.py`; `require_super_admin` único em `dependencies.py`.
- **Aceite**: grep por `_PLAN_TIER` retorna 1 arquivo; tenant com assinatura suspensa/cancelada
  perde acesso consistentemente em todos os módulos gated.
- **Esforço**: M. **Custo**: R$ 0.
- **Feito (2026-10-05)**: `require_plan_feature(feature)` + `check_plan_feature` (inline) +
  `effective_limit` (limites numéricos) em `api/dependencies.py`; catálogo, `_PLAN_TIER` e
  `subscription_block_reason` só em `services/plan_features.py`; `require_super_admin` único em
  `dependencies.py` (10 cópias removidas, contando `_require_super_admin` do billing_sync).
  Adotado em estoque, sites, cursos presenciais, contas financeiras, e-mail (rastreio/reenvio),
  mensalidades (médiuns, associados, config, relatório), médiuns (aniversariantes/criação) e nos
  toggles de fila de espera/agendamento; `PermissionService`, `/admin/subscription`, dashboard,
  waitlist e time slots usam `get_effective_plan_features`.
  **Semântica**: plano inclui a feature (senão 403) **e** status permite uso (senão 402):
  SUSPENDED bloqueia; CANCELLED/EXPIRED bloqueiam plano pago (CANCELLED+FREE pós-`reset_to_free`
  segue no FREE); trial local vencido bloqueia antes do scheduler rebaixar; trial Stripe fica com o
  webhook; `is_bonus` segue o status mas não tem corte de trial; `cancel_at_period_end` mantém
  acesso até o webhook de exclusão. Limites numéricos: SUSPENDED → 402, cancelado/trial vencido →
  limites do FREE. Achados corrigidos de passagem: relatório de mensalidades dava NameError
  (`_PLAN_TIER` sem import → 500) e mensalidade de médiuns exigia PREMIUM no backend embora o
  catálogo/tela digam PRO+ desde 2026-06-27. Testes: `tests/unit/test_require_plan_feature.py` e
  `tests/integration_pg/test_plan_gate.py` (402/403 por módulo via HTTP).

- **Nota (2026-10-06) — reestruturação de planos**: decisão do dono do produto. Limites: Gratuito 2
  giras/mês; Basic 3 giras e 15 médiuns; Pro 4 giras e 30 médiuns (Premium, usuários e preços sem
  mudança). Associados (+ mensalidade de associados), estoque, fila de espera, horário marcado,
  todo o financeiro (`contas_financeiras`) e a mensalidade de médiuns (decisão do dono, mesma
  data) passaram do Pro para o Premium. Catálogo em `_FEATURE_MIN_TIER` (`plan_features.py`), migração de dados
  `059_planos_limites_out_2026`, router de associados ganhou `require_plan_feature("associados")`,
  toggles com gate só checam o plano ao ligar. Sem grandfathering: tenant Pro existente perde os
  módulos (dados preservados, tela `PlanLocked`) — decisão sobre transição pendente com o dono
  (card X-01 do [plano-benchmark-2026-10.md](plano-benchmark-2026-10.md); em 2026-10-09 ainda a registrar).
  Testes: `tests/unit/test_planos_out_2026.py`, `tests/integration_pg/test_planos_out_2026.py`.
- **Nota (2026-10-07) — ajuste de planos**: decisões do dono. (1) Mensalidade de médiuns a partir do
  **Basic** (gatilho de upgrade: com 15 médiuns no Basic, controlar a mensalidade de todos leva ao Pro/
  Premium); a de associados segue Premium. (2) **Usuários ilimitados em todos os planos**, inclusive o
  Gratuito (quem opera a plataforma vira promotor interno do upgrade) — migração de dados
  `060_usuarios_ilimitados`, sem checagem de limite em `users.py`. (3) Quadro de planos sem "Exportar
  planilhas (CSV)" e sem "Ações em lote" (seguem funcionando; só não aparecem), "Senha pelo WhatsApp
  (link público)" → "Link de senhas para enviar via WhatsApp", "Cores e logo do terreiro" →
  "Personalização da plataforma". (4) Landing com o comparativo completo abaixo dos cartões.

### P-06 — Checklist de primeira gira no dashboard — `feito` (2026-10-05)
- **Exceção à R-01**, decidida pelo dono do produto em 2026-10-05. Motivo: análise de produção
  do mesmo dia mostrou 11 cadastros self-service desde julho e **zero** convertidos em pagantes;
  6 criaram gira, só 4 receberam alguma senha pelo link, só 1 passou de 10 (recontado no banco em
  2026-10-05; a primeira versão da análise dizia 7 e 5). Nenhum novo tenant era guiado a
  mandar o link de senhas para os consulentes — sem isso não há Porta nem valor percebido.
- **Entrega**: card "Primeiros passos" no topo de `/admin/dashboard` com 4 passos — criar gira →
  compartilhar o link (WhatsApp com mensagem pronta, copiar, QR code) → receber senhas pelo link →
  usar a Porta. Estado derivado de dados existentes (`onboarding` em `GET /dashboard-summary`, uma
  consulta), sem endpoint novo nem migração. Some ao concluir, ao passar de 20 senhas pelo link
  (terreiro já ativado) ou quando o admin oculta. Eventos `onboarding_*` vão para GA4 e Clarity.
- **Aceite de produto**: medir em 30 dias a fração de cadastros novos que chega a 1 senha pelo
  link (base: 4 de 11) e a 10 senhas (base: 1 de 11), pelo funil do Clarity/GA4.
- **Complemento (2026-10-05)**: empty state em `/admin/giras` (antes: tabela vazia) com o ciclo
  em 3 passos e "Criar primeira gira"; falha de carregamento agora mostra erro com retry em vez
  de parecer lista vazia; `?nova=1` abre o formulário de criação direto (usado pelo checklist).
- **Complemento (2026-10-05, padrões de senhas)**: criar uma gira abre na sequência a configuração
  de senhas (antes o formulário só fechava e a gira podia ficar sem emissão). Gira sem senhas vem
  preenchida com a mediana das quantidades do terreiro (30 sem histórico) e liberação de agora até
  o início da gira; janela menor que 3h mostra aviso com "Usar sugestão". Base: em produção os
  terreiros ativos têm janela mediana de 5h a 48h, os novos de 1h a 2h.

### P-07 — Pergunta de dor no cadastro + tour de boas-vindas por trilha — `feito` (2026-10-05)
- **Mudança de regra do cadastro**, decidida pelo dono do produto: o cadastro self-service passa a
  **exigir** a resposta "O que você mais precisa resolver?" (select, 6 opções, inclusive "Ainda estou
  conhecendo"). Mesma exceção à R-01 do P-06 (ativação de novos tenants).
- **Entrega**: resposta gravada em `tenant_configs.custom_settings.principal_dor` (como o
  `como_conheceu`, sem migração) e exposta em `onboarding.principal_dor` do `/dashboard-summary`.
  No primeiro acesso ao dashboard, o admin vê um tour de boas-vindas que abre sozinho uma vez, com
  a trilha da dor escolhida (senhas, médiuns, financeiro, divulgação, estoque ou essencial). Tenants
  anteriores à pergunta não veem o tour automático.
- **Aceite de produto**: em 30 dias, distribuição das respostas (consulta em `custom_settings`) e
  taxa de clique nos botões da trilha (`welcome_tour_cta` no GA4/Clarity), cruzadas com o funil de
  ativação do P-06.

### P-08 — E-mails de onboarding D+1 e D+3 — `feito` (2026-10-05)
- **Problema**: entre o e-mail de boas-vindas e o lembrete de fim de trial (D-7) não havia nenhum
  contato; a maioria dos cadastros some no mesmo dia.
- **Entrega**: `services/onboarding_email_scheduler.py`, todo dia às 10:00 BRT. **D+1** (conta com
  20h–68h, sem gira) → "sua primeira gira leva 1 minuto", com P.S. para o módulo da trilha
  (`principal_dor`). **D+3** (conta com 68h–7 dias, nenhuma senha pelo link) → "mande o link para os
  consulentes", com o link e botão de WhatsApp. Cada e-mail no máximo uma vez por tenant; contas com
  7+ dias nunca recebem. Links com UTM `utm_campaign=onboarding_d1|d3`.
- **Anti-duplicação** (o backend roda 2 workers): advisory lock por rodada + marca persistente em
  `tenant_configs.custom_settings.onboarding_emails`, gravada sob `FOR UPDATE` antes do envio.
  Desligar: `ONBOARDING_EMAILS_ENABLED=false`. Ver quem receberia:
  `python -m src.services.onboarding_email_scheduler --dry-run`.
- **Aceite de produto**: em 30 dias, fração de quem recebeu D+1 e criou gira em até 48h, e de quem
  recebeu D+3 e recebeu a primeira senha pelo link em até 72h (sessões com `utm_campaign`).

### P-09 — Trial que não pune — `feito` (2026-10-05)
- **Problema**: o fim do trial escondia o que o terreiro construiu (no gratuito `max_mediuns = 0`
  e a tela inteira de médiuns virava aviso de upgrade; um terreiro cadastrou 16 médiuns e deixou
  de vê-los). E durante o trial o card do plano em teste aparecia como "Plano atual" desabilitado,
  sem caminho para assinar.
- **Entrega**: médiuns fora do plano ficam visíveis só para consulta, com aviso e link para
  assinar; criar, editar e excluir somem (o aviso de upgrade só aparece quando não há nenhum
  médium). `GET /admin/billing` passou a devolver `is_trial` e `trial_ends_at`; no trial local
  (sem assinatura Stripe) o card do plano em teste mostra "Em teste" e "Continuar neste plano",
  que abre o checkout com os dias restantes do teste grátis (o backend já fazia isso).
- **Aceite**: `frontend/src/__tests__/ux/trial-nao-pune.test.tsx`.

---

## Fase 4 — Frontend

### M-01 — Migração MUI → shadcn/ui — `feito` (2026-10-06, interface v2.0.0)

- **Por quê**: o admin tinha 244 objetos responsivos `{ xs, sm, md }` e ~2.900 `sx`; o MUI v5 estava parado
  (sem `enableCssLayer`) e cada tela carregava o runtime do Emotion. Junto com a troca, as telas foram
  redesenhadas pela análise de UX de 2026-10-05 (artefato "Redesenho GiraHub").
- **Como**: fases 0 e 1 (fundação e kit) em sequência; fases 2 a 8 em seis frentes paralelas sobre o mesmo
  branch, integradas e seguidas da fase 9 (remoção). Estado final e regras em AGENTS.md §11.16; kit em
  `frontend/src/components/README.md`; bundle antes/depois em `docs/bundle-baseline.md`.
- **Fases** (todas `feito`):
  - **0 — Fundação** (2026-10-05): Tailwind v4 + shadcn convivendo com o MUI, `applyBrand`, classe `dark` na raiz, piloto.
  - **1 — Primitivas e compartilhados** (2026-10-05): ~30 primitivas, compostos com a mesma API, `DataTable`, `fields/*`, gates, Sonner.
  - **2 — Público e bilhete** (2026-10-06): `PublicShell`, `Bilhete`, emissão com 3 campos acima da dobra, fila com decisão explícita, cancelar, inscrição em etapas, status e 404.
  - **3 — Layout e navegação** (2026-10-06): Sidebar por trabalho, barra inferior no celular, ⌘K, versão 2.0.0.
  - **4 — Operação** (2026-10-06): Giras em cartões com um botão por estado, Senhas com detalhe em Sheet, Porta em modo operação ("Chamar próximo"), modo TV.
  - **5 — Aquisição e conta** (2026-10-06): landing de um trabalho, cadastro em uma tela → primeira gira, plano e assinatura unificados com `constants/plans.ts`, pessoas e acessos, suporte, tour convergente.
  - **6 — Gestão da casa** (2026-10-06): `CobrancaMensal`, Lançamentos (pagar + receber), estoque em duas telas, cursos, relatórios, analytics, auditoria.
  - **7 — Meu Site** (2026-10-06): seções compartilhadas (fecha o P-04), assistente, prévia, "Publicar alterações", salvar automático.
  - **8 — Plataforma** (2026-10-06): Hoje, Tenant 360, terreiros + assinaturas com paginação no servidor, suporte, auditoria, configurações.
  - **9 — Remoção** (2026-10-06): sem `@mui/*`, `@emotion/*`, `packages/shared-ui`; preflight completo; overlays no z-index do Radix.
- **Pendências registradas**: a busca de terreiros da plataforma é feita no navegador; a rota
  `/platform/tenants/search` estava sombreada por `/tenants/{tenant_id}` (corrigido no PR #47) e, para a tela
  usá-la, precisa devolver plano, status e fim do trial; "Nova conversa" no suporte da plataforma depende de endpoint
  de criação; ~~isenção de mensalidade em médiuns depende de campo no backend~~ — `feito`: o campo
  `mediuns.mensalidade_isento` existe desde a migração 027 e a tela de Médiuns voltou a editá-lo nas jornadas 2.2
  (PR #54, 2026-10-06); páginas públicas ficaram mais
  pesadas que antes (ver `docs/bundle-baseline.md`) e merecem uma rodada de corte (import de ícones, zod/RHF só
  onde há formulário).

## Fase 5 — Pós-benchmark de concorrentes (2026-10-06)

Backlog derivado do [benchmark-concorrentes-2026-10.md](benchmark-concorrentes-2026-10.md), detalhado em
[plano-benchmark-2026-10.md](plano-benchmark-2026-10.md): 47 cards com ranking global em 5 ondas, incluindo
I-02 e P-02 deste plano e a decisão de transição dos clientes Pro (X-01). Esse arquivo é a fonte da verdade do
board "GiraHub" no Trello: edite lá e rode `scripts/trello_sync_backlog.py`. As restrições deste plano (custo
zero, R-01 a R-04) continuam valendo lá.

---

## Regras de trabalho (vigentes a partir de agora)

- **R-01 — Congelamento de módulos novos** — `cumprida` (2026-10-05): nenhum módulo/feature novo
  até a Fase 2 (Q-01 e Q-02) concluída. Exceção: itens deste plano e correções de produção.
  Q-01 e Q-02 foram feitos e são bloqueantes no CI; o congelamento deixa de valer.
- **R-02 — Doc que mente é bug**: encontrou documentação divergente do código → corrigir na
  mesma sessão (AGENTS.md/CLAUDE.md corrigidos em 2026-08-26 nesta primeira aplicação da regra).
- **R-03 — Adotar ou deletar**: abstração frontend com 0 consumidores — na próxima sessão que tocar
  uma tela relacionada, ou a abstração é adotada ali, ou é deletada. Sem terceira opção. Aplicada na
  M-01 (2026-10-06): `DataTable` e `SnackbarContext` adotados; `useCrudDrawer`, `useFetch`,
  `usePaginatedFetch`, `useResponsive`, `ResponsiveTable`, `ResponsiveFilterBar` e `packages/shared-ui` apagados.
- **R-04 — Migração nova só com `alembic heads` única** (já era regra; reafirmada porque a
  numeração já colidiu 3× e gerou 4 merges).

## Ordem sugerida de execução

| # | Item | Por quê primeiro |
|---|------|------------------|
| 1 | I-01 | Postgres exposto na internet; 1 hora de trabalho |
| 2 | I-02 | Único ponto de perda total do negócio |
| 3 | I-04 | Habilita todo o resto a ter sinal antes do deploy |
| 4 | I-03 + I-05 | Lote de limpeza rápida |
| 5 | Q-01 | O item que muda a trajetória fix/feat (fatiar em 5) |
| 6 | Q-03 + Q-04 | Fecham as duas races conhecidas, com Q-01 como rede |
| 7 | Q-02 | Rede de segurança de tenant |
| 8 | P-03 | 30 minutos que eliminam um passivo comercial |
| 9 | P-01 | Primeira entrega visível pro usuário do plano |
| 10 | Q-05, P-05, Q-06, P-04, P-02 | Conforme fôlego e decisões |
