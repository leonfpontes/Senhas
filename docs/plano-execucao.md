# Plano de Execução — GiraHub / Senhas

Criado: 2026-08-26 · Fonte: auditoria completa do projeto (produto, técnico, infra)
Restrição vigente: **custo zero** — nenhum item pode exigir gasto novo de infra. Free tiers são permitidos.
Como usar: os itens são independentes salvo dependência explícita. Escolha um item por vez; cada item
vira uma sessão de implementação com seus critérios de aceite como definição de pronto.

Status possíveis: `pendente` · `em andamento` · `feito` · `descartado`

---

## Fase 0 — Bugs confirmados (em andamento em sessões paralelas)

Estes três foram confirmados em código durante a auditoria e já estão em execução.

### E-01 — Reenvio público de e-mail retorna 500 em toda chamada — `em andamento`
- **Problema**: `backend/src/api/v1/public/resend_email.py:122` instancia `TicketRepository()` sem
  argumentos (herda `BaseRepository.__init__(self, db, model)`); `TypeError` engolido pelo
  `except Exception` → HTTP 500 sempre. Teste passa verde porque mocka a própria classe.
- **Aceite**: endpoint reenviando e-mail de verdade; teste que exercita a instanciação real
  (sem patch da classe `TicketRepository`).

### E-02 — `decode_token` aceita refresh token como access token — `em andamento`
- **Problema**: `decode_refresh_token` exige `type == "refresh"`, mas `decode_token` não rejeita
  esse tipo — refresh de 30 dias vale como access no `jwt_middleware`. Docstring promete as duas
  direções; só uma existe.
- **Aceite**: `decode_token` rejeita `type == "refresh"`; testes cobrindo as duas direções;
  fluxos de refresh e impersonação intactos.

### E-03 — Rate limit em login / forgot-password / reset-password / resend público — `em andamento`
- **Problema**: nenhum `@limiter.limit` nesses endpoints; resend público dispara até 10 e-mails
  por chamada sem auth. Atenção ao keying: uvicorn roda sem `--forwarded-allow-ips` atrás do
  nginx, então o IP visto pode ser o do próprio nginx (bucket único global) — corrigir o
  encaminhamento de IP **antes** de ligar limites, senão um atacante esgota o limite de todos.
- **Aceite**: limites conservadores ativos e keyed por IP real; teste demonstrando o 429.

---

## Fase 1 — Infra de custo zero (prioridade máxima após Fase 0)

### I-01 — Fechar portas de serviços internos no host — `em andamento` (2026-08-26)
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

### I-03 — Prometheus/Grafana: desligar (ou assumir de verdade) — `pendente`
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

### I-04 — CI em pull request (separado do deploy) — `pendente`
- **Problema**: o único workflow roda em push na master — merge é deploy, branch não tem sinal
  nenhum. Todo erro só aparece quando já está indo pra produção.
- **Entrega**: `ci.yml` novo com gatilho `pull_request` (e `push` em branches), rodando os mesmos
  jobs `test-backend` + `test-frontend` do deploy.yml (extrair pra workflow reutilizável com
  `workflow_call` pra não duplicar). Deploy continua só em master.
- **Aceite**: abrir um PR de teste e ver os checks rodando antes do merge.
- **Esforço**: P–M. **Custo**: R$ 0 (GitHub Actions free tier cobre).

### I-05 — Consertos pequenos de operação (lote único) — `pendente`
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

### Q-01 — Testes de integração com Postgres real — `pendente`
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

### Q-02 — Auditor AST de `tenant_id` no CI — `pendente`
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

### Q-04 — Fechar idempotência do webhook Stripe — `pendente`
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

---

## Regras de trabalho (vigentes a partir de agora)

- **R-01 — Congelamento de módulos novos**: nenhum módulo/feature novo até a Fase 2 (Q-01 e
  Q-02) concluída. Exceção: itens deste plano e correções de produção.
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
