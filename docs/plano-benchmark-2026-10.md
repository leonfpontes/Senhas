# Plano de ação pós-benchmark — especificação do backlog (outubro/2026)

Criado: 2026-10-06 · Fonte: [benchmark-concorrentes-2026-10.md](benchmark-concorrentes-2026-10.md)
Complementa o [plano-execucao.md](plano-execucao.md) (Fase 5). As restrições de lá continuam valendo:
- **custo zero de infra**: taxa por transação paga pelo terreiro é aceitável; mensalidade fixa paga por nós, não;
- regras R-01 a R-04.

**Este arquivo é a fonte da verdade do board "GiraHub" no Trello.** Cada `###` vira um card. Para mudar um card, edite
aqui e rode o sync de novo, em vez de editar só no Trello.

> **Revisão de 2026-10-09 (R-02):** a coluna "Status" do ranking foi conferida contra o código do master (não é
> cópia do board). Os cards criados direto no Trello a partir de 08/10 (Área do Médium, correções) não estão neste
> arquivo; a Área do Médium tem o próprio plano em [plano-area-do-medium.md](plano-area-do-medium.md) §11.

Caminhos abreviados: **B/** = `backend/src/`, **F/** = `frontend/src/`. A próxima migração Alembic é a **094**
(head atual: `093_sessao_contas_verificadas`). Confira `alembic heads` antes de criar.

---

## Como ler os cards

| Campo | Valores |
|---|---|
| Ranking | Ordem global de execução, de 1 a 47 (1 = primeiro) |
| Prioridade | **P0** agora · **P1** próximo · **P2** depois · **P3** futuro |
| Onda | 1 Vitrine e fundações · 2 Planos e correções · 3 Núcleo senha/porta · 4 Funcionalidades e conteúdo · 5 Crescimento |
| Esforço | **P** ≤ 1 dia · **M** 2–4 dias · **G** 1–2 semanas |
| Tipo | dev · decisão · conteúdo · infra (combináveis) |
| Módulo | área do produto (etiqueta "Módulo: …" no Trello) |
| Épico | Vitrine · Planos · Núcleo · Funcionalidade · Crescimento · Fundação |

### Definição de pronto (vale para todo card com código)
- [ ] `require_group_permission` em endpoint admin novo/alterado; `canGroup` na tela; ações ocultas (não `disabled`)
- [ ] Gate de plano via `require_plan_feature` + `_FEATURE_MIN_TIER` + espelho em `F/constants/plans.ts` (se a feature tiver plano)
- [ ] Query filtrada por `tenant_id`; `python backend/scripts/audit_tenant_isolation.py` passando
- [ ] Migração Alembic com `alembic heads` única (se o schema mudou); `tests/integration_pg/test_migrations.py` verde
- [ ] Testes unitários + `integration_pg` quando tocar no banco; front: lint (`--max-warnings 0`), type-check, jest, permission-audit e build
- [ ] Versão do front subiu → entrada no topo de `F/constants/releaseNotes.ts`, em linguagem de terreiro
- [ ] AGENTS.md/CLAUDE.md atualizados se alguma regra ou comportamento documentado mudou (R-02)

---

## Ranking global

| # | Card | Prio | Onda | Esf. | Status (09/10) |
|---|---|---|---|---|---|
| 1 | I-02 Backup fora da VPS | P0 | 1 | M | Feito (#57; instalado na VPS com R2, #67) |
| 2 | X-01 Transição dos clientes Pro | P0 | 1 | P | Decisão a registrar pelo dono (reaberto no Trello) |
| 3 | $-01 Resposta ao "tudo incluso" | P0 | 1 | P | Decidido (08/10: opção a) |
| 4 | V-01 Coletar depoimentos | P0 | 1 | M | Em andamento (3 depoimentos reais na landing) |
| 5 | V-06 WhatsApp de vendas | P0 | 1 | P | Feito (#57; número no build, #68) |
| 6 | T-01 Slugs reservados no backend | P0 | 1 | P | Feito (#57) |
| 7 | V-04 FAQ | P0 | 1 | P | Feito (#57) |
| 8 | V-02 Números reais de uso | P0 | 1 | P | Feito (#57) |
| 9 | V-03 Seção de depoimentos | P0 | 1 | P | Feito (#57) |
| 10 | V-07 Antes × depois | P0 | 1 | P | Feito (#57) |
| 11 | V-05 Carrossel de telas reais | P0 | 1 | M | Feito (#57) |
| 12 | T-03 Sitemap dinâmico | P0 | 1 | P | Feito (#57) |
| 13 | $-03 Página /planos | P0 | 1 | M | Feito (#57) |
| 14 | T-04 TV sem dados pessoais | P1 | 2 | P | Feito (#66) |
| 15 | T-05 Porteiro sem acesso a Médiuns | P1 | 2 | P | Feito (#66) |
| 16 | T-06 Permissão do Meu Site | P1 | 2 | P | Feito (#66) |
| 17 | $-02 Plano anual | P1 | 2 | M | Backlog |
| 18 | $-05 Cupons | P1 | 2 | P | Backlog |
| 19 | F-08 Story da agenda do mês | P1 | 2 | P | Backlog |
| 20 | V-08 Identidade visual da landing | P1 | 2 | G | Feito (#57, landing nova no ar) |
| 21 | $-04 PIX/boleto na assinatura | P1 | 2 | M | Feito (boleto #105; PIX mês a mês #112) |
| 22 | N-04 Tela de consulentes | P1 | 3 | M | Backlog |
| 23 | N-06 Check-in por QR | P1 | 3 | M | Backlog |
| 24 | N-01 Modo TV com conteúdo | P1 | 3 | M | Backlog |
| 25 | N-02 Ficha impressa térmica | P1 | 3 | M | Backlog |
| 26 | N-03 Senha por médium/entidade | P1 | 3 | G | Backlog |
| 27 | N-05 Retornos | P1 | 3 | M | Backlog |
| 28 | P-02 Decisão WhatsApp | P1 | 4 | P | Aguardando o dono |
| 29 | F-01 Decisão gateway da mensalidade | P1 | 4 | P | Decidido (09/10: misto Stripe Connect + Mercado Pago) |
| 30 | F-02 PIX na mensalidade | P1 | 4 | G | Código entregue (#114, #115, #116); aguarda teste com casa piloto |
| 31 | C-02 Páginas por recurso | P2 | 4 | M | Backlog |
| 32 | C-01 Blog | P2 | 4 | M | Backlog |
| 33 | C-03 Glossário | P2 | 4 | P | Backlog |
| 34 | C-04 GiraHub × caderno | P2 | 4 | P | Backlog |
| 35 | C-08 Tutoriais em vídeo | P2 | 4 | M | Backlog |
| 36 | T-02 Token de acesso tipado | P0 | 4 | P | Feito (#69; ramo legado removido em 09/10, #119) |
| 37 | F-03 WhatsApp automático | P2 | 4 | G | Backlog |
| 38 | F-04 Portal do médium | P2 | 4 | G | Substituído pela Área do Médium (AM-02 a AM-13) |
| 39 | F-05 Ficha espiritual | P2 | 4 | M | Feito (com o AM-19, #109) |
| 40 | F-06 Presença dos médiuns | P2 | 4 | M | Substituído (AM-17 e AM-26) |
| 41 | F-09 Importar médiuns | P2 | 4 | M | Backlog |
| 42 | F-07 Escalas de zeladoria | P2 | 4 | M | Substituído (AM-25, AM-18 e AM-15) |
| 43 | F-10 2FA para admins | P2 | 4 | M | Backlog |
| 44 | C-05 Diretório de terreiros | P3 | 5 | G | Backlog |
| 45 | N-07 Fila em tempo real | P3 | 5 | M | Backlog |
| 46 | C-06 Afiliados | P3 | 5 | M | Página publicada (09/10); cupom/display/relatório pendentes |
| 47 | C-07 Federações | P3 | 5 | P | Decisões |

**Trilha paralela de conteúdo** (não depende de dev): V-01, C-03, C-04, C-08 e os textos de C-01/C-02 podem andar a
qualquer momento com quem escreve.

---

## Onda 1 — Vitrine e fundações

### I-02 — Backup fora da VPS, criptografado, com restore testado
- **Ranking:** 1 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** M · **Tipo:** infra · **Módulo:** Infra & Plataforma · **Épico:** Fundação
- **Depende de:** — · **Destrava:** tranquilidade para mexer em pagamentos e dados (F-02, $-02)

**Por quê.** Os dois backups atuais (pré-deploy no CI e cron diário) gravam no mesmo disco do Postgres. Se o volume
ou a VPS se perderem, o negócio acaba. Nunca houve teste de restore. Item herdado do plano de execução.

**Achado novo.** `devops/vps_setup.sh:134-152` instala um cron às 02h com `sudo -u postgres pg_dump senhas_prod`, ou
seja, contra um Postgres **do host**. Em produção o Postgres roda em container (`docker-compose.prod.yml`,
`senhas-postgres`), então esse cron provavelmente falha em silêncio. Conferir `/var/log/senhas-backup.log` na VPS.
O backup pré-deploy fica em `.github/workflows/deploy.yml:99-105`.

**Implementação**
- Bucket em free tier: Cloudflare R2 ou Backblaze B2 (10 GB grátis).
- Cron na VPS: `docker compose exec -T postgres pg_dump | gzip | age -r <chave pública>`, com upload via `rclone`.
  A criptografia acontece **antes** do upload, porque o dump tem PII de consulentes.
- Retenção: 30 diários + 12 mensais.
- A chave privada `age` fica fora da VPS: gerenciador de senhas do dono, mais uma cópia offline.
- Alerta se o upload falhar: e-mail pelo provedor já usado ou log monitorado.
- Procedimento de restore em `docs/deployment.md`: baixar → decriptar → restaurar em container Postgres descartável →
  contar linhas de 3 tabelas (tenants, tickets, mediuns).

**Riscos.** Perder a chave privada torna os backups inúteis. Credencial do bucket na VPS: usar uma chave restrita a
esse único bucket, só com escrita.

**Fora do escopo.** Réplica/hot standby e backup de imagens fora do banco (hoje elas ficam em BYTEA, dentro do dump).

**Aceite**
- [ ] Cron antigo do host diagnosticado (está falhando?) e substituído
- [ ] Upload diário criptografado visível no bucket por 3 dias seguidos
- [ ] Um backup real restaurado com sucesso num container local, com contagem de linhas conferida
- [ ] Procedimento passo a passo em `docs/deployment.md`; lembrete trimestral de teste de restore
- [ ] I-02 marcado como `feito` no `docs/plano-execucao.md`

### X-01 — Decidir a transição dos clientes Pro que perderam módulos
- **Ranking:** 2 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** decisão · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** — · **Destrava:** $-01, comunicação com clientes
- **Status (2026-10-09):** **decisão a registrar pelo dono** (card reaberto no Trello). Nenhuma das opções abaixo
  está registrada em doc até agora; o AGENTS.md §3.4 segue descrevendo o corte sem grandfathering.

**Por quê.** A reestruturação de planos (migração 059, 2026-10-06) moveu estoque, associados, financeiro, fila de
espera, horário marcado e mensalidade de médiuns do Pro para o Premium, **sem grandfathering**. Um terreiro Pro
pagante perdeu esses módulos: os dados foram preservados e a tela mostra `PlanLocked`. O plano de execução registra
que essa decisão de transição está pendente com o dono do produto. Pagante que perde funcionalidade de um dia para o
outro é risco direto de churn.

**Opções**
- (a) Grandfathering: o Pro existente mantém os módulos até uma data (ex.: 90 dias) ou para sempre.
- (b) Upgrade com desconto para Premium por N meses (cupom; depende de $-05).
- (c) Manter o corte e avisar por e-mail com um link de upgrade.

**Dados para decidir.** Quantos tenants Pro usavam algum dos módulos movidos nos últimos 30 dias: painel da
plataforma, `B/api/v1/platform/dashboard.py` e `tenant_observatory.py`.

**Aceite**
- [ ] Lista de tenants Pro afetados, com o uso real de cada módulo movido
- [ ] Opção escolhida e registrada no AGENTS.md §3.4 e na nota da P-05 do plano de execução
- [ ] Se for (a) ou (b), card de dev criado; se for (c), e-mail de aviso enviado

### $-01 — Decidir a resposta ao "tudo incluso" dos concorrentes
- **Ranking:** 3 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** decisão · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** X-01 (mesma conversa) · **Destrava:** $-02, $-03, textos da landing
- **Status (2026-10-08):** **decidido — opção (a)**: manter os preços e vender o Gratuito e a senha/porta como diferencial.

**Por quê.** AxéCloud cobra R$ 69,90 com tudo incluso (ou R$ 699/ano); Kanzuá, R$ 41,90/mês no anual, com equipe
ilimitada; ORI, a partir de R$ 24,90. Todos sem cobrar por módulo. A página de comparativo do AxéCloud diz
literalmente "verifique se o concorrente cobra por médium". Nosso Premium custa R$ 99 e os planos bloqueiam módulo e
número de médiuns. Nosso trunfo é o Gratuito, que nenhum concorrente tem de verdade.

**Opções**
- (a) Manter os preços e vender o Gratuito e a senha/porta como diferencial.
- (b) Baixar o Premium e/ou criar um anual agressivo.
- (c) Tirar o limite de médiuns do Pro.

**Dados.** Distribuição por plano (`_plans_distribution`, `platform/dashboard.py:119`) e MRR real (`_mrr` /
`paying_clause()` em `B/services/billing_metrics.py`). Não somar `monthly_price` na mão (AGENTS.md §11.17).

**Se o preço mudar, tudo muda junto**
- `PLAN_LIMITS` (`B/repositories/subscription_repo.py:20-25`) e `PLANS` (`F/constants/plans.ts:38-75`)
- `__tests__/constants/plans.test.ts` e `tests/unit/test_planos_out_2026.py`
- Migração 060 no padrão da 059
- **Prices novos no Stripe.** Price é imutável e trocar `STRIPE_PRICE_*` **sem manter um mapa de Prices legados**
  quebra os webhooks dos assinantes atuais: `checkout.session.completed` dá ValueError e responde 500 em loop, e
  `subscription.updated` ignora o plano em silêncio.

**Aceite**
- [ ] Decisão registrada no AGENTS.md §3.4
- [ ] Se houver mudança: card de dev com mapa de Prices legados no `_get_price_plan_map` e aviso aos clientes

### V-01 — Coletar depoimentos reais de dirigentes
- **Ranking:** 4 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** M · **Tipo:** conteúdo · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** — · **Destrava:** V-03, V-08 (mídia)

**Por quê.** Nossa landing não tem nenhuma prova social. O Kanzuá vende com "1.000+ terreiros" e depoimentos com foto,
nome de santo, @ e cidade; o ORI, com 2 depoimentos longos com casa e cidade. Meu Axé e Minha Gira usam depoimentos
com cara de inventados, e isso fica visível. Os nossos têm de ser reais.

**Como**
- Selecionar de 5 a 8 terreiros entre os mais ativos (`_top_tenants`, `platform/dashboard.py:199`, e o painel de
  ativação).
- Roteiro de 3 perguntas: como era a gira antes; o que mudou; o que mais gosta.
- Pedir 2 a 3 frases + foto + @instagram + cidade/UF + como querem ser chamados (nome de santo).
- Aproveitar e pedir autorização de foto ou vídeo de gira para V-05 e V-08.

**LGPD.** Nome de santo e foto revelam religião, que é dado sensível (art. 11). O consentimento precisa ser explícito,
por escrito e revogável. Guardar as autorizações **fora do repositório** e combinar como tirar o depoimento do ar se
pedirem.

**Aceite**
- [ ] Lista de candidatos e roteiro prontos
- [ ] Pelo menos 3 depoimentos aprovados, com foto
- [ ] Autorizações guardadas (data de cada uma anotada para a constante do V-03)
- [ ] Pelo menos 1 autorização de foto/vídeo de gira para a landing

### V-06 — WhatsApp de vendas no hero + botão flutuante
- **Ranking:** 5 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** número comercial definido · **Destrava:** —

**Por quê.** Kanzuá e Minha Gira põem "Falar no WhatsApp" no hero e um botão flutuante. O nosso público decide pelo
WhatsApp.

**Bug encontrado.** A landing já tem `SUPPORT_WHATSAPP` (`F/pages/index.tsx:41`) e um botão na seção Contato, mas
`NEXT_PUBLIC_SUPPORT_WHATSAPP` **não chega ao build de produção**. Ela não é ARG no `frontend/Dockerfile` (l.26-40),
nem está em `docker-compose.prod.yml` `frontend.build.args` (l.181-187), nem em `.env.prod.example`. Como
`NEXT_PUBLIC_*` é inlined no build, setar no ambiente do container não funciona. Hoje o botão nunca aparece em
produção.

**Implementação**
- Deploy: `ARG/ENV NEXT_PUBLIC_SUPPORT_WHATSAPP` no Dockerfile, `args:` no compose e a linha no `.env.prod.example`.
  O valor vai como secret ou variável no CI.
- Hero (`index.tsx` l.328-337): CTA secundário `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`,
  só se a variável existir.
- Novo `F/components/landing/WhatsAppFab.tsx`, no padrão de `F/components/site/MobileCtaBar.tsx` (safe-area).
- Evento de analytics com `trackEvent` (`@/services/analytics`).
- Normalizar o DDI 55 como `F/components/platform/format.ts:77-81`.

**Testes.** `frontend/__tests__/pages/landing.test.tsx` (novo; ainda não existe teste da landing):
- sem a variável, não aparece nem botão nem flutuante;
- com ela, o `href` tem DDI e `text=`.
Definir `process.env` antes de importar o módulo. Mockar `IntersectionObserver` por causa do framer-motion.

**Riscos.** O botão flutuante não pode cobrir o CTA nem o `Toaster`.

**Aceite**
- [ ] Número comercial definido
- [ ] Variável chegando ao build de produção (verificado no HTML servido)
- [ ] CTA no hero e botão flutuante com mensagem pré-preenchida
- [ ] Teste da landing cobrindo com e sem a variável

### T-01 — Lista de slugs reservados no backend
- **Ranking:** 6 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev · **Módulo:** Infra & Plataforma · **Épico:** Fundação
- **Depende de:** — · **Destrava:** $-03, C-01, C-02, C-03, C-04, C-05, F-04

**Por quê.** O site do terreiro mora em `/[tenantSlug]` (`F/pages/[tenantSlug]/index.tsx`). Toda rota estática nova
(`/planos`, `/blog`, `/recursos`, `/terreiros`, `/glossario`, `/convite`, `/medium`) **encobre** um terreiro com esse
slug. Os slugs reservados só existem no front (`RESERVED_SEGMENTS` em `F/pages/404.tsx:17`). O backend
(`_slugify`/`_unique_slug` em `B/api/v1/public/onboarding.py:209-225`) aceita qualquer um.

**Implementação**
- Constante `RESERVED_SLUGS` no backend com as rotas atuais e as planejadas: planos, precos, blog, recursos,
  terreiros, glossario, convite, medium, cadastro, login, admin, platform, public, api, status, termos, privacidade,
  offline, sobre, contato.
- `_unique_slug` pula slugs reservados (sufixo numérico).
- Teste que mantém back e front em sincronia: lista do front ⊆ lista do back.
- Script/consulta pontual em produção: existe tenant com algum desses slugs? Se existir, decidir a migração do slug
  antes de criar a rota.

**Testes.** `backend/tests/unit/test_onboarding_signup.py` (slug reservado vira `planos-2`); a sincronia com o front
num teste jest ou num script do CI.

**Aceite**
- [ ] `RESERVED_SLUGS` no backend usado no cadastro e em qualquer troca de slug
- [ ] Produção verificada: nenhum tenant com slug reservado (ou plano de migração)
- [ ] Teste de sincronia entre front e back

### V-04 — FAQ na landing + JSON-LD FAQPage
- **Ranking:** 7 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev + conteúdo · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** — · **Destrava:** —

**Por quê.** AxéCloud (7 perguntas), ORI (7) e Minha Gira (5) têm FAQ. Ele responde objeções sem precisar de
atendimento.

**Perguntas, com a resposta conferida no código**
1. Preciso de cartão para testar? Não: 30 dias de Premium (`TRIAL_DAYS=30`, `onboarding.py:46`), uma vez por CPF/e-mail.
2. Como cancelo? Pelo painel; o acesso vai até o fim do período (`billing_stripe.py:296`).
3. O consulente precisa instalar app? Não, ele pega a senha pelo link.
4. Funciona na TV do salão? Sim, Modo TV (`F/pages/admin/porta/kiosk.tsx`).
5. E se a internet cair na porta? A Porta é PWA instalável (`public/sw.js`); explicar o comportamento real offline.
6. Meus dados estão seguros? LGPD, link para `/privacidade`.
7. Dá para migrar da planilha? Hoje é manual (F-09 ainda não existe); não prometer importação.
8. Tem plano grátis? Sim, Gratuito (`PLANS.free`).

**Implementação**
- `F/constants/landingFaq.ts` (`{q, a}[]`) consumido pelo Accordion (o padrão já usado em `index.tsx` l.401-417) e
  pelo JSON-LD.
- `<section id="duvidas" className="scroll-mt-20">` e `{label:'Dúvidas', href:'#duvidas'}` no `NAV` (l.43) e no rodapé.
- Segundo `<script type="application/ld+json">` com `FAQPage` no `<Head>` (l.248), escapando `<` (`.replace(/</g,'\\u003c')`).

**Riscos.** O texto do JSON-LD tem de ser idêntico ao visível. Desde 2023 o Google só mostra o rich result de FAQ para
sites de governo e saúde, então o ganho principal é a conversão.

**Aceite**
- [ ] 8 perguntas revisadas, com as respostas batendo com o código
- [ ] Accordion + âncora "Dúvidas" no menu e no rodapé
- [ ] JSON-LD FAQPage gerado da mesma constante (teste verifica a igualdade)

### V-02 — Números reais de uso na landing
- **Ranking:** 8 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** — · **Destrava:** —

**Por quê.** Minha Gira mostra "32k+ mensalidades processadas, 87k+ giras e escalas"; Kanzuá, "1.000+ terreiros".
Temos números reais de senhas emitidas e giras realizadas que não aparecem em lugar nenhum.

**Implementação**
- Novo `B/api/v1/public/stats.py`: `GET /api/v1/public/stats`.
  - Sem auth, `@limiter.limit("60/minute")` com `request: Request`. O nginx já aplica 30 r/min em `/api/v1/public/`.
  - Header `Cache-Control: public, max-age=3600`.
  - Registrar em `public/__init__.py` e em `B/main.py` (l.283-291).
- Consultas reaproveitadas de `B/api/v1/platform/dashboard.py` (`_ticket_counts` l.69, `_tenant_counts` l.18):
  - senhas emitidas: sem `cancelled`, sem acompanhante, sem soft delete;
  - giras realizadas: `data_inicio < now`, ativas;
  - terreiros ativos: sem `deleted_at`, `is_active`, sem `self_deactivated_at`.
- **Excluir o tenant demo `terreiro-modelo`** (`backend/scripts/seed_terreiro_modelo.py:44`), senão os 6 meses de
  seed inflam os números.
- Cache de 1 h: dict com timestamp por worker, ou Redis `SETEX senhas:public_stats` no padrão de
  `B/services/error_alert_service.py:57`. Não existe helper de cache pronto.
- Auditor de tenant: entrada em `EXEMPT_PUBLIC_QUERIES` (`backend/scripts/audit_tenant_isolation.py:288`) com
  justificativa ("agregado cross-tenant intencional, sem dado de tenant").
- Front:
  - `F/components/landing/StatsBand.tsx`, com contador animado usando `Reveal`/`useReducedMotion`;
  - limiar mínimo em `F/constants/landingStats.ts` (abaixo dele o número não aparece);
  - fetch no cliente via `apiClient`, ou `getStaticProps` com `revalidate: 3600` e try/catch que devolve `null`,
    porque no `docker build` não há backend.

**Testes**
- `tests/unit/test_public_stats.py` e o registro do limite em `test_rate_limits.py`.
- `tests/integration_pg/test_public_stats.py`: exclui tenant apagado, o demo e senhas canceladas.
- `landing.test.tsx`: a faixa some abaixo do limiar.

**Riscos.** Nunca expor nome ou id de tenant. Com cache por worker, os números podem variar um pouco entre requisições.

**Aceite**
- [ ] Endpoint público com cache, rate limit e só agregados
- [ ] Demo e dados apagados/cancelados excluídos (teste com Postgres real)
- [ ] Faixa na landing respeitando o limiar e `prefers-reduced-motion`
- [ ] Auditor de tenant passando com a isenção justificada

### V-03 — Seção de depoimentos na landing
- **Ranking:** 9 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** V-01 · **Destrava:** —

**Implementação**
- `F/constants/testimonials.ts` tipado: `{nome, casa, cidade, uf, foto, instagram, texto, autorizadoEm}`.
- `F/components/landing/Testimonials.tsx` com `Card` + `Avatar` (`F/components/ui/avatar.tsx`) + `Reveal`.
  - No celular, carrossel com CSS `snap-x` (não há lib de carrossel no projeto).
  - Grade a partir de `md:` (breakpoints em `globals.css:153`).
- Fotos em `frontend/public/landing/depoimentos/*.webp`.
- Posição: depois de "Como funciona" (l.374) ou depois do V-07.
- Link do Instagram: `https://instagram.com/<handle>` sanitizado, com `rel="noopener noreferrer"`.

**Riscos.** Se a constante estiver vazia, a seção não aparece. `alt` descritivo nas fotos.

**Aceite**
- [ ] Seção com 3 ou mais depoimentos reais
- [ ] Carrossel no celular, grade no desktop
- [ ] Teste: renderiza N depoimentos e some quando a lista está vazia

### V-07 — Seção "antes × depois" e perguntas do terreiro
- **Ranking:** 10 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev + conteúdo · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** — · **Destrava:** —

**Por quê.** O antes × depois do Kanzuá e os benefícios escritos como perguntas reais da Minha Gira ("O que eu levo
pra gira?", "Quem limpa hoje?") são as seções mais claras do nicho.

**Conteúdo**
- Antes: fila no portão desde cedo; papelzinho que some; "quem chegou primeiro?"; consulente indo embora; ninguém sabe
  quantos foram atendidos.
- Depois: senha no celular pelo WhatsApp; chamada pela Porta e na TV; fila de espera automática; relatório da gira
  pronto.
- Perguntas: "Quantas pessoas cabem hoje?", "Quem é o próximo?", "Quantos o Caboclo atendeu?"

**Implementação.** `F/components/landing/BeforeAfter.tsx`, com o texto em `F/constants/landingCopy.ts`, depois de
`#como-funciona` (l.374). Cores dos ícones: `text-destructive-strong`/`text-success-strong`; nunca
`text-*-foreground` (`colorUsage.test.ts` acusa).

**Aceite**
- [ ] Texto revisado na linguagem do terreiro
- [ ] Seção implementada e com contraste aprovado nos testes

### V-05 — Carrossel de telas reais
- **Ranking:** 11 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** M · **Tipo:** dev · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** — · **Destrava:** C-02 (reaproveita as capturas)

**Por quê.** O ORI mostra 11 screenshots reais em carrossel; o AxéCloud, "telas capturadas no sistema real". Nós
mostramos um mock estático (`PortaMock`, `index.tsx:107-161`).

**Implementação**
- Capturas do tenant demo `terreiro-modelo` (`backend/scripts/seed_terreiro_modelo.py`), conferindo que todos os nomes
  são fictícios.
- Telas: `/admin/porta`, `/admin/porta/kiosk`, bilhete público (`F/components/public/Bilhete.tsx`),
  `/admin/relatorio-gira`, site do terreiro (`/[tenantSlug]`), `/admin/financeiro`.
- `frontend/public/landing/telas/*.webp`, cada uma com menos de ~150 KB.
- `F/components/landing/ScreensCarousel.tsx` + `DeviceFrame.tsx`, com lightbox via `F/components/ui/dialog.tsx`.
- Remover `PortaMock` se ficar sem uso (R-03).
- `next/image`: o `output: 'standalone'` em alpine precisa de `sharp` para otimizar e ele não está instalado. Validar
  o build de produção ou usar `unoptimized` com webp já otimizado. Só a primeira imagem com `priority`.

**Riscos.** Dado real vazar numa captura. LCP.

**Aceite**
- [ ] 6 capturas com dados fictícios, otimizadas
- [ ] Carrossel com legenda, moldura e lightbox acessível (`alt` em cada imagem)
- [ ] Build de produção ok com a estratégia de imagem escolhida
- [ ] Teste: abre e fecha o lightbox

### T-03 — Sitemap dinâmico
- **Ranking:** 12 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** P · **Tipo:** dev · **Módulo:** Site & SEO · **Épico:** Fundação
- **Depende de:** — · **Destrava:** $-03, C-01, C-02, C-05

**Por quê.** `frontend/public/sitemap.xml` é estático, com só `/`, `/cadastro` e `/login`. Os sites publicados dos
terreiros e todas as páginas de marketing novas ficam fora. Os concorrentes que vivem de SEO (AxéCloud) têm uma
página por recurso e um diretório indexados.

**Implementação**
- `F/pages/sitemap.xml.tsx` com `getServerSideProps`, gerando XML: rotas estáticas de marketing + sites publicados
  (endpoint público que lista os slugs com site `PUBLISHED`; isenção justificada no auditor).
- Remover o `public/sitemap.xml` estático, que conflita com a rota; o `robots.txt` continua apontando para
  `/sitemap.xml`.
- Cache de 1 h no response.

**Aceite**
- [ ] `/sitemap.xml` dinâmico com as rotas de marketing e os sites publicados
- [ ] Nenhum site despublicado ou de tenant inativo no sitemap (teste)
- [ ] Validado no Google Search Console

### $-03 — Página `/planos` com tabela comparativa
- **Ranking:** 13 · **Prioridade:** P0 · **Onda:** 1 · **Esforço:** M · **Tipo:** dev · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** T-01, T-03, $-01 (textos) · **Destrava:** $-02 (toggle aparece aqui)

**Por quê.** A Minha Gira tem a melhor página de preços do nicho: "Tudo do plano X +" e uma tabela comparativa
completa. A nossa tabela só existe dentro do painel.

**Implementação**
- `F/pages/planos.tsx`, pré-renderizada como estática (sem fetch).
- Reaproveitar `F/components/billing/PlanComparison.tsx` e `PlanCard.tsx`, mais `F/constants/plans.ts` (`PLAN_LIST`,
  `planHighlights`, `FEATURE_CATALOG`, `BASE_FEATURES`, `formatLimit`).
- Ajustes no `PlanComparison`:
  - `currentPlan` passa a ser opcional (l.27), para não mostrar o badge "Atual";
  - trocar `bg-primary/5` e `text-brand` (l.76, l.184) por classes neutras ou uma variante `marketing`, porque o
    `applyBrand` (`F/providers/ThemeProvider.tsx:200-206`) pinta a página com a cor do terreiro do usuário logado;
  - na versão pública, CSS (`hidden sm:block`) em vez de `useMediaQuery`, que começa em `false` e faz o layout pular
    depois da hidratação.
- Extrair o header e o rodapé da landing para `F/components/landing/MarketingShell.tsx` (serve também a V-08 e C-02).
- Landing: o `NAV` (l.45) e o rodapé (l.481) apontam para `/planos`.
- Texto do trial padronizado em "30 dias de Premium" (a landing hoje diz "1 mês").

**Testes.** `frontend/__tests__/pages/planos.test.tsx`: 4 planos, linhas do `FEATURE_CATALOG`, CTA
`/cadastro?plan=pro`.

**Aceite**
- [ ] `/planos` publicada, gerada de `plans.ts` (fonte única)
- [ ] Tabela completa no desktop, abas no celular, sem pulo de layout
- [ ] Sem herdar a cor do terreiro logado
- [ ] Gratuito e trial de 30 dias em destaque; menu e rodapé apontando para `/planos`

---

## Onda 2 — Planos e correções

### T-04 — Modo TV sem dados pessoais no navegador
- **Ranking:** 14 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** P · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Fundação
- **Depende de:** — · **Destrava:** N-01

**Por quê.** O kiosk (`F/pages/admin/porta/kiosk.tsx`) faz polling de `GET /api/v1/admin/giras/{id}/door/queue`, que
devolve **e-mail e telefone completos** de toda a fila para o navegador da TV. A tela só mostra `nomeParaTv`, mas os
dados ficam no aparelho público (DevTools, cache). É uma exposição desnecessária pela LGPD.

**Implementação**
- Novo `GET /api/v1/admin/giras/{gira_id}/door/tv` com PORTA view e **sem gate de plano** (o número é núcleo).
  Payload enxuto: número formatado, nome já reduzido no servidor (mesma regra de `nomeParaTv`), próximo da fila e a
  chamada atual.
- `kiosk.tsx` passa a consumir esse endpoint.
- Declarar `chamado_em` na interface do kiosk (a API já devolve).

**Testes.** Teste do endpoint (sem e-mail/telefone no payload); novo `frontend/__tests__/pages/admin_porta_kiosk.test.tsx`.

**Aceite**
- [ ] Kiosk sem nenhuma PII além do nome reduzido
- [ ] Endpoint com PORTA view, testado
- [ ] Teste do kiosk criado

### T-05 — Porteiro sem acesso a Médiuns cai no texto livre
- **Ranking:** 15 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** P · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Fundação
- **Depende de:** — · **Destrava:** N-03

**Por quê.** No `AttendModal`, as sugestões de médium vêm de `GET /api/v1/admin/mediuns/options?only_atendimento=true`
(`B/api/v1/admin/mediuns.py:180`), que exige `MEDIUNS:view`. Um porteiro que só tem PORTA recebe 403, o erro é engolido
em `porta.tsx::loadMediunOptions` e ele digita o nome à mão. Resultado: o relatório da gira agrupa por um texto com
grafias diferentes.

**Implementação**
- `GET /api/v1/admin/door/mediuns-options` com PORTA view, devolvendo só id + nome dos médiuns de atendimento.
- `porta.tsx` passa a usar esse endpoint; erro real aparece em toast, não é engolido.

**Aceite**
- [ ] Porteiro só com PORTA vê as sugestões de médium
- [ ] Teste RBAC: PORTA sem MEDIUNS recebe 200 no endpoint novo
- [ ] Sem `catch` silencioso no carregamento

### T-06 — Permissão do "Meu Site" usa o grupo de Cursos
- **Ranking:** 16 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** P · **Tipo:** dev · **Módulo:** Site & SEO · **Épico:** Fundação
- **Depende de:** — · **Destrava:** —

**Por quê.** O router admin de sites (`B/api/v1/admin/sites.py`) usa `require_plan_feature("site_builder")` + o grupo
**`CURSOS_PRESENCIAIS`**. O CLAUDE.md diz "Cursos Presenciais / Sites → `CURSOS_PRESENCIAIS`", então é intencional,
mas confunde: quem cuida do site precisa de permissão de cursos e vice-versa. Também afeta o upload de imagens
(`admin/sites.py:463-564`).

**Decisão + implementação**
- Decidir: manter e deixar claro na UI ("Cursos e site") ou separar numa feature `SITE`. Separar exige enum + 2
  migrações + `permissionFeatures.ts` + `PermissionMatrix`.
- Se separar: dar a feature nova a todos os grupos que hoje têm `CURSOS_PRESENCIAIS`, para ninguém perder acesso.

**Aceite**
- [ ] Decisão tomada e refletida no CLAUDE.md/AGENTS.md
- [ ] Se separar: migração preservando o acesso atual e testes RBAC

### $-02 — Plano anual
- **Ranking:** 17 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** M · **Tipo:** dev · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** $-01, $-03 · **Destrava:** —

**Por quê.** AxéCloud (2 meses grátis), Kanzuá (semestral e anual, −30%) e Minha Gira (−20%) têm anual. Nós só
temos mensal (`STRIPE_PRICE_BASIC/PRO/PREMIUM`). Anual melhora caixa e retenção.

**Implementação backend**
- `B/core/config.py:64-66`: `STRIPE_PRICE_{BASIC,PRO,PREMIUM}_ANNUAL`, mais `docker-compose.prod.yml:130-132` e
  `.env.prod.example`.
- `B/services/stripe_service.py`:
  - `_price_id_for_plan(plan, interval)`;
  - `create_checkout_session(..., interval)` e `update_subscription(sub_id, new_plan, interval)`;
  - definir `proration_behavior` na troca entre mensal e anual.
- `B/api/v1/admin/billing_stripe.py`:
  - `CreateCheckoutRequest`/`ChangePlanRequest` (l.81-90) ganham `interval: Literal["month","year"]="month"`;
  - **corrigir `change_plan` (l.247-293), que hoje converteria um anual em mensal em silêncio**;
  - `BillingInfoResponse` ganha `billing_interval`.
- `B/api/v1/webhooks.py::_get_price_plan_map` (l.74-97) mapeia os 6 Prices para `{plan, interval, monthly_price}`:
  - **anual grava `monthly_price = anual/12`**; senão o `effective_mrr` (`billing_metrics.py:57`) infla o MRR 12×;
  - ignorar Price vazio (hoje a chave `""` sobrescreve).
- `B/api/v1/platform/billing_sync.py:87-105` usa o mesmo mapa e lê `current_period_end` direto; corrigir junto.
- Migração 060: `subscriptions.billing_interval` (`month|year`, `server_default='month'`, NOT NULL).
  `reset_to_free` (`subscription_repo.py:202-213`) volta para `month`.

**Implementação frontend**
- `F/constants/plans.ts`: preço anual (sugestão `10 ×` a mensal) e `formatPrice` com intervalo.
- `F/components/billing/BillingIntervalToggle.tsx` (ToggleGroup), usado na landing, em `/planos` e em
  `F/pages/admin/billing.tsx` (`handleCheckout`/`handleChangePlan` l.192-217, rótulos "/mês").
- Cadastro: `?plan=pro&ciclo=anual` (`F/pages/cadastro.tsx` l.42, l.74) e `F/hooks/useSubscription.tsx:38`.
- Plataforma: `F/components/platform/planMeta.ts` e `SubscriptionDrawer.tsx:181`.
- JSON-LD (`index.tsx:227`): ofertas anuais com `UnitPriceSpecification` e `billingDuration: "P1Y"`.

**Testes**
- `test_webhook_plan_sync.py` (mapa dos anuais, /12, Price vazio).
- `test_admin_billing_stripe.py` (o anual continua anual).
- `integration_pg/test_stripe_webhook.py` (evento anual + idempotência Q-04).
- `test_platform_billing_metrics.py` (MRR /12).
- Front: `admin_billing.test.tsx`, `plans.test.ts`, `cadastro.test.tsx`.

**Riscos.** O `trial_period_days` (`billing_stripe.py:229-233`) continua valendo no anual. Definir a regra de
downgrade de anual para mensal no meio do ciclo.

**Aceite**
- [ ] 3 Prices anuais criados no Stripe e configurados em produção
- [ ] Toggle mensal/anual na landing, em `/planos`, no cadastro e no billing
- [ ] MRR correto para assinatura anual (teste)
- [ ] Trocar de plano preserva o intervalo

### $-05 — Cupons de desconto
- **Ranking:** 18 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** P · **Tipo:** dev · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** — · **Destrava:** X-01 (opção b), C-06

**Por quê.** O ORI tem campo de cupom. Cupom também é a base do programa de afiliados da Quartinha e de campanhas.

**Implementação**
- `stripe_service.create_checkout_session` (l.39-69):
  - sem cupom: `allow_promotion_codes=True`;
  - com cupom: resolver `stripe.PromotionCode.list(code=..., active=True)` e passar `discounts=[{"promotion_code": id}]`;
  - **o Stripe não aceita os dois juntos.**
- Cadastro:
  - `F/pages/cadastro.tsx` lê `?cupom=` (padrão do `wantedPlanKey`, l.42);
  - `buildOnboardingPayload` (`F/components/auth/cadastroForm.ts:103`);
  - `OnboardingRequest.cupom` validado com `^[A-Z0-9_-]{3,40}$`;
  - grava em `custom_settings["cupom"]` (`onboarding.py:173-180`).
- Checkout: `CreateCheckoutRequest.cupom`, com fallback para `custom_settings["cupom"]`. Cupom inválido → 400 via
  `_reraise_stripe_error`.
- Relatório:
  - no `checkout.session.completed` (`webhooks.py:211-280`), gravar `promotion_code`;
  - migração `subscriptions.promotion_code` (String(64), indexada);
  - `GET /api/v1/platform/billing/coupons` com `require_super_admin`: cadastros, conversões e MRR por código;
  - card em `F/pages/platform/billing.tsx`.

**Testes**
- `test_admin_billing_stripe.py`: com cupom manda `discounts`, sem cupom manda `allow_promotion_codes`.
- `test_onboarding_signup.py`.
- `integration_pg/test_stripe_webhook.py`: grava o código uma vez só em reentrega.

**Riscos.** Cupom com trial: o desconto `once` cai na primeira fatura depois do trial; comunicar isso.

**Aceite**
- [ ] Link `/cadastro?cupom=X` leva o desconto até o checkout
- [ ] Campo de código promocional no checkout do Stripe
- [ ] Relatório de cupons no painel da plataforma

### F-08 — Story de Instagram com a agenda do mês
- **Ranking:** 19 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** P · **Tipo:** dev · **Módulo:** Giras & Agenda · **Épico:** Crescimento
- **Depende de:** — · **Destrava:** —

**Por quê.** Ideia do Meu Axé: um PNG 1080×1920 com a grade do mês para o terreiro postar no story. É marketing
grátis para a casa e para o GiraHub, com a marca discreta no rodapé. Custa pouco e espalha o produto.

**Implementação**
- `F/components/shared/AgendaStory.tsx`, renderizado fora da tela em 1080×1920 com logo e cores do terreiro
  (`F/lib/brand.ts`, `siteBrandColor`).
- `F/hooks/useStoryExport.ts` com `html2canvas`, já usado em `F/hooks/useRelatorioPDF.ts`.
- Dados: `GET /api/v1/public/agenda/{slug}` (limite de 20 próximas). Adicionar `?mes=YYYY-MM` ou usar a listagem
  admin de giras.
- Botão em `F/pages/admin/giras.tsx` e na agenda pública (`TenantAgenda.tsx`/`GirasCalendar.tsx`).
- Rodapé "feito com GiraHub" (reaproveitar `PoweredByGiraHubFooter.tsx`).
- Gate de plano: nenhum (é marketing para nós).

**Riscos.** CORS do logo no canvas (vem da mesma origem pela API; testar). Fontes externas no canvas.

**Aceite**
- [ ] PNG 1080×1920 baixado com as giras do mês, logo e cores do terreiro
- [ ] Botão na tela de giras e na agenda pública
- [ ] Testado no celular (download e compartilhamento)

### V-08 — Nova identidade visual da landing
- **Ranking:** 20 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** G · **Tipo:** decisão + dev · **Módulo:** Landing & Marketing · **Épico:** Vitrine
- **Depende de:** V-01 (mídia autorizada), $-03 (MarketingShell) · **Destrava:** C-01, C-02 (mesmo visual)

**Por quê.** As três landings mais fortes (AxéCloud, ORI, Minha Gira) usam paleta de terreiro (creme, barro/terracota,
dourado), serifa de display e foto ou vídeo real de gira. A nossa usa índigo/violeta com hex fixos
(`#0f0d2e`, indigo, amber). Parece um SaaS qualquer.

**Decisão.** Moodboard com 2 propostas e escolha do dono.

**Implementação**
- Tokens só no escopo de marketing: bloco `.marketing { --mkt-* }` + `.dark .marketing` em
  `F/styles/globals.css`, mapeados em `@theme inline` como `--color-mkt-*`.
  - **Não sobrescrever `--primary`/`--brand`**: o `applyBrand` reescreve isso quando há sessão.
  - **Não criar blocos `:root {`/`.dark {` antes dos atuais**: `contrast.test.ts` pega o primeiro `indexOf`.
- Novo `frontend/__tests__/styles/marketingContrast.test.ts` (reaproveitar `contrastRatio` de `@/lib/brand`).
  Dourado sobre creme quase sempre reprova 4,5:1.
- Serifa de display via `next/font/google` (self-host, compatível com o CSP).
- Vídeo no próprio domínio (`frontend/public/landing/hero.mp4`/`.webm`), porque o CSP não tem `media-src`. Usar
  `poster` + `preload="none"`, pausado com `prefers-reduced-motion`.
- Modo escuro da landing: `F/providers/MarketingThemeProvider.tsx` no padrão do `AdminThemeProvider.tsx:55-60`.
  `theme-color` por página (o `_document.tsx` tem `#4f46e5` fixo).
- Trocar todos os hex/classes indigo-violet-amber de `index.tsx` (header l.255, hero l.316, PlanCard l.172-207, CTA
  l.450, rodapé l.466) e de `/planos` por `mkt-*`. `Badge`/`Button` do kit usam `--primary`: passar `className` ou
  criar uma variante.

**Riscos.** O painel não pode mudar (o escopo `.marketing` garante). LCP do vídeo. Direito de uso da mídia.

**Aceite**
- [ ] Proposta escolhida
- [ ] Landing e `/planos` com os tokens `mkt-*`, claro e escuro, contraste aprovado em teste
- [ ] Foto/vídeo real de gira com autorização registrada
- [ ] Painel admin visualmente inalterado
- [ ] Lighthouse mobile: LCP < 2,5 s

### $-04 — PIX/boleto na assinatura
- **Ranking:** 21 · **Prioridade:** P1 · **Onda:** 2 · **Esforço:** M · **Tipo:** decisão + dev · **Módulo:** Planos & Assinatura · **Épico:** Planos
- **Depende de:** — · **Destrava:** —

**Por quê.** Muitos terreiros não têm cartão de crédito no nome da casa. O AxéCloud cobra só por PIX; Minha Gira e
Quartinha usam o Asaas (PIX e boleto).

**Decisão.** Validar no Stripe Brasil (lib `stripe==15.4.0`):
- boleto em `mode=subscription` (`payment_method_types=["card","boleto"]`) ou `collection_method="send_invoice"` com
  `days_until_due`;
- se há Pix Automático recorrente e quanto custa.

**Implementação**
- `stripe_service.create_checkout_session` (l.39-69): `payment_method_types` e
  `payment_method_options.boleto.expires_after_days`.
- Para `send_invoice`: `POST /api/v1/admin/billing/subscribe-invoice` em `billing_stripe.py` (`_require_admin`, igual
  aos outros; o arquivo já é isento em `scripts/audit_permission_guards.py`).
- Webhooks (`webhooks.py:173-187`):
  - tratar `checkout.session.async_payment_succeeded`/`async_payment_failed`;
  - tratar `invoice.paid` (reativa SUSPENDED) e `invoice.overdue`;
  - **o `checkout.session.completed` de boleto chega com `payment_status=unpaid`, e hoje o handler marca ACTIVE
    direto (l.257)**;
  - `_handle_payment_failed` (l.356-393) rebaixa o trial na primeira falha; boleto em aberto não é falha.
- Opcional: `subscriptions.collection_method`, para a UI mostrar "pague o boleto".

**Testes.** `integration_pg/test_stripe_webhook.py` (`invoice.paid` reativa; reentrega não reprocessa),
`test_admin_billing_stripe.py`, `admin_billing.test.tsx` ("aguardando pagamento").

**Status (08/10/2026) — decidido: aceitar PIX e boleto além do cartão.** O que a Stripe permite numa conta
brasileira (docs.stripe.com, consultado em 08/10):
- **Boleto**: aceito em assinatura (Checkout `mode=subscription`, Billing e Invoicing). Confirmação em até
  1 dia útil, sem estorno/contestação, mínimo R$ 5. Taxa: **R$ 3,45 por boleto pago**
  (stripe.com/br/pricing/local-payment-methods; o Pix avulso custa 1,19%). A taxa do Stripe Billing, se
  houver no contrato, vale igual para cartão e boleto.
- **Pix**: conta BR só aceita Pix **avulso** e **sob convite**; o **Pix Automático (recorrente) não está
  disponível no Brasil**, e o Pix em faturas (Invoicing) não lista o Brasil entre os países. Ou seja, hoje
  não há como cobrar a assinatura por Pix pela Stripe BR.
- **Implementado (boleto)**: escolha "Cartão de crédito" × "Boleto bancário" em `/admin/billing`; boleto =
  assinatura `collection_method=send_invoice` (fatura por e-mail todo mês, 5 dias para pagar, link
  "Pagar agora" no painel); plano liberado só no `invoice.paid`; boleto em aberto não suspende nem rebaixa;
  fatura vencida suspende e o pagamento reativa. Migração `085_assinatura_boleto`. Detalhes em AGENTS.md
  §11.18 e docs/api.md §20; passos do Dashboard em docs/deployment.md (Stripe).
- **Status (09/10/2026): feito** — boleto no PR #105 e PIX mês a mês no PR #112, ambos no master.
- **PIX mês a mês: PR #112 (09/10/2026, decisão do dono "Quero pix na assinatura").** Sem Pix recorrente na
  Stripe BR, cada mês é um Checkout avulso de Pix (`POST /admin/billing/pix-checkout`) que libera 30 dias do plano
  a partir de max(agora, pago até, fim do teste); lembretes 5 d/1 d; 3 dias de tolerância e volta ao gratuito;
  conta como pagante no MRR enquanto o mês vale. Migração `090_assinatura_pix_mensal`. Detalhes em AGENTS.md
  §11.18, docs/api.md §20 e docs/deployment.md (Stripe). Pix e Boleto ativados no Dashboard em 09/10.
- **Pix na fatura**: se a Stripe um dia liberar Pix em faturas para a conta, é só `STRIPE_INVOICE_PAYMENT_METHODS=
  boleto,pix` — o boleto passa a mostrar "PIX ou boleto" sem mudar código.

**Aceite**
- [x] Decisão documentada, com as taxas reais (boleto R$ 3,45 por pagamento; Pix indisponível em assinatura)
- [x] PIX mês a mês (Checkout avulso, 30 dias por pagamento, lembretes e vencimento) — PR #112
- [ ] Assinar com boleto funcionando ponta a ponta em modo de teste (Boleto ativado no Dashboard em 09/10; falta o teste)
- [x] Boleto pendente não suspende nem rebaixa antes do vencimento (teste)

---

## Onda 3 — Defender o núcleo senha/porta

### N-04 — Tela de consulentes com histórico
- **Ranking:** 22 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** M · **Tipo:** dev · **Módulo:** Consulentes · **Épico:** Núcleo
- **Depende de:** — · **Destrava:** N-05

**Por quê.** O ORI vende o histórico de atendimentos por consulente; a Quartinha tem um portal do consulente. O
modelo `consulentes` já existe e é preenchido em toda emissão, mas **não existe tela nem endpoint admin**. Os
consulentes só aparecem de forma indireta (fila, lista por gira, CSV).

**Estado do código**
- `B/models/consulentes.py`: nome, email, telefone, `*_normalized`, cpf, endereco e **`observacoes`**, que existe e
  não é usado.
- **Dedup só por e-mail** (`uq_consulentes_tenant_email_active`, migração 052). O `phone_normalized` é gravado mas
  não deduplica.
- Walk-in sem e-mail e cada acompanhante viram um consulente novo, então o histórico fica fragmentado.
- `ConsulenteRepository.list_by_tenant` (`B/repositories/consulente_repo.py:334`) não tem chamador e **não filtra
  `deleted_at`**.
- Dado sensível já existe: `tickets.priority_category` (PcD/TEA, gestante) e `atendimento_descricao` (texto livre).

**Implementação**
- Decidir a permissão: feature nova `CONSULENTES` (enum + migração `ALTER TYPE` + segunda migração dando a feature aos
  grupos padrão + `permissionFeatures.ts` + `PermissionMatrix`) ou reaproveitar `TICKETS`. **Recomendado:
  `CONSULENTES`**, porque o histórico revela atendimento espiritual.
- Repositório: `search` (nome/email/telefone, paginado), `get_with_history`, `update_internal_notes`; corrigir o
  `list_by_tenant`.
- Novo `B/api/v1/admin/consulentes.py`:
  - `GET /api/v1/admin/consulentes?search=&skip=&limit=` (view);
  - `GET /api/v1/admin/consulentes/{id}` (view, ficha + histórico: gira, data, status, médium, descrição);
  - `PATCH /api/v1/admin/consulentes/{id}` (edit: nome, telefone, observações);
  - `GET /api/v1/admin/consulentes/export-csv` (view + `require_plan_feature("export_csv")`, reaproveitando
    `exports.py`).
- Plano sugerido: lista no BASIC, histórico no PRO (feature `consulentes_historico` em `_FEATURE_MIN_TIER` +
  `plans.ts`).
- Front: `F/pages/admin/consulentes.tsx` (`DataTable`) + `F/pages/admin/consulentes/[consulenteId].tsx`, item no
  `navConfig.ts` (grupo "Giras e senhas"), `F/constants/routes.ts`, `releaseNotes.ts`.
- Índice `(tenant_id, nome)` para a busca.

**Testes**
- `integration_pg/`: `test_tenant_isolation.py`, `test_rbac_http.py`, `test_rbac_grupo_padrao.py` (feature nova no
  grupo padrão), `test_plan_gate.py`, `test_migrations.py`.
- Front: no padrão de `admin_mediuns.test.tsx`.

**Riscos.** LGPD: finalidade, exportação com PII e log de auditoria sem o conteúdo sensível. Busca `ilike` sem índice.

**Fora do escopo.** Mesclar consulentes duplicados (card futuro) e dedup por telefone (muda a regra da Q-03; decidir à
parte).

**Aceite**
- [ ] Lista com busca e ficha com o histórico completo do consulente
- [ ] Observações internas editáveis
- [ ] Permissão CONSULENTES (ou decisão registrada) com migrações e testes RBAC
- [ ] `list_by_tenant` filtrando `deleted_at`
- [ ] Exportação CSV respeitando `export_csv`

### N-06 — Check-in por QR do bilhete
- **Ranking:** 23 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** M · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Núcleo
- **Depende de:** — · **Destrava:** —

**Por quê.** A Quartinha tem check-in e scanner por QR. Nós já temos o check-in manual (`tickets.checkin_em`,
`PATCH/DELETE /api/v1/admin/door/tickets/{id}/checkin`, `door_control.py:553,575`); falta o QR para agilizar a porta.

**Implementação**
- Bilhete (`F/components/public/Bilhete.tsx`): `QRCodeSVG` (`qrcode.react`, já instalado) com
  `ticketPagePath(slug, id)` enquanto a senha não foi atendida.
- `F/components/admin/QrScanner.tsx`: `BarcodeDetector`, com fallback por import dinâmico de `@zxing/browser`
  (versão JS, **não WASM**: o CSP não tem `wasm-unsafe-eval`). iOS Safari não tem `BarcodeDetector`.
- `POST /api/v1/admin/giras/{gira_id}/door/checkin-by-code` body `{code}`, com PORTA edit e sem gate de plano:
  - extrai o id com a mesma lógica de `ticketIdFromLink` (`bilhete-utils.ts:148`);
  - senha de outra gira → 409 com mensagem; status fora de espera → 409;
  - grava `checkin_em` (e dos acompanhantes via `parent_ticket_id`);
  - devolve o item + a posição na fila (extrair a ordenação de `get_door_queue`, l.326-373, para um helper).
- Botão "Ler QR" no topo da Porta (`porta.tsx` l.747-779) e toast com a posição.

**Riscos**
- **O UUID da senha é o segredo de cancelamento** (`_cancellability`). Um QR que o consulente mostra ou fotografa
  expõe esse segredo. Avaliar um `tickets.checkin_token` separado (migração) para o QR.
- Câmera exige HTTPS e permissão; no PWA do iOS a permissão é pedida de novo.

**Aceite**
- [ ] QR no bilhete; scanner na Porta funcionando no Android Chrome e no iOS Safari
- [ ] Check-in de senha de outra gira ou de outro tenant recusado (teste de isolamento)
- [ ] Decisão sobre token separado registrada
- [ ] Posição na fila exibida após o check-in

### N-01 — Modo TV com conteúdo entre as chamadas
- **Ranking:** 24 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** M · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Núcleo
- **Depende de:** T-04 · **Destrava:** —

**Por quê.** O ORI TV (app de Google TV/Fire TV) mostra avisos, vídeos e "frases de sabedoria" entre as chamadas. O
nosso kiosk mostra só o número e o próximo da fila.

**Implementação**
- Config por terreiro: avisos, frases, imagens, intervalo do rodízio e logo liga/desliga.
  - Leve: `TenantConfig.custom_settings["tv"]`, sem migração.
  - Explícita: coluna `tenant_configs.tv_config JSON` (060).
- Edição pelo `PUT /tenant/config` (CONFIGURACOES edit) com gate ao ligar (`check_plan_feature`). Nova seção "Modo TV"
  em `F/pages/admin/config.tsx` (`TvConfigSection.tsx`).
- Leitura: `GET /api/v1/admin/door/tv-config` (PORTA view).
- Plano: `tema_personalizado` (PRO) ou feature nova `modo_tv_conteudo` (PRO).
- `F/components/admin/TvRotator.tsx` no `kiosk.tsx`:
  - rodízio quando não há chamada; a chamada interrompe com o som que já existe (l.100-113);
  - `gira.recados` como aviso automático;
  - botão "Ativar som" (Android TV/Fire TV bloqueiam autoplay sem gesto).
- Imagens: **não usar `SiteImage` sem ajuste**. O `site_id` é NOT NULL e o GC do `SiteImageRepository` apaga imagens
  não referenciadas. Criar uma tabela `tenant_media` ou guardar só URLs/textos na v1.

**Riscos.** Sessão logada num aparelho público. Navegadores de TV antigos. Imagens em BYTEA aumentam o banco.

**Aceite**
- [ ] Configuração de avisos/frases/imagens no painel, com gate de plano
- [ ] Rodízio na TV, interrompido pela chamada com som
- [ ] Testado numa TV real (Android TV ou Fire TV)
- [ ] Item "Funciona na TV?" do FAQ (V-04) atualizado

### N-02 — Ficha impressa em impressora térmica
- **Ranking:** 25 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** M · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Núcleo
- **Depende de:** — · **Destrava:** —

**Por quê.** Para o consulente que chega sem celular (walk-in). O ORI vende a ficha térmica "por menos de 1 centavo";
o Meu Axé imprime direto do navegador por WebUSB. Hoje só existe `window.print()` no dashboard.

**Implementação**
- Caminho principal: `F/components/admin/FichaImpressa.tsx` com `@media print` e `@page { size: 58mm auto }` (e
  80 mm), via `window.print`. Funciona em qualquer navegador e impressora com driver.
- Caminho avançado: `F/lib/thermalPrinter.ts` com ESC/POS via WebUSB/Web Serial:
  - encoder CP860/CP850 para acentos;
  - QR por `GS ( k`, com fallback raster;
  - impressão silenciosa.
- `GET /api/v1/admin/door/tickets/{ticket_id}/ficha` (PORTA view, sem gate): número formatado, gira (nome e data),
  horário, nome do terreiro, mensagem (`custom_settings["ficha_mensagem"]` ou `gira.recados`) e `bilhete_url`
  (`public_ticket_link`, `B/core/public_links.py`).
- Botão depois de `handleCreateWalkIn` (`porta.tsx` l.607-621), entrada "Imprimir ficha" no `ItemMenu`
  (l.231-295), opção "imprimir ao criar" no `WalkInModal`.
- `F/components/admin/PrinterSettingsDialog.tsx`, salvando por aparelho em `localStorage`
  (`girahub:porta-impressora`, no padrão de `MUTE_STORAGE_KEY`).

**Riscos**
- WebUSB/Serial só funcionam no Chrome/Edge e em HTTPS.
- No Windows, o driver prende a interface USB (WinUSB/Zadig).
- QR em ESC/POS varia entre impressoras genéricas.
- O QR com o UUID é o segredo de cancelamento. No walk-in o risco é baixo, porque a gira já começou.

**Aceite**
- [ ] Ficha de 58 e 80 mm pelo `window.print` funcionando em impressora real
- [ ] (Opcional) ESC/POS direto via WebUSB testado em 1 modelo (Epson TM-T20 ou genérica)
- [ ] Botões no walk-in e no menu da fila
- [ ] Testes mockando `window.print` e `navigator.usb`

### N-03 — Senha por médium/entidade com limite de vagas
- **Ranking:** 26 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** G · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Núcleo
- **Depende de:** T-05 · **Destrava:** N-05 (retorno ao mesmo médium), F-06

**Por quê.** ORI (fichas por guia/médium) e Quartinha (senha por entidade, com limite de vagas por médium) já fazem.
Hoje o `tickets.medium_nome` é texto livre, preenchido na hora de chamar (`AttendRequest`, `door_control.py:597`), sem
chave estrangeira.

**Modelo (migração 060)**
- `gira_atendentes`: id, tenant_id, gira_id, medium_id (FK `mediuns` SET NULL), cambone_id NULL, entidade_nome,
  vagas NULL, total_emitido, slots_returned, version, ordem, timestamps e deleted_at.
  - Único parcial em (gira_id, medium_id, entidade_nome) WHERE `deleted_at IS NULL`.
- `tickets.gira_atendente_id` (FK SET NULL, indexada). **Manter `medium_nome` como snapshot** (CSV, PDF e relatório
  dependem dele).
- `giras.atendentes_mode` (`livre` | `escolha` | `distribuir`, default `livre`).
- `tenant_configs.enable_atendentes` (default false).

**Backend**
- Copiar o desenho do `GiraTimeSlot` (`increment_atomic` com `FOR UPDATE`, `increment_slots_returned`,
  `replace_slots_for_gira`) para `gira_atendente_repo.py` + `atendente_service.py` (distribuir para o menos
  carregado).
- `emit_ticket.py`: `EmitTicketRequest.gira_atendente_id` (l.74) e um STEP "7d" copiando o 7b (l.598-655), antes do
  commit. Acompanhantes ocupam a mesma vaga.
- Devolução de vaga nos mesmos pontos do horário: `tickets_bulk.py`, `tickets_list.py`, `public/cancel_ticket.py`,
  `public/waitlist_confirm.py`.
- `waitlist_service.py`: fila de espera por atendente (`_get_next_in_line`, `compute_queue_position`,
  `reconcile_and_fill`).
- `next_gira.py`: expor as entidades e as vagas no público (análogo a `_resolve_time_slots`, l.114). **Mostrar só o
  nome da entidade, nunca o nome civil do médium.**
- Endpoints:
  - `GET/PUT /api/v1/admin/giras/{gira_id}/atendentes` (GIRAS view/edit + `require_plan_feature("senha_por_medium")`);
  - `GET /api/v1/admin/giras/{gira_id}/door/atendentes` (PORTA view).
- Plano: feature nova `senha_por_medium` (PRO ou PREMIUM; o horário marcado é PREMIUM).

**Frontend**
- Configuração em `F/pages/admin/giras.tsx` (`GiraAtendentesEditor.tsx`).
- Seletor na emissão pública (`F/pages/public/gira/[id].tsx`, igual ao de horário).
- Filtro por médium na Porta, pré-seleção no `AttendModal`.
- Kiosk: "Senha 12 → Caboclo X".
- Coluna "Entidade" em `relatorio-gira.tsx`, `RelatorioPDFLayout.tsx` e `exports.py`.

**Riscos**
- **Não criar numeração por médium.** O número continua sequencial por gira (`SenhaControl`); senão quebra a Q-03.
- Na distribuição, travar os atendentes em ordem fixa (`FOR UPDATE` ordenado) para evitar deadlock.
- Ordem dos incrementos na transação: geral, depois horário, depois médium.
- Médium desativado no meio da gira.

**Testes.** Análogos de horário: `test_repos_gira_time_slot.py`, `test_time_slot_service.py`,
`test_ticket_time_slot_release.py`, `test_door_control_time_slot.py`, `test_waitlist_service.py`;
`integration_pg/test_emission_concurrency.py` (rajada no mesmo médium) e `test_ticket_dedup.py`.

**Aceite**
- [ ] Gira configurável com atendentes, vagas e modo (livre/escolha/distribuir)
- [ ] Emissão respeitando as vagas sob concorrência (teste de rajada)
- [ ] Fila de espera por atendente
- [ ] Porta filtrando por médium; kiosk mostrando a entidade
- [ ] Relatório, PDF e CSV com a coluna "Entidade"
- [ ] AGENTS.md §11.4 atualizado

### N-05 — Retornos pedidos pela entidade
- **Ranking:** 27 · **Prioridade:** P1 · **Onda:** 3 · **Esforço:** M · **Tipo:** dev · **Módulo:** Consulentes · **Épico:** Núcleo
- **Depende de:** N-04 · **Destrava:** —

**Por quê.** O ORI tem "retornos": a entidade pede que o consulente volte, e o terreiro acompanha. Hoje esse pedido
se perde.

**Modelo.** `consulente_retornos`: tenant_id, consulente_id, ticket_origem_id, gira_origem_id, gira_atendente_id ou
medium_nome (snapshot), unidade (`giras` | `semanas`), quantidade, data_prevista, status
(pendente/cumprido/cancelado), ticket_retorno_id, email_opt_in, opt_in_em, notificado_em e created_by. Índice
(tenant_id, status, data_prevista).

**Implementação**
- `AttendModal`: campo "Pediu retorno em N giras/semanas" + opt-in de e-mail (consentimento verbal registrado com
  data).
- `door_control.py` (`attend_ticket` l.597, `edit_attend_info` l.628) e `tickets_list.py:305` criam ou atualizam o
  retorno.
- `emit_ticket.py`: depois do commit, marcar o retorno pendente do consulente como cumprido.
- Endpoints:
  - `GET /api/v1/admin/giras/{gira_id}/retornos-esperados` (PORTA view);
  - `GET/PATCH /api/v1/admin/retornos` (CONSULENTES).
- Badge "Retorno" na fila da Porta; `RetornosEsperadosSheet.tsx`.
- E-mail quando a gira de retorno abrir:
  - `retorno_scheduler.py` no padrão do `birthday_scheduler.py`, com `advisory_lock` chave `0x6769726168756205` (a `...204` ficou com o `presenca_scheduler`, AM-17) e
    marca por linha (`notificado_em`);
  - template `retorno_aberto.py`;
  - gate `email_transacional` (PRO).

**Riscos.** "N giras" depende de giras que ainda não existem. Walk-in sem e-mail não recebe aviso. A fila de e-mail é
em memória e perde envios num restart.

**Aceite**
- [ ] Registrar o retorno no atendimento
- [ ] Lista de retornos esperados na próxima gira e badge na fila
- [ ] Retorno cumprido automaticamente quando o consulente pega senha
- [ ] E-mail opt-in, sem envio duplicado com 2 workers (teste)

---

## Onda 4 — Funcionalidades e conteúdo

### P-02 — Decidir o caminho do WhatsApp
- **Ranking:** 28 · **Prioridade:** P1 · **Onda:** 4 · **Esforço:** P · **Tipo:** decisão · **Módulo:** Comunicação · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** F-03
- **Status (2026-10-08):** o dono quer a API oficial da Meta; custos e caminho em `docs/custos-whatsapp-meta.md` (falta: verificação do negócio na Meta com o CNPJ, número dedicado, modelo de cobrança).
- **Status (2026-10-09):** aguardando (dono decide depois). O CNPJ já existe e está nos Termos
  (`F/constants/legal.ts`); o pré-requisito que falta é a verificação do negócio na Meta + número dedicado.

**Por quê.** Item herdado do `plano-execucao.md` (Fase 3). O público é mobile-first e não lê e-mail. O AxéCloud usa a
API oficial da Meta; o ORI vende WhatsApp como add-on por volume (R$ 24,90 a R$ 149,90).

**Opções**
- Meta WhatsApp Cloud API: oficial. Exige número dedicado, verificação do negócio e templates aprovados.
  **Recomendada**, mas validar os limites atuais do free tier.
- Não oficiais (Evolution API etc.): violam os termos e podem banir o número. **Descartadas.**
- Meio-termo imediato, sem API: botão "receber no WhatsApp" depois da emissão (`wa.me`), reaproveitando
  `whatsappLink` (`F/components/admin/TicketDetailSheet.tsx:37`).

**Questão de custo.** Conversa paga pela plataforma viola o "custo zero". O caminho é vender como add-on ou repassar o
custo.

**Aceite**
- [ ] Limites e preços atuais da Cloud API verificados
- [ ] Decisão de modelo de cobrança (add-on? qual plano?)
- [ ] Spec curta que vira o F-03; P-02 atualizado no plano de execução

### F-01 — Decidir o gateway da mensalidade
- **Ranking:** 29 · **Prioridade:** P1 · **Onda:** 4 · **Esforço:** P · **Tipo:** decisão · **Módulo:** Financeiro · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** F-02
- **Status (2026-10-08):** explicação do fluxo e comparativo em `docs/fluxo-pagamento-mensalidade.md`; recomendação Mercado Pago com OAuth; decisão do dono pendente.
- **Status (2026-10-09):** dono estudando; acrescentada a opção **Stripe Connect** (PIX avulso na conta da casa, sem guardar token) em `docs/fluxo-pagamento-mensalidade.md` §5a — testar com uma casa piloto se o PIX é liberado na conta conectada.
- **Decidido (2026-10-09):** **misto** — cada casa escolhe **Stripe Connect** ou **Mercado Pago (OAuth)**; plano Pro
  (`mensalidade_automatica`); sem comissão do GiraHub. Registro em AGENTS.md §3.3/§11.10 e
  `docs/fluxo-pagamento-mensalidade.md` §7.

**Por quê.** PIX integrado na mensalidade é o gap mais repetido entre os concorrentes fortes: AxéCloud (PIX no portal
do filho), ORI (Mercado Pago, add-on de R$ 9,90), Minha Gira (Asaas), Quartinha (banco parceiro). O nosso é baixa
manual com comprovante.

**Critérios que o código impõe**
- Webhook resolve o tenant pela cobrança, nunca pelo corpo.
- **Não há criptografia de segredo em repouso no projeto.** Isso favorece OAuth (Mercado Pago OAuth, Stripe Connect
  Standard) sobre uma API key por terreiro (Asaas), ou exige criar um utilitário de criptografia antes.
- Assinatura do webhook verificável.
- Sem mensalidade fixa para nós; o dinheiro cai direto na conta do terreiro.
- KYC: muitos terreiros não têm CNPJ.

**Aceite**
- [ ] Tabela comparativa Asaas × Mercado Pago × Stripe Connect com as taxas atuais verificadas
- [ ] Decisão registrada no AGENTS.md

### F-02 — PIX na mensalidade com baixa automática
- **Ranking:** 30 · **Prioridade:** P1 · **Onda:** 4 · **Esforço:** G · **Tipo:** dev · **Módulo:** Financeiro · **Épico:** Funcionalidade
- **Depende de:** F-01, I-02 · **Destrava:** F-04 (mensalidade no portal)
- **Status (2026-10-09):** PR 1 — base comum (`core/secret_box.py`, `mensalidade_gateways`/`mensalidade_cobrancas`,
  migração 091, `mensalidade_pagamentos.origem`, conectar/desconectar com senha + e-mail aos admins, webhook
  `/api/v1/webhooks/stripe-connect` idempotente) + **Stripe Connect** (conta Express, cobrança direta na conta da
  casa). PR 2 — Mercado Pago (OAuth). O que mudou em relação ao desenho abaixo: idempotência reaproveita
  `stripe_events_processed`; a cobrança nasce na Área (AM-22, `POST /api/v1/medium/mensalidades/{mes}/cobranca`),
  não no painel; link público, e-mail de cobrança e associados ficam para depois.
- **Status (2026-10-09, fim do dia):** **código entregue** — Stripe Connect (#114), Mercado Pago (#115) e pagamento
  parcial com vários comprovantes (#116), migrações 091/092, todos no master. Falta ação do dono (Stripe Connect na
  conta da plataforma) e o teste com uma casa piloto; credenciais do Mercado Pago configuradas em 09/10.

**Estado anterior (antes do F-02).** Mensalidade era registro manual (`B/models/mensalidades.py`, `associado_mensalidade.py`; endpoints em
`B/api/v1/admin/mensalidades.py`, gates `mensalidade_mediun`/`mensalidade_associado` (Premium), grupo FINANCEIRO). O
espelho em contas a receber é `B/services/mensalidade_contas_service.py` (`external_ref =
"mensalidade:{tipo}:{pessoa_id}:{YYYY-MM}"`).

**Modelo (migração).** `tenant_gateway_accounts` (provider, account_id, credencial/OAuth, status do KYC),
`mensalidade_cobrancas` (tipo_pessoa, pessoa_id, mes_referencia, provider_charge_id único, txid, QR/copia-e-cola,
status, expira_em) e `gateway_events_processed` (provider, event_id único), ou generalizar `stripe_events_processed`
com a coluna provider.

**Implementação**
- `B/services/gateway/<provider>_client.py` (httpx).
- Webhook `POST /api/v1/webhooks/<gateway>`:
  - entra em `public_paths` do `B/middleware/jwt_middleware.py`;
  - idempotência no padrão Q-04 (`webhooks.py:127-165`);
  - chama `sync_pagamento(status_mensalidade="PAGO", ...)` (ajustar o tipo de `criado_por` para nullable).
- Endpoints:
  - `POST /api/v1/admin/financeiro/gateway/connect` e `GET .../gateway/status` (CONFIGURACOES ou FINANCEIRO edit);
  - `POST /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/cobranca` (FINANCEIRO insert), e o equivalente
    para associados.
- Link público com token opaco e expiração: `GET /api/v1/public/cobranca/{token}` + `F/pages/public/cobranca/[token].tsx`
  (QR com `qrcode.react`).
- E-mail `mensalidade_cobranca.py` via `email_queue`.
- UI em `F/components/financeiro/CobrancaMensal.tsx` e `F/pages/admin/financeiro/mensalidades.tsx`.

**Testes.** `integration_pg/test_stripe_webhook.py` como modelo (entrega duplicada simultânea),
`test_mensalidade_api.py`, `integration_pg/test_jornadas_casa_financeiro.py`.

**Riscos.** O auditor de isolamento vai acusar as queries do webhook (justificar em `EXEMPT_*` ou filtrar pelo tenant
da cobrança). O link público expõe nome e valor. KYC demorado.

**Aceite**
- [ ] Terreiro conecta a própria conta do gateway
- [ ] Cobrança PIX gerada por mensalidade, com link público e e-mail
- [ ] Pagamento dá baixa sozinho e aparece em contas a receber
- [ ] Webhook idempotente sob entrega duplicada (teste com Postgres real)

### C-02 — Páginas por recurso
- **Ranking:** 31 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev + conteúdo · **Módulo:** Site & SEO · **Épico:** Crescimento
- **Depende de:** T-01, T-03, V-05 (capturas) · **Destrava:** —

**Por quê.** O AxéCloud tem uma página por recurso (`/recursos/*`). Isso traz busca orgânica por "senha para gira",
"sistema para terreiro" etc. Nós somos SSR (Next), o que é vantagem sobre os SPAs (ORI, Meu Axé, Quartinha, Tupam).

**Implementação.** `F/pages/recursos/[slug].tsx` (SSG) alimentado por uma constante tipada (como `plans.ts`), usando o
`MarketingShell`. Páginas:
- `senha-pelo-whatsapp`
- `porta-e-modo-tv`
- `fila-de-espera`
- `horario-marcado`
- `site-do-terreiro`
- `financeiro-e-mensalidades`
- `cursos`
- `estoque`

Cada uma com captura, benefícios, FAQ curto e CTA. Entram no sitemap (T-03) e em `RESERVED_SEGMENTS`/`RESERVED_SLUGS`
(T-01).

**Aceite**
- [ ] 8 páginas publicadas, com title/description/OG próprios
- [ ] Linkadas da landing e no sitemap

### C-01 — Blog / hub de conteúdo
- **Ranking:** 32 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev + conteúdo · **Módulo:** Site & SEO · **Épico:** Crescimento
- **Depende de:** T-01, T-03 · **Destrava:** —

**Implementação**
- `F/pages/blog/index.tsx` e `F/pages/blog/[slug].tsx` com `getStaticProps`/`getStaticPaths`.
- Conteúdo em `frontend/content/blog/*.mdx` (`next-mdx-remote` ou `@next/mdx`; dependência nova e grátis).
- Conferir que o conteúdo entra no build `output: 'standalone'`.

**5 artigos iniciais**
- Como organizar a fila da gira
- Senha pelo WhatsApp: passo a passo
- Como cobrar mensalidade sem constranger
- LGPD no terreiro: o que muda
- Como montar o site do terreiro

**Aceite**
- [ ] Blog publicado com 5 artigos
- [ ] Sitemap e OpenGraph por artigo

### C-03 — Glossário do axé
- **Ranking:** 33 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** P · **Tipo:** conteúdo · **Módulo:** Site & SEO · **Épico:** Crescimento
- **Depende de:** T-01 · **Destrava:** —

20 a 30 termos (gira, corrente, cambone, consulente, zeladoria, camarinha, amaci, ogã, ekedi…), em linguagem
respeitosa e revisados por alguém da religião. Cada termo linka para os recursos relacionados. Página
`F/pages/glossario.tsx`. O AxéCloud usa o glossário como isca de SEO.

**Aceite**
- [ ] Termos escritos e revisados por um dirigente
- [ ] Página publicada e no sitemap

### C-04 — Página "GiraHub × caderno e planilha"
- **Ranking:** 34 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** P · **Tipo:** conteúdo · **Módulo:** Site & SEO · **Épico:** Crescimento
- **Depende de:** T-01 · **Destrava:** —

Comparativo honesto com o jeito atual (papelzinho, caderno, planilha, grupo de WhatsApp), no modelo do "vs planilhas"
do AxéCloud. Não citar concorrentes pelo nome. Página `F/pages/girahub-vs-planilha.tsx`.

**Aceite**
- [ ] Página publicada, linkada da landing e no sitemap

### C-08 — Tutoriais em vídeo curtos
- **Ranking:** 35 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** conteúdo · **Módulo:** Landing & Marketing · **Épico:** Crescimento
- **Depende de:** — · **Destrava:** —

Três vídeos de até 60 s: criar a primeira gira, chamar pela Porta e ligar o Modo TV. Hospedar no YouTube (o
`frame-src` do CSP já permite) ou no próprio domínio. Embutir na landing, no tour (`F/tours/`) e no checklist da
primeira gira. O Tupam promete tutoriais e mostra "em breve"; nós entregamos.

**Aceite**
- [ ] 3 vídeos gravados com dados fictícios
- [ ] Embutidos na landing e no onboarding

### T-02 — Token de acesso tipado (allowlist no decode)
- **Ranking:** 36 · **Prioridade:** P0 · **Onda:** 4 · **Esforço:** P · **Tipo:** dev · **Módulo:** Conta & Segurança · **Épico:** Fundação
- **Depende de:** — · **Destrava:** AM-03, AM-05 (Área do Médium), F-10

> 2026-10-07: subiu de P2 para P0. É dependência dura da Área do Médium e, sem tela, corre junto com o estudo
> de experiência (AM-00). Ver `docs/plano-area-do-medium.md` §11.

- **Status (2026-10-09):** feito — access token com `type: "access"` e `decode_token` em allowlist no PR #69; a
  janela de compatibilidade para tokens antigos sem `type` acabou e o ramo legado saiu no PR #119.

**Por quê.** O access token não tem `type`. O `decode_token` (`B/security/jwt.py:170`) só rejeita `type=="refresh"`,
ou seja, funciona como lista de bloqueio. O F-10 (token `mfa_pending`) e o F-04 (token de convite) criariam tokens que
passariam como acesso.

**Implementação**
- Emitir `type: "access"` nos access tokens (login, refresh, impersonação, reativação, cadastro).
- `decode_token` passa a aceitar só `type == "access"`, com uma janela de compatibilidade para tokens antigos sem
  `type`, até o maior TTL de access.

**Testes.** `test_security_jwt.py`, `test_security_jwt_compat_jose.py`, `test_middleware_jwt.py`; impersonação e
refresh intactos.

**Aceite**
- [x] Todo access token emitido com `type: "access"`
- [x] `decode_token` em modo allowlist (depois da janela de compatibilidade)
- [x] Testes cobrindo refresh, impersonação e um token de tipo desconhecido

> 2026-10-09: janela de compatibilidade encerrada (corte 08/10 + 24h de TTL); `LEGACY_UNTYPED_ACCESS_CUTOFF`
> e o ramo legado saíram do código — token sem `type` é recusado.

### F-03 — WhatsApp automático
- **Ranking:** 37 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** G · **Tipo:** dev · **Módulo:** Comunicação · **Épico:** Funcionalidade
- **Depende de:** P-02 · **Destrava:** —

**Escopo depois da decisão.** Senha enviada por WhatsApp, lembrete da gira e aviso de cobrança.

**Implementação (se for a Cloud API)**
- `B/services/whatsapp/cloud_api.py`.
- Webhook `POST /api/v1/webhooks/whatsapp` em `public_paths`, com verificação `X-Hub-Signature-256` e idempotência
  por `message_id`.
- Fila no padrão do `email_queue`.
- Lembrete da gira: agendador com a próxima chave livre do `scheduler_guard` e marca por linha.
- Opt-in do consulente: coluna `whatsapp_opt_in` (+ data).
- Add-on de plano: hoje tudo é por tier em `plan_features.py`, então add-on exige uma dimensão nova (decidir no P-02).

**Meio-termo (se for wa.me).** Botão "receber no WhatsApp" em `F/pages/public/gira/[id].tsx` e no bilhete
(`F/pages/public/[tenant]/ticket/[ticketId].tsx`). Esforço P.

**Aceite**
- [ ] Fluxo decidido no P-02 implementado
- [ ] Opt-in registrado (LGPD)
- [ ] Custo por terreiro visível no painel, se for add-on

### F-04 — Portal do médium
- **Ranking:** 38 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** G · **Tipo:** dev · **Módulo:** Médiuns & Corrente · **Épico:** Funcionalidade
- **Depende de:** T-01, T-02 · **Destrava:** link "Recebi um convite" na landing
- **Status (2026-10-09):** **substituído** pela Área do Médium (AM-02 a AM-13, no ar em piloto); ver
  `docs/plano-area-do-medium.md` §5 e §11.0. O texto abaixo fica como histórico.

**Por quê.** AxéCloud (portal do filho de santo), Kanzuá ("App dos Médiuns") e ORI ("entrar como membro") têm. **A
"área do associado" não existe de fato**: `F/pages/public/[tenant]/associado.tsx` só redireciona para a emissão de
senha. É preciso criar uma área autenticada.

**Modelo (migração)**
- `ALTER TYPE user_role ADD VALUE 'medium'`.
- `mediuns.user_id` (FK nullable, único parcial).
- `medium_invites` (token_hash, expira em).
- Tabela `avisos` (mural; hoje só existe `Gira.recados`).

**Implementação**
- `UserRole.MEDIUM` abaixo de OPERATOR em `_ROLE_HIERARCHY` (`B/api/dependencies.py:95`). O `PermissionService` nunca
  libera MEDIUM.
- **Toda rota admin que usa só `get_current_user` precisa barrar MEDIUM**: `dashboard_summary.py`, `support_chat.py
  /me`, `subscription_info.py`, `config.py /tenant/branding`, `permission_groups.py /me/permissions`.
- `_ensure_user_limit` (`B/api/v1/admin/users.py:75`) não conta médiuns no `max_users`.
- Convite:
  - reaproveitar o fluxo de reset de senha (`login.py:421-493`: `token_urlsafe` + sha256 + expiração);
  - `POST /api/v1/admin/mediuns/{id}/convite` (MEDIUNS edit + `require_plan_feature`; sugestão de feature nova
    `portal_medium`, PRO);
  - `POST /api/v1/auth/accept-invite` (público, com rate limit);
  - template `medium_invite.py`.
- Portal: `B/api/v1/medium/portal.py` com `require_medium` (resolve o médium por user_id + tenant), servindo
  `GET /api/v1/medium/me`, `/agenda`, `/mensalidades` e `/avisos`.
- Front:
  - `F/pages/medium/{index,agenda,mensalidades,ficha}.tsx` e `F/pages/convite/[token].tsx`;
  - `F/services/authSession.ts:25` redireciona MEDIUM para `/medium`;
  - `admin_layout.tsx:105` barra MEDIUM;
  - botão "Convidar" em `F/pages/admin/mediuns.tsx`;
  - "Recebi um convite" no login e na landing.

**Riscos**
- Escalada de privilégio pelas rotas sem grupo.
- E-mail único por tenant: médium que já é operador.
- Login pega o usuário "mais antigo" com o e-mail.
- Decidir se a impersonação de médium é permitida.

**Testes.** `test_auth_login.py`, `test_dependencies.py`, `integration_pg/test_rbac_http.py`,
`test_tenant_isolation.py`, `test_route_shadowing.py`.

**Aceite**
- [ ] Convite por e-mail e aceite com criação de senha
- [ ] Médium vê só os próprios dados: agenda, avisos, mensalidades
- [ ] Médium recebe 403 em **todas** as rotas admin (teste varrendo o router)
- [ ] Médium fora do limite de usuários do plano

### F-05 — Ficha espiritual do médium
- **Ranking:** 39 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev · **Módulo:** Médiuns & Corrente · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** F-04 (aba ficha), AM-19
- **Status (2026-10-08):** **implementado** junto com o AM-19 (PR "ficha espiritual com consentimento e caminhada",
  migrações 088/089). Decisões: plano `ficha_espiritual` no **Pro** (vendido no quadro); feature `FICHA_ESPIRITUAL`
  fora do grupo padrão (sem migração de acesso; `ensure_default_group` pula); retirar o consentimento deixa os dados
  inacessíveis e avisa a direção para apagar ("Apagar dados"); auditoria só com ids/contagens. Detalhes em
  AGENTS.md §3.3/§11.23, `docs/api.md` §20 e `docs/database.md`.

**Por quê.** Todos os concorrentes de gestão têm algo assim:
- AxéCloud: caminhada mediúnica, camarinha, orixá de cabeça;
- ORI: linhas, guias, orixás, jornada;
- Meu Axé: ficha Umbanda × Candomblé;
- Minha Gira: obrigações e iniciações.

O nosso `Medium` tem só dados civis.

**Modelo**
- `ficha_campos` (tenant, chave, rótulo, tipo, tradição, ordem): campos configuráveis.
- `ficha_valores` (tenant, médium, campo, valor).
- `medium_marcos` (obrigações, batismo, coroação, com data): linha do tempo.
- Consentimento: `mediuns.consentimento_dado_religioso_em`, `_por` e versão do texto.

**Permissão.** Feature nova `FICHA_ESPIRITUAL`, separada de MEDIUNS (LGPD art. 11). **Decisão consciente: não dar a
feature por padrão ao grupo "Acesso total"**, ao contrário do padrão da 057. Plano: `mediuns` (BASIC) ou feature nova
`ficha_espiritual` (PRO).

**Implementação**
- `GET/PUT /api/v1/admin/mediuns/{id}/ficha` e `/marcos`, mais `/admin/mediuns/ficha-campos`.
- O PATCH e as respostas de `B/api/v1/admin/mediuns.py` não podem vazar campos sensíveis a quem não tem a permissão.
- Aba "Ficha" + linha do tempo em `F/pages/admin/mediuns.tsx`.
- `F/pages/privacidade.tsx` cita o dado religioso.
- Precedente de consentimento: cursos (`aceita_uso_dados_saude`, `B/api/v1/public/curso_inscricao.py:257-275`), onde
  o consentimento "nunca é inferido".

**Riscos.** Exportação e auditoria (`audit_logging`) não podem registrar o valor sensível. Admin e impersonação passam
por cima dos grupos (`permission_service.py:85`): documentar.

**Aceite**
- [x] Campos configuráveis por tradição, com um modelo inicial para Umbanda e outro para Candomblé
- [x] Consentimento explícito registrado antes de gravar
- [x] Visível só com FICHA_ESPIRITUAL; ausente de exportações e logs
- [x] Linha do tempo da caminhada do médium

### F-06 — Presença dos médiuns na gira
- **Ranking:** 40 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev · **Módulo:** Médiuns & Corrente · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** —
- **Status (2026-10-09):** **substituído** pelo AM-17 (presença) e pelo AM-26 (assiduidade) da Área do Médium;
  ver `docs/plano-area-do-medium.md` §5. O texto abaixo fica como histórico.

**Por quê.** AxéCloud (frequência e check-in), Minha Gira (presença nas giras) e Meu Axé (presença com relatório de
ausentes). Hoje não existe.

**Implementação**
- Tabela `gira_presencas` (tenant, gira, médium, status presente/falta/justificada, registrado_por), com unicidade em
  gira + médium.
- `GET/PUT /api/v1/admin/giras/{gira_id}/presencas` (GIRAS edit).
- `GET /api/v1/admin/mediuns/assiduidade?inicio&fim` (MEDIUNS view). Plano `mediuns` (BASIC).
- Lista de chamada num componente próprio (o `giras.tsx` já tem 1.660 linhas); relatório com `useRelatorioPDF`.
- Validar que médium e gira são do mesmo tenant (`EXEMPT_BODY_FKS`/`test_fk_cross_tenant.py`).

**Aceite**
- [ ] Lista de chamada por gira
- [ ] Relatório de assiduidade por médium e período, com PDF
- [ ] Teste de FK entre tenants

### F-09 — Importar médiuns por planilha
- **Ranking:** 41 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev · **Módulo:** Médiuns & Corrente · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** item "migrar da planilha" do FAQ

**Implementação**
- `POST /api/v1/admin/mediuns/import/preview` (dry-run, no estilo de `validate_bulk.py`) e `POST .../import`, com
  MEDIUNS insert + `require_plan_feature("mediuns")`.
- Respeitar `_checar_limite_mediuns` (`mediuns.py:44`) antes de gravar.
- Deduplicar por e-mail normalizado ou telefone, no padrão das migrações 058/052.
- **Repetir o efeito colateral da criação unitária**: `criar_conta_proxima_mensalidade`
  (`mensalidade_contas_service.py:206`).
- Gravar tudo numa transação única.
- CSV pela stdlib (`csv`, já usada em `exports.py`). XLSX exige `openpyxl` (dependência nova).
- Modelo para baixar em `frontend/public/modelos/mediuns.csv`; `ImportMediunsDialog.tsx`.

**Riscos.** CSV injection na exportação; tamanho do upload.

**Aceite**
- [ ] Modelo CSV para baixar
- [ ] Prévia com erros e duplicados por linha, antes de gravar
- [ ] Limite do plano respeitado; mensalidade criada como no cadastro manual

### F-07 — Escalas de zeladoria
- **Ranking:** 42 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev · **Módulo:** Médiuns & Corrente · **Épico:** Funcionalidade
- **Depende de:** — · **Destrava:** —
- **Status (2026-10-09):** **substituído** pelo AM-25 (faxina), AM-18 (escala de gira) e AM-15 (lembretes) da
  Área do Médium; ver `docs/plano-area-do-medium.md` §5. O texto abaixo fica como histórico.

**Por quê.** É o destaque da Minha Gira ("É a vez de quem limpar o terreiro?"): limpeza, cozinha e portaria por gira.

**Implementação**
- `escala_tipos` (tenant, nome, ativo) e `escala_alocacoes` (tenant, gira, tipo, médium, `notificado_em`).
- `B/api/v1/admin/escalas.py`: CRUD de tipos, alocação por gira e `POST .../escalas/gerar` (rodízio: função pura em
  ordem circular sobre os médiuns ativos). Grupo GIRAS; plano `mediuns` ou feature nova `escalas` (PRO).
- `B/services/escala_scheduler.py` no padrão do `birthday_scheduler.py`, com `advisory_lock` e **marca por linha**
  (`UPDATE ... WHERE notificado_em IS NULL RETURNING`), registrado no lifespan de `B/main.py`.
- Template `escala_aviso.py`.

**Aceite**
- [ ] Tipos de escala configuráveis e rodízio automático
- [ ] E-mail na véspera, sem duplicar com 2 workers (teste)
- [ ] Escala visível na gira

### F-10 — Login em 2 fatores (TOTP) para admins
- **Ranking:** 43 · **Prioridade:** P2 · **Onda:** 4 · **Esforço:** M · **Tipo:** dev · **Módulo:** Conta & Segurança · **Épico:** Funcionalidade
- **Depende de:** T-02 · **Destrava:** —

**Por quê.** O ORI tem MFA. Num sistema com dado de consulente e financeiro, 2FA para quem administra é argumento de
segurança na venda.

**Implementação**
- Colunas `users.totp_secret_enc`, `totp_enabled_at`, `totp_backup_codes_hash` e `tenant_configs.require_2fa`.
- `B/api/v1/auth/login.py`: com 2FA ativo, devolve `mfa_required` + um token `type: "mfa_pending"` de curta duração
  em vez de chamar `issue_session`.
- Endpoints `POST /auth/mfa/{setup,enable,verify,disable}`, com rate limit (`B/core/limiter.py`); `/auth/mfa/verify`
  entra em `public_paths`.
- TOTP via `pyotp` ou RFC 6238 com o hmac da stdlib.
- **Criptografia do segredo em repouso não existe no projeto**: derivar de `SECRET_KEY` ou adicionar `cryptography`.
- Códigos de backup guardados como hash.
- Front: passo do código no `login.tsx`, ativação em `profile.tsx` (admin e platform), obrigatoriedade em `config.tsx`.
  QR com `qrcode.react`.
- **Impersonação (`B/api/v1/platform/impersonate.py`) cria token sem 2FA**: exigir TOTP do super admin antes de
  impersonar.
- Reativação (`deactivation.py`) e cadastro também chamam `issue_session`; cobrir esses caminhos.

**Aceite**
- [ ] Ativar e desativar o 2FA com QR e códigos de backup
- [ ] Login exige o código quando ativo; obrigatoriedade por terreiro
- [ ] Super admin precisa de 2FA para impersonar
- [ ] Segredo cifrado em repouso

---

## Onda 5 — Crescimento

### C-05 — Diretório público de terreiros
- **Ranking:** 44 · **Prioridade:** P3 · **Onda:** 5 · **Esforço:** G · **Tipo:** dev · **Módulo:** Site & SEO · **Épico:** Crescimento
- **Depende de:** T-01, T-03 · **Destrava:** —

**Por quê.** O AxéCloud tem um mapa público de terreiros com "reivindique seu perfil": traz consulentes e vira um
canal de aquisição. Nós já temos site e agenda por terreiro; falta a vitrine que junta todos.

**Estado.** O tenant não tem cidade nem UF estruturados (só `TenantConfig.endereco`, em texto livre, e
`config.city`/`state` da seção LOCATION do site, em JSONB).

**Implementação**
- Colunas `cidade`, `uf`, `diretorio_opt_in`, `diretorio_consentimento_em` e `_por` (em tenants ou tenant_configs),
  editáveis em `F/pages/admin/config.tsx`; pré-preencher a partir da seção LOCATION.
- `B/api/v1/public/diretorio.py`:
  - `GET /api/v1/public/diretorio/ufs`, `/{uf}` e `/{uf}/{cidade}`;
  - filtros: ativo, sem soft delete, sem auto-desativação, com opt-in e (site PUBLISHED **ou** giras futuras);
  - campos expostos: só nome, slug, cidade e logo.
- `F/pages/terreiros/[uf].tsx` e `[uf]/[cidade].tsx` com SSR, no padrão de `[tenantSlug]/index.tsx`; entram no
  sitemap.
- Isenção em `EXEMPT_PUBLIC_QUERIES` ("listagem pública intencional, só opt-in").

**Riscos**
- **Nunca expor endereço exato**: local de culto exposto a intolerância religiosa. Só cidade.
- Tenant sem opt-in, suspenso ou desativado aparecendo (teste obrigatório).
- Normalizar a cidade (acentos, slug).

**Aceite**
- [ ] Opt-in com consentimento registrado do responsável
- [ ] Páginas por UF e cidade indexáveis, linkando para o site/agenda de cada terreiro
- [ ] Testes de isolamento: sem opt-in, inativo e suspenso não aparecem

### N-07 — Fila em tempo real
- **Ranking:** 45 · **Prioridade:** P3 · **Onda:** 5 · **Esforço:** M · **Tipo:** dev · **Módulo:** Senhas & Porta · **Épico:** Núcleo
- **Depende de:** — · **Destrava:** —

**Por quê.** Hoje a Porta (`porta.tsx`, stats + fila) e o kiosk fazem polling a cada 8 s. Na prática funciona;
tempo real é refinamento.

**Implementação**
- `B/services/realtime.py`: `publish(tenant_id, gira_id)` no Redis pub/sub `senhas:gira:{tenant}:{gira}`, com payload
  mínimo; o cliente refaz o GET REST, o que preserva permissões e privacidade. Padrão `redis.asyncio` com fallback de
  `error_alert_service.py`.
- Publicar depois de cada commit:
  - `door_control.py`: walk-in, check-in, attend, no-show, undo;
  - `emit_ticket.py` (l.757), `cancel_ticket.py`, `waitlist_confirm.py`, `tickets_list.py`, `tickets_bulk.py`.
- `GET /api/v1/admin/giras/{gira_id}/door/events` (SSE) com `require_any_group_permission(PORTA, RELATORIO_GIRA)`.
  **Autenticar numa sessão curta e não segurar a sessão do banco durante o stream** (pool de 10 + 20 por worker).
- nginx: `location` dedicada com `proxy_buffering off` e `proxy_read_timeout 3600s`, ou `X-Accel-Buffering: no` +
  heartbeat a cada 20 s.
- `F/hooks/useGiraEvents.ts`: com o stream ativo, polling de segurança a cada 30 s; em erro, volta para 8 s.
- Impersonação usa header Authorization, que o `EventSource` não envia: fica em polling.

**Riscos.** São 2 workers, então o Redis é obrigatório entre eles. Expiração do access token no meio do stream. Os 4
middlewares HTTP envolvem o stream.

**Aceite**
- [ ] Porta e kiosk atualizam em menos de 1 s depois de uma emissão
- [ ] Fallback para polling testado (Redis fora, nginx cortando)
- [ ] AGENTS.md §11.4 atualizado

### C-06 — Programa de afiliados com lojas de artigos religiosos
- **Ranking:** 46 · **Prioridade:** P3 · **Onda:** 5 · **Esforço:** M · **Tipo:** decisão + dev · **Módulo:** Planos & Assinatura · **Épico:** Crescimento
- **Depende de:** $-05 · **Destrava:** —

**Por quê.** A Quartinha tem afiliados com lojas: display A4 com QR, cupom para o terreiro e comissão recorrente para
a loja, com saque por PIX. As lojas de artigos religiosos falam com todos os terreiros da região.

**Implementação**
- Tabela `afiliados` (nome, cupom, comissão) e `tenants.afiliado_id` (ou `custom_settings`, onde já fica o
  `como_conheceu`).
- Relatório na plataforma (`B/api/v1/platform/`, `require_super_admin`).
- Display A4 em PDF com QR para `/cadastro?cupom=X`.
- Pagamento da comissão é manual, fora do Stripe.

**Status (2026-10-09).** Números aprovados pelo dono e página publicada (`NEXT_PUBLIC_PARCEIROS_PUBLICADO=true`).

**Status (2026-10-08).** Página e formulário prontos atrás da chave `NEXT_PUBLIC_PARCEIROS_PUBLICADO`
(desligada; `/parceiros` em 404); cupom manual no Stripe até o $-05. Proposta de regras na página: terreiro com 20%
de desconto nos 3 primeiros meses; parceiro com 20% de comissão por 12 meses, PIX mensal a partir de R$ 30. Pedidos
gravados em `parceiro_interesses` (migração 084) e listados em `/platform/parceiros` (status, cupom, observações),
com aviso por e-mail ao `ALERT_EMAIL`. Regras, economia por plano e decisões pendentes em `docs/programa-parceiros.md`.

**Aceite**
- [ ] Regras de comissão decididas — números aprovados em 09/10; ainda em aberto comissão sobre bruto × líquido e
  recibo/RPA para pessoa física (`docs/programa-parceiros.md`, "Decisões do dono")
- [x] Página pública com convite, regulamento e formulário de interesse + lista na plataforma (publicada em 09/10)
- [ ] Cupom por loja no cadastro/checkout ($-05), display A4 e relatório de indicações e conversões

### C-07 — Oferta para federações
- **Ranking:** 47 · **Prioridade:** P3 · **Onda:** 5 · **Esforço:** P · **Tipo:** decisão · **Módulo:** Landing & Marketing · **Épico:** Crescimento
- **Depende de:** — · **Destrava:** —

A Quartinha tem uma seção "Sua federação precisa de tecnologia?". Uma federação reúne dezenas de terreiros.

**Aceite**
- [ ] Conversa com pelo menos 1 federação para entender a necessidade
- [ ] Decidir se vale uma oferta (desconto por volume? painel agregado?) ou só uma seção na landing com contato
