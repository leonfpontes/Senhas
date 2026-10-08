# Plano da Área do Médium (outubro/2026)

Criado: 2026-10-07 · Status: **em produção em piloto** (entrega 2.3.0 completa e parte da 2.4.0 — ver §11.0) · Prefixo dos cards: **AM-**

Histórico:
- 2026-10-07 (v1): plano inicial, cards AM-01 a AM-24.
- 2026-10-07 (v2): o dono aceitou as decisões D-01 a D-08 como recomendadas (§12) e pediu **escala de faxina,
  escala de gira e presença com justificativa** em giras e atividades internas. Entrou a §8 (atividades da casa,
  escalas e presença), os cards AM-08, AM-15, AM-17, AM-18 e AM-23 foram reescritos e nasceram AM-25 a AM-28.
  F-06 e F-07 passam a ser substituídos.
- 2026-10-07 (v3): o dono pediu um **estudo de experiência e usabilidade completo antes de desenvolver** (foco em
  usabilidade, facilidade, termos conhecidos, jornada simples e celular). Nasceu o **AM-00**
  ([estudo-ux-area-do-medium.md](estudo-ux-area-do-medium.md)) e a §11 ganhou a fase 0: nenhuma tela da Área
  começa antes do estudo fechar.

Fontes internas: [benchmark-concorrentes-2026-10.md](benchmark-concorrentes-2026-10.md),
[plano-benchmark-2026-10.md](plano-benchmark-2026-10.md) (cards F-01 a F-10, T-02), AGENTS.md §3 e §11, código em
`backend/src` e `frontend/src` na `master` de 2026-10-07 (head Alembic `060_usuarios_ilimitados`; a próxima
migração é a **061**, confira `alembic heads` antes).

Caminhos abreviados: **B/** = `backend/src/`, **F/** = `frontend/src/`. Escala dos cards igual à do
plano-benchmark: esforço **P** ≤ 1 dia · **M** 2 a 4 dias · **G** 1 a 2 semanas; prioridade **P0** agora ·
**P1** próximo · **P2** depois · **P3** futuro. A "Definição de pronto" do plano-benchmark vale para todo card
com código daqui.

---

## 1. Pedido do dono

1. **Login dos médiuns**: depois do login, uma tela de desambiguação. Quem tem acesso ao painel do terreiro
   (back-office) **e** é médium escolhe entre a Área do Médium e a área administrativa. Quem tem só uma das
   áreas entra direto nela.
2. **Calendário de giras** compartilhado, com informação detalhada dos eventos.
3. **Comunicados**.
4. **"Pague sua mensalidade aqui"** com a chave PIX (recorrente) que o terreiro disponibiliza.
5. Levantar o que os concorrentes oferecem nessa área e trazer para o planejamento.
6. (v2) **Escala de faxina e escala de gira**, com presença marcada no app e justificativa em caso de ausência.
   A escala de faxina é cadastrada pelo admin com grupos por dias escolhidos do mês (ex.: G1 nos dias X e Y, G2
   nos dias Z e W, G3 no dia D). Presença e ausência valem para faxinas, giras e **atividades internas** do
   terreiro, com cadastro livre dessas atividades (rituais coletivos, rituais individuais, organização interna,
   preparação de cursos e o que mais a casa quiser criar).

---

## 2. Resumo executivo

- **O que já temos e dá para aproveitar**: cadastro de médiuns (`Medium`, com `data_entrada`, `data_nascimento`,
  `mensalidade_isento`, contato e endereço), mensalidade por médium com comprovante (`MensalidadePagamento`,
  BYTEA, 5 MB), espelho em contas a receber, giras com local/descrição/recados, agenda pública, gerador de `.ics`
  (`F/components/public/bilhete-utils.ts`), fluxo de token de reset de senha (`token_urlsafe` + sha256 +
  expiração), agendadores com `scheduler_guard`, fila de e-mail, PWA da Porta, e um precedente de "chave PIX +
  comprovante" nos cursos presenciais (`curso.chave_pix`, botão copiar, comprovante obrigatório).
- **O que não existe**: nenhuma conta de médium. `Medium` não tem vínculo com `User`. A "área do associado"
  (`F/pages/public/[tenant]/associado.tsx`) só redireciona para a emissão de senha. Não há comunicados (só
  `Gira.recados`, que vai no e-mail do consulente), não há evento interno (toda gira aparece no site e conta no
  limite de giras do plano) e não há gerador de PIX copia-e-cola.
- **Desenho proposto**: uma pessoa = um `User` por terreiro. O acesso à Área do Médium vem do **vínculo**
  `mediuns.user_id → users.id`, não do papel. Quem só é médium ganha o papel novo `medium` (sem nenhum acesso ao
  back-office). Admin ou operador que também é médium continua admin/operador e ganha a segunda área pelo
  vínculo. As áreas são calculadas no servidor a cada requisição (não vão no JWT), então desvincular vale na hora.
- **API separada**: `/api/v1/medium/*` com a dependência `require_medium`, que resolve o médium pelo usuário logado
  (tenant **e** `medium_id`). Nenhum endpoint da área recebe `medium_id` na URL ou no corpo.
- **Plano (decidido)**: feature nova `area_medium` a partir do **Basic** (o mesmo nível de `mediuns` e
  `mensalidade_mediun`); `atividades_corrente` (atividades internas e presença) também no **Basic**; `escalas`
  (faxina por grupos, escala de gira) e estudos no **Pro**. Justificativa na §6.5.
- **"PIX recorrente" sem gateway** é: chave estática do terreiro + copia-e-cola/QR gerado com valor e
  identificador do mês + lembrete mensal + instrução para o médium agendar o "Pix Agendado Recorrente" no próprio
  banco + comprovante enviado pelo médium e confirmado pelo admin. Baixa automática só com gateway (F-01/F-02).
  O Pix Automático do BC exige CNPJ com 6 meses e contrato com PSP (§7.2).
- **Atividades, escalas e presença (v2)**: uma camada única para giras e atividades internas. A gira continua na
  tabela `giras` (senhas, site, limite do plano) e ganha uma "âncora" em `atividades`; atividades internas são
  linhas próprias em `atividades`, com **tipos livres por terreiro**. Escala e presença são uma tabela só
  (`atividade_participacoes`, uma linha por médium por atividade). Grupos da corrente (G1, G2, G3) são um conceito
  só, usado em escala, público de comunicado e elegibilidade. Desenho na §8.
- **MVP** em duas entregas: **2.3.0** (Área com convite, escolha de área, calendário, comunicados e Pague aqui) e
  **2.4.0** (atividades da casa, grupos, presença com justificativa, escala de faxina, escala de gira, lembretes,
  relatório de assiduidade, perfil, multi-terreiro). Estimativa: 11 a 13 semanas de uma pessoa no total. Fase 2 e 3
  trazem PWA com push, troca de escala, check-in por QR, ficha espiritual, aniversariantes, estudos e baixa
  automática.
- **Backlog existente**: a Área do Médium **substitui o F-04** (Portal do médium), o **F-06** (Presença) e o
  **F-07** (Escalas de zeladoria); **depende** de T-02; e **consome** F-05 e F-02 nas fases 2 e 3 (tabela na §5).

---

## 3. O que os concorrentes oferecem na área do médium/membro

Pesquisa feita em **07/10/2026** nos sites públicos (texto da página e, nos SPAs, o bundle JavaScript público
servido pela landing). Nenhuma conta foi criada. Legenda: **V** = verificado na fonte citada; **I** = inferido
(indício, não confirmado); **B** = vem do benchmark de 06/10/2026, não reconferido hoje.

### 3.1 Por concorrente

**AxéCloud** (plano único R$ 69,90)
- V: "Cada membro acessa um espaço separado do painel da administração", com avisos, calendário, mensalidades,
  biblioteca "e outros conteúdos liberados pela casa" (home).
- V: o portal do filho de santo mostra "apenas o que a diretoria liberou"; entrada com "ID da casa e CPF";
  funciona no navegador ou instalado como PWA, "Não precisa App Store nem Google Play"
  (`/recursos/portal-filho-de-santo`).
- V: mensalidade: "O filho de santo paga pelo portal; a diretoria vê o crédito no painel"
  (`/recursos/financeiro-pix-mensalidades`). **Não diz** se é chave estática, QR dinâmico ou gateway.
- V: mural de avisos para tirar os comunicados do grupo de WhatsApp (`/recursos/mural-de-avisos`); a página não
  detalha segmentação nem confirmação de leitura.
- V: frequência: "Presenças, faltas e assiduidade registradas em giras e atividades da casa"
  (`/recursos/frequencia-check-in`); a página não diz se o próprio membro faz check-in.
- V: push: "Avisos importantes da casa entregues diretamente no celular" (`/recursos/notificacoes-push`).
- V (índice `/recursos`): páginas de caminhada mediúnica ("entrada, iniciações, obrigações, cargos e marcos"),
  biblioteca de estudos ("Textos, cantigas e materiais de fundamento"), obrigações e alertas, calendário
  litúrgico, desenvolvimento mediúnico (turmas e frequência), documentos da casa, camarinha "em área reservada à
  zeladoria".

**Kanzuá** (R$ 41,90 a 59,90, equipe ilimitada)
- V: "App dos Médiuns" com "Agenda da casa", "Comunicados internos", "Informações da corrente" e "Acesso simples
  pelo celular" (home).
- Não aparece na página: mensalidade, presença, escalas, ficha ou estudos para o médium.

**ORI** (R$ 24,90 a 59,90 + add-ons)
- V (bundle): link "Recebeu um convite do seu terreiro?" / "Entrar como membro", com **código de convite**
  ("Digite o código de convite que você recebeu", "Aceitar e Entrar no Templo"), papéis Proprietário,
  Administrador e Membro.
- V (bundle): pagamento por PIX ou cartão via Mercado Pago "com baixa automática e débito recorrente"; página
  pública `/pagar/:token` com aba "PIX copia e cola"; recibo por e-mail ao registrar pagamento.
- V (bundle): avisos no WhatsApp "com consentimento de cada pessoa" (lembrete antes do vencimento, aviso de
  atraso); "Jornada do médium" (guias, orixás, marcos); "histórico de frequência"; e-mail de aniversariantes
  para administradores.
- I: o "Membro" do ORI parece um papel da equipe dentro do mesmo painel ("Fui convidado por um templo para fazer
  parte da equipe"), e não um portal separado do médium.

**Minha Gira** (R$ 99,90 a 149,90 por nº de membros)
- V (home, por plano): em todos os planos, "Agenda do terreiro", "Comunicados" e "Notificações de aniversários e
  datas importantes". A partir do intermediário: "Chat do terreiro", "Controle de Presença nas giras",
  lembretes de mensalidade antes do vencimento e "Escalas de limpeza do terreiro". Só no plano mais alto:
  biblioteca da casa, cursos e "Controle de obrigações com a casa".
- V: mensalidade via Asaas, "cobranças automáticas por cartão de crédito ou Pix".
- B: é PWA; benefícios escritos como perguntas ("O que eu tenho que levar pra gira?").

**Quartinha** (preço oculto)
- V (bundle): "Histórico de Frequência" ("Presença em eventos enquanto membro da casa"), "Diário & Entidades",
  "Acompanhamento & Diário Espiritual", "Diário de Tutoria & Supervisão" (acompanhamento de desenvolvimento),
  "Mural de avisos para a comunidade" com QR code do mural, escalas de limpeza/cozinha no modelo de estatuto,
  cadastro de chave PIX com botão copiar, conexão com Asaas ("automatizar cobranças via PIX, Boleto e Cartão") e
  com o Banco Cora.
- I: existe a string "Área do Médium" no bundle, mas o contexto (área logada ou título de conteúdo) não foi
  confirmado.

**Tupam** (preço oculto)
- V (bundle): "Arrecadação via PIX" por "link compartilhado no app, acessível por médiuns e consulentes";
  "Pontos & Cânticos" por entidade/linha; "Estudos"; "Biblioteca Virtual"; "Membros & Filhos de Santo".

**Meu Axé**
- O site respondeu 403 em 07/10/2026. B: ficha espiritual separada Umbanda × Candomblé, faturas futuras geradas
  automaticamente, presença com relatório de ausentes, portal do membro.

### 3.2 Matriz da área do médium

| Recurso para o médium | AxéCloud | Kanzuá | ORI | Minha Gira | Quartinha | Tupam | GiraHub hoje | Card |
|---|---|---|---|---|---|---|---|---|
| Acesso próprio separado do painel | V | V | I (papel Membro) | B (PWA) | I | ? | não | AM-02/03/04 |
| Convite do terreiro | ? | ? | V (código) | ? | ? | ? | não | AM-03 |
| Agenda/calendário | V | V | V (agenda pública) | V | ? | ? | só agenda pública | AM-07 |
| Atividades internas com tipos | V ("atividades da casa") | ? | V (tipos de ritual) | ? | V (eventos) | ? | não | AM-08 |
| Comunicados/mural | V | V | WhatsApp | V | V | ? | não | AM-09 |
| Mensalidade pelo portal | V (PIX) | ? | V (link /pagar) | V (Asaas) | V (Asaas/Cora) | V (link PIX) | só no painel | AM-11/12/22 |
| Baixa automática | V ("vê o crédito") | ? | V | V | V | ? | não | AM-22 (F-02) |
| Lembrete de vencimento | ? | ? | V (WhatsApp) | V | ? | ? | não | AM-15 |
| Presença/frequência | V | ? | V | V | V | ? | não | AM-17, AM-26 |
| Justificativa de falta | ? | ? | ? | ? | V | ? | não | AM-17 |
| Escalas de zeladoria | ? | ? | ? | V | V (estatuto) | ? | não | AM-25 |
| Funções na gira/ritual | ? | ? | V (Funções) | ? | ? | ? | não | AM-18 |
| Troca de escala | ? | ? | ? | ? | ? | ? | não | AM-27 |
| Ficha/caminhada/obrigações | V | ? | V | V (plano alto) | V (diário) | ? | não | AM-19 (F-05) |
| Aniversários | ? | ? | V (só admin) | V | ? | ? | só admin | AM-20 |
| Biblioteca/estudos/pontos | V | ? | ? | V (plano alto) | ? | V | não | AM-21 |
| Push/PWA | V | V (celular) | ? | B | ? | ? | PWA só da Porta | AM-16 |
| Chat do terreiro | ? | ? | ? | V | ? | ? | não | fora do escopo (§9) |

"?" = não encontrado nas fontes públicas consultadas (não quer dizer que não exista).

### 3.3 Conclusões da pesquisa
1. **Agenda + comunicados + mensalidade** é o núcleo comum (AxéCloud, Kanzuá, Minha Gira). Bate com o pedido.
2. **Convite** é a porta de entrada (ORI faz por código; propomos link por e-mail/WhatsApp, que é mais simples
   para o médium).
3. **Privacidade** é argumento de venda: AxéCloud repete que o membro vê "apenas o que a diretoria liberou" e que
   cobrança fica "fora do grupo público".
4. **Presença, escalas e caminhada** aparecem nos planos mais altos (Minha Gira) ou como módulos à parte. Por
   isso escalas são degrau do Pro (D-02); presença fica no Basic, junto com a Área (§6.5).
5. Ninguém mostrou publicamente um **PIX copia-e-cola com valor gerado da chave estática**; quem tem baixa
   automática usa gateway (Asaas, Mercado Pago). O nosso "Pague aqui" sem gateway é diferencial de custo zero
   enquanto o F-02 não chega.

### 3.4 Escalas, presença e atividades internas (pesquisa da v2, 07/10/2026)
- **Minha Gira** (V, home): "Escalas de Zeladoria", "Gestão da limpeza do terreiro e atividades de zeladoria",
  "Programe alertas automáticos"; "Controle de Presença nas giras" nos planos Padrão e Avançado. A página **não**
  fala de troca de escala, justificativa de falta, confirmação pelo membro, grupos/equipes nem rodízio.
- **AxéCloud** (V, `/recursos/frequencia-check-in`): "Presenças, faltas e assiduidade registradas em giras e
  atividades da casa". Não diz se o membro faz o próprio check-in.
- **ORI** (V, bundle): cadastros configuráveis de "Tipos de Rituais" e de "Funções" ("Gerenciar funções
  espirituais e administrativas do terreiro"), serviço de presença em ritual e PDF de atendimentos por médium.
  Rituais têm "Agenda, tipos e controle de presença".
- **Quartinha** (V, bundle): presença gravada por evento e por pessoa, formulário "Confirmação de Presença",
  "Histórico de Frequência", categoria de solicitação "Faltas & Justificativas" com campo "Motivo / Justificativa";
  o modelo de estatuto prevê "escalas de limpeza, cozinha" e "faltas justificadas".
- **Ninguém** mostra publicamente: escala por **grupos em dias escolhidos do mês**, **troca/substituição** de
  escala, nem check-in do próprio médium pelo app com janela de horário. Os três são diferenciais nossos.
- Conclusão: tipos de atividade configuráveis (ORI), funções na gira (ORI), presença em giras **e** atividades
  (AxéCloud, Quartinha) e justificativa (Quartinha) já são esperados; a escala mensal por grupos com toque no
  calendário é o pedido do dono e não tem equivalente público.

---

## 4. GiraHub hoje (o que o código impõe)

| Tema | Estado em 2026-10-07 | Consequência para a Área do Médium |
|---|---|---|
| Papéis | `UserRole` = `super_admin`, `admin`, `operator` (`B/models/users.py`). Hierarquia em `_ROLE_HIERARCHY` (`B/api/dependencies.py`). | Papel novo `medium` (ALTER TYPE, enum minúsculo conforme AGENTS.md §4.4). |
| Unicidade | `UniqueConstraint(tenant_id, email)`; mesmo e-mail pode existir em terreiros diferentes. | Operador que é médium no mesmo terreiro **é o mesmo `User`**: o vínculo resolve, papel não. |
| Login | `user_by_login_email_stmt` pega a **conta mais antiga** com o e-mail (`B/api/v1/auth/login.py`). | Médium com conta em dois terreiros não consegue entrar no segundo. Card AM-05. |
| JWT | Claims `sub`, `tenant_id`, `role`, `iat`, `exp`, `impersonated_by`; access sem `type` (`B/security/jwt.py`). | Token de convite/seleção de conta exige o **T-02** (allowlist de `type`). |
| Rotas admin | `admin_router = APIRouter()` sem dependência comum (`B/api/v1/admin/__init__.py`). Algumas rotas usam só `get_current_user` (dashboard_summary, support_chat `/me`, subscription_info, branding, `/me/permissions`). | Um guard único no `admin_router` barra o papel `medium` em tudo de uma vez. |
| Grupos | `PermissionService.check_permission`: admin e impersonação passam; operador sem grupo é fail-closed. | Usuário `medium` não tem grupo, então já leva 403 nas rotas com grupo; o guard do router fecha o resto. |
| Medium | Sem `user_id`. Campos civis + `is_atendimento`, `data_entrada/saida`, `mensalidade_isento`, `observacoes`. | Migração com `mediuns.user_id` (FK nullable, único parcial). `observacoes` é campo interno, nunca exposto ao médium. |
| Mensalidade | `MensalidadePagamento` (único por médium+mês, `valor_vigente`, comprovante BYTEA 5 MB, `registrado_por`), gate `mensalidade_mediun` (**Basic**), grupo FINANCEIRO. | Médium só vê o próprio; envio de comprovante cria/atualiza o registro do mês **sem** marcar pago. |
| Giras | `nome`, `descricao`, `data_inicio/fim`, `local`, `recados` (vai no e-mail do consulente), `is_active`. Agenda pública lista toda gira ativa (`SiteRepository.list_upcoming_giras`). Giras/mês têm limite por plano (2/3/4/ilimitado). | Falta campo de orientação só para a corrente e falta atividade interna que não apareça no site nem conte no limite de giras. Não existe escala nem presença de médium. |
| PIX | Só `cursos_presenciais.chave_pix` (texto livre + copiar + comprovante obrigatório). | Reaproveitar o padrão de UI; criar gerador de BR Code. |
| Frontend | `ProfileProvider`, `SubscriptionProvider`, `PermissionsProvider` e `BirthdayProvider` montados no `_app` chamam rotas `/api/v1/admin/*` em toda página. `completeLogin` manda tudo que não é super admin para `/admin/dashboard`. | Providers precisam saber a área; `completeLogin` passa a decidir pela área. |
| Slugs | `B/core/reserved_slugs.py` já reserva `medium` e `convite` (T-01 feito). | Reservar também `escolher-area`. |
| PWA | Manifesto único com `id`/`start_url` em `/admin/porta`; SW nunca cacheia `/api/*`. | Manifesto próprio para a Área do Médium (AM-16). |
| Auditores | `audit_tenant_isolation.py` cobre `admin/`, `repositories/`, `services/`, `public/`; `audit_permission_guards.py` só `admin/`; o JS só `pages/admin`. | Estender os três para `medium/` (AM-02). |
| Banco | Postgres com limite de 8 GB; comprovantes e fotos em BYTEA. | Comprimir imagem no navegador e limitar tamanho do comprovante do médium (risco R-05). |

**Divergência corrigida neste PR (R-02):** AGENTS.md §11.10 dizia que `mensalidade_mediun` "voltou a ser
Premium"; o código (`_FEATURE_MIN_TIER`) e a matriz da §3.4 dizem **Basic**. O texto foi corrigido. O docstring de
`B/models/mensalidades.py` ("Premium feature") também está desatualizado e fica para o primeiro PR de código.

---

## 5. Reconciliação com o backlog existente

| Card | Relação | O que fazer no board |
|---|---|---|
| **F-04** Portal do médium | **Substituído** pela Área do Médium (AM-02 a AM-13). Aproveitamos do F-04: papel `medium`, `require_medium`, convite reaproveitando o fluxo de reset, bloqueio das rotas admin. Mudamos: vínculo por `user_id` em vez de "papel define tudo" (para o operador-médium), plano Basic em vez de Pro, e o item "médium fora do limite de usuários" caiu (usuários são ilimitados desde a `060`). | Arquivar F-04 com comentário apontando para os AM. |
| **T-02** Token tipado | **Dependência dura** de AM-03 e AM-05 (token de convite e de seleção de conta não podem passar como access). | Subir o T-02 no ranking, antes do AM-02. |
| **T-01** Slugs reservados | Feito. Falta só `escolher-area`. | Nada; o AM-04 acrescenta o slug. |
| **F-05** Ficha espiritual | **AM-19 depende** do F-05 (o F-05 cria campos, marcos e consentimento; o AM-19 mostra ao médium e libera edição de alguns campos). | Manter F-05; tirar "Destrava F-04" e pôr "Destrava AM-19". |
| **F-06** Presença | **Substituído (v2)** por **AM-17** (convocação, vou/não vou, justificativa, check-in e lista de chamada, para giras **e** atividades) e **AM-26** (relatório de assiduidade com PDF). A tabela `gira_presencas` do F-06 não é criada: a presença mora em `atividade_participacoes` (§8). Mantido do F-06: unicidade por atividade+médium, validação de FK entre tenants, PDF na base `lib/pdf/pdfDoc` (AM-26), componente próprio fora do `giras.tsx`. Mudou: plano `atividades_corrente` (Basic) em vez de `mediuns`, e feature de grupo `ESCALAS` em vez de GIRAS/MEDIUNS. | Arquivar F-06 apontando para AM-17 e AM-26. |
| **F-07** Escalas de zeladoria | **Substituído (v2)** por **AM-25** (escala de faxina por grupos e dias do mês), **AM-18** (escala de gira por função, com o rodízio do F-07) e **AM-15** (aviso da véspera, com o `scheduler_guard` e marca por linha que o F-07 previa). As tabelas `escala_tipos`/`escala_alocacoes` do F-07 viram `atividade_tipos`, `funcoes_corrente`, `escala_planos` e `atividade_participacoes`. Plano `escalas` (Pro), como o F-07 sugeria. | Arquivar F-07 apontando para AM-25, AM-18 e AM-15. |
| **F-09** Importar médiuns | **Sinergia**, não dependência: depois de importar, "Convidar todos com e-mail" (AM-03, convite em lote). | Manter. |
| **F-01** Gateway | **AM-22 depende**. Também decide se a chave estática continua como alternativa. | Manter; destrava F-02. |
| **F-02** PIX com baixa automática | **AM-22 depende**. O "Pague aqui" do AM-11 é a ponte até o F-02: quando o terreiro conecta o gateway, o botão passa a gerar a cobrança dinâmica e a baixa é automática. | Trocar "Destrava F-04" por "Destrava AM-22". |
| **F-03** WhatsApp automático | **Opcional** para AM-15 (canal extra de lembrete). O MVP usa e-mail e link `wa.me` sem API. | Manter. |
| **F-10** 2FA | Independente. Se entrar antes, o fluxo `mfa_pending` precisa passar pela escolha de área depois do código. | Nota no F-10. |
| **N-03** Senha por médium | Independente. Ideia de fase 3: "minhas consultas na gira" na Área do Médium. | Nada agora. |

---

## 6. Arquitetura

### 6.1 Personas
- **Médium** (inclui cambone, ogã, ekedi): quer saber quando é a próxima gira, o que levar, ler os avisos da casa
  e pagar a mensalidade sem mandar print no grupo. Usa celular, muitas vezes Android simples, e não lê e-mail com
  frequência.
- **Dirigente/admin**: quer tirar comunicado e cobrança do grupo de WhatsApp, saber quem leu e quem pagou, sem
  expor a vida de um médium para os outros.
- **Operador que também é médium** (o filho da casa que opera a Porta): precisa das duas áreas com o mesmo login.

### 6.2 Identidade e vínculo

```
users (1 por pessoa por terreiro)          mediuns
  id, tenant_id, email, role  <──────────  user_id (FK nullable, único parcial onde não nulo e não excluído)
  role: admin | operator | medium          tenant_id, nome, ...
```

Regras:
1. **Área administrativa** = `role in (admin, operator)` (super admin continua indo para `/platform`).
2. **Área do Médium** = existe `Medium` com `user_id = user.id`, `tenant_id = user.tenant_id`, não excluído e
   ativo, **e** o plano efetivo do terreiro tem `area_medium` (e a área está ligada na configuração, AM-10).
3. **Papel `medium`** só para quem não tem acesso ao back-office. Ele não passa em nenhuma rota admin.
4. **Operador/admin que é médium**: mantém o papel; ganha a Área pelo vínculo. Tirar o acesso ao painel de um
   operador-médium (tela Usuários) rebaixa para `medium` em vez de excluir a conta, para não quebrar o vínculo.
   Dar acesso ao painel para um usuário `medium` (Usuários → "Adicionar" com o mesmo e-mail) promove para
   `operator` e põe no grupo padrão, com a mesma regra anti-escalada de `users.py`.
5. **Vínculo só com prova de posse do e-mail**: o admin nunca liga uma conta a um médium diretamente; ele envia o
   convite e o vínculo nasce no aceite (AM-03). Isso evita que alguém com MEDIUNS:edit ligue a própria conta à
   ficha de outra pessoa e passe a ver a mensalidade dela.
6. **Excluir/inativar o médium** (D-08, decidido) encerra o acesso na hora (o `require_medium` falha). Se o usuário for `medium`
   puro, a conta é desativada junto; se for operador/admin, só perde a Área.
7. **Mesmo e-mail em vários terreiros**: cada terreiro tem o seu `User` (senhas independentes). O login passa a
   procurar todas as contas ativas com o e-mail e conferir a senha em cada uma (AM-05).

### 6.3 Tokens e claims
- **Nenhum claim novo de área no JWT.** As áreas são calculadas no servidor (`GET /api/v1/auth/me` e resposta do
  login devolvem `areas: {admin: bool, medium: {medium_id, nome} | null}`). Motivo: o access token vale 24 h e o
  vínculo pode mudar a qualquer momento (médium saiu da casa, convite revogado).
- Com o **T-02**, todo access passa a ter `type: "access"`. Tokens novos desta frente:
  `type: "account_select"` (seleção de conta, 5 min, AM-05). O convite **não** é JWT: é token opaco
  `token_urlsafe(32)` guardado como sha256 (mesmo padrão do reset de senha), com expiração e uso único.
- `role` continua no token (o `medium` aparece aí para o `require_backoffice` barrar sem ir ao banco, mas a
  checagem de área sempre consulta o banco).

### 6.4 Login e escolha de área
```
POST /auth/login
  ├─ e-mail com mais de uma conta cuja senha confere → {choose_account, selection_token, options[]} (AM-05)
  └─ uma conta → sessão aberta (cookies), user + areas
        ├─ super_admin                  → /platform
        ├─ só admin/operador            → /admin/dashboard
        ├─ só médium                    → /medium
        ├─ as duas, escolha lembrada    → área lembrada
        ├─ as duas, sem escolha         → /escolher-area
        └─ nenhuma (médium sem plano)   → /medium com aviso neutro "A Área do Médium não está disponível agora.
                                            Fale com a direção da casa." (sem oferta de upgrade ao médium)
```
- (D-04, decidido) "Lembrar minha escolha neste aparelho" (caixa marcada por padrão) grava `girahub:area:{userId}` no
  localStorage. Os dois cabeçalhos têm "Trocar de área" (no menu do perfil do `AdminTopbar` e no menu da Área do
  Médium), que também atualiza a escolha lembrada.
- A troca de área **não troca o token**: é a mesma sessão, só muda a rota. Logout é o mesmo (`/auth/logout`).
- `/escolher-area` mostra dois cartões grandes ("Área do Médium: agenda, avisos e mensalidade" e "Painel do
  terreiro: giras, senhas e gestão"), com o nome e a marca do terreiro.

### 6.5 Plano (decidido em 2026-10-07, D-01 e D-02)
**Feature nova `area_medium` no catálogo `PlanFeatures`, nível BASIC**, espelhada em `F/constants/plans.ts` e no
quadro da landing ("Área do Médium: agenda, avisos e mensalidade").

Por quê:
- Não existe médium no Gratuito (limite "—"), então a Área nasce no Basic de qualquer jeito.
- O gatilho de upgrade já é o **número de médiuns** (15/30/ilimitado) e de giras. A Área faz o terreiro cadastrar
  todos os médiuns, o que bate no limite e puxa o upgrade. Cobrar a Área à parte enfraquece esse gatilho.
- O mercado entrega o núcleo (agenda, avisos, mensalidade) em todos os planos (AxéCloud tudo incluso; Minha Gira
  tem agenda e comunicados até no plano de entrada). Pôr no Pro nos deixaria atrás de quem cobra R$ 41,90.
- Feature própria (e não reaproveitar `mediuns`) deixa o dono mover de plano depois sem mexer em código.

Degraus (D-02, decidido):

| Feature do catálogo | Nível | O que libera |
|---|---|---|
| `area_medium` | Basic | Login do médium, Início, calendário, comunicados, Pague aqui, perfil |
| `atividades_corrente` (nova, v2) | Basic | Tipos de atividade, atividades internas, grupos da corrente, convocação, vou/não vou com justificativa, check-in no app, lista de chamada, histórico do médium, relatório de assiduidade por médium |
| `escalas` (nova) | **Pro** | Escala de faxina por grupos e dias do mês, escala de gira por função, rodízio, copiar mês, relatório por grupo, lembrete de escala, troca de escala (fase 2) |
| `biblioteca_medium` (nova, fase 3) | **Pro** | Estudos e documentos (AM-21) |
| ficha | segue o F-05 | AM-19 |
| baixa automática | segue F-01/F-02 | AM-22 (taxa paga pelo terreiro) |

A mensalidade na Área exige também `mensalidade_mediun` (Basic) e a config de mensalidade ativa. Presença fica no
Basic (o F-06 já previa) porque é o dado que o dirigente mais pede e porque a escala é que vende o Pro: no Basic a
casa marca quem veio; no Pro ela planeja quem vem.

Status da assinatura: suspenso/vencido bloqueia a Área como qualquer feature paga (402), e a tela do médium
mostra o aviso neutro. Nada é apagado.

### 6.6 API e isolamento
- Router `B/api/v1/medium/__init__.py` com `APIRouter(prefix="/api/v1/medium", dependencies=[Depends(require_medium)])`.
- `require_medium` (em `B/api/dependencies.py`) devolve um `MediumContext(user, tenant_id, medium, token)`:
  1. `get_current_user`;
  2. `tenant_id` do usuário (nunca do corpo);
  3. `select(Medium).where(Medium.user_id == user.id, Medium.tenant_id == user.tenant_id, Medium.deleted_at.is_(None), Medium.is_active.is_(True))`;
  4. `check_plan_feature(user, db, "area_medium")` (403/402);
  5. config da Área ligada (AM-10).
- **Regra de ouro**: rotas da Área são "minhas" (`/me`, `/mensalidades`, `/comunicados`). Nunca aceitam
  `medium_id`. Recurso com id (gira, comunicado, evento) é buscado com `tenant_id == ctx.tenant_id` e, quando há
  segmentação, com a regra de público do médium.
- **Escrita sob impersonação é recusada** (403, `is_impersonated_request`): o suporte pode ver o que o médium vê,
  mas não envia comprovante, não marca leitura e não edita perfil em nome dele.
- `require_backoffice` (novo) no `admin_router` inteiro: recusa `role == medium` com 403. Fecha de uma vez as
  rotas que hoje só usam `get_current_user`. Platform já exige super admin.
- Auditores:
  - `audit_tenant_isolation.py` ganha o modo **medium** para `B/api/v1/medium/`: toda query em modelo
    multi-tenant filtra por tenant **e** toda query em modelo com coluna `mediun_id`/`medium_id` filtra pelo
    `ctx.medium.id`;
  - `audit_permission_guards.py` passa a exigir `require_medium` no router `medium/` (rotas da Área são
    isentas de grupo, como as de sistema; a exceção vai para CLAUDE.md e AGENTS.md §3.3);
  - `frontend/scripts/audit-permission-guards.js` exige que toda página em `F/pages/medium/` use o
    `MediumLayout` (que faz o gate de área).
- Teste que varre o app: usuário `medium` recebe 403 em **toda** rota `/api/v1/admin/*` e `/api/v1/platform/*`
  (modelo: `test_route_shadowing.py` para listar as rotas).

### 6.7 Grupos de permissão (lado admin)
| Ação no painel | Feature | Ação |
|---|---|---|
| Convidar, reenviar e revogar acesso do médium | `MEDIUNS` | `edit` |
| Publicar, editar, arquivar comunicado | **`COMUNICADOS`** (nova) | `insert`/`edit`/`delete`; ver leituras = `view` |
| Tipos de atividade, funções, atividades internas | **`ESCALAS`** (nova, rótulo "Atividades e escalas") | `view`/`insert`/`edit`/`delete` |
| Planejar e publicar escala de faxina e escala de gira | `ESCALAS` | `insert`/`edit` |
| Lista de chamada (marcar presente/ausente, encerrar chamada) | `ESCALAS` `edit`; na gira também `PORTA` `edit` (`require_any_group_permission`) | `edit` |
| Ver confirmações, justificativas e relatórios de assiduidade | `ESCALAS` | `view` |
| Grupos da corrente (criar, pôr e tirar médiuns) | `MEDIUNS` | `edit` (ler: `MEDIUNS` ou `ESCALAS` `view`) |
| Configuração da Área (boas-vindas, WhatsApp da casa, módulos) | `CONFIGURACOES` | `edit` |
| Chave PIX da mensalidade | `FINANCEIRO` | `edit` + senha + aviso aos admins (§7.3) |
| Confirmar/recusar comprovante enviado | `FINANCEIRO` | `insert` (confirmar, igual a registrar) / `edit` (recusar) |

`COMUNICADOS` e `ESCALAS` seguem o roteiro do CLAUDE.md: valor no enum, migração `ALTER TYPE permission_feature
ADD VALUE`, segunda migração dando acesso total no grupo padrão "Acesso total", entrada em `permissionFeatures.ts`
(grupo "Corrente").

Por que `ESCALAS` e não reaproveitar `MEDIUNS` ou `GIRAS`: quem organiza a corrente (capitão de corrente, pai
pequeno, o porteiro que faz a chamada) não deveria precisar de `MEDIUNS:edit`, que dá acesso a telefone, endereço e
nascimento de todo mundo e a criar/excluir médium; nem de `GIRAS`, que mexe em senhas e no site. A chamada da gira
aceita também `PORTA:edit` porque quem está na porta no dia é quem vê quem chegou. Grupos ficam em `MEDIUNS` porque
compor grupo é mexer no cadastro da corrente, e servem a comunicados e escalas ao mesmo tempo.

### 6.8 LGPD
- Ser médium de um terreiro revela **convicção religiosa** (dado sensível, LGPD art. 11). Vale para o cadastro
  todo, não só para a ficha espiritual. O terreiro é o controlador; o GiraHub é operador.
- **Consentimento no aceite do convite**: texto curto e versionado ("Ao ativar, você autoriza o terreiro X a
  usar seus dados para…"), gravado em `mediuns.area_consentimento_em` + `area_consentimento_versao`. Sem aceite,
  não há conta. Modelo: consentimento de saúde dos cursos ("nunca é inferido").
- **O médium não vê dados de outros médiuns no MVP (D-07).** Nada de lista da corrente, telefone, mensalidade,
  presença ou justificativa alheia. Ele vê o nome do próprio grupo ("Você está no G2"), não quem mais está nele.
  Aniversariantes e "quem divide a escala comigo" só na fase 2, com opt-in de cada um (AM-20, AM-27).
- **Justificativa de falta** pode conter dado de saúde: campo livre de até 500 caracteres com o aviso "não precisa
  detalhar motivo de saúde"; visível só para quem tem `ESCALAS:view`; fora de e-mail, push, auditoria e
  exportação (o relatório mostra só se há justificativa).
- **Ritual individual** (obrigação, amaci de uma pessoa) tem visibilidade "só convocados" por padrão: não aparece no
  calendário de quem não está nele.
- **Convite discreto**: assunto e texto do e-mail/WhatsApp sem termos religiosos além do nome que o terreiro
  escolheu ("Convite de <terreiro> para acessar sua área no GiraHub").
- Campos internos (`observacoes`, comprovantes de outros, `registrado_por`) nunca saem pela API da Área.
- Auditoria registra ações do médium (enviou comprovante, alterou contato) sem gravar o conteúdo sensível.
- "Meus dados" (exportar, revogar consentimento) na fase 2 (AM-14). Política de privacidade (`F/pages/privacidade.tsx`)
  atualizada já no MVP.

### 6.9 Impersonação e suporte
- (D-06, decidido) Super admin pode impersonar um usuário `medium` (mesma ferramenta, banner amarelo); a Área abre em modo leitura
  (escritas 403, §6.6; inclui vou/não vou, justificativa e check-in). Impersonando um operador-médium, a escolha de área aparece normalmente.
- O **chat de suporte** (`support_chat`) é o canal do terreiro com a plataforma e **não aparece** para o papel
  `medium` (o guard do router já recusa). O médium fala com a casa: botão "Falar com a casa" (WhatsApp da casa
  configurado no AM-10) e e-mail de resposta do terreiro.
- `get_tenant_primary_contact` (`trial_scheduler.py`) cai para "qualquer usuário" quando não acha admin: excluir
  `role = medium` desse fallback (senão um médium pode receber e-mail de cobrança da plataforma).

### 6.10 Frontend
- Rotas (nomes da v3, D-16 e D-26): `/escolher-area`, `/convite/[token]`, `/medium` (início), `/medium/agenda`,
  `/medium/agenda/[tipo]/[id]`, `/medium/avisos`, `/medium/avisos/[id]`, `/medium/mensalidade`,
  `/medium/perfil`, `/medium/presencas` (minhas escalas e meu histórico, v2, aberto pelo Perfil); fases seguintes: `/medium/estudos`,
  `/medium/meus-dados`. Admin (v2): `/admin/atividades` (calendário da casa com giras e atividades, abas Atividades ·
  Escala de faxina · Tipos e funções · Relatórios), `/admin/atividades/[id]/chamada`, `/admin/mediuns/grupos`.
- `F/components/medium/MediumLayout.tsx`: celular primeiro, cabeçalho com logo e cor do terreiro (`applyBrand`),
  barra inferior com Início · Agenda · Avisos · Mensalidade · Perfil (D-27) (mesma regra de z-index da
  `MobileTabBar`), menu com "Trocar de área" (só se tiver as duas) e "Sair". Gate: sem área de médium →
  redireciona para a área certa.
- Kit existente: `PageHeader`, `EmptyState`, `KpiCard`, `CrudDrawer` (perfil), `DataTable` com `renderCard`,
  `fields/*`, `ConfirmDialog`, `useSnackbar`, `qrcode.react`, `lib/dateBr.ts`. Cores: `text-brand`,
  `text-X-strong` (contraste travado por teste).
- `_app.tsx`: `SubscriptionProvider`, `PermissionsProvider` e `BirthdayProvider` só buscam dados quando o perfil tem
  `areas.admin` e a rota é `/admin/*`; um `MediumProvider` busca `/api/v1/medium/me` nas rotas `/medium/*`.

---

## 7. Mensalidade: "Pague sua mensalidade aqui"

### 7.1 O que dá para fazer sem gateway (MVP)
1. O terreiro cadastra **uma chave PIX** (CPF, CNPJ, e-mail, telefone ou aleatória), o nome do recebedor e a cidade
   (AM-10).
2. Na Área, o médium vê o mês: valor, vencimento, status (Em aberto, Vencida, Comprovante enviado, Paga, Isento) e
   os meses anteriores em aberto.
3. "Pagar com PIX" mostra:
   - **PIX copia e cola** gerado no servidor a partir da chave, no padrão BR Code (EMV) do BC: chave, valor do mês
     (`valor_vigente` se já houver registro, senão `valor_mensal` da config), nome e cidade do recebedor,
     **txid** de até 25 caracteres que identifica médium e mês (ex.: `GH` + 10 caracteres do id do médium +
     `AAAAMM`), CRC16;
   - o **QR code** do mesmo texto (`qrcode.react`, local);
   - a **chave** com botão copiar (para quem prefere digitar).
4. "Já paguei, enviar comprovante": foto ou PDF, comprimido no navegador. O status vira "Comprovante enviado".
5. O admin vê a fila "Comprovantes para conferir" em Mensalidades e **confirma** (vira Paga, com espelho em contas
   a receber, como hoje) ou **recusa** com motivo (o médium vê o motivo).

O médium **nunca** marca como pago. Quem confirma é sempre o terreiro.

### 7.2 O que "PIX recorrente" pode significar
| Opção | Como funciona | Precisa de | Baixa automática | Quando |
|---|---|---|---|---|
| Chave estática + lembrete | Mesmo copia-e-cola todo mês + e-mail/push no D-3 e no vencimento | nada | não (comprovante) | MVP (AM-11/12) + AM-15 |
| **Pix Agendado Recorrente** | O médium agenda no app do próprio banco um PIX mensal de mesmo valor para a chave do terreiro. Obrigatório em todos os bancos desde 28/10/2024 e vale para recebedor pessoa física | nada do nosso lado; só instrução na tela | não (conciliação manual ou por comprovante) | MVP: texto "Agende no seu banco" com passo a passo |
| Cobrança por gateway | QR dinâmico por cobrança, webhook dá baixa | F-01 + F-02 (conta do terreiro no gateway) | sim | AM-22 |
| **Pix Automático** (BC, desde 16/06/2025) | O médium autoriza uma vez; o recebedor debita todo mês | recebedor **pessoa jurídica com CNPJ ativo há 6 meses** e contrato com PSP | sim | Fase 3, só via gateway e só para terreiro com CNPJ |

Recomendação: vender como "PIX todo mês sem taxa" (opções 1 e 2) no MVP e "PIX com baixa automática" quando o
F-02 sair. Não prometer "Pix Automático" para casa sem CNPJ.

### 7.3 Riscos da chave PIX
- **Troca maliciosa da chave** (alguém com FINANCEIRO:edit põe a própria chave). Decidido (D-05): o PUT exige a senha de quem
  altera (padrão `skipAutoLogout`, já usado em confirmações de senha), grava auditoria com chave antiga e nova
  mascaradas, manda e-mail para **todos os admins** do terreiro e mostra ao médium "Chave alterada em dd/mm" por
  30 dias. É a "proteção específica" que o CLAUDE.md pede, sem empilhar `is_admin` no guard.
- **Validação de formato** por tipo (CPF/CNPJ com dígito verificador, e-mail, telefone +55, UUID para aleatória).
- **Nome e cidade** do recebedor limitados a 25 e 15 caracteres, sem acento, como o BR Code exige; a tela avisa
  que o nome que aparece no banco do médium é o do titular da chave.
- Gerar o BR Code no servidor (função pura `B/services/pix_brcode.py`, com testes de CRC contra exemplos do
  manual do BC) evita que a chave seja montada de forma diferente em cada tela.

---

## 8. Atividades da casa, escalas e presença (v2)

### 8.1 Ideia central
Tudo o que a corrente faz junto vira uma **atividade**: gira, faxina, ritual coletivo, reunião, preparação de
curso. Cada atividade tem um **tipo** que a casa configura. Em cima de qualquer atividade, a mesma camada responde
três perguntas: **quem foi chamado** (convocação e escala), **quem disse que vai** (vou/não vou com justificativa) e
**quem veio** (check-in do médium ou chamada do admin).

- A **gira continua na tabela `giras`** (senhas, fila, site, limite do plano). Para entrar na camada, ela ganha
  uma **âncora** em `atividades` (uma linha com `gira_id`), criada na primeira vez que alguém escala, convoca ou
  marca presença. A âncora não copia data, nome nem local: lê da gira.
- **Atividades internas** são linhas próprias em `atividades` (D-03: tabela própria, fora do limite de giras, fora
  do site, da agenda pública e do sitemap).
- **Escala e presença são a mesma tabela** (`atividade_participacoes`): uma linha por médium por atividade, com a
  convocação (de onde veio: grupo, função, rodízio, manual), a resposta (vou/não vou), a justificativa e a presença.
  Não há tabela de escala separada da de presença, então não há o que sincronizar.
- **Grupos da corrente** (G1, G2, "Ogãs", "Desenvolvimento") são um conceito só, usado como escala de faxina,
  escala de gira, elegibilidade de um tipo e público de comunicado.

```
atividade_tipos ──< atividades >── giras (âncora opcional, 1:1)
      │                 │
      │                 └──< atividade_participacoes >── mediuns
      │                              │        │
corrente_grupos ──< corrente_grupo_membros   ├── funcoes_corrente
      │                                       └── corrente_grupos (origem)
      └──< escala_plano_dias >── escala_planos (mês × tipo)
```

### 8.2 Tipos de atividade (livres por terreiro)
Sugestões criadas para todo terreiro (migração de dados + `ensure_default_atividade_tipos` no cadastro e na criação
pela plataforma, como o grupo "Acesso total"). O admin renomeia, muda ícone e cor, cria novos e arquiva; "Gira" é
de sistema (pode renomear, não pode arquivar).

| Tipo sugerido | Presença | Pede vou/não vou | Justificativa obrigatória | Convocação padrão | Escala | Visibilidade padrão |
|---|---|---|---|---|---|---|
| Gira (sistema) | sim | sim | sim | todos os elegíveis | por função | corrente |
| Faxina / Zeladoria | sim | sim | sim | só escalados | grupos por dia | corrente |
| Ritual coletivo | sim | sim | sim | todos os elegíveis | nenhuma | corrente |
| Ritual individual | sim | sim | não | só escalados (manual) | nenhuma | só convocados |
| Organização interna | sim | sim | não | só escalados | nenhuma | corrente |
| Preparação de curso | não | sim | não | só escalados | nenhuma | corrente |
| Desenvolvimento | sim | sim | sim | elegíveis = grupo "Desenvolvimento" ou atendimento | nenhuma | corrente |
| Reunião | sim | sim | não | todos os elegíveis | nenhuma | corrente |

Configuração por tipo:
- nome, ícone (lista fechada de `lib/icons.ts`), cor (paleta fechada com contraste AA testado);
- **visível no site público**: só o tipo Gira, e não é editável (é a gira de verdade); nenhum outro tipo vai ao
  site;
- controla presença; pede confirmação (vou/não vou); exige justificativa para "não vou" e para ausência;
- check-in pelo médium no app (sim/não) e janela (padrão: de 60 min antes a 180 min depois do início);
- **quem pode ser escalado/convocado**: todos, só atendimento, só cambones, ou grupos escolhidos;
- convocação padrão: "todos os elegíveis" ou "só quem for escalado";
- modo de escala: nenhuma · grupos por dia do mês (planejador da faxina) · por função (escala de gira);
- horário e duração padrão; visibilidade padrão (corrente ou só convocados).

### 8.3 Modelo de dados
Todas as tabelas têm `tenant_id` (FK `tenants`, ON DELETE CASCADE), `created_at`/`updated_at`, e índice por
`tenant_id`. Enums novos seguem a convenção minúscula do AGENTS.md §4.4.

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `atividade_tipos` | `nome` (60), `natureza` (`gira` \| `atividade`), `icone`, `cor`, `controla_presenca`, `pede_confirmacao`, `exige_justificativa`, `checkin_pelo_medium`, `checkin_antes_min`, `checkin_depois_min`, `elegiveis` (`todos` \| `atendimento` \| `cambones` \| `grupos`), `convocacao_padrao` (`todos_elegiveis` \| `so_escalados`), `modo_escala` (`nenhuma` \| `grupos_por_dia` \| `funcoes`), `hora_padrao`, `duracao_min`, `visibilidade_padrao`, `is_sistema`, `ordem`, `arquivado_em` | único parcial (`tenant_id`, `lower(nome)`) onde não arquivado; único parcial (`tenant_id`) onde `natureza = 'gira'` |
| `atividade_tipo_grupos` | `tipo_id`, `grupo_id` | PK (`tipo_id`, `grupo_id`) |
| `atividades` | `tipo_id`, `gira_id` (FK `giras`, nullable), `titulo`, `inicio`, `fim`, `local`, `descricao`, `orientacoes`, `visibilidade` (`corrente` \| `convocados`), `origem` (`manual` \| `plano_escala` \| `gira`), `escala_plano_dia_id`, `cancelada_em`, `cancelamento_motivo`, `chamada_encerrada_em`, `chamada_encerrada_por`, `created_by`, `deleted_at` | único parcial (`gira_id`) onde não nulo; CHECK `gira_id IS NOT NULL OR (titulo IS NOT NULL AND inicio IS NOT NULL)`; índice (`tenant_id`, `inicio`) |
| `corrente_grupos` | `nome`, `cor`, `descricao`, `arquivado_em` | único parcial (`tenant_id`, `lower(nome)`) onde não arquivado |
| `corrente_grupo_membros` | `grupo_id`, `medium_id`, `desde` | PK (`grupo_id`, `medium_id`) |
| `funcoes_corrente` | `nome` (ex.: Cambone, Porteiro, Ogã/Atabaque, Cozinha, Limpeza pós-gira), `descricao`, `ordem`, `arquivado_em` | único parcial por nome ativo |
| `atividade_participacoes` | `atividade_id`, `medium_id`, `convocado` (bool), `origem` (`elegivel` \| `grupo` \| `funcao` \| `rodizio` \| `manual` \| `avulso`), `grupo_id`, `funcao_id`, `resposta` (`sem_resposta` \| `vou` \| `nao_vou`), `respondido_em`, `justificativa` (500), `justificativa_em`, `presenca` (`nao_registrada` \| `presente` \| `ausente`), `presenca_origem` (`checkin_medium` \| `chamada` \| `encerramento`), `presenca_registrada_em`, `presenca_registrada_por` (FK users), `dispensado_em`, `substituida_por_id` (FK própria, fase 2), `lembrete_enviado_em` | **único (`atividade_id`, `medium_id`)**; índices (`tenant_id`, `medium_id`) e (`tenant_id`, `atividade_id`) |
| `escala_planos` | `tipo_id`, `mes` (1º dia do mês), `status` (`rascunho` \| `publicado`), `publicado_em`, `publicado_por` | único (`tenant_id`, `tipo_id`, `mes`) |
| `escala_plano_dias` | `plano_id`, `data`, `grupo_id`, `hora_inicio`, `hora_fim`, `atividade_id` (preenchido ao publicar) | único (`plano_id`, `data`, `grupo_id`) |

Isolamento:
- Toda FK que chega no corpo ou no caminho (`tipo_id`, `grupo_id`, `funcao_id`, `medium_id`, `gira_id`,
  `atividade_id`) é validada no tenant antes de gravar (`_validar_*_do_tenant`, checagem 4 do auditor) e coberta
  por `test_fk_cross_tenant.py`.
- O `tenant_id` da participação é sempre o da atividade, que é o da gira âncora; o serviço confere os três.
- Rotas do médium filtram participação por `ctx.medium.id` e atividade "só convocados" por `EXISTS` da
  participação do próprio médium.
- Nenhuma rota pública lê `atividades`, `atividade_participacoes` ou grupos (teste: agenda pública e site não
  mostram atividade interna).

**Âncora da gira**: `atividade_da_gira(db, tenant_id, gira_id)` faz `INSERT ... ON CONFLICT (gira_id) DO NOTHING`
e devolve a linha, na mesma transação da operação que precisou dela. Gira excluída (soft delete) some do calendário
e dos lembretes pelo join com `giras.deleted_at IS NULL`; o histórico de presença continua.

### 8.4 Convocação: quem é esperado
- **"Todos os elegíveis"** (gira, ritual coletivo, reunião): a convocação é **virtual** até a chamada. A tela de
  confirmações lista os elegíveis ativos no dia (calculado) unidos às participações já gravadas; a linha só nasce
  quando o médium responde, faz check-in, é escalado numa função ou quando a chamada é encerrada (aí nasce para
  todos os elegíveis, para o relatório ter denominador). Assim, médium que entrou na casa depois de a atividade
  ser criada também é esperado, e não há milhares de linhas para atividades futuras.
- **"Só escalados"** (faxina, organização, ritual individual): as linhas nascem na escala (planejador da faxina,
  escala de gira, ou "Convocar" manual na atividade).
- Médium que veio sem estar convocado: a chamada tem "Adicionar quem veio" (`origem = avulso`, `convocado = false`).

### 8.5 Situação de cada médium numa atividade
Gravamos só `resposta`, `justificativa`, `presenca`, `dispensado_em` e `substituida_por_id`; a situação mostrada é
derivada:

| Situação na tela | Regra |
|---|---|
| **Convocado** | convocado, sem resposta, presença não registrada |
| **Confirmado** | resposta = vou, presença não registrada |
| **Ausência avisada** | resposta = não vou (com justificativa quando o tipo exige), antes da atividade |
| **Presente** | presença = presente (vale mesmo que tenha respondido "não vou") |
| **Ausente com justificativa** | presença = ausente e há justificativa (dada antes ou depois) |
| **Ausente sem justificativa** | presença = ausente e sem justificativa |
| **Dispensado** | admin tirou da escala ou a atividade foi cancelada |
| **Substituído** (fase 2) | `substituida_por_id` preenchido (AM-27) |

Regras:
- "Não vou" num tipo que exige justificativa não salva sem texto. O médium pode mudar a resposta até o início.
- Depois de marcado ausente, o médium pode justificar até **7 dias** depois (prazo configurável por terreiro).
  Aceitar ou recusar a justificativa (abonar) fica para a fase 2; no MVP, justificada = tem justificativa.
- **Encerrar chamada** (botão do admin) marca como ausente quem continua sem presença registrada, com
  `presenca_origem = encerramento`. Se ninguém encerrar, um job encerra 48 h depois do fim **apenas** se a
  atividade tiver pelo menos uma presença registrada (sinal de que a chamada aconteceu); senão fica "sem chamada" e
  não entra no relatório.
- Cancelar a atividade dispensa todo mundo e avisa os convocados.

### 8.6 Presença no dia
- **Modo de presença (decisão D-11, configurável pela casa)**: em Configurações da Área, com padrão da casa e
  ajuste por tipo de atividade. São três modos, nenhum usa GPS:
  - **Confiança** (padrão): a confirmação "vou" do médium basta. Quem confirmou conta como presente quando a
    atividade termina, a não ser que o admin/porteiro marque ausência. Não há botão "Cheguei".
  - **Check-in pelo app**: botão "Cheguei" na Área, só dentro da janela do tipo e só para quem é convocado ou
    elegível. Grava `presenca_origem = checkin_medium`.
  - **Check-in com QR**: o "Cheguei" exige o QR do dia, exibido na Porta/TV e na tela da chamada (AM-28, conversa com
    o N-06), para evitar check-in de casa.
- **Chamada pelo admin/porteiro**: lista com os convocados/elegíveis, busca por nome, tocar alterna
  Presente/Ausente, "Marcar todos os confirmados como presentes", "Adicionar quem veio", "Encerrar chamada". Na
  gira, a chamada abre também a partir da Porta (`PORTA:edit`).
- O admin pode corrigir o que o médium marcou (fica registrado quem mudou).

### 8.7 Escala de faxina: planejador do mês (grupos por dia)
Fluxo do admin (tipo com modo "grupos por dia", ex.: Faxina):
1. Escolhe o **mês** e o tipo. Se o mês não tem plano, oferece "Copiar do mês anterior" ou "Começar vazio".
2. À esquerda (no celular, em cima), os **grupos** como fichas coloridas (G1, G2, G3) com o número de dias de cada
   um; "Novo grupo" abre o cadastro de grupos sem sair da tela.
3. À direita, a **grade do mês** (7 colunas, células de 44 px, funciona no celular). Toca numa ficha de grupo e
   depois nos dias: o dia ganha a cor e a sigla do grupo. Tocar de novo tira. Um dia pode ter mais de um grupo.
4. Atalhos:
   - **Copiar do mês anterior** pela ordem do dia da semana (o 1º sábado vai para o 1º sábado, o 2º para o 2º);
   - **Girar grupos** (G1 pega os dias do G3, G2 os do G1, G3 os do G2), para quem faz rodízio mês a mês;
   - **Distribuir**: escolhe dias da semana (ex.: sábados) e os grupos em ordem, e o sistema preenche em ciclo.
5. Horário padrão do tipo em todos os dias, editável por dia (toque longo ou menu do dia).
6. Resumo em texto antes de publicar: "G1: dias 5 e 19 · G2: dias 12 e 26 · G3: dia 3".
7. **Salvar rascunho** (o médium não vê) e **Publicar**: cria uma atividade por dia e grupo ("Faxina · G1"), cria a
   participação de cada membro do grupo (`origem = grupo`, `convocado = true`) e dispara o aviso (AM-15).
8. **Republicar** depois de mexer: dia removido → atividade cancelada e convocados dispensados com aviso; grupo
   trocado num dia → os do grupo antigo dispensados, os do novo convocados; o que não mudou mantém respostas e
   presenças. Publicar roda sob `SELECT ... FOR UPDATE` no plano e é idempotente.
9. Mudou a composição de um grupo depois de publicado: botão "Atualizar convocações das próximas faxinas" (só
   datas futuras; o passado não muda).

### 8.8 Escala de gira (por função e por grupo)
- Na gira (e em qualquer tipo com modo "por função"), a aba **Escala** lista as funções da casa (`funcoes_corrente`).
  Para cada função, escolher médiuns (Combobox com só os elegíveis) ou **um grupo inteiro** ("G2 trabalha nesta
  gira": todos os membros convocados, com função padrão opcional).
- **Copiar da gira anterior** e **Rodízio**: para uma função, distribuir em ordem circular entre os elegíveis (ou
  entre grupos) pelas próximas N giras (função pura testada, herdada do F-07).
- Um médium tem no máximo uma função por gira (unicidade atividade+médium); a escala grava `funcao_id` na própria
  participação, que é a mesma linha da presença.
- Médiuns sem função continuam convocados pelo tipo ("todos os elegíveis") e aparecem na chamada.

### 8.9 Na Área do Médium
- **Início**: cartão "Sua próxima escala" (ex.: "Faxina · sábado 12/10, 9h · grupo G2") com **Vou** / **Não vou**
  (abre o campo de justificativa quando o tipo exige); cartão "Responda até sexta" para confirmações pendentes; botão
  **Cheguei** quando estiver dentro da janela de check-in.
- **Calendário**: giras, atividades visíveis para ele e as escalas dele em destaque ("Você está escalado:
  Cambone"). O detalhe da atividade tem resposta, check-in e justificativa.
- **Minhas presenças** (`/medium/presencas`, acessível pelo Início e pelo menu): próximas escalas, histórico com a
  situação de cada atividade, percentual de presença no período e "Justificar" nas ausências ainda dentro do prazo.
- O médium vê o nome do próprio grupo; não vê quem mais está no grupo nem a presença dos outros (D-07).

### 8.10 Lado admin
- `/admin/atividades`: calendário da casa (mês/lista) com giras e atividades, filtro por tipo e grupo; criar
  atividade com `CrudDrawer` (tipo, data, horário, local, orientações, visibilidade, convocação).
- Abas: **Escala de faxina** (planejador do §8.7, só com `escalas`), **Tipos e funções**, **Relatórios**.
- Na tela de Giras, aba **Escala** e botão **Chamada** em cada gira (componente próprio; o `giras.tsx` já tem
  mais de 1.600 linhas).
- **Confirmações**: por atividade, contadores (confirmados, ausências avisadas, sem resposta) e lista com as
  justificativas.
- **Relatório de assiduidade** (AM-26): por médium e por grupo, período e tipo; colunas convocações, presenças,
  ausências com e sem justificativa, percentual (presentes ÷ convocações com chamada encerrada, sem dispensados);
  PDF na base dos PDFs de listagem (`lib/pdf/pdfDoc`, jspdf-autotable; o `useRelatorioPDF` é o do Relatório
  de gira, com a página 1 em imagem), só com contagens.

### 8.11 Avisos (AM-15)
- Véspera, às 18 h: "Amanhã você está na faxina (G2), 9h" e "Amanhã tem gira, você é Cambone".
- Dois dias antes: confirmação pendente.
- Depois de marcado ausente: "Quer justificar a falta de sábado?" (link para a Área).
- Para o admin: resumo diário com ausências avisadas e justificativas novas.
- Canal: e-mail no MVP; push quando o AM-16 existir; WhatsApp só com o F-03.

### 8.12 Plano e permissões (resumo)
- `atividades_corrente` (Basic): tipos, atividades internas, grupos, convocação, vou/não vou, justificativa,
  check-in, chamada, histórico, relatório por médium, avisos de atividade e de confirmação pendente.
- `escalas` (Pro): planejador da faxina, escala de gira por função e por grupo, rodízio, copiar mês, relatório por
  grupo, aviso de escala, troca (fase 2). Fora do plano, a aba aparece com `PlanLocked`
  (`minPlanFor('escalas').label`) e a API responde 403.
- Grupo de permissão `ESCALAS` (nova) para tudo isso; grupos da corrente em `MEDIUNS`; chamada da gira aceita
  `PORTA:edit` (§6.7).

---

## 9. Fora do escopo (por enquanto)
- **Chat do terreiro / grupo** (Minha Gira tem): moderação, notificação e expectativa de resposta em tempo real;
  o WhatsApp já cumpre esse papel. Comunicados de mão única resolvem a dor do "aviso perdido no grupo".
- **App nativo** (lojas): PWA cobre (AxéCloud vende justamente "não precisa App Store").
- **Pedido de reza / consulentes na Área**: é outro público.
- **Pagamento por cartão**: só com gateway (F-02).

---

## 10. Cards

### AM-00 — Estudo de experiência e usabilidade da Área do Médium
- **Prioridade:** P0 · **Fase:** Fase 0 · **Esforço:** G (3 semanas) · **Tipo:** pesquisa · **Depende de:** AM-01

**Por quê.** Pedido do dono (v3): estudar experiência e usabilidade antes de desenvolver, com foco em facilidade,
termos conhecidos, jornada simples e celular. A Área é a primeira parte do GiraHub usada por quem não escolheu o
sistema; adoção, vocabulário e celular simples são os riscos principais (R-09, R-06).

**Como.** Roteiro completo em [estudo-ux-area-do-medium.md](estudo-ux-area-do-medium.md): conversas com médiuns
e dirigentes de 3 a 4 casas, teste de vocabulário, protótipo navegável no celular (jornadas J1 a J13), teste de
primeiro toque e teste de usabilidade moderado, no celular de cada participante e com o link aberto pelo
WhatsApp. O dono recruta e conduz; o Claude prepara o material e faz a síntese.

**Aceite**
- [ ] Casas e participantes recrutados (8 a 10 médiuns, 3 a 4 dirigentes)
- [ ] Conversas de descoberta feitas e jornada atual mapeada
- [ ] Teste de vocabulário respondido e glossário da Área fechado
- [ ] Protótipo navegável cobrindo J1 a J13, testado no celular
- [ ] Metas do §9 do estudo atingidas, sem problema que impeça tarefa em aberto
- [ ] Cards AM atualizados com escopo, ordem e aceite de UX; decisões novas na §12

### AM-01 — Decisões do dono da Área do Médium
- **Prioridade:** P0 · **Fase:** MVP · **Esforço:** P · **Tipo:** decisão · **Depende de:** —

**Por quê.** Pontos que mudam o desenho e o preço (lista na §12). **D-01 a D-08 foram decididas em 2026-10-07**
(todas como recomendado). D-09 a D-13, sobre escalas e presença, também foram decididas em 2026-10-07: todas como
recomendado, menos a D-11, que virou configuração da casa (confiança, check-in pelo app ou check-in com QR).

**Aceite**
- [x] D-01 a D-08 da §12 respondidas e registradas neste documento (2026-10-07)
- [x] Plano da `area_medium` decidido: Basic (o AGENTS.md §3.4 é atualizado no card de código, AM-02)
- [x] D-09 a D-13 da §12 respondidas (2026-10-07; D-11 como configuração da casa)
- [ ] F-04, F-06 e F-07 arquivados no board apontando para os cards AM

### AM-02 — Fundação de identidade: vínculo médium↔usuário, papel `medium` e trava do painel
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** G · **Tipo:** dev · **Depende de:** T-02, AM-01

**Por quê.** Todos os concorrentes com área do membro separam o acesso do painel ("Cada membro acessa um espaço
separado do painel da administração", AxéCloud). Hoje não há como um médium ter conta, e o operador que é médium
precisa das duas áreas com um login só.

**Implementação**
- Migração 061: `ALTER TYPE user_role ADD VALUE 'medium'` (sozinha, por causa da regra do Postgres sobre enum
  novo na mesma transação).
- Migração 062: `mediuns.user_id` (FK `users.id` ON DELETE SET NULL, nullable), índice único parcial
  `(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL`; `mediuns.area_consentimento_em`,
  `area_consentimento_versao`.
- `UserRole.MEDIUM` fora do `_ROLE_HIERARCHY` de back-office (nível -1); `is_operator_or_admin` continua falso.
- `require_backoffice` no `admin_router` (`B/api/v1/admin/__init__.py`). As rotas de `/auth/*` que o médium usa
  (perfil, trocar senha, logout) continuam abertas a ele; platform já exige super admin.
- `require_medium` + `MediumContext` em `B/api/dependencies.py`; router vazio `B/api/v1/medium/` com `GET /me`
  (nome, foto, terreiro, marca, áreas, módulos ligados).
- `GET /auth/me`, `GET /auth/profile` e a resposta do login passam a trazer `areas`.
- Feature `area_medium` (BASIC) em `PlanFeatures`/`_FEATURE_MIN_TIER` + `F/constants/plans.ts` + teste-espelho.
- `users.py`: listagem de Usuários esconde `role = medium` por padrão; criar usuário com e-mail de um `medium` do
  mesmo terreiro promove para operador (com grupo padrão); rebaixar operador-médium volta para `medium`.
- `trial_scheduler.get_tenant_primary_contact` ignora `role = medium`.
- Auditores estendidos (§6.6) e entrada na lista de exceções do CLAUDE.md/AGENTS.md §3.3 para `medium/`.
- Inativar/excluir médium (`B/api/v1/admin/mediuns.py`): desativa o usuário se for `medium` puro.

**Testes.** `test_dependencies.py` (require_medium: sem vínculo, médium inativo, outro tenant, plano sem
feature, assinatura suspensa), varredura de rotas admin/platform com usuário `medium` (403 em todas),
`integration_pg/test_rbac_http.py`, `test_migrations.py`, `test_tenant_isolation.py`.

**Aceite**
- [ ] Usuário `medium` recebe 403 em toda rota `/api/v1/admin/*` e `/api/v1/platform/*` (teste varrendo o app)
- [ ] `require_medium` resolve o médium só pelo usuário logado, com tenant e médium ativos
- [ ] Operador/admin vinculado tem as duas áreas; `areas` correto em `/auth/me` e no login
- [ ] `area_medium` no catálogo, no espelho do front e no quadro de planos
- [ ] Auditores de tenant e de guard cobrindo `B/api/v1/medium/`; CLAUDE.md e AGENTS.md atualizados
- [ ] `alembic heads` com uma head; migrações testadas com Postgres real

**Riscos.** Rota admin esquecida fora do `admin_router` (mitigado pela varredura). Consulta de `User` sem filtro
de papel tratando médium como usuário do painel (contagens, contato principal, listas da plataforma): revisar
`grep "select(User)"`.

### AM-03 — Convite do médium e ativação da conta
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02, T-02

**Por quê.** O ORI entra por convite ("Recebeu um convite do seu terreiro?"). Convite com prova de posse do
e-mail é o que garante que só a pessoa certa vê a própria mensalidade.

**Implementação**
- Tabela `medium_convites` (tenant_id, medium_id, email, token_hash único, expira_em (7 dias), usado_em,
  revogado_em, criado_por, created_at). Um convite ativo por médium (reenviar revoga o anterior).
- `POST /api/v1/admin/mediuns/{id}/convite` (MEDIUNS edit + `area_medium`): exige e-mail no cadastro; devolve o
  link para copiar e o texto pronto para WhatsApp (`wa.me` com o telefone do médium, sem API); envia e-mail
  (template `medium_convite.py` via `email_queue`, texto discreto, §6.8).
- `POST .../convite/lote` (MEDIUNS edit): convida todos os ativos com e-mail e sem acesso (sinergia com F-09).
- `DELETE /api/v1/admin/mediuns/{id}/acesso` (MEDIUNS edit): revoga convite ou desfaz o vínculo (com
  `ConfirmDialog`).
- Público: `GET /api/v1/public/convite/{token}` (nome do terreiro, primeiro nome do médium, se já existe conta com
  o e-mail no terreiro) e `POST /api/v1/public/convite/{token}/aceitar`:
  - sem conta no terreiro: cria `User(role=medium)` com senha (`validate_password_policy`), grava consentimento,
    vincula e abre sessão (`issue_session`);
  - já existe conta no terreiro com o e-mail (operador/admin): pede a senha dessa conta, vincula e abre sessão;
  - rate limit (`B/core/limiter.py`), token de uso único, resposta genérica para token inválido/expirado.
- Busca do convite pelo token entra como "busca raiz" no auditor de `public/`.
- Front: `F/pages/convite/[token].tsx` (AuthShell da identidade de conta), coluna/selo "Acesso à Área" em
  `F/pages/admin/mediuns.tsx` (Sem acesso · Convite enviado · Ativo), ações Convidar/Reenviar/Copiar link/Revogar
  só com `canGroup('mediuns','edit')` e `can('area_medium')` (`PlanLocked` com `minPlanFor`).
- Política de privacidade com o parágrafo da Área do Médium.

**Aceite**
- [ ] Admin convida por e-mail e copia link/texto de WhatsApp
- [ ] Médium cria a senha, aceita o termo e cai na Área já logado
- [ ] Operador que é médium aceita com a senha que já tem e passa a ter as duas áreas
- [ ] Convite expira em 7 dias, é de uso único e reenviar invalida o anterior
- [ ] Revogar tira o acesso na hora
- [ ] Consentimento gravado com data e versão; sem aceite não há conta
- [ ] Convite em lote para médiuns ativos com e-mail

**Riscos.** E-mail errado no cadastro entrega o convite a outra pessoa (mitigação: mostrar o e-mail mascarado na
confirmação do admin e permitir revogar). E-mail que já existe em outro terreiro gera segunda conta; o login
precisa do AM-05.

### AM-04 — Login com escolha de área e troca de área
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02

**Por quê.** Pedido direto do dono. Quem tem as duas áreas escolhe; quem tem uma entra direto.

**Implementação**
- `F/services/authSession.ts::completeLogin` decide pelo `areas` (§6.4) e pela escolha lembrada.
- `F/pages/escolher-area.tsx` (+ `escolher-area` em `RESERVED_SLUGS` e no teste); dois cartões, caixa "Lembrar
  neste aparelho", marca do terreiro.
- "Trocar de área" no menu do perfil do `AdminTopbar` (só com `areas.medium`) e no `MediumLayout` (só com
  `areas.admin`).
- `admin_layout.tsx` redireciona quem não tem `areas.admin` para `/medium`; `MediumLayout` faz o inverso.
- `_app.tsx`: providers de admin só carregam com `areas.admin` em rota `/admin/*` (sem 403 em série no Sentry).
- Link "Recebi um convite" no `/login` explicando que o acesso vem pelo link do terreiro.
- Evento de analytics `area_escolhida {area, lembrada}`.

**Aceite**
- [ ] Só admin/operador vai direto ao painel; só médium vai direto à Área
- [ ] Com as duas, aparece a escolha; marcar "lembrar" pula a tela nos próximos logins naquele aparelho
- [ ] Troca de área nos dois menus, sem novo login
- [ ] Médium puro nunca vê tela nem chamada de `/admin/*` (sem 403 no console)
- [ ] Médium cujo terreiro perdeu o plano vê o aviso neutro

### AM-05 — Mesmo e-mail em mais de um terreiro
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** T-02, AM-02

**Por quê.** Hoje o login pega a conta mais antiga com o e-mail. Médium que já é admin de outro terreiro (ou
médium em duas casas) nunca entraria na Área nova. Convidar médiuns aumenta muito a chance de colisão.

**Implementação**
- `login`: buscar **todas** as contas ativas com o e-mail (`func.lower`), conferir a senha em cada uma (no máximo
  N, ex. 5, para limitar o custo do bcrypt), manter o tempo constante quando nenhuma confere.
- Uma conta confere: fluxo atual. Mais de uma: 200 com `choose_account: true`, `selection_token`
  (`type: "account_select"`, 5 min, lista de user_ids) e `options` (nome do terreiro, áreas). Sem cookies ainda.
- `POST /auth/login/select {selection_token, user_id}` (público com rate limit, em `public_paths`): valida o tipo
  e a lista, chama `issue_session`.
- Esqueci a senha e reativação: hoje usam a conta mais antiga; o e-mail de reset passa a listar os terreiros
  (um link por conta).
- Front: passo "Em qual terreiro?" no `/login`, antes da escolha de área.

**Aceite**
- [ ] Pessoa com conta em dois terreiros escolhe o terreiro no login
- [ ] Senha que só confere numa das contas entra direto nela
- [ ] `selection_token` não funciona como access (teste do T-02)
- [ ] Reset de senha alcança cada conta
- [ ] Tempo de resposta sem diferença perceptível entre e-mail inexistente e senha errada

**Riscos.** Enumeração de terreiros pelo e-mail: só listar terreiros cuja senha conferiu.

**Depois (D-36, 08/10).** O cadastro de terreiro aceita e-mail que já tem conta ativa, confirmando a senha
dessa conta (`conta_existente` no `POST /public/onboarding`, mesmo rate limit do login); limite de 5 contas
ativas por e-mail mantido.

### AM-06 — Casca da Área do Médium e tela Início
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02, AM-04

**Por quê.** É a "home" que todos os concorrentes descrevem: agenda, avisos e mensalidade num lugar só, no
celular.

**Implementação**
- `F/components/medium/MediumLayout.tsx` e `MediumProvider` (§6.10), marca do terreiro via `applyBrand`,
  claro/escuro seguindo o sistema (out/2026: a Área passou a ser sempre clara, no tom da landing — AGENTS.md §11.16).
- `GET /api/v1/medium/inicio`: próxima gira/evento, comunicados não lidos (contagem + 3 últimos), mensalidade do
  mês (status, valor, vencimento), aviso de aniversário do próprio médium, módulos ligados (AM-10).
- `F/pages/medium/index.tsx`: cartões com ação direta ("Ver gira", "Ler aviso", "Pagar"), `EmptyState` amigável
  quando a casa ainda não publicou nada.
- (v3, D-23) **Ícone na tela inicial já no MVP**: `public/manifest-medium.webmanifest` (`id` `/medium`,
  `start_url` `/medium?source=pwa`, ícones do GiraHub), linkado só no `MediumLayout`; no 1º acesso, passo guiado
  "Adicionar à tela inicial" (padrão do `InstallPortaHint`), com instrução para iPhone. Sessão lembrada.
- (v3, D-24) Ordem do Início: **pendências primeiro** (responder escala, mensalidade a vencer ou vencida, aviso
  novo) e depois a próxima gira. Barra inferior: Início · Agenda · Avisos · Mensalidade · Perfil (D-27).
- O `/inicio` já nasce com espaço para os cartões da v2 ("Sua próxima escala", confirmação pendente e "Cheguei"),
  que o AM-17 e o AM-25 preenchem (§8.9).
- Textos em linguagem de terreiro; testes por papel/texto.

**Aceite**
- [ ] Início mostra próxima gira, avisos não lidos e mensalidade do mês numa tela de celular sem rolagem lateral
- [ ] Cor e logo do terreiro aplicados com contraste AA (teste de contraste passa)
- [ ] Módulo desligado pelo terreiro não aparece
- [ ] Página carrega só endpoints `/api/v1/medium/*`
- [ ] Instalar pelo passo "Adicionar à tela inicial" abre direto na Área (não na Porta), no Android e no iPhone

### AM-07 — Calendário de giras para a corrente
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-06

**Por quê.** Pedido do dono e núcleo de todos os concorrentes ("Agenda da casa", Kanzuá; "Agenda do terreiro",
Minha Gira). A Minha Gira vende a pergunta "O que eu tenho que levar pra gira?".

**Implementação**
- Migração: `giras.orientacoes_corrente` (Text, nullable): o que levar, roupa, horário de chegada da corrente.
  Diferente de `recados` (que vai para o consulente). Campo novo no drawer da gira em `F/pages/admin/giras.tsx`
  (GIRAS edit), num componente próprio.
- `GET /api/v1/medium/calendario?inicio&fim`: giras ativas do tenant no período (passadas e futuras); com o
  AM-08, também as atividades internas visíveis ao médium e, com o AM-17/AM-25, a participação dele em cada item
  (convocado, função, grupo, resposta). Resposta unificada `{origem: "gira"|"atividade", id, tipo (nome, ícone,
  cor), titulo, inicio, fim, local, minha_participacao}`, desenhada já assim no MVP para não quebrar depois.
- `GET /api/v1/medium/calendario/gira/{id}`: nome, data e hora (Brasília, `lib/dateBr.ts`), local ou endereço do
  terreiro com link do mapa, descrição, orientações da corrente, situação das senhas (abertas/lotadas, sem dados
  de consulentes) e link público da gira.
- Front: `F/pages/medium/calendario.tsx` com lista por mês (padrão) e grade mensal opcional, filtro
  Giras/Eventos; detalhe com "Adicionar à agenda" (`.ics` do `bilhete-utils`, link do Google Agenda) e
  "Divulgar a gira" (WhatsApp com o link público: o médium vira divulgador).

**Aceite**
- [ ] Médium vê as giras do mês e dos próximos meses, com detalhe completo
- [ ] Orientações da corrente aparecem só na Área (nunca no site, e-mail ou bilhete do consulente)
- [ ] Adicionar ao calendário (.ics e Google) funciona no Android e no iPhone
- [ ] Botão de divulgar abre o WhatsApp com o link público da gira
- [ ] Nenhum dado de consulente na resposta

### AM-08 — Atividades da casa: tipos configuráveis e atividades internas
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** G · **Tipo:** dev · **Depende de:** AM-02, AM-07, AM-23
- (v2: substitui o antigo "Eventos internos da corrente")

**Por quê.** O calendário da corrente tem mais que giras abertas: rituais coletivos e individuais, organização
interna, preparação de curso, desenvolvimento, reunião, faxina (pedido do dono, v2). AxéCloud registra presença em
"giras e atividades da casa"; o ORI tem "Tipos de Rituais" configuráveis. Hoje toda gira aparece no site e conta
no limite de giras/mês do plano (2/3/4), o que inviabiliza lançar atividade interna como gira (D-03).

**Implementação** (§8.2, §8.3, §8.10)
- Migrações: `ALTER TYPE permission_feature ADD VALUE 'escalas'` (sozinha) e, em seguida, acesso total no grupo
  padrão; tabelas `atividade_tipos`, `atividade_tipo_grupos`, `funcoes_corrente`, `atividades`; migração de dados
  com os 8 tipos sugeridos e funções sugeridas para todo terreiro; `ensure_default_atividade_tipos` no cadastro
  (`public/onboarding.py`) e no `tenant_service`.
- Features de plano `atividades_corrente` (BASIC) e `escalas` (PRO) no catálogo e no espelho do front.
- `B/api/v1/admin/atividades.py`: CRUD de tipos e funções (`ESCALAS` edit), CRUD de atividades
  (`ESCALAS` view/insert/edit/delete + `atividades_corrente`), cancelar com motivo, calendário da casa
  (`GET /admin/atividades/calendario`: giras + atividades). Não conta no limite de giras.
- Serviço `atividade_da_gira` (âncora, `ON CONFLICT DO NOTHING`).
- Front: `F/pages/admin/atividades.tsx` (calendário + `CrudDrawer`), aba "Tipos e funções" com ícone/cor e as
  opções de presença, confirmação, justificativa, check-in, elegíveis, convocação e modo de escala.
- `GET /api/v1/medium/calendario` passa a trazer atividades visíveis (visibilidade "só convocados" filtrada por
  participação do próprio médium).
- `permissionFeatures.ts`: `escalas` com rótulo "Atividades e escalas", grupo "Corrente".

**Aceite**
- [ ] Terreiro novo e existente nascem com os 8 tipos sugeridos; admin cria, renomeia, muda ícone/cor e arquiva tipos
- [ ] Tipo "Gira" é de sistema: não arquiva, é o único visível no site
- [ ] Admin cria atividade interna sem consumir o limite de giras
- [ ] Atividade aparece só na Área do Médium, para quem pode ver (corrente ou só convocados)
- [ ] Agenda pública, site e sitemap não mostram atividade interna (teste)
- [ ] `ESCALAS` no enum, no grupo padrão e no `permissionFeatures.ts`; botões ocultos sem permissão
- [ ] Teste de FK/tenant cruzado em tipo, grupo, função e gira

### AM-09 — Comunicados
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02, AM-06

**Por quê.** Pedido do dono e presente em AxéCloud ("mural e avisos oficiais para reduzir ruído no grupo"),
Kanzuá ("Comunicados internos"), Minha Gira e Quartinha.

**Implementação**
- Migrações: `ALTER TYPE permission_feature ADD VALUE 'comunicados'`; depois, acesso total no grupo padrão.
- Tabelas `comunicados` (tenant_id, titulo, corpo (texto simples com quebras de linha e links autolinkados, sem
  HTML), publico (todos | atendimento | cambones), fixado, publicar_em, expira_em, criado_por, soft delete) e
  `comunicado_leituras` (tenant_id, comunicado_id, medium_id, lido_em; único comunicado+médium).
- Admin `B/api/v1/admin/comunicados.py`: CRUD com `COMUNICADOS` + `area_medium`; `GET /{id}/leituras` (quem leu,
  quem não leu: `view`). Tela `F/pages/admin/comunicados.tsx` no grupo "Corrente" do menu, com `CrudDrawer`,
  prévia como o médium vê e contagem "lido por 12 de 20".
- Médium: `GET /api/v1/medium/comunicados` (não expirados, do seu público, fixados primeiro, `lido` por item),
  `GET /{id}`, `POST /{id}/lido` (recusado sob impersonação).
- E-mail opcional "Avisar por e-mail agora" fica para o AM-15.
- Quando o AM-23 existir, o público aceita também grupos da corrente (`comunicado_grupos`).

**Aceite**
- [ ] Quem tem COMUNICADOS:insert publica; botões ocultos sem permissão; `PermissionDenied` sem `view`
- [ ] Médium vê só comunicados do seu público, com marca de não lido
- [ ] Admin vê quem leu e quem não leu
- [ ] Fixar, agendar publicação e expirar funcionam
- [ ] Corpo sem HTML (sem XSS), testado

### AM-10 — Configuração da Área e chave PIX do terreiro
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02, AM-01

**Por quê.** O terreiro decide o que o médium vê (AxéCloud: "mostra apenas o que a diretoria liberou") e onde o
dinheiro cai.

**Implementação**
- Configuração da Área em `tenant_configs` (colunas ou `custom_settings.area_medium`): ligada, mensagem de
  boas-vindas, WhatsApp da casa ("Falar com a casa"), módulos visíveis (calendário, comunicados, mensalidade).
  `GET/PUT /api/v1/admin/config/area-medium` (CONFIGURACOES view/edit + `area_medium`); seção nova em
  `F/pages/admin/config.tsx`.
- Chave PIX em `mensalidade_configs`: `pix_tipo`, `pix_chave`, `pix_nome_recebedor` (≤ 25), `pix_cidade` (≤ 15),
  `pix_instrucoes`, `pix_alterado_em`. `PUT /api/v1/admin/financeiro/config/pix` (FINANCEIRO edit +
  `mensalidade_mediun`) com senha de confirmação, validação por tipo, auditoria mascarada e e-mail a todos os
  admins (§7.3). Na tela `F/pages/admin/financeiro/config.tsx`, com prévia do QR.
- `B/services/pix_brcode.py`: função pura que monta o BR Code estático (chave, valor, nome, cidade, txid, CRC16).

**Aceite**
- [ ] Terreiro liga/desliga a Área e cada módulo; médium não vê módulo desligado
- [ ] Chave PIX validada por tipo; trocar exige senha e avisa todos os admins por e-mail
- [ ] Auditoria registra a troca com a chave mascarada
- [ ] `pix_brcode` com testes de CRC e de limites de campo (exemplos do manual do BC)
- [ ] Prévia do QR na tela de configuração lê corretamente em pelo menos 3 apps de banco

### AM-11 — "Pague sua mensalidade aqui"
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-06, AM-10

**Por quê.** Pedido do dono. AxéCloud ("O filho de santo paga pelo portal"), ORI (`/pagar` com "PIX copia e
cola"), Minha Gira e Tupam têm. Tira o print do grupo.

**Implementação**
- `GET /api/v1/medium/mensalidades`: meses do médium a partir de `data_entrada` (mesma regra de "mês de
  referência" da §11.10 do AGENTS.md), com status calculado (em aberto, vencida após `dia_vencimento`,
  comprovante enviado, paga, isento) e valor. Gate `mensalidade_mediun` + módulo ligado; isento mostra
  "Você é isento de mensalidade".
- `GET /api/v1/medium/mensalidades/{AAAA-MM}/pix`: copia-e-cola + dados para o QR, só para mês em aberto e com
  chave configurada.
- Front `F/pages/medium/mensalidade.tsx`: cartão do mês com "Pagar com PIX" (Sheet com QR, copiar código, copiar
  chave), lista de meses em aberto e histórico (pagos com data). Bloco "Quer pagar todo mês sem lembrar?" com
  passo a passo do Pix Agendado Recorrente e o aviso de conferir o valor quando a casa reajustar.
- Sem chave PIX configurada: mostra "Combine o pagamento com a casa" + botão do WhatsApp da casa.

**Aceite**
- [ ] Médium vê o mês atual, os meses em aberto e o histórico, só os dele
- [ ] Copia-e-cola e QR com valor e txid do mês, aceitos por apps de banco
- [ ] Copiar chave funciona no celular
- [ ] Isento e sem chave têm mensagem própria
- [ ] Nenhum dado de outro médium (teste de isolamento por `medium_id`)

### AM-12 — Comprovante enviado pelo médium e confirmação no painel
- **Prioridade:** P0 · **Fase:** MVP (2.3.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-11

**Por quê.** Sem gateway, a baixa é humana; o comprovante precisa chegar organizado ("Menos print perdido no
WhatsApp", AxéCloud).

**Implementação**
- Migração em `mensalidade_pagamentos`: `comprovante_enviado_em`, `comprovante_enviado_por` (FK users),
  `recusa_motivo`, `recusado_em`. Status continua PENDENTE até a confirmação (sem valor novo no enum).
- `POST /api/v1/medium/mensalidades/{AAAA-MM}/comprovante` (multipart): cria ou atualiza o registro do mês do
  próprio médium com o comprovante; recusa se já estiver PAGO ou ISENTO; tipos jpeg/png/webp/pdf; limite de
  **2 MB** (imagem comprimida no navegador antes de enviar); rate limit; recusado sob impersonação; auditoria.
- Admin, em `F/pages/admin/financeiro/mensalidades.tsx`: filtro e selo "Comprovante enviado", ver comprovante
  (rota que já existe), "Confirmar pagamento" (POST de registro atual, FINANCEIRO insert, espelha em contas a
  receber) e "Recusar" com motivo (`PATCH .../recusa`, FINANCEIRO edit). KPI "Comprovantes para conferir".
- Médium vê "Em conferência" e, se recusado, o motivo e o botão para reenviar.
- E-mail ao admin quando chega comprovante fica para o AM-15 (no MVP, o contador no painel resolve).

**Aceite**
- [ ] Médium envia foto/PDF e o mês fica "Em conferência"
- [ ] Admin com FINANCEIRO:insert confirma e o mês vira pago, com espelho em contas a receber
- [ ] Recusa com motivo aparece para o médium, que pode reenviar
- [ ] Médium não consegue marcar pago nem mexer em mês de outro médium (teste)
- [ ] Arquivo acima de 2 MB ou tipo inválido recusado com mensagem clara

**Riscos.** Crescimento do banco (BYTEA, limite de 8 GB): compressão no navegador, limite de 2 MB e
monitoramento do tamanho da tabela.

### AM-13 — Perfil do médium
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-06

**Por quê.** Cadastro atualizado sem o admin digitar tudo ("Informações da corrente", Kanzuá); base para
aniversário e lembretes.

**Implementação**
- `GET /api/v1/medium/perfil` e `PATCH` (recusado sob impersonação).
- **O médium edita**: telefone, endereço (CEP), data de nascimento, foto (do `User`, mesmo upload do perfil
  admin), senha (rota existente de trocar senha) e e-mail de login (com confirmação no e-mail novo).
- **Só o admin edita** (o médium vê, sem editar): nome no cadastro da casa, data de entrada, tipo (atendimento ou
  cambone), isenção. **Nunca aparece**: `observacoes`, `data_saida`, `registrado_por`.
- Cada alteração do médium vai para a auditoria do terreiro ("médium atualizou o telefone"), sem valor sensível.
- Front `F/pages/medium/perfil.tsx` com `CrudDrawer` e `MaskedInput`.

**Aceite**
- [ ] Médium atualiza contato, endereço, nascimento e foto
- [ ] Campos da casa visíveis e travados; campos internos ausentes da resposta (teste do schema)
- [ ] Alteração aparece na Auditoria do terreiro
- [ ] Trocar senha e e-mail seguem as regras de sessão já existentes

### AM-14 — Meus dados e privacidade (LGPD)
- **Prioridade:** P2 · **Fase:** Fase 2 · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-13

**Por quê.** Direito de acesso e de revogação (LGPD art. 18) para um cadastro que revela religião. AxéCloud usa
privacidade como argumento ("ambiente isolado, com autenticação e acesso aos próprios registros").

**Implementação**
- `GET /api/v1/medium/meus-dados/exportar` (JSON/PDF com cadastro, mensalidades, leituras, presenças).
- "Encerrar meu acesso": revoga o consentimento, desvincula e desativa a conta `medium` (os dados da casa ficam
  com o terreiro, controlador); avisa os admins.
- Texto "Quem vê o quê" na tela.

**Aceite**
- [x] Médium baixa os próprios dados
- [x] Encerrar acesso desvincula e desativa a conta, com aviso aos admins
- [x] Política de privacidade descreve os dois fluxos

### AM-15 — Lembretes e avisos por e-mail
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-09, AM-11, AM-12, AM-17
- (v2: entra no MVP e passa a cobrir escalas, confirmação pendente e justificativa; absorve o "e-mail na véspera" do F-07)

**Por quê.** Minha Gira "envia lembretes amigáveis antes do vencimento" e "Programe alertas automáticos" nas
escalas; ORI avisa por WhatsApp. Sem lembrete, escala de faxina vira esquecimento e a Área vira mais um lugar para
esquecer.

**Implementação** (§8.11)
- `B/services/medium_lembrete_scheduler.py` no padrão `scheduler_guard` (advisory lock + marca por linha,
  `UPDATE ... WHERE lembrete_enviado_em IS NULL RETURNING`), registrado no lifespan:
  - mensalidade: D-3 e D+3 sem comprovante (D-29 substituiu o "no vencimento"; a casa pode desligar);
  - véspera, 18 h: escala do médium (faxina com o grupo, função na gira) e atividade/gira de amanhã;
  - D-2: confirmação (vou/não vou) pendente;
  - depois de marcado ausente: convite para justificar, dentro do prazo;
  - comunicado novo, quando o admin marca "avisar por e-mail".
- Para o admin: resumo diário com comprovantes para conferir, ausências avisadas e justificativas novas (um e-mail,
  não um por evento).
- Preferências do médium (`medium_preferencias`: por tipo de aviso, opt-out) e link de descadastro.
- Lembrete de escala só com `escalas` (Pro); os demais com o plano do módulo.
- Volume de e-mail: medir contra o plano gratuito do Resend antes de ligar para todos.
- (Implementado, ver §11.0) Também: escala nova (um e-mail com os dias novos), atividade cancelada e troca da
  chave PIX (sem a chave). Volume estimado: ~10 e-mails/mês por médium com tudo ligado + ~40/mês de resumo por
  terreiro → piloto (3–4 casas, ~30 médiuns cada) ≈ 1.400/mês, dentro dos 3.000/mês do Resend gratuito, mas
  dividindo a cota com as senhas dos consulentes; conta e consulta de medição em `docs/email.md`.

**Aceite**
- [ ] Lembretes chegam uma vez só, mesmo com 2 workers (teste)
- [ ] Véspera da faxina e da escala de gira avisa o médium com grupo/função e horário
- [ ] Confirmação pendente e justificativa de falta têm aviso próprio
- [ ] Médium desliga cada tipo de aviso
- [ ] Admin recebe um resumo diário (comprovantes, ausências, justificativas)
- [ ] Volume mensal estimado e registrado no card

### AM-16 — Instalar no celular (PWA da Área) e notificação push
- **Prioridade:** P2 · **Fase:** Fase 2 · **Esforço:** G · **Tipo:** dev · **Depende de:** AM-06, AM-15

**Por quê.** AxéCloud: "Não precisa App Store nem Google Play" e push; Kanzuá e Minha Gira são "app" no celular.
O manifesto atual abre a Porta.

**Implementação**
- (v3, D-23) O manifesto da Área e a dica de instalação **saíram para o AM-06 (MVP 2.3.0)**. Aqui fica só o push.
- Web Push com VAPID (sem custo): tabela `push_inscricoes` (user_id, endpoint, chaves, criado_em), envio pelo
  mesmo agendador do AM-15, handler `push`/`notificationclick` no `sw.js` (sem cachear `/api/*`, regra mantida).
  iPhone só recebe com o app instalado (iOS 16.4+).

**Feito (AM-16, migração 082).** Tabela `push_inscricoes` (+ `tenant_id`, `medium_id`, `user_agent` curto,
`last_success_at`, `failures`) e liga/desliga por tipo próprio do celular (`medium_preferencias.push_*`); API
`/api/v1/medium/push*` (chave pública, ligar/desligar o aparelho, tipos, teste); envio pelo agendador do AM-15 com a
mesma marca (uma vez só nos dois canais), texto discreto sem nome de atividade/aviso; 404/410 apagam a inscrição.
Sem as chaves VAPID no servidor fica desligado (só e-mail) — ligar: `docs/deployment.md`. Perfil → "Notificações no
celular" (permissão só no toque; iPhone fora da tela inicial abre o passo de instalação). A caixa "Avisar por
e-mail também" do aviso também dispara o push.

**Aceite**
- [ ] Push de comunicado e de mensalidade chega no Android e no iPhone instalado (validar no aparelho, com as chaves
  VAPID ligadas, pelo "Mandar uma notificação de teste" e por um aviso/lembrete real)
- [x] Teste do SW continua garantindo que `/api/*` não é cacheado (`__tests__/pwa/sw.test.ts`, inclusive `/api/v1/medium/push*`)

### AM-17 — Presença: convocação, vou/não vou com justificativa, check-in e lista de chamada
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** G · **Tipo:** dev · **Depende de:** AM-08, AM-06
- (v2: reescrito; **substitui o F-06** junto com o AM-26)

**Por quê.** Pedido do dono (v2): presença e ausência com justificativa em giras, faxinas e atividades internas.
AxéCloud ("Presenças, faltas e assiduidade registradas em giras e atividades da casa"), Minha Gira ("Controle de
Presença nas giras"), Quartinha ("Confirmação de Presença", "Histórico de Frequência", "Faltas & Justificativas"),
ORI (presença em ritual).

**Implementação** (§8.3 a §8.6, §8.9)
- Tabela `atividade_participacoes` (única por atividade+médium) e serviço de convocação (virtual para "todos os
  elegíveis", materializada no encerramento da chamada).
- Médium (`require_medium` + `atividades_corrente`, escritas recusadas sob impersonação):
  - `POST /api/v1/medium/atividades/{origem}/{id}/resposta` (`vou` | `nao_vou` + justificativa obrigatória quando o
    tipo exige; até o início);
  - `POST .../checkin` (só na janela do tipo, só convocado/elegível);
  - `POST .../justificativa` (depois de ausente, até o prazo);
  - `GET /api/v1/medium/presencas` (próximas convocações, histórico, percentual) e
    `F/pages/medium/presencas.tsx`; cartões no Início e ações no detalhe do calendário.
- Admin (`ESCALAS`; na gira também `PORTA:edit` na chamada):
  - `GET /api/v1/admin/atividades/{id}/confirmacoes` (contadores e lista com justificativas, `view`);
  - `GET/PUT .../chamada` (marcar presente/ausente, adicionar avulso, "marcar confirmados como presentes", `edit`);
  - `POST .../chamada/encerrar` (`edit`) e job de encerramento automático em 48 h (só se houve alguma presença);
  - `F/pages/admin/atividades/[id]/chamada.tsx`, botão "Chamada" no cartão da gira e na Porta.
- Situações derivadas e regras do §8.5; prazo de justificativa (7 dias) em `tenant_configs`.
- Justificativa fora de e-mail, push, auditoria e exportação (§6.8).

**Testes.** Isolamento entre dois médiuns do mesmo terreiro e entre terreiros; janela de check-in; justificativa
obrigatória por tipo; encerramento idempotente; `integration_pg` com concorrência de check-in e chamada.

**Aceite**
- [ ] Médium responde vou/não vou; "não vou" exige justificativa quando o tipo pede
- [ ] Médium faz check-in pelo app só dentro da janela do tipo
- [ ] Admin ou porteiro faz a chamada (presente/ausente, avulso) e encerra; quem sobrou vira ausente
- [ ] Ausente pode justificar até o prazo; situação muda para "ausente com justificativa"
- [ ] Admin vê confirmados, ausências avisadas, sem resposta e as justificativas por atividade
- [ ] Vale para giras, faxinas e atividades internas (tipos com presença ligada)
- [ ] Médium vê só o próprio histórico (teste com dois médiuns)

### AM-18 — Escala de gira: funções e quem trabalha em cada gira
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-08, AM-17, AM-23
- (v2: reescrito de "Minhas escalas"; **substitui a parte de gira do F-07**, inclusive o rodízio)

**Por quê.** Pedido do dono (v2): "escala de gira". O ORI tem cadastro de "Funções" ("Gerenciar funções
espirituais e administrativas do terreiro"); o F-07 previa limpeza, cozinha e portaria por gira com rodízio.

**Implementação** (§8.8)
- Aba **Escala** na gira (e em qualquer tipo com modo "por função"): por função, escolher médiuns elegíveis ou um
  grupo inteiro; "Copiar da gira anterior"; **Rodízio** para as próximas N giras (função pura testada, ordem
  circular entre médiuns ou grupos).
- `GET/PUT /api/v1/admin/atividades/{id}/escala` (`ESCALAS` view/edit + `escalas`); grava `funcao_id`,
  `grupo_id` e `origem` na participação (a mesma linha da presença); trocar alguém de função muda a linha; tirar da
  função numa gira ("todos os elegíveis") só limpa a função (segue esperado) e, em tipo "só escalados", marca
  `dispensado_em` (decisão do piloto, 08/10).
- Médium: função aparece no Início ("Você é Cambone na gira de sábado"), no calendário e em "Minhas presenças".
- Fora do plano `escalas`: aba com `PlanLocked`; giras continuam com presença (Basic).

**Aceite**
- [x] Admin monta a escala da gira por função, com médiuns ou grupo inteiro
- [x] Copiar da gira anterior e rodízio para as próximas giras funcionam
- [x] Um médium tem no máximo uma função por gira
- [x] Médium vê a própria função no Início e no calendário
- [x] Sem o plano Pro, a aba mostra o bloqueio com o plano mínimo e a API responde 403

### AM-19 — Minha ficha e minha caminhada
- **Prioridade:** P2 · **Fase:** Fase 2 · **Esforço:** M · **Tipo:** dev · **Depende de:** F-05, AM-13

**Por quê.** Todos os concorrentes de gestão têm (caminhada no AxéCloud, "Jornada do médium" no ORI, obrigações
na Minha Gira, "Diário & Entidades" na Quartinha).

**Implementação**
- `GET /api/v1/medium/ficha`: campos da ficha do F-05 marcados como "visível ao médium" e linha do tempo de
  marcos (entrada, batismo, obrigações).
- Campos marcados como "o médium pode sugerir" geram uma sugestão que o admin aprova (nunca gravação direta em
  dado religioso).
- Respeita o consentimento e a feature `FICHA_ESPIRITUAL` do F-05 do lado admin.

**Aceite**
- [ ] Médium vê só os campos que a casa liberou e a própria linha do tempo
- [ ] Sugestão do médium só entra depois de aprovada
- [ ] Nada da ficha em exportação, log ou e-mail

### AM-20 — Aniversariantes da corrente
- **Prioridade:** P3 · **Fase:** Fase 2 · **Esforço:** P · **Tipo:** dev · **Depende de:** AM-13

**Por quê.** Minha Gira ("Notificações de aniversários"); o GiraHub já tem aniversariantes, mas só para o admin.

**Implementação**
- Opt-in do médium ("Mostrar meu aniversário para a corrente", dia e mês, sem ano).
- Cartão no Início com os aniversariantes da semana que aceitaram; parabéns do próprio terreiro para o
  aniversariante (sem opt-in, é só para ele).

**Aceite**
- [x] Só aparece quem aceitou, sem o ano
- [x] Aniversariante vê a mensagem da casa no dia

### AM-21 — Estudos e documentos da casa
- **Prioridade:** P3 · **Fase:** Fase 3 · **Esforço:** G · **Tipo:** dev · **Depende de:** AM-09, AM-01 (D-02)

**Por quê.** AxéCloud (biblioteca, "Textos, cantigas e materiais de fundamento"), Tupam ("Pontos & Cânticos",
"Estudos", "Biblioteca Virtual"), Minha Gira (biblioteca no plano mais alto).

**Implementação**
- `materiais_corrente` (tenant_id, titulo, tipo (link, pdf, texto, ponto cantado), url ou arquivo, categoria,
  público (todos, atendimento, cambones ou grupos do AM-23), ordem). Começar por **links** (Drive, YouTube) e texto; upload de PDF com limite baixo por causa do
  banco (8 GB) ou só depois de armazenamento de objetos.
- Feature de plano sugerida `biblioteca_medium` (Pro); grupo `COMUNICADOS` ou feature nova.
- Ideia relacionada: mostrar na Área os cursos presenciais abertos da casa (já existem) com o link de inscrição.

**Aceite**
- [ ] Admin publica material por público e categoria
- [ ] Médium lista, busca e abre os materiais liberados
- [ ] Limite de tamanho definido e medido

### AM-22 — Mensalidade com baixa automática na Área
- **Prioridade:** P2 · **Fase:** Fase 2 · **Esforço:** M · **Tipo:** dev · **Depende de:** F-01, F-02, AM-11

**Por quê.** Quem tem baixa automática (AxéCloud, ORI, Minha Gira, Quartinha) usa gateway. O F-02 cria a cobrança;
este card a põe na Área.

**Implementação**
- Com o gateway conectado, "Pagar com PIX" chama a cobrança do F-02 (`mensalidade_cobrancas`) em vez do BR Code
  estático; o webhook dá baixa e o médium vê "Paga" sem comprovante.
- Sem gateway, continua o fluxo do AM-11/AM-12.
- Pix Automático/débito recorrente: só se o gateway escolhido oferecer e o terreiro tiver CNPJ (§7.2).

**Aceite**
- [ ] Terreiro com gateway: médium paga e o mês vira pago sozinho
- [ ] Terreiro sem gateway: fluxo de chave estática intacto
- [ ] Mesmo isolamento por médium do AM-11

### AM-23 — Grupos da corrente
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-02
- (v2: reescrito de "Públicos da corrente (segmentos)" e trazido para o MVP; um conceito só para escala, público e elegibilidade)

**Por quê.** A escala de faxina do dono é feita por grupos (G1, G2, G3). Casas também separam ogãs, ekedis,
desenvolvimento, diretoria. Um único cadastro de grupos serve à escala, ao público de comunicados e à elegibilidade
dos tipos de atividade.

**Implementação** (§8.3)
- Tabelas `corrente_grupos` e `corrente_grupo_membros`; `B/api/v1/admin/corrente_grupos.py` com `MEDIUNS`
  (edit para criar/editar/arquivar e pôr/tirar médiuns; leitura com `MEDIUNS` ou `ESCALAS` view via
  `require_any_group_permission`) + `atividades_corrente`.
- Tela `F/pages/admin/mediuns/grupos.tsx` (ou aba em Médiuns): lista com cor e contagem, `CrudDrawer` com
  Combobox de médiuns ativos; no cadastro do médium, campo "Grupos".
- Comunicados (`comunicado_grupos`), tipos de atividade (`atividade_tipo_grupos`) e escalas passam a aceitar grupos.
- Médium inativo/excluído sai dos grupos (mantém histórico das participações).
- Médium vê só o nome do próprio grupo (D-07).

**Aceite**
- [ ] Admin cria grupos com nome e cor e põe médiuns neles
- [ ] Comunicado/atividade para um grupo só aparece para quem está nele
- [ ] Tipo de atividade pode limitar quem é escalado a certos grupos
- [ ] Médium vê o nome do próprio grupo e não vê os outros membros

### AM-24 — Divulgação: "Sou médium" na landing, página de recurso e novidades
- **Prioridade:** P2 · **Fase:** MVP (2.4.0) · **Esforço:** P · **Tipo:** conteúdo + dev · **Depende de:** AM-03, AM-11

**Por quê.** O ORI tem "Entrar como membro" na landing. A Área é argumento de venda contra o "tudo incluso".

**Implementação**
- Link "Recebi um convite / sou médium" no hero e no `/login` (explica que o acesso vem do terreiro).
- Linha "Área do Médium" no quadro de planos (`PlanComparisonTable`) e, quando o C-02 existir, a página
  `/recursos/area-do-medium` com telas reais do terreiro demo (regra do dono: a imagem mostra o que o texto diz).
- Entrada nas novidades da versão (`releaseNotes.ts`) e uma pergunta no FAQ ("Os médiuns têm acesso?").

**Aceite**
- [x] Link na landing e no login (atrás da chave `NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA`, desligada no piloto)
- [x] Quadro de planos com a Área (mesma chave) e a pergunta no FAQ
- [x] Novidades da versão escritas em linguagem de terreiro (2.5.0) (vão com a versão 2.5.0)

### AM-25 — Escala de faxina: grupos por dias do mês
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** G · **Tipo:** dev · **Depende de:** AM-08, AM-17, AM-23
- (v2: card novo; **substitui a parte de zeladoria do F-07**)

**Por quê.** Pedido do dono (v2): "G1 fica com os dias X e Y, G2 com os dias Z e W e G3 com o dia D". Minha Gira
vende "Escalas de Zeladoria" e a pergunta "É a vez de quem limpar o terreiro?"; Quartinha prevê "escalas de
limpeza, cozinha" no estatuto. Nenhum concorrente mostra publicamente escala por grupos em dias escolhidos.

**Implementação** (§8.7)
- Tabelas `escala_planos` (tipo × mês, rascunho/publicado) e `escala_plano_dias` (data × grupo × horário).
- `B/api/v1/admin/escala_planos.py` (`ESCALAS` view/insert/edit + `escalas`):
  `GET/PUT /escala-planos/{tipo_id}/{AAAA-MM}` (rascunho), `POST .../copiar-mes-anterior`, `POST .../girar-grupos`,
  `POST .../distribuir`, `POST .../publicar` (cria/atualiza atividades e participações, com diff na republicação,
  sob `SELECT ... FOR UPDATE`, idempotente), `POST .../atualizar-convocacoes` (só datas futuras).
- Funções puras testadas: copiar por ordem do dia da semana, girar grupos, distribuir em ciclo, diff de publicação.
- Front: aba "Escala de faxina" em `F/pages/admin/atividades.tsx` com grade do mês (7 colunas, células de 44 px),
  fichas de grupo coloridas, tocar para atribuir, resumo em texto, Salvar rascunho / Publicar com `ConfirmDialog`.
  Vale para qualquer tipo com modo "grupos por dia" (ex.: Cozinha).
- Médium: cartão "Sua próxima escala" com grupo e horário, vou/não vou, check-in (AM-17); aviso da véspera (AM-15).

**Aceite**
- [ ] Admin escolhe o mês, cria/usa grupos e toca nos dias para atribuir cada grupo, no celular e no computador
- [ ] Copiar do mês anterior (por dia da semana), girar grupos e distribuir em ciclo funcionam
- [ ] Rascunho não aparece para o médium; publicar cria as faxinas e convoca os membros de cada grupo
- [ ] Republicar cancela dias removidos, troca convocados de dias alterados e preserva respostas do que não mudou
- [ ] Mudança de grupo depois de publicado atualiza só as faxinas futuras
- [ ] Sem o plano Pro, a aba mostra o bloqueio e a API responde 403

### AM-26 — Relatório de assiduidade e justificativas
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-17, AM-23
- (v2: card novo; **substitui o relatório do F-06**)

**Por quê.** O dirigente quer saber quem falta e por quê, por médium e por grupo. AxéCloud fala em "assiduidade";
o ORI gera PDF por médium; Meu Axé (benchmark) tem relatório de ausentes.

**Implementação** (§8.10)
- `GET /api/v1/admin/atividades/assiduidade?inicio&fim&tipo_id&grupo_id&agrupar=medium|grupo` (`ESCALAS` view;
  `agrupar=grupo` exige `escalas`, Pro): convocações, presenças, ausências com e sem justificativa e percentual
  (presentes ÷ convocações com chamada encerrada, sem dispensados).
- Detalhe por médium com a lista de ausências e as justificativas (só na tela, nunca no PDF/CSV).
- Aba "Relatórios" com `DataTable` (`renderCard` no celular) e PDF na base `lib/pdf/pdfDoc`
  (`lib/pdf/assiduidadePdf.ts`; feito em vez do `useRelatorioPDF`, que é o do Relatório de gira).

**Aceite**
- [ ] Relatório por médium e período, filtrável por tipo de atividade, com PDF
- [ ] Relatório por grupo no plano Pro
- [ ] Justificativas visíveis só na tela de quem tem `ESCALAS:view`, fora do PDF
- [ ] Atividade sem chamada encerrada não entra no percentual

### AM-27 — Troca e substituição na escala
- **Prioridade:** P2 · **Fase:** Fase 2 · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-25, AM-18, AM-15

**Por quê.** Quem não pode ir costuma combinar a troca no grupo de WhatsApp e o admin fica sem saber. Nenhum
concorrente mostra troca de escala publicamente (diferencial). Também traz o "quem divide a escala comigo" com
opt-in (D-07, fase 2).

**Implementação**
- Tabela `participacao_trocas` (tenant, participação de origem, médium substituto, status pedido · aceito ·
  aprovado · recusado, datas).
- Médium pede troca indicando um colega elegível (vê só o primeiro nome de quem aceitou aparecer); o colega aceita
  na Área; o admin aprova (ou a casa liga "troca aceita entre médiuns não precisa de aprovação").
- Aprovada: a participação original fica "Substituído" (`substituida_por_id`) e nasce a do substituto com a mesma
  função/grupo; avisos aos envolvidos.
- Abonar justificativa (aceitar/recusar) entra aqui também.

**Aceite**
- [ ] Médium pede troca, colega aceita e admin aprova (ou aprovação automática configurada)
- [ ] Situação "Substituído" aparece para os dois e no relatório
- [ ] Admin pode aceitar ou recusar uma justificativa
- [ ] Opt-in para mostrar o primeiro nome aos colegas de escala

### AM-28 — Modo de presença da casa e check-in com QR do dia
- **Prioridade:** P1 · **Fase:** MVP (2.4.0) · **Esforço:** M · **Tipo:** dev · **Depende de:** AM-17

**Por quê.** Decisão D-11: a casa escolhe se confia na confirmação do médium, se pede check-in pelo app ou se exige o
QR do dia, que só existe no terreiro (sem GPS). Para o QR ser opção desde o lançamento, este card entra na 2.4.0, junto
com a presença. Conversa com o N-06 (check-in do consulente por QR).

**Implementação**
- Token curto por atividade, rotativo (ex.: a cada 60 s), exibido na Porta/modo TV e na tela da chamada.
- O botão "Cheguei" abre a câmera; o servidor confere o token da atividade e a janela.
- Configuração da casa em Configurações da Área (modo padrão: confiança · check-in pelo app · check-in com QR), com
  ajuste por tipo de atividade.

**Aceite**
- [ ] Casa escolhe o modo padrão de presença e pode ajustar por tipo de atividade
- [ ] No modo confiança, quem confirmou conta como presente ao fim da atividade, salvo ausência marcada pelo admin
- [ ] No modo QR, o check-in só é aceito com o código da hora
- [ ] Código exibido na Porta e no modo TV, sem dado pessoal
- [ ] Trocar o modo vale para as atividades futuras, sem alterar presenças já registradas

---

## 11. Ordem de execução

### 11.0 Status de implementação (atualizado em 2026-10-08)

Tudo vai para a produção **desligado**: a Área só vale no terreiro em que a plataforma ligou a chave do piloto
(`tenants.area_medium_liberada`, Tenant 360) e com plano Basic ou superior (D-30).

| Card | PR | Migração | Em produção |
|---|---|---|---|
| T-02 Token tipado | #69 | — | 2026-10-07 |
| AM-00 Estudo de experiência (protótipo validado) | este plano | — | 2026-10-07 |
| AM-02 Fundação de identidade | #71, #76 (rec. 2) | 064, 065 | 2026-10-07 |
| Chave do piloto (AM-01b) | #78 | 066 | 2026-10-07 |
| AM-03 Convite e ativação | #81 | 067 | 2026-10-07 |
| AM-10 Configuração da Área e chave PIX | #80 | 068 | 2026-10-07 |
| AM-04 Escolha de área + AM-06 Casca e Início | #82 | — | 2026-10-07 |
| AM-09 Avisos | #84 | 070, 071 | 2026-10-07 |
| AM-11 Pague aqui + AM-12 Comprovante | #83 | 072 | 2026-10-07 |
| AM-07 Agenda | #86 | 073 | 2026-10-07 |
| Versão 2.4.0 do app (notas "em teste em algumas casas") | #87 | — | 2026-10-07 |
| AM-05 Mesmo e-mail em vários terreiros | #88 | — | 2026-10-08 |
| AM-23 Grupos da corrente | #89 | 075 | 2026-10-08 |
| AM-13 Perfil do médium | #90 | 076 | 2026-10-08 |
| AM-08 Atividades da casa (feature de grupo `ESCALAS`) | #91 | 077, 078 | 2026-10-08 |
| AM-17 Presença + AM-28 Modo de presença e QR do dia | #92 | 079 | 2026-10-08 |
| AM-29 Ajustes do piloto (convocar grupos, QR no iPhone, PIX no Início, remover foto, limite no login) | #93 | — | 2026-10-08 |
| AM-26 Relatório de assiduidade e justificativas (aba Relatórios, PDF sem justificativa) | #94 | — | 2026-10-08 |
| AM-25 Escala de faxina (planejador do mês por grupos) | #95 | 080 | 2026-10-08 |
| AM-15 Lembretes e avisos por e-mail (mensalidade D-3/D+3, véspera, D-2, escala nova, falta, aviso, cancelamento, PIX, resumo do admin) | #96 | 081 | 2026-10-08 |
| AM-18 Escala de gira por função (grupos inteiros, copiar da anterior, rodízio) | #97 | — (usa as colunas da 079) | 2026-10-08 |
| AM-24 Divulgação (atrás da chave NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA, desligada) | #98 | — | 2026-10-08 |
| AM-16 Notificação push (desligada até gerar as chaves VAPID) | #100 | 082 | 2026-10-08 |
| AM-14 Meus dados (exportar JSON/PDF, encerrar o acesso com a senha, "Quem vê o quê", Política 2.3) | #102 | 083 | 2026-10-08 |
| AM-20 Aniversariantes (opt-in no Perfil, cartão da semana no Início, mensagem da casa no dia) | #102 | 083 | 2026-10-08 |

Os números de migração não seguem a ordem dos cards: cards correram em paralelo e as migrações foram renumeradas e
re-encadeadas na hora do merge (a cadeia vale pelo `down_revision`; ver AGENTS.md §11.8).

**Falta da 2.4.0 do plano:** nada de código — ligar a chave da divulgação (AM-24) quando a Área sair do piloto. **Fase 2/3:** AM-19, AM-21, AM-22, AM-27.
**Validação no piloto (dono):** adicionar à agenda no Android/iPhone/navegador do WhatsApp; QR do PIX em 3 bancos;
QR de presença no Android e no iPhone.


**Fase 0 — estudo de experiência (3 semanas, v3).** O AM-00 vem antes de qualquer tela. Enquanto ele roda, só
anda o que não tem tela e que nenhum resultado do estudo muda: o T-02 (token tipado) e a parte de backend do AM-02
(vínculo, papel `medium`, trava do painel, auditores). As telas do AM-02 em diante só começam com o protótipo
validado e o glossário fechados; os textos e o nome da área saem do estudo.

| # | Card | Prio | Fase | Esf. | Observação |
|---|---|---|---|---|---|
| 0 | AM-00 Estudo de experiência e usabilidade | P0 | Fase 0 | G | Antes de qualquer tela; 3 semanas com as casas |
| 0 | T-02 Token tipado | P0 | (pré) | P | Sem tela: corre junto com o AM-00 |
| 1 | AM-01 Decisões | P0 | MVP | P | D-01 a D-13 decididas (feito) |
| 2 | AM-02 Fundação de identidade | P0 | MVP 2.3.0 | G | Base de tudo; backend pode correr junto com o AM-00 |
| 3 | AM-03 Convite e ativação | P0 | MVP 2.3.0 | M | |
| 4 | AM-04 Escolha de área | P0 | MVP 2.3.0 | M | Pode correr junto com AM-03 |
| 5 | AM-06 Casca e Início | P0 | MVP 2.3.0 | M | |
| 6 | AM-10 Configuração e chave PIX | P0 | MVP 2.3.0 | M | Pode correr junto com AM-06 |
| 7 | AM-07 Calendário de giras | P0 | MVP 2.3.0 | M | Resposta já no formato unificado do §8 |
| 8 | AM-09 Comunicados | P0 | MVP 2.3.0 | M | |
| 9 | AM-11 Pague aqui | P0 | MVP 2.3.0 | M | |
| 10 | AM-12 Comprovante e confirmação | P0 | MVP 2.3.0 | M | |
| 11 | AM-05 Mesmo e-mail em vários terreiros | P1 | MVP 2.4.0 | M | Antes de convidar em massa |
| 12 | AM-13 Perfil | P1 | MVP 2.4.0 | M | |
| 13 | AM-23 Grupos da corrente | P1 | MVP 2.4.0 | M | Antes de atividades e escalas |
| 14 | AM-08 Atividades da casa e tipos | P1 | MVP 2.4.0 | G | Cria `ESCALAS`, `atividades_corrente`, `escalas` |
| 15 | AM-17 Presença | P1 | MVP 2.4.0 | G | Substitui o F-06 |
| 16 | AM-28 Modo de presença e check-in com QR | P1 | MVP 2.4.0 | M | Logo depois do AM-17 |
| 17 | AM-25 Escala de faxina | P1 | MVP 2.4.0 | G | Substitui o F-07 (zeladoria) |
| 18 | AM-15 Lembretes por e-mail | P1 | MVP 2.4.0 | M | Véspera da escala, confirmação, justificativa |
| 19 | AM-26 Assiduidade | P1 | MVP 2.4.0 | M | Substitui o relatório do F-06 |
| 20 | AM-18 Escala de gira | P1 | MVP 2.4.0 | M | Substitui o F-07 (gira e rodízio); pode virar 2.5.0 se a 2.4.0 crescer demais |
| 21 | AM-24 Divulgação | P2 | MVP 2.4.0 | P | Fecha o lançamento |
| 22 | AM-22 Baixa automática | P2 | Fase 2 | M | Quando F-02 sair |
| 23 | AM-16 PWA e push | P2 | Fase 2 | G | |
| 24 | AM-27 Troca na escala | P2 | Fase 2 | M | |
| 25 | AM-14 Meus dados | P2 | Fase 2 | M | |
| 26 | AM-19 Ficha e caminhada | P2 | Fase 2 | M | Depois do F-05 |
| 27 | AM-20 Aniversariantes | P3 | Fase 2 | P | |
| 28 | AM-21 Estudos e documentos | P3 | Fase 3 | G | |

Lançamento em duas entregas, cada uma com entrada em `releaseNotes.ts`:
- **2.3.0** (5 a 6 semanas): AM-02, AM-03, AM-04, AM-06, AM-07, AM-09, AM-10, AM-11, AM-12. A Área funciona com
  convite, escolha de área, calendário de giras, comunicados e Pague aqui.
- **2.4.0** (6 a 7 semanas): AM-05, AM-13, AM-23, AM-08, AM-17, AM-28, AM-25, AM-15, AM-26, AM-18, AM-24. Atividades da
  casa, grupos, presença com justificativa, escala de faxina, escala de gira, lembretes e relatório.

**Por que escala de faxina e presença no MVP e não na fase 2** (recomendação D-09): foram pedidas pelo dono, são o
destaque de quem vende área do membro (Minha Gira) e dão ao Pro (D-02) um motivo concreto de upgrade já no
lançamento. O custo é a 2.4.0 ficar grande; se precisar cortar, a escala de gira (AM-18) vai para uma 2.5.0 e a
faxina fica, porque é o exemplo do dono.

---

## 12. Decisões tomadas

**D-01 a D-08: decididas pelo dono em 2026-10-07, todas como recomendado.**

| # | Decisão | Escolha |
|---|---|---|
| D-01 | Plano da Área do Médium | **Basic** (`area_medium`), núcleo completo (§6.5) |
| D-02 | Degraus das fases seguintes | **Escalas e estudos no Pro** (`escalas`, `biblioteca_medium`); baixa automática segue o gateway, com taxa paga pelo terreiro |
| D-03 | Atividade interna | **Tabela própria** (`atividades`, §8), fora do limite de giras, do site, da agenda pública e do sitemap |
| D-04 | Escolha de área | **Lembrar por aparelho** (caixa marcada por padrão) + "Trocar de área" nos dois menus |
| D-05 | Troca da chave PIX | **FINANCEIRO:edit + senha + e-mail a todos os admins + aviso ao médium**, sem `is_admin` |
| D-06 | Impersonação de médium | **Só leitura** (escritas da Área recusam token impersonado) |
| D-07 | O que o médium vê dos outros | **Nada no MVP**; aniversário e colegas de escala com opt-in na fase 2 |
| D-08 | Médium que sai da casa | **Perde acesso** (conta `medium` desativada); histórico sob pedido ao terreiro |

**Decisões da v2 (escalas e presença), tomadas em 2026-10-07:**

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-09 | Escala de faxina e presença: MVP ou fase 2 | MVP (2.4.0) · fase 2 | **MVP 2.4.0**; se cortar, a escala de gira vai para 2.5.0 (§11) |
| D-10 | Plano da presença | Basic · Pro | **Basic** (`atividades_corrente`): no Basic a casa marca quem veio; no Pro planeja quem vem |
| D-11 | Como a presença é confirmada | confiança · janela de horário · QR do dia · GPS | **Configuração da casa** (padrão + ajuste por tipo): **confiança** (padrão; a confirmação do médium basta), **check-in pelo app** na janela ou **check-in com QR** (AM-28, MVP 2.4.0). GPS não, por privacidade e imprecisão |
| D-12 | Prazos | justificativa até N dias; encerramento automático da chamada | **7 dias** para justificar (configurável); **48 h** para encerrar sozinho, só se houve alguma presença |
| D-13 | Abonar justificativa | admin aceita/recusa · basta ter texto | **Basta ter texto no MVP**; aceitar/recusar na fase 2 (AM-27) |

**Decisões de experiência (v3), tomadas pelo dono em 2026-10-07 numa rodada de produto** (substituem as fases de
descoberta e vocabulário do AM-00; ver [estudo-ux-area-do-medium.md](estudo-ux-area-do-medium.md) §6):

| # | Tema | Escolha | Efeito nos cards |
|---|---|---|---|
| D-14 | Nome da área | **Área do Médium** | Menu, convite, escolha de área |
| D-15 | Valor mensal | **Mensalidade** (mesmo termo do painel) | AM-11, AM-12, AM-15 |
| D-16 | Mensagens da casa | **Avisos** na tela (tabelas e rotas internas podem seguir `comunicados`) | AM-09 |
| D-17 | Escala | **"Você está na escala"** (nunca "convocado" na tela do médium) | AM-17, AM-18, AM-25 |
| D-18 | Presença no dia | Botão **"Cheguei"** | AM-17, AM-28 |
| D-19 | Ausência | **"Não vou"** + campo **"Conte o motivo"** (com o aviso de que não precisa detalhar saúde) | AM-17 |
| D-20 | Limpeza | **Faxina** (nome sugerido do tipo; tipos continuam livres) | AM-08, AM-25 |
| D-21 | Termos por casa | **Fixos no MVP**; reavaliar com pedidos reais | AM-10 sem dicionário |
| D-22 | Acesso | **E-mail + senha**, convite enviado pelo WhatsApp (texto pronto) | AM-03 |
| D-23 | Voltar à área | **Ícone na tela inicial já no MVP**: manifesto da Área + passo guiado "Adicionar à tela inicial" no 1º acesso; push segue na fase 2 | AM-06 ganha o manifesto; AM-16 fica só com push |
| D-24 | Início | **Pendências primeiro** (responder escala, mensalidade a vencer/vencida, aviso novo), depois a próxima gira | AM-06 |
| D-25 | Pagamento | **Envio do comprovante** (foto ou PDF) e a casa confirma | AM-12 (sem mudança) |
| D-26 | Tela de giras e atividades | **Agenda** (rota `/medium/agenda`) | AM-07 |
| D-27 | Barra inferior | **Início · Agenda · Avisos · Mensalidade · Perfil**; escala aparece no Início e na Agenda; histórico de presenças no Perfil | AM-06, AM-13, AM-17 |
| D-28 | Leitura de avisos | Dirigente vê **quem leu e quem não leu** | AM-09 (sem mudança) |
| D-29 | Lembretes da mensalidade | **3 dias antes e 3 dias depois** do vencimento se não houver comprovante, tom gentil, a casa pode desligar | AM-15 |

---

**Decisões tomadas durante a implementação (2026-10-07 e 2026-10-08):**

| # | Tema | Escolha |
|---|---|---|
| D-30 | Lançamento | **Chave por terreiro (piloto)**: tudo vai desligado; a plataforma liga casa a casa e, no lançamento, para todos |
| D-31 | Mensalidade no Início | Sobe para "Para você ver agora" só **a partir de 5 dias antes do vencimento** ou atrasada; antes fica em "Acompanhando" |
| D-32 | Operador que também é médium | Desativar no painel tira **só o painel**; continua com a Área |
| D-33 | WhatsApp do convite | Texto simpático com o vocabulário do terreiro ("A nossa casa, <nome>, agora tem a Área do Médium… Axé!"); o e-mail segue discreto |
| D-34 | Textos legais | Termo do médium (v1) e Política de Privacidade 2.2 escritos pelo Claude a pedido do dono (ajustes depois, se ele quiser) |
| D-35 | Convocação | Além de médium por médium, **grupos inteiros** podem ser convocados para uma atividade (AM-29) |
| D-36 | Casa nova com e-mail que já tem conta (ex.: médium abrindo o próprio terreiro) | **Permitido com a senha da conta existente** (08/10): o cadastro pede a senha dessa conta e o admin novo usa a mesma senha; o login pergunta o terreiro (AM-05). **Limite de 5 contas ativas por e-mail mantido** (`MAX_LOGIN_ACCOUNTS`) |

## 13. Riscos gerais

| # | Risco | Mitigação |
|---|---|---|
| R-01 | Médium alcança rota admin que só usa `get_current_user` | `require_backoffice` no router inteiro + teste que varre todas as rotas |
| R-02 | Médium vê dado de outro médium | Rotas "minhas" sem `medium_id`, modo medium no auditor, testes com dois médiuns no mesmo tenant |
| R-03 | Troca maliciosa da chave PIX | Senha, auditoria, e-mail a todos os admins, aviso ao médium (§7.3) |
| R-04 | Colisão de e-mail entre terreiros trava o login | AM-05 antes do convite em massa; aviso no convite quando o e-mail já tem conta em outro terreiro |
| R-05 | Banco de 8 GB cresce com comprovantes e fotos | Compressão no navegador, 2 MB por comprovante, medir `pg_total_relation_size`; armazenamento de objetos antes do AM-21 com upload |
| R-06 | Dado religioso exposto (convite, e-mail, push na tela bloqueada) | Textos discretos, consentimento versionado, push sem conteúdo sensível |
| R-07 | Providers do admin disparam 403/401 na Área | Gate por `areas` no `_app`; 401 força logout (memória `skipAutoLogout`), conferir que nenhuma chamada da Área cai nisso |
| R-08 | Volume de e-mail passa do gratuito do Resend | Medir no AM-15; lembretes agregados; push como canal principal na fase 2 |
| R-09 | Adoção baixa (médium não ativa o convite) | Convite por WhatsApp com texto pronto, convite em lote, Início útil já no primeiro acesso, painel de status do convite |
| R-10 | Escopo cresce (chat, app nativo) | Fora do escopo explícito (§9) |
| R-11 | Âncora da gira divergente (gira excluída ou de outro tenant) | Âncora sem cópia de dados, `ON CONFLICT` na mesma transação, join com `giras.deleted_at`, conferência de tenant no serviço e teste de FK cruzada |
| R-12 | Republicar a escala apaga respostas ou duplica faxinas | Diff puro testado, `SELECT ... FOR UPDATE` no plano, unicidade (`plano`, `data`, `grupo`) e (`atividade`, `médium`) |
| R-13 | Check-in feito de casa | Casa escolhe o modo; quem quer prova física usa o QR do dia (AM-28); admin corrige |
| R-14 | Justificativa com dado de saúde vaza | Aviso no campo, visível só com `ESCALAS:view`, fora de e-mail/push/auditoria/PDF |
| R-15 | 2.4.0 grande demais | Corte previsto: AM-18 para 2.5.0 (§11) |

---

## 14. Fontes externas (acessadas em 07/10/2026)
- AxéCloud: https://axecloud.com.br · https://axecloud.com.br/sistema-de-gestao-para-terreiros ·
  https://axecloud.com.br/recursos · /recursos/portal-filho-de-santo · /recursos/financeiro-pix-mensalidades ·
  /recursos/mural-de-avisos · /recursos/frequencia-check-in · /recursos/notificacoes-push
- Kanzuá: https://kanzua.com.br
- ORI: https://oriapp.com.br (textos do bundle público `/assets/main-*.js`)
- Minha Gira: https://minhagira.com.br
- Quartinha: https://quartinha.com.br (textos do bundle público `/assets/index-*.js`)
- Tupam: https://www.tupam.com.br (textos do bundle público `/assets/index-*.js`)
- Meu Axé: https://meuaxe.com.br (respondeu 403; dados do benchmark de 06/10/2026)
- Pix Automático (regras para recebedor: CNPJ ativo há 6 meses, verificação pelo PSP), Agência Brasil, jun/2025:
  https://agenciabrasil.ebc.com.br/economia/noticia/2025-06/bc-publica-regras-para-evitar-fraudes-por-empresas-no-pix-automatico
- Minha Gira, escalas e presença (v2): https://minhagira.com.br ("Escalas de Zeladoria", "Controle de Presença
  nas giras"); ORI e Quartinha pelos mesmos bundles acima (tipos de ritual, funções, presença, justificativas).
- Pix Agendado Recorrente obrigatório desde 28/10/2024, Fenacon:
  https://fenacon.org.br/noticias/pix-agendado-recorrente-torna-se-obrigatorio/
- BR Code (QR estático EMV, txid, CRC16): "Manual de Padrões para Iniciação do Pix" do Banco Central.
  **Não reconferido nesta pesquisa**; conferir a versão vigente ao implementar o AM-10.

---

## Apêndice A — Cards em formato de linha

```
AM-00 | Estudo de experiência e usabilidade da Área do Médium | P0 | Fase 0 | G | AM-01 | Conversas, teste de vocabulário, protótipo no celular e teste de usabilidade com médiuns e dirigentes antes de qualquer tela; sai glossário, protótipo validado e aceite de UX dos cards.
AM-01 | Decisões do dono da Área do Médium | P0 | MVP | P | — | D-01 a D-08 decididas em 2026-10-07 (todas como recomendado); faltam D-09 a D-13 sobre escalas e presença.
AM-02 | Fundação de identidade: vínculo médium↔usuário, papel medium e trava do painel | P0 | MVP (2.3.0) | G | T-02, AM-01 | Cria mediuns.user_id, papel medium, require_medium, require_backoffice, feature area_medium e auditores para /api/v1/medium.
AM-03 | Convite do médium e ativação da conta | P0 | MVP (2.3.0) | M | AM-02, T-02 | Admin convida por e-mail/WhatsApp; médium cria senha, aceita o termo LGPD e é vinculado ao cadastro.
AM-04 | Login com escolha de área e troca de área | P0 | MVP (2.3.0) | M | AM-02 | Após o login, quem tem as duas áreas escolhe (com lembrar), quem tem uma entra direto; troca nos dois menus.
AM-05 | Mesmo e-mail em mais de um terreiro | P1 | MVP (2.4.0) | M | T-02, AM-02 | Login confere a senha em todas as contas do e-mail e pergunta o terreiro quando mais de uma confere.
AM-06 | Casca da Área do Médium e tela Início | P0 | MVP (2.3.0) | M | AM-02, AM-04 | Layout mobile com a marca do terreiro e Início com próxima gira, avisos não lidos e mensalidade do mês.
AM-07 | Calendário de giras para a corrente | P0 | MVP (2.3.0) | M | AM-06 | Calendário com detalhe da gira, orientações só para a corrente, .ics/Google e botão de divulgar no WhatsApp.
AM-08 | Atividades da casa: tipos configuráveis e atividades internas | P1 | MVP (2.4.0) | G | AM-02, AM-07, AM-23 | Tipos de atividade livres por terreiro (8 sugeridos) e atividades internas fora do site e do limite de giras, com a feature de grupo ESCALAS.
AM-09 | Comunicados | P0 | MVP (2.3.0) | M | AM-02, AM-06 | Admin publica avisos por público com fixar/agendar/expirar; médium lê e o admin vê quem leu.
AM-10 | Configuração da Área e chave PIX do terreiro | P0 | MVP (2.3.0) | M | AM-02, AM-01 | Terreiro liga módulos, define WhatsApp da casa e cadastra a chave PIX com senha, auditoria e aviso aos admins.
AM-11 | Pague sua mensalidade aqui | P0 | MVP (2.3.0) | M | AM-06, AM-10 | Médium vê status e histórico e paga pelo PIX copia-e-cola/QR gerado da chave com valor e txid do mês.
AM-12 | Comprovante enviado pelo médium e confirmação no painel | P0 | MVP (2.3.0) | M | AM-11 | Médium envia comprovante; admin confirma (vira pago e espelha em contas a receber) ou recusa com motivo.
AM-13 | Perfil do médium | P1 | MVP (2.4.0) | M | AM-06 | Médium edita contato, endereço, nascimento e foto; campos da casa travados e internos ocultos.
AM-14 | Meus dados e privacidade (LGPD) | P2 | Fase 2 | M | AM-13 | Exportar os próprios dados e encerrar o acesso revogando o consentimento.
AM-15 | Lembretes e avisos por e-mail | P1 | MVP (2.4.0) | M | AM-09, AM-11, AM-12, AM-17 | Agendador sem duplicidade para mensalidade, véspera da escala/atividade, confirmação pendente, justificativa e comunicado, com resumo diário ao admin.
AM-16 | Instalar no celular (PWA da Área) e notificação push | P2 | Fase 2 | G | AM-06, AM-15 | Manifesto próprio da Área e Web Push (VAPID) para avisos, escalas e mensalidade.
AM-17 | Presença: convocação, vou/não vou com justificativa, check-in e lista de chamada | P1 | MVP (2.4.0) | G | AM-08, AM-06 | Presença em giras, faxinas e atividades: convocação, vou/não vou com justificativa, check-in no app na janela e lista de chamada do admin/porteiro.
AM-18 | Escala de gira: funções e quem trabalha em cada gira | P1 | MVP (2.4.0) | M | AM-08, AM-17, AM-23 | Escala de gira por função (médiuns ou grupo inteiro), copiar da gira anterior e rodízio, no plano Pro.
AM-19 | Minha ficha e minha caminhada | P2 | Fase 2 | M | F-05, AM-13 | Médium vê os campos liberados da ficha espiritual e a linha do tempo; sugestões passam por aprovação.
AM-20 | Aniversariantes da corrente | P3 | Fase 2 | P | AM-13 | Aniversários da semana com opt-in, sem o ano, e parabéns da casa ao aniversariante.
AM-21 | Estudos e documentos da casa | P3 | Fase 3 | G | AM-09, AM-01 (D-02) | Biblioteca de links, textos, PDFs e pontos cantados por público, começando por links externos.
AM-22 | Mensalidade com baixa automática na Área | P2 | Fase 2 | M | F-01, F-02, AM-11 | Com gateway conectado, o Pague aqui gera cobrança dinâmica e a baixa é automática.
AM-23 | Grupos da corrente | P1 | MVP (2.4.0) | M | AM-02 | Grupos da corrente (G1, G2, ogãs, desenvolvimento) como conceito único para escala, público de comunicado e elegibilidade.
AM-24 | Divulgação: Sou médium na landing, página de recurso e novidades | P2 | MVP (2.4.0) | P | AM-03, AM-11 | Link de convite na landing e no login, Área no quadro de planos, FAQ e novidades da versão.
AM-25 | Escala de faxina: grupos por dias do mês | P1 | MVP (2.4.0) | G | AM-08, AM-17, AM-23 | Planejador do mês: admin toca nos dias para atribuir G1/G2/G3, copia o mês anterior ou gira grupos e publica, gerando as faxinas e convocações.
AM-26 | Relatório de assiduidade e justificativas | P1 | MVP (2.4.0) | M | AM-17, AM-23 | Relatório de presença por médium (Basic) e por grupo (Pro), com ausências justificadas ou não e PDF.
AM-27 | Troca e substituição na escala | P2 | Fase 2 | M | AM-25, AM-18, AM-15 | Médium pede troca a um colega, colega aceita, admin aprova; inclui abonar justificativa e opt-in de colegas de escala.
AM-28 | Modo de presença da casa e check-in com QR do dia | P1 | MVP (2.4.0) | M | AM-17 | Casa escolhe confiança, check-in pelo app ou check-in com QR (código rotativo na Porta/TV), com ajuste por tipo.
```

O aceite de cada card (checklist do Trello) é a lista "Aceite" da §10.
