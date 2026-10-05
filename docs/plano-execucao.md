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

### I-02 — Backup fora da VPS, criptografado, com restore testado — `pendente`
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
  `tests/integration/` morta e `tests/fix_quotes.py`/`fix_escaped.py` apagados.
- **Bugs reais achados e corrigidos na mesma entrega**: (a) primeiras emissões simultâneas numa gira
  sem contador (senha de associado, 11 giras antigas em produção) davam 500 por UniqueViolation no
  SenhaControl → `INSERT ... ON CONFLICT DO NOTHING`; (b) o tratamento da corrida de consulente com o
  mesmo e-mail fazia `session.rollback()` completo, expirava tenant/gira e derrubava a emissão com
  MissingGreenlet → savepoint (`begin_nested`), também no walk-in; (c) plano gratuito (`max_mediuns`
  0) criava médiuns pela API → 403.
- **Achado registrado (não corrigido)**: `alembic check` aponta divergência entre modelos e schema
  migrado (índices únicos e regras de FK que só existem nas migrações, JSON×JSONB). O banco está mais
  correto que os modelos; alinhar os modelos é item próprio antes de usar `alembic check` como gate.
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
- **Limites** (docstring do script): não audita repositories/services/rotas public e platform;
  não valida o valor comparado nem FKs recebidos no body; filtro dentro de `if` conta como
  sempre aplicado; exceção vale para a função inteira.
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

### Q-03 — Constraint de dedup de emissão no banco — `pendente`
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

### Q-05 — RBAC fail-open → fail-closed — `pendente`
- **Problema**: operador sem nenhum grupo tem acesso total ("backward compatibility"). Usuário
  novo criado sem grupo = permissão irrestrita no tenant.
- **Entrega**: decidir a semântica (recomendado: sem grupo = sem acesso, com grupo default
  "Acesso Total" criado automaticamente no onboarding de tenant e atribuído a operadores novos
  por padrão — preserva a conveniência sem o furo). Migração de dados: atribuir o grupo default
  a todos os operadores hoje sem grupo, **antes** de virar a chave.
- **Aceite**: operador sem grupo → telas bloqueadas; tenants existentes sem mudança visível de
  comportamento (todos migrados pro grupo default).
- **Esforço**: M. **Custo**: R$ 0.

### Q-06 — Atualização de dependências (staged) — `pendente`
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

---

## Fase 3 — Produto

### P-01 — PWA da Visão da Porta — `pendente`
- **Racional**: a Porta é usada em pé, em tablet, durante a gira — o caso perfeito de PWA
  (ícone na home, fullscreen, sobrevive a oscilação de rede). Hoje não há manifest nem service
  worker (e o `favicon.ico` tem 0 bytes).
- **Entrega**: `manifest.json` + ícones reais (o `generate_favicons.py` da raiz nunca rodou —
  consertar ou substituir), service worker mínimo (cache de shell + fallback offline com aviso
  "sem conexão" na Porta; **sem** tentar sincronização offline de emissão nesta fase), meta tags
  de instalação iOS.
- **Aceite**: "Adicionar à tela inicial" funcional em Android e iOS; Porta abre fullscreen;
  Lighthouse PWA verde.
- **Esforço**: M. **Custo**: R$ 0.

### P-02 — WhatsApp como canal de senha — `pendente` (decisão antes de código)
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

### P-03 — API Premium: remover ou implementar — `pendente` (decisão)
- **Problema**: o plano Premium anuncia `api_access` que não existe — a flag não tem consumidor,
  a chave gerada nunca é persistida, `/docs` é desabilitado em produção. Vender o que não existe
  é passivo comercial.
- **Recomendação custo-zero**: **remover** da tabela comparativa de planos e do
  `plan_features.py` agora (30 min de trabalho); recolocar no dia em que houver demanda real de
  cliente, como projeto deliberado (chave persistida + hash, escopo read-only primeiro, docs).
- **Aceite**: nenhuma menção a API/api_access visível pra cliente; flag removida ou marcada
  interna.
- **Esforço**: P. **Custo**: R$ 0.

### P-04 — Unificar renderers do Site Builder — `pendente`
- **Problema**: ~2.500 linhas duplicadas entre `admin/meu-site.tsx` (previews) e
  `[tenantSlug]/index.tsx` (site público) — 8 seções paralelas + 5 helpers byte-a-byte idênticos.
  Toda mudança visual precisa ser feita duas vezes ou o preview mente.
- **Entrega**: extrair `src/components/site-sections/` com um componente por seção usado pelos
  dois lados (prop `mode: 'preview' | 'live'` onde precisar); helpers num módulo único. Reduzir
  `meu-site.tsx` (4.608 linhas) no processo.
- **Aceite**: `diff` conceitual zero entre preview e site publicado; nenhum helper duplicado.
- **Esforço**: G (fatiar por seção: uma sessão pra infra + 2 seções, depois lotes).
- **Custo**: R$ 0.

### P-05 — Gate de plano único no backend — `pendente`
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

---

## Regras de trabalho (vigentes a partir de agora)

- **R-01 — Congelamento de módulos novos** — `cumprida` (2026-10-05): nenhum módulo/feature novo
  até a Fase 2 (Q-01 e Q-02) concluída. Exceção: itens deste plano e correções de produção.
  Q-01 e Q-02 foram feitos e são bloqueantes no CI; o congelamento deixa de valer.
- **R-02 — Doc que mente é bug**: encontrou documentação divergente do código → corrigir na
  mesma sessão (AGENTS.md/CLAUDE.md corrigidos em 2026-08-26 nesta primeira aplicação da regra).
- **R-03 — Adotar ou deletar**: abstração frontend com 0 consumidores (`useCrudDrawer`,
  `useFetch`, `usePaginatedFetch`, `useResponsive`, `DataTable`, `ResponsiveTable`,
  `ResponsiveFilterBar`, `SnackbarContext`, `packages/shared-ui`) — na próxima sessão que tocar
  uma tela relacionada, ou a abstração é adotada ali, ou é deletada. Sem terceira opção.
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
