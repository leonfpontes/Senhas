# Schema do Banco de Dados

**Stack:** PostgreSQL 15 · SQLAlchemy 2.0 async · Alembic (19 migrações) · Python 3.11+

Todas as PKs são UUID v4. Todos os timestamps usam timezone=True (UTC). Soft-delete via `deleted_at` nullable.

---

## Classes Base Abstratas

### `Base`
Declarative base do SQLAlchemy. Nenhuma coluna própria — pai de todos os modelos.

### `TimestampedModel(Base)` — `__abstract__ = True`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| `created_at` | `DateTime(tz)` | Não | `datetime.utcnow()` |
| `updated_at` | `DateTime(tz)` | Não | `datetime.utcnow()` · `onupdate=utcnow()` |
| `deleted_at` | `DateTime(tz)` | **Sim** | — |

### `SoftDeleteModel(TimestampedModel)` — `__abstract__ = True`
Herda as 3 colunas de timestamp. Adiciona método `.soft_delete()` que define `deleted_at = now()`. Nenhuma coluna adicional no banco.

---

## Diagrama ER

```
┌──────────────────────────────────────────────────────────────┐
│  DOMAIN: Identity                                            │
│                                                              │
│  tenants ──1:1── tenant_configs                              │
│  tenants ──1:M── users                                       │
│  tenants ──1:1── subscriptions                               │
│  tenants ──1:M── invoices                                    │
│  tenants ──1:M── feature_flags                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  DOMAIN: Core (Senhas)                                       │
│                                                              │
│  tenants ──1:M── giras ──1:M── tickets ──M:1── consulentes  │
│  tenants ──1:M── consulentes                                 │
│  giras   ──1:M── senha_controls (is_sponsor: bool)          │
│  tenants ──1:M── associados                                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  DOMAIN: Estoque                                             │
│                                                              │
│  tenants ──1:M── estoque_grupos ──1:M── estoque_itens        │
│  estoque_itens ──1:M── estoque_movimentacoes                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Audit (imutável)                                            │
│                                                              │
│  tenants ──1:M── audit_logs ──M:1── users                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Domain 1 — Identity

### `tenants`

| Coluna | Tipo SA | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `name` | `String(255)` | Não | — | — |
| `slug` | `String(255)` | Não | — | `UNIQUE`, indexed |
| `description` | `String(500)` | Sim | — | — |
| `is_active` | `Boolean` | Não | `True` | indexed |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_tenants_slug`, `ix_tenants_is_active`

**Relationships (cascade `all, delete-orphan`):** `users`, `giras`, `consulentes`, `tickets`, `senha_controls`, `audit_logs` (sem cascade), `config` (1:1), `subscription` (1:1), `invoices`, `feature_flags`, `associados`

---

### `users`

| Coluna | Tipo SA | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | **Sim** | — | FK → `tenants.id CASCADE`; NULL para SUPER_ADMIN |
| `email` | `String(255)` | Não | — | indexed; único por tenant (`uq_users_tenant_email`, abaixo) |
| `username` | `String(255)` | Não | — | — |
| `full_name` | `String(255)` | Sim | — | adicionado em 008 |
| `phone` | `String(20)` | Sim | — | adicionado em 008 |
| `profile_photo_url` | `String(500)` | Sim | — | adicionado em 008 |
| `profile_photo_data` | `LargeBinary` (BYTEA) | Sim | — | adicionado em 009; foto binária |
| `profile_photo_content_type` | `String(50)` | Sim | — | adicionado em 009; ex.: `image/jpeg` |
| `password_hash` | `String(255)` | Não | — | bcrypt |
| `role` | `Enum(UserRole)` | Não | `OPERATOR` | DB enum `user_role` (`medium` desde a 063 — conta só da Área do Médium) |
| `is_active` | `Boolean` | Não | `True` | indexed |
| `reset_token_hash` | `String(255)` | Sim | — | sha256 do token do "esqueci a senha"; indexed |
| `reset_token_expires_at` | `DateTime(tz)` | Sim | — | validade do link de redefinição |
| `sessions_revoked_at` | `DateTime(tz)` | Sim | — | token emitido antes disto é recusado (troca de senha, "sair de todos") |
| `email_pendente` | `String(255)` | Sim | — | 074 (AM-13): e-mail de login pedido pelo Perfil do médium, ainda não confirmado |
| `email_pendente_token_hash` | `String(64)` | Sim | — | 074: sha256 do token do link enviado ao endereço novo; índice único `uq_users_email_pendente_token_hash` |
| `email_pendente_expira_em` | `DateTime(tz)` | Sim | — | 074: validade (24 h); as três colunas `email_pendente*` são limpas na confirmação (uso único) |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Unique constraints:**
- `uq_users_tenant_email` em `(tenant_id, email)` — e-mail único por tenant (multi-tenant)
- `uq_users_email_superadmin` (partial index) em `(email) WHERE tenant_id IS NULL` — e-mail globalmente único para SUPER_ADMIN

**Indexes:** `ix_users_tenant_id`, `ix_users_is_active`, `ix_users_email`, `ix_users_reset_token_hash`, `uq_users_email_pendente_token_hash` (único, 074)

**Troca do e-mail de login (AM-13, migração 076):** `users.email` só muda quando o link mandado ao endereço novo é
aberto (`POST /api/v1/public/email/confirmar`); aí `mediuns.email` do médium ligado acompanha e o endereço antigo é
avisado. Pedir de novo troca o token (o link anterior deixa de valer).

**Properties:** `.is_super_admin`, `.is_admin`, `.is_operator_or_admin` (falso para `medium`), `.is_medium_only`

**Vínculo com médium (AM-02, migração 065):** `mediuns.user_id` (FK → `users.id` **ON DELETE SET NULL**,
nullable) liga a conta ao cadastro do médium e é o que dá acesso à Área do Médium (`require_medium`).
Índice único parcial `uq_mediuns_user_id_ativo` em `(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL`
(um usuário, no máximo um médium não excluído). `mediuns.area_consentimento_em` (`DateTime(tz)`) e
`mediuns.area_consentimento_versao` (`String(20)`) guardam o aceite LGPD gravado no convite (AM-03).

**Chave do piloto (migração 066):** `tenants.area_medium_liberada` (`Boolean`, padrão `false`). A plataforma liga por
terreiro no Tenant 360; sem ela a Área do Médium não vale, mesmo com plano Basic+ (`check_plan_feature`).

### `medium_convites` (AM-03, migração 067)

Convite da casa para o médium entrar na Área do Médium. O vínculo `mediuns.user_id` só nasce no aceite
(prova de posse do e-mail). Model `MediumConvite(Base)` (sem `updated_at`/`deleted_at`).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `medium_id` | UUID FK → `mediuns.id` CASCADE | |
| `email` | `String(255)` | e-mail do cadastro no momento do convite (minúsculas); se o cadastro mudar, o convite deixa de valer |
| `token_hash` | `String(64)` UNIQUE | sha256 do token opaco `token_urlsafe(32)` — o token em claro só existe no link |
| `expira_em` | `DateTime(tz)` | criação + 7 dias |
| `usado_em` | `DateTime(tz)` NULL | aceite (uso único) |
| `revogado_em` | `DateTime(tz)` NULL | reenviar, cancelar, tirar acesso, trocar o e-mail, inativar ou excluir o médium |
| `criado_por` | UUID FK → `users.id` SET NULL | |
| `created_at` | `DateTime(tz)` | `server_default now()` |

**Indexes:** `ix_medium_convites_tenant_id`, `ix_medium_convites_medium_id` e o único parcial
`uq_medium_convites_aberto` em `(medium_id) WHERE usado_em IS NULL AND revogado_em IS NULL` — no máximo um
convite em aberto por médium (criar outro revoga o anterior antes).

**Configuração da Área e chave PIX (migração 068, AM-10):** colunas `area_medium_*` em `tenant_configs` (abaixo) e,
em `mensalidade_configs`: `pix_tipo` (`String(10)`, CHECK `ck_mensalidade_configs_pix_tipo` em
`cpf/cnpj/email/telefone/aleatoria` — string, não ENUM do PG), `pix_chave` (`String(77)`, já no formato do DICT),
`pix_nome_recebedor` (`String(25)`), `pix_cidade` (`String(15)`), `pix_instrucoes` (`Text`) e `pix_alterado_em`
(`DateTime(tz)`, só muda quando tipo/chave mudam). Trocar a chave: `PUT /admin/financeiro/config/pix` (senha + e-mail
aos admins + auditoria mascarada).

**Comprovante enviado pelo médium (migração 072, AM-11/AM-12):** em `mensalidade_pagamentos`,
`comprovante_enviado_em` (`DateTime(tz)`), `comprovante_enviado_por` (UUID FK → `users.id` **ON DELETE SET NULL**,
`fk_mensalidade_pagamentos_comprovante_enviado_por`), `recusa_motivo` (`Text`, o médium vê) e `recusado_em`
(`DateTime(tz)`). O status continua `PENDENTE` até a casa confirmar (sem valor novo em `mensalidade_status`): "em
conferência" = pendente + `comprovante_enviado_em` + arquivo guardado + sem recusa depois do envio; "não
confirmada" = `recusado_em >= comprovante_enviado_em`. Reenvio limpa a recusa. Comprovante anexado pelo painel não
preenche `comprovante_enviado_em`. Índice parcial `ix_mensalidade_pagamentos_conferir` em
`(tenant_id, comprovante_enviado_em) WHERE comprovante_enviado_em IS NOT NULL AND status = 'PENDENTE'` (fila
"Comprovantes para conferir" sem varrer o BYTEA). O arquivo continua em `comprovante_data` (BYTEA): pela Área o
limite é 2 MB (o navegador reduz a foto antes); pelo painel, 5 MB.

### `comunicados` e `comunicado_leituras` (AM-09, migrações 070/071)

Avisos da casa para a corrente — na tela é **"Avisos"** (D-16); tabelas e API admin seguem `comunicados`.
Model `Comunicado(SoftDeleteModel)` e `ComunicadoLeitura(Base)` (`src/models/comunicados.py`).

`comunicados`:

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `titulo` | `String(120)` | texto simples (HTML e controle removidos ao salvar) |
| `corpo` | `Text` | texto simples com quebras de linha; ≤ 5000 na API; links só viram clicáveis na tela |
| `publico` | `String(20)`, padrão `todos` | CHECK `ck_comunicados_publico` em `todos/atendimento/cambones/grupos` (`grupos` entrou na 075, AM-23, com a tabela `comunicado_grupos`) — string, não ENUM do PG, para crescer sem `ALTER TYPE` |
| `fixado` | `Boolean`, padrão `false` | primeiro da lista |
| `publicar_em` | `DateTime(tz)` | agora ou agendado |
| `expira_em` | `DateTime(tz)` NULL | sai do ar nessa hora |
| `criado_por` | UUID FK → `users.id` SET NULL | |
| `created_at` / `updated_at` / `deleted_at` | `DateTime(tz)` | soft delete = arquivado |

**Indexes:** `ix_comunicados_tenant_id`, `ix_comunicados_tenant_publicar_em` (`tenant_id, publicar_em`).

`comunicado_leituras` (quem leu, D-28):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `comunicado_id` | UUID FK → `comunicados.id` CASCADE | |
| `medium_id` | UUID FK → `mediuns.id` CASCADE | sempre o médium logado (`ctx.medium.id`) |
| `lido_em` | `DateTime(tz)` | `server_default now()`; ler de novo não muda |

**Constraints/Indexes:** UNIQUE `uq_comunicado_leituras_comunicado_medium` (`comunicado_id, medium_id`),
`ix_comunicado_leituras_tenant_id`, `ix_comunicado_leituras_medium_id`.

**Permissão:** valor `comunicados` no ENUM `permission_feature` (070, `ADD VALUE` em `autocommit_block`); a 071
cria as tabelas e dá acesso total à feature nos grupos padrão "Acesso total" (grupos criados pelo admin ficam
sem a feature até ele marcar).

### `corrente_grupos`, `corrente_grupo_membros` e `comunicado_grupos` (AM-23, migração 075)

Grupos da corrente (G1, G2, "Ogãs", "Desenvolvimento"): um conceito só para o público dos avisos e, nos
próximos cards, para escalas e elegibilidade de atividades (AM-08/AM-25). Models em
`src/models/corrente_grupos.py`. Sem feature nova de permissão: usam `MEDIUNS` (§6.7 do plano da Área).

`corrente_grupos`:

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `nome` | `String(60)` | texto simples numa linha |
| `cor` | `String(20)`, padrão `ambar` | CHECK `ck_corrente_grupos_cor` na paleta fechada `ambar/petroleo/violeta/azul/verde/vinho/terra/grafite` (chave, não hex — o hex com contraste AA fica em `frontend/src/constants/correnteGrupos.ts`) |
| `descricao` | `String(300)` NULL | |
| `arquivado_em` | `DateTime(tz)` NULL | arquivado sai das telas e do público dos avisos; os membros ficam gravados |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Constraints/Indexes:** UNIQUE parcial `uq_corrente_grupos_tenant_nome_ativo` (`tenant_id, lower(nome)`)
`WHERE arquivado_em IS NULL`; `ix_corrente_grupos_tenant_id`.

`corrente_grupo_membros`:

| Coluna | Tipo | Notas |
|---|---|---|
| `grupo_id` | UUID FK → `corrente_grupos.id` CASCADE, PK | |
| `medium_id` | UUID FK → `mediuns.id` CASCADE, PK | só médium ativo e não excluído do mesmo terreiro; inativar/excluir o médium apaga as linhas dele |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `desde` | `DateTime(tz)` | `server_default now()` |

**Indexes:** `ix_corrente_grupo_membros_tenant_id`, `ix_corrente_grupo_membros_medium_id`.

`comunicado_grupos` (avisos com `publico = 'grupos'`):

| Coluna | Tipo | Notas |
|---|---|---|
| `comunicado_id` | UUID FK → `comunicados.id` CASCADE, PK | |
| `grupo_id` | UUID FK → `corrente_grupos.id` CASCADE, PK | grupo ativo do mesmo terreiro (conferido na API) |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |

**Indexes:** `ix_comunicado_grupos_tenant_id`, `ix_comunicado_grupos_grupo_id`.

Downgrade da 075: avisos com público `grupos` são arquivados (soft delete) e voltam a `todos` só para caber
no CHECK antigo — nunca ficam visíveis para a corrente inteira.

### `atividade_tipos`, `atividade_tipo_grupos`, `funcoes_corrente` e `atividades` (AM-08, migrações 077/078)

Atividades da casa (§8 do plano da Área do Médium): faxina, rituais, reuniões, desenvolvimento… e a âncora das
giras na camada de escala/presença. Models em `src/models/atividades.py`; regras em `src/services/atividades.py`.
Colunas "enum" são texto com CHECK, valores minúsculos (como `comunicados.publico`). Atividade interna é tabela
própria (D-03): fora do limite de giras/mês, do site, da agenda pública e do sitemap.

`atividade_tipos` (livres por terreiro; 8 sugeridos na 078 e no cadastro/criação pela plataforma —
`ensure_default_atividade_tipos`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `nome` | `String(60)` | texto simples numa linha |
| `natureza` | `String(20)`, padrão `atividade` | CHECK `gira`/`atividade`; um `gira` por terreiro (o tipo de sistema) |
| `icone` | `String(30)` | CHECK na lista fechada (`gira`, `faxina`, `vela`, `flor`, `organizacao`, `curso`, `desenvolvimento`, `reuniao`, `atabaque`, `cozinha`, `estudo`, `estrela`, `folha`, `agua`; desenho em `frontend/src/lib/icons.ts`) |
| `cor` | `String(20)` NULL | CHECK na paleta dos grupos da corrente; NULL = cor do terreiro |
| `controla_presenca` / `pede_confirmacao` / `exige_justificativa` / `checkin_pelo_medium` | `Boolean` | opções de presença (AM-17) |
| `checkin_antes_min` / `checkin_depois_min` | `Integer`, padrão 60/180 | CHECK 0–1440 (janela do "Cheguei") |
| `presenca_modo` | `String(20)` NULL | AM-28 (079): CHECK `confianca/app/qr`; NULL = padrão da casa (`tenant_configs.presenca_modo_padrao`). `checkin_pelo_medium` fica em sincronia (app/qr) por compatibilidade |
| `elegiveis` | `String(20)`, padrão `todos` | CHECK `todos/atendimento/cambones/grupos` |
| `convocacao_padrao` | `String(20)` | CHECK `todos_elegiveis/so_escalados` |
| `modo_escala` | `String(20)` | CHECK `nenhuma/grupos_por_dia/funcoes` |
| `hora_padrao` | `Time` NULL | |
| `duracao_min` | `Integer` NULL | CHECK 15–1440 |
| `visibilidade_padrao` | `String(20)` | CHECK `corrente/convocados` |
| `is_sistema` | `Boolean` | o tipo "Gira" |
| `ordem` | `Integer` | ordem na tela |
| `arquivado_em` | `DateTime(tz)` NULL | arquivado sai das opções de atividade nova |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Constraints/Indexes:** UNIQUE parcial `uq_atividade_tipos_tenant_nome_ativo` (`tenant_id, lower(nome)`)
`WHERE arquivado_em IS NULL`; UNIQUE parcial `uq_atividade_tipos_gira` (`tenant_id`) `WHERE natureza = 'gira'`;
CHECK `ck_atividade_tipos_gira_nao_arquiva` (`natureza <> 'gira' OR arquivado_em IS NULL`);
`ix_atividade_tipos_tenant_id`.

`atividade_tipo_grupos` (grupos elegíveis quando `elegiveis = 'grupos'`): `tipo_id` (FK → `atividade_tipos.id`
CASCADE, PK), `grupo_id` (FK → `corrente_grupos.id` CASCADE, PK; grupo ativo do mesmo terreiro, conferido na
API), `tenant_id`. **Indexes:** `ix_atividade_tipo_grupos_tenant_id`, `ix_atividade_tipo_grupos_grupo_id`.

`funcoes_corrente` (Cambone, Porteiro, Ogã/Atabaque, Cozinha, Limpeza pós-gira — sugeridas): `id`, `tenant_id`,
`nome` (`String(60)`), `descricao` (`String(300)` NULL), `ordem`, `arquivado_em`, timestamps. **Constraints/
Indexes:** UNIQUE parcial `uq_funcoes_corrente_tenant_nome_ativo` (`tenant_id, lower(nome)`) `WHERE arquivado_em
IS NULL`; `ix_funcoes_corrente_tenant_id`.

`atividades`:

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `tipo_id` | UUID FK → `atividade_tipos.id` | tipo ativo do mesmo terreiro, natureza `atividade` (interna) ou o tipo Gira (âncora) |
| `gira_id` | UUID FK → `giras.id` CASCADE NULL | âncora da gira (`services/atividades.atividade_da_gira`, `ON CONFLICT DO NOTHING`); não copia nome/data/local |
| `titulo` | `String(120)` NULL | obrigatório na interna (CHECK) |
| `inicio` / `fim` | `DateTime(tz)` NULL | `inicio` obrigatório na interna; CHECK `fim > inicio` |
| `local` | `String(200)` NULL | |
| `descricao` / `orientacoes` | `Text` NULL | orientações só na Área do Médium |
| `visibilidade` | `String(20)`, padrão `corrente` | CHECK `corrente/convocados` |
| `origem` | `String(20)`, padrão `manual` | CHECK `manual/plano_escala/gira` |
| `escala_plano_dia_id` | UUID NULL | dia do planejador da faxina que gerou a atividade (AM-25). **Sem FK de propósito** (o vínculo com FK é `escala_plano_dias.atividade_id`; FK nos dois sentidos seria um ciclo) — o serviço limpa quando o dia sai do plano |
| `cancelada_em` / `cancelamento_motivo` | `DateTime(tz)` NULL / `String(300)` NULL | cancelar com motivo |
| `chamada_encerrada_em` / `chamada_encerrada_por` | `DateTime(tz)` NULL / UUID FK → `users.id` SET NULL | lista de chamada (AM-17) |
| `created_by` | UUID FK → `users.id` SET NULL | |
| `created_at` / `updated_at` / `deleted_at` | `DateTime(tz)` | soft delete |

**Constraints/Indexes:** UNIQUE parcial `uq_atividades_gira_id` (`gira_id`) `WHERE gira_id IS NOT NULL`;
CHECK `ck_atividades_gira_ou_titulo_inicio` (`gira_id IS NOT NULL OR (titulo IS NOT NULL AND inicio IS NOT
NULL)`); CHECK `ck_atividades_fim_depois_do_inicio`; `ix_atividades_tenant_id`, `ix_atividades_tenant_inicio`
(`tenant_id, inicio`), `ix_atividades_tipo_id`.

**Dados e permissão:** a 077 só acrescenta `escalas` ao ENUM `permission_feature` (`ADD VALUE` em
`autocommit_block`); a 078 cria as tabelas, os 8 tipos e as funções sugeridos para todo terreiro (o tipo
"Desenvolvimento" fica para `atendimento` ou, se a casa já tem um grupo "Desenvolvimento", para ele) e dá acesso
total a `escalas` nos grupos padrão "Acesso total". Downgrade da 078: apaga as linhas `escalas` de
`group_permissions` e as quatro tabelas (o valor do ENUM fica). O planejador da faxina
(`escala_planos`/`escala_plano_dias`) veio no AM-25 (migração 080, abaixo).

### `atividade_participacoes` (AM-17/AM-28, migração 079)

Uma linha por médium por atividade: convocação, resposta, justificativa e presença na MESMA linha (escala
e presença não se sincronizam — são a mesma coisa, §8.1 do plano). Model em `src/models/atividades.py`;
regras em `src/services/presenca.py`. A situação mostrada (convocado, confirmado, ausência avisada,
presente, ausente com/sem justificativa, dispensado, substituído) é **derivada**, nunca gravada.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | sempre o da atividade (que é o da gira âncora) |
| `atividade_id` | UUID FK → `atividades.id` CASCADE | interna ou âncora da gira |
| `medium_id` | UUID FK → `mediuns.id` CASCADE | médium do mesmo terreiro (conferido na API) |
| `convocado` | `Boolean`, padrão false | false só no avulso ("Adicionar quem veio") |
| `origem` | `String(20)`, padrão `elegivel` | CHECK `elegivel/grupo/funcao/rodizio/manual/avulso` |
| `grupo_id` / `funcao_id` | UUID FK → `corrente_grupos.id` / `funcoes_corrente.id` SET NULL | escala (AM-18/AM-25): a função da escala por função (uma por médium por atividade); `grupo_id` com `origem = grupo` = veio de um grupo inteiro; tirado da escala mantém a função e ganha `dispensado_em` |
| `resposta` | `String(20)`, padrão `sem_resposta` | CHECK `sem_resposta/vou/nao_vou`; muda até o início |
| `respondido_em` | `DateTime(tz)` NULL | |
| `justificativa` | `String(500)` NULL | pode ter dado de saúde (§6.8): só com `ESCALAS:view`; nunca em auditoria, e-mail, push ou exportação |
| `justificativa_em` | `DateTime(tz)` NULL | |
| `presenca` | `String(20)`, padrão `nao_registrada` | CHECK `nao_registrada/presente/ausente` |
| `presenca_origem` | `String(20)` NULL | CHECK `checkin_medium/chamada/encerramento/confianca` (`confianca` = "vou" que virou presente no encerramento) |
| `presenca_registrada_em` / `presenca_registrada_por` | `DateTime(tz)` NULL / UUID FK → `users.id` SET NULL | quem marcou (correções do admin ficam registradas) |
| `dispensado_em` | `DateTime(tz)` NULL | tirado da escala ou atividade cancelada (= `cancelada_em`; reativar devolve) |
| `substituida_por_id` | UUID FK → `atividade_participacoes.id` SET NULL | troca de escala (fase 2, AM-27) |
| `lembrete_enviado_em` | `DateTime(tz)` NULL | avisos (AM-15) |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Constraints/Indexes:** UNIQUE `uq_atividade_participacoes_atividade_medium` (`atividade_id, medium_id`) —
o "Cheguei" e a chamada ao mesmo tempo nunca duplicam a linha (`services/presenca.upsert_participacao`:
`INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`); `ix_atividade_participacoes_tenant_medium`
(`tenant_id, medium_id`), `ix_atividade_participacoes_tenant_atividade` (`tenant_id, atividade_id`); CHECKs
`ck_atividade_participacoes_origem/_resposta/_presenca/_presenca_origem`.

**Convocação virtual:** tipo "todos os elegíveis" não grava linha para quem só é esperado — ela nasce quando o
médium responde, faz o "Cheguei", é escalado ou quando a chamada é encerrada (aí para todos os esperados).
**QR do dia** (AM-28): sem tabela — HMAC do (tenant, origem, id, janela de 60 s) com subchave da `SECRET_KEY`.

**Migração 079 (`079_presenca`):** cria a tabela; `tenant_configs.presenca_modo_padrao` (`String(20)`, padrão
`confianca`, CHECK `ck_tenant_configs_presenca_modo`) e `presenca_prazo_justificativa_dias` (`Integer`, padrão
7, CHECK 1–30 `ck_tenant_configs_presenca_prazo`); `atividade_tipos.presenca_modo` + CHECK; dados: tipo com
`checkin_pelo_medium` ligado vira `presenca_modo = 'app'`. Downgrade apaga a tabela e as colunas.

### `escala_planos` e `escala_plano_dias` (AM-25, migração 080)

Planejador do mês da faxina (e de qualquer tipo com `modo_escala = 'grupos_por_dia'`). Model em
`src/models/atividades.py`; regras puras em `src/services/escala_planos.py`; API em
`src/api/v1/admin/escala_planos.py`. O rascunho nunca chega ao médium: só a publicação cria atividades
(`atividades.origem = 'plano_escala'`, título "Faxina · G2") e participações (`origem = 'grupo'`).

`escala_planos` (um por tipo e mês):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `tipo_id` | UUID FK → `atividade_tipos.id` CASCADE | tipo do terreiro com escala "grupos por dia" (conferido na API) |
| `mes` | `Date` | sempre o 1º dia do mês (CHECK `ck_escala_planos_mes_dia_1`, só na migração) |
| `status` | `String(20)`, padrão `rascunho` | CHECK `rascunho/publicado`; publicado continua publicado depois de mexer ("mudanças por publicar") |
| `publicado_em` / `publicado_por` | `DateTime(tz)` NULL / UUID FK → `users.id` SET NULL | última publicação |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Constraints/Indexes:** UNIQUE `uq_escala_planos_tenant_tipo_mes` (`tenant_id, tipo_id, mes`) — a API cria
com `INSERT … ON CONFLICT DO NOTHING` e trava com `SELECT … FOR UPDATE` (publicar e salvar em série);
`ix_escala_planos_tenant_id`.

`escala_plano_dias` (um grupo num dia; um dia pode ter mais de um grupo):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `plano_id` | UUID FK → `escala_planos.id` CASCADE | |
| `data` | `Date` | dia de Brasília, dentro do mês do plano (conferido na API) |
| `grupo_id` | UUID FK → `corrente_grupos.id` CASCADE | grupo ativo do terreiro (arquivado só se já estava no plano) |
| `hora_inicio` / `hora_fim` | `Time` / `Time` NULL | padrão do tipo (`hora_padrao`, `duracao_min`); CHECK `ck_escala_plano_dias_horario` (`hora_fim > hora_inicio`) |
| `atividade_id` | UUID FK → `atividades.id` SET NULL | a atividade gerada ao publicar (NULL = ainda não publicado) |
| `removido` | `Boolean`, padrão false | dia tirado do rascunho DEPOIS de publicado: a linha fica até a próxima publicação, que cancela (ou reaproveita, na troca de grupo) a atividade e apaga a linha |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Constraints/Indexes:** UNIQUE `uq_escala_plano_dias_plano_data_grupo` (`plano_id, data, grupo_id`);
`ix_escala_plano_dias_tenant_id`, `ix_escala_plano_dias_atividade_id`.

**Migração 080 (`080_escala_planos`, após `079_presenca`):** cria as duas tabelas; nada de permissão nova (feature
`ESCALAS` da 077, plano `escalas`). Downgrade apaga as tabelas (as atividades geradas ficam).

---

### `medium_preferencias` e `medium_lembretes_enviados` (AM-15, migração 081 — encadeada depois da 080)

Lembretes e avisos por e-mail da Área do Médium (`services/medium_lembrete_scheduler.py`). Models em
`src/models/medium_lembretes.py`.

`medium_preferencias` (uma linha por médium; sem linha = tudo ligado):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `medium_id` | UUID FK → `mediuns.id` CASCADE | UNIQUE `uq_medium_preferencias_medium` |
| `email_mensalidade` / `email_escalas` / `email_confirmacao` / `email_faltas` / `email_avisos` | `Boolean`, padrão `true` | liga/desliga por grupo de lembretes (Perfil da Área ou link do rodapé) |
| `token_descadastro` | `String(64)` | UNIQUE `uq_medium_preferencias_token`; `token_urlsafe(32)` em claro (vai em todo e-mail; só desliga e-mail) |
| `created_at` / `updated_at` | `DateTime(tz)` | |

**Indexes:** `ix_medium_preferencias_tenant_id`.

`medium_lembretes_enviados` (marca "já mandei", gravada ANTES do envio):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `medium_id` | UUID FK → `mediuns.id` CASCADE NULL | NULL = do terreiro (resumo diário dos administradores) |
| `tipo` | `String(30)` | CHECK `ck_medium_lembretes_enviados_tipo`: `mensalidade_antes`, `mensalidade_depois`, `pix_alterado`, `escala_nova`, `vespera`, `confirmacao`, `falta`, `aviso`, `cancelada`, `resumo_admin` |
| `referencia` | `String(80)` | o que o lembrete cobre: mês `AAAA-MM`, id da atividade/aviso, data do resumo, instante da troca do PIX |
| `enviado_em` | `DateTime(tz)` | `server_default now()` |

**Constraints/Indexes:** índice único parcial `uq_medium_lembretes_enviados_medium` (`tenant_id, tipo,
referencia, medium_id`) `WHERE medium_id IS NOT NULL` e `uq_medium_lembretes_enviados_terreiro` (`tenant_id,
tipo, referencia`) `WHERE medium_id IS NULL`; `ix_medium_lembretes_enviados_medium_id`. Uma vez só com 2
workers: `INSERT … ON CONFLICT DO NOTHING RETURNING` — a segunda transação espera a primeira no índice e não
recebe a linha (teste com duas sessões em `tests/integration_pg/test_am15_lembretes.py`).

**Migração 081 (`081_lembretes`, encadeada na `079_presenca`; pode ser re-encadeada no merge):** cria as duas
tabelas, `tenant_configs.area_medium_lembrete_mensalidade` (`Boolean`, padrão `true`) e
`comunicados.avisar_email`/`avisar_email_em`. Downgrade apaga tabelas e colunas.

---

### `ficha_campos`, `ficha_valores`, `medium_marcos` e `ficha_sugestoes` (F-05/AM-19, migrações 088/089)

`src/models/ficha_espiritual.py`. Dado religioso (LGPD art. 11): feature de permissão própria
`FICHA_ESPIRITUAL` (088 só cria o valor do ENUM; **nenhum grupo ganha acesso** — exceção consciente) e plano
`ficha_espiritual` (Pro). Valores nunca vão para auditoria, exportação, CSV ou e-mail.

`ficha_campos` — campos que a casa configura:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → `tenants.id` CASCADE | |
| `chave` | `String(60)` | derivada do rótulo (`orixa_de_cabeca`); modelos usam `umb_*`/`cdb_*`; UNIQUE (`tenant_id`, `chave`) |
| `rotulo` | `String(80)` | |
| `tipo` | `String(20)`, padrão `texto` | CHECK `ck_ficha_campos_tipo`: `texto/data/lista/sim_nao` |
| `opcoes` | JSONB, nulo | só `lista` (1–30 opções) |
| `tradicao` | `String(20)`, padrão `outra` | CHECK `ck_ficha_campos_tradicao`: `umbanda/candomble/outra` |
| `ordem` | int | |
| `visivel_ao_medium` / `medium_pode_sugerir` | bool, padrão false | sugerir implica visível |
| `arquivado_em` | timestamptz, nulo | arquivado sai da ficha e da Área; valores ficam |

`ficha_valores` — `tenant_id`, `medium_id` (FK `mediuns` CASCADE), `campo_id` (FK `ficha_campos` CASCADE), `valor`
(Text; data em ISO, sim/não em `sim`/`nao`), `atualizado_por` (FK `users` SET NULL), timestamps. UNIQUE
`uq_ficha_valores_medium_campo`; índices `ix_ficha_valores_tenant_id`, `ix_ficha_valores_campo_id`.

`medium_marcos` — linha do tempo: `tenant_id`, `medium_id` (CASCADE), `tipo` (CHECK `ck_medium_marcos_tipo`:
`entrada/batismo/obrigacao/coroacao/outro`), `titulo` (≤ 120), `data` (date), `observacao` (≤ 300),
`visivel_ao_medium` (padrão true), `registrado_por` (FK `users` SET NULL), timestamps.

`ficha_sugestoes` — sugestão do médium: `tenant_id`, `medium_id`, `campo_id` (CASCADE), `valor_sugerido`, `status`
(CHECK `ck_ficha_sugestoes_status`: `pendente/aceita/recusada`), `decidido_em`, `decidido_por` (FK `users` SET NULL),
timestamps. UNIQUE parcial `uq_ficha_sugestoes_pendente` (`medium_id`, `campo_id`) `WHERE status = 'pendente'`.

Colunas em `mediuns` (089): `consentimento_dado_religioso_em` (timestamptz), `consentimento_dado_religioso_por` (FK
`users` SET NULL — a direção que registrou ou o próprio médium), `consentimento_dado_religioso_versao`
(`String(20)`, versão do texto) e `consentimento_dado_religioso_revogado_em` (o médium retirou: as três primeiras
são limpas e os dados ficam inacessíveis até a direção apagá-los). Nenhuma delas sai em `MediumResponse`.

### `tenant_configs`

Configurações, branding e feature flags do tenant. Relação 1:1 com `tenants`.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; `UNIQUE` |
| `logo_url` | `String(500)` | Sim | — | URL externa |
| `logo_data` | `LargeBinary` (BYTEA) | Sim | — | logo binária; adicionado em 009 |
| `logo_content_type` | `String(50)` | Sim | — | ex.: `image/png`; adicionado em 009 |
| `primary_color` | `String(7)` | Não | `"#4f46e5"` | hex; default atualizado em 017 |
| `secondary_color` | `String(7)` | Não | `"#818cf8"` | hex; default atualizado em 017 |
| `endereco` | `String(500)` | Sim | — | adicionado em 011; usado no email "Como chegar" |
| `reply_to_email` | `String(255)` | Sim | — | — |
| `email_signature` | `String(1000)` | Sim | — | — |
| `enable_bulk_operations` | `Boolean` | Não | `True` | — |
| `enable_analytics` | `Boolean` | Não | `True` | sem efeito: nada lê; toggle removido da UI em 2026-10-06 (Analytics segue plano + grupo) |
| `enable_webhooks` | `Boolean` | Não | `False` | — |
| `enable_walk_in` | `Boolean` | Não | `False` | adicionado em 007; habilita emissão walk-in |
| `sponsor_priority_mode` | `String(20)` | Não | `"first"` | `"first"` ou `"interleave"`; adicionado em 006 |
| `validate_associado_on_emit` | `Boolean` | Não | `False` | adicionado em 012; verifica email na tabela `associados` |
| `enable_estoque_log` | `Boolean` | Não | `True` | adicionado em 018 |
| `custom_settings` | `JSON` | Sim | — | dicionário arbitrário |
| `area_medium_ativa` | `Boolean` | Não | `true` | 067 (AM-10): liga/desliga da própria casa; a chave da plataforma (`tenants.area_medium_liberada`) vale por cima |
| `area_medium_boas_vindas` | `Text` | Sim | — | 067: mensagem de boas-vindas da Área (≤ 500 na API) |
| `area_medium_whatsapp` | `String(20)` | Sim | — | 067: WhatsApp da casa, só dígitos com DDI (`5511987654321`) |
| `area_medium_agenda` / `area_medium_avisos` / `area_medium_mensalidade` | `Boolean` | Não | `true` | 067: módulos visíveis na Área (mensalidade também exige `mensalidade_mediun` no plano) |
| `presenca_modo_padrao` | `String(20)` | Não | `confianca` | 079 (AM-28): CHECK `confianca/app/qr` — como a presença é marcada na casa; o tipo pode ajustar |
| `presenca_prazo_justificativa_dias` | `Integer` | Não | `7` | 079 (AM-17): CHECK 1–30 — dias depois da atividade para o médium contar o motivo de uma falta |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Unique constraint:** `uq_tenant_configs_tenant_id` em `(tenant_id)`

**Indexes:** `ix_tenant_configs_tenant_id`

**`sponsor_priority_mode`:**
- `"first"` — blocos contínuos: `assoc_pref → pref → assoc_reg → regular`
- `"interleave"` — intercalação em duas fases: `[assoc_pref ↔ pref]` + `[assoc_reg ↔ regular]`

---

## Domain 2 — Core (Senhas)

### `giras`

Sessão/evento espiritual onde as senhas são emitidas.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; indexed |
| `nome` | `String(255)` | Não | — | — |
| `descricao` | `Text` | Sim | — | — |
| `data_inicio` | `DateTime(tz)` | Não | — | indexed |
| `data_fim` | `DateTime(tz)` | Sim | — | — |
| `local` | `String(255)` | Sim | — | mantido no schema; removido da UI (endereço vem de `tenant_configs.endereco`) |
| `is_active` | `Boolean` | Não | `True` | indexed |
| `max_tickets` | `Integer` | Sim | — | adicionado em 004 |
| `release_start_at` | `DateTime(tz)` | Sim | — | início da liberação de senhas; adicionado em 004 |
| `release_end_at` | `DateTime(tz)` | Sim | — | fim da liberação; adicionado em 004 |
| `sponsor_max_tickets` | `Integer` | Sim | — | limite para associados; adicionado em 006 |
| `sponsor_release_start_at` | `DateTime(tz)` | Sim | — | liberação para associados; adicionado em 006 |
| `sponsor_release_end_at` | `DateTime(tz)` | Sim | — | adicionado em 006 |
| `recados` | `Text` | Sim | — | vai para o consulente (e-mail da senha e bilhete) |
| `orientacoes_corrente` | `Text` | Sim | — | 069 (AM-07): o que levar / chegada da corrente. Só na Área do Médium (Agenda, `.ics`, Início); nunca em rota pública, site, e-mail ou bilhete. ≤ 2000 na API |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_giras_tenant_id`, `ix_giras_data_inicio`, `ix_giras_is_active`

---

### `tickets`

Entidade core — representa uma senha emitida para um consulente.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; indexed |
| `gira_id` | `UUID` | Não | — | FK → `giras.id CASCADE`; indexed |
| `consulente_id` | `UUID` | Não | — | FK → `consulentes.id CASCADE`; indexed |
| `emitido_por_id` | `UUID` | **Sim** | — | FK → `users.id`; NULL para emissão pública; tornada nullable em 004 |
| `numero` | `Integer` | Não | — | sequencial por gira/tipo; indexed |
| `status` | `Enum(TicketStatus)` | Não | `EMITTED` | DB enum `ticket_status`; indexed |
| `is_sponsor` | `Boolean` | Não | `False` | True = associado; adicionado em 006 |
| `is_walk_in` | `Boolean` | Não | `False` | True = walk-in presencial; adicionado em 007 |
| `observacoes` | `Text` | Sim | — | JSON com flags: veja estrutura abaixo |
| `checkin_em` | `DateTime(tz)` | Sim | — | check-in na porta; adicionado em 005; indexed |
| `atendido_em` | `DateTime(tz)` | Sim | — | adicionado em 005 |
| `chamado_em` | `DateTime(tz)` | Sim | — | quando chamado na fila |
| `finalizado_em` | `DateTime(tz)` | Sim | — | quando atendido/finalizado |
| `medium_nome` | `String(255)` | Sim | — | adicionado em 005 |
| `cambone_nome` | `String(255)` | Sim | — | adicionado em 005 |
| `atendimento_descricao` | `Text` | Sim | — | adicionado em 005 |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base; indexed |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_tickets_tenant_id`, `ix_tickets_gira_id`, `ix_tickets_consulente_id`, `ix_tickets_status`, `ix_tickets_numero`, `ix_tickets_created_at`

**Property:** `.is_active` → `status in (EMITTED, CALLED)`

#### Estrutura do campo `observacoes` (JSON em TEXT)

O campo `observacoes` armazena um objeto JSON com flags booleanas. Possíveis valores:

```json
{}                                          // ticket comum sem flags
{"preferencial": true}                      // preferencial (não associado)
{"patrocinador": true}                      // associado regular (is_sponsor=true)
{"patrocinador": true, "preferencial": true} // associado preferencial
```

**Lógica de construção** em `emit_ticket.py`:
```python
obs_payload: dict = {}
if is_sponsor:
    obs_payload["patrocinador"] = True
if request.preferencial:
    obs_payload["preferencial"] = True
observacoes = json.dumps(obs_payload) if obs_payload else None
```

> `is_sponsor` (coluna booleana) e `preferencial` (flag em `observacoes`) são **independentes** e podem coexistir. O campo `is_sponsor` é a fonte de verdade para o tipo de ticket; `observacoes` carrega metadados adicionais.

---

### `consulentes`

Pessoa que solicita uma senha.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; indexed |
| `nome` | `String(255)` | Não | — | — |
| `email` | `String(255)` | Sim | — | indexed |
| `email_normalized` | `String(255)` | Sim | — | lowercase; adicionado em 004; indexed |
| `telefone` | `String(20)` | Sim | — | indexed |
| `phone_normalized` | `String(20)` | Sim | — | adicionado em 004 |
| `cpf` | `String(11)` | Sim | — | dígitos sem máscara (LGPD) |
| `endereco` | `Text` | Sim | — | — |
| `observacoes` | `Text` | Sim | — | notas livres |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_consulentes_tenant_id`, `ix_consulentes_email`, `ix_consulentes_telefone`

---

### `senha_controls`

Controle atômico de numeração para emissão de senhas. Usa `SELECT FOR UPDATE` para garantir atomicidade sob concorrência.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; indexed |
| `gira_id` | `UUID` | Não | — | FK → `giras.id CASCADE`; indexed |
| `is_sponsor` | `Boolean` | Não | `False` | separa contador regular/associado; adicionado em 006 |
| `proximo_numero` | `Integer` | Não | `1` | próximo número a emitir |
| `version` | `Integer` | Não | `0` | optimistic lock counter |
| `total_emitido` | `Integer` | Não | `0` | total informacional |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Unique constraint:** `uq_senha_control_tenant_gira_sponsor` em `(tenant_id, gira_id, is_sponsor)`

**Indexes:** `ix_senha_controls_tenant_id`, `ix_senha_controls_gira_id`

> Cada gira tem **dois** registros `senha_control`: um com `is_sponsor=False` (numeros regulares) e um com `is_sponsor=True` (numeros de associados). Os contadores são independentes.

---

### `associados`

Lista de e-mails cadastrados como associados (membros) do tenant. Usada para validar emissão de senhas de associado quando `tenant_configs.validate_associado_on_emit = True`.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE` |
| `nome` | `String(255)` | Não | — | — |
| `email` | `String(255)` | Não | — | casing original |
| `email_normalized` | `String(255)` | Não | — | lowercase; parte da UK |
| `telefone` | `String(20)` | Sim | — | — |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Unique constraint:** `uq_associados_tenant_email` em `(tenant_id, email_normalized)`

**Indexes:** `ix_associados_tenant_id`, `ix_associados_email_normalized`

---

## Domain 3 — Platform / Billing

### `subscriptions`

Plano de assinatura do tenant. Relação 1:1 com `tenants`.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE`; `UNIQUE` |
| `plan` | `Enum(PlanType)` | Não | `BASIC` | DB default `FREE` definido em 016 |
| `status` | `Enum(SubscriptionStatus)` | Não | `ACTIVE` | — |
| `max_users` | `Integer` | Não | — | limite definido no plano |
| `max_giras_per_month` | `Integer` | Não | — | limite definido no plano |
| `current_users` | `Integer` | Não | `0` | — |
| `monthly_price` | `Float` | Não | — | — |
| `currency` | `String(3)` | Não | `"USD"` | — |
| `is_trial` | `Boolean` | Não | `False` | — |
| `trial_ends_at` | `DateTime(tz)` | Sim | — | — |
| `billing_cycle_start` | `DateTime(tz)` | Não | `now(utc)` | — |
| `billing_cycle_end` | `DateTime(tz)` | Sim | — | — |
| `auto_renew` | `Boolean` | Não | `True` | — |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_subscriptions_tenant_id`, `ix_subscriptions_plan`, `ix_subscriptions_status`

---

### `invoices`

Registro de faturamento vinculado ao tenant.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE` |
| `invoice_number` | `String(100)` | Não | — | `UNIQUE`; alargado de 50→100 em 015 |
| `period_start` | `DateTime(tz)` | Não | — | indexed |
| `period_end` | `DateTime(tz)` | Não | — | — |
| `subtotal` | `Float` | Não | — | — |
| `tax_amount` | `Float` | Não | `0.0` | — |
| `discount_amount` | `Float` | Não | `0.0` | — |
| `total_amount` | `Float` | Não | — | — |
| `status` | `Enum(InvoiceStatus)` | Não | `DRAFT` | DB enum `invoice_status` |
| `paid_amount` | `Float` | Não | `0.0` | — |
| `payment_method` | `String(50)` | Sim | — | `credit_card` / `bank_transfer` / `pix` |
| `payment_reference` | `String(255)` | Sim | — | referência de pagamento externo |
| `due_date` | `DateTime(tz)` | Não | — | — |
| `paid_at` | `DateTime(tz)` | Sim | — | — |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_invoices_tenant_id`, `ix_invoices_status`, `ix_invoices_period_start`

---

### `feature_flags`

Feature flags por tenant. Permite ativar/desativar capacidades específicas com expiração opcional.

> **Não lida por nenhum código** (2026-10-06): só a API `/api/v1/platform/feature-flags` grava e
> lista. A aba "Flags" de `/platform/settings` foi removida por isso (AGENTS.md §11.18).

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE` |
| `feature` | `String(100)` | Não | — | ex.: `advanced_analytics`, `white_label` |
| `enabled` | `Boolean` | Não | `False` | — |
| `expires_at` | `DateTime(tz)` | Sim | — | desabilita automaticamente |
| `description` | `String(500)` | Sim | — | — |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_feature_flags_tenant_id`, `ix_feature_flags_feature`

---

## Domain 4 — Estoque

### `estoque_grupos`

Categorias para agrupamento de itens no estoque.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE` |
| `nome` | `String(255)` | Não | — | — |
| `descricao` | `Text` | Sim | — | — |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_estoque_grupos_tenant_id`

---

### `estoque_itens`

Itens específicos do inventário, opcionalmente agrupados.

| Coluna | Tipo SA | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `UUID` | Não | `uuid4` | PK |
| `tenant_id` | `UUID` | Não | — | FK → `tenants.id CASCADE` |
| `grupo_id` | `UUID` | **Sim** | — | FK → `estoque_grupos.id SET NULL` |
| `nome` | `String(255)` | Não | — | — |
| `descricao` | `Text` | Sim | — | — |
| `unidade_medida` | `String(10)` | Não | `"UN"` | ex.: `UN`, `KG`, `LT` |
| `estoque_minimo` | `Integer` | Não | `0` | threshold de reposição |
| `custo_unitario` | `Numeric(10,2)` | Sim | — | custo por unidade |
| `observacoes` | `Text` | Sim | — | notas livres |
| `foto_data` | `LargeBinary` (BYTEA) | Sim | — | foto binária do item |
| `foto_content_type` | `String(50)` | Sim | — | ex.: `image/jpeg` |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Indexes:** `ix_estoque_itens_tenant_id`, `ix_estoque_itens_grupo_id`

---

### `estoque_movimentacoes`

Ledger imutável de movimentações de estoque. Herda de `TimestampedModel` (não de `SoftDeleteModel` — registros não devem ser deletados).

| Coluna | Tipo SA | Nullable | Notas |
|---|---|---|---|
| `id` | `UUID` | Não | PK |
| `tenant_id` | `UUID` | Não | FK → `tenants.id CASCADE` |
| `item_id` | `UUID` | Não | FK → `estoque_itens.id RESTRICT` (corrigido em 019 para proteger integridade do ledger) |
| `usuario_id` | `UUID` | Sim | FK → `users.id SET NULL` |
| `tipo` | `Enum(EstoqueMovimentacaoTipo)` | Não | DB enum `estoque_movimentacao_tipo` |
| `quantidade` | `Integer` | Não | positivo; tipo define direção |
| `motivo` | `Text` | Sim | descrição livre |
| `data_movimentacao` | `DateTime(tz)` | Não | indexed |
| `requisitante` | `String(255)` | Sim | nome do requisitante |
| `created_at` | `DateTime(tz)` | Não | from base |
| `updated_at` | `DateTime(tz)` | Não | from base |

**Indexes:** `ix_estoque_mov_tenant_id`, `ix_estoque_mov_item_id`, `ix_estoque_mov_data`

---

## Audit

### `audit_logs`

Trail imutável de todas as operações (compliance LGPD). Herda de `Base` diretamente — **sem** `updated_at` nem `deleted_at` (removidos na migração 013).

| Coluna | Tipo SA | Nullable | Notas |
|---|---|---|---|
| `id` | `UUID` | Não | PK |
| `tenant_id` | `UUID` | Sim | FK → `tenants.id CASCADE`; NULL para eventos da plataforma |
| `user_id` | `UUID` | Sim | FK → `users.id SET NULL`; NULL para ações não autenticadas |
| `action` | `Enum(AuditAction)` | Não | DB enum `audit_action` |
| `resource_type` | `String(100)` | Não | ex.: `"User"`, `"Ticket"`, `"Gira"` |
| `resource_id` | `UUID` | Sim | ID do recurso tocado |
| `details` | `JSON` | Sim | contexto adicional da operação |
| `created_at` | `DateTime(tz)` | Não | Python-side default; indexed |

**Indexes:** `ix_audit_logs_tenant_id`, `ix_audit_logs_user_id`, `ix_audit_logs_created_at`, `ix_audit_logs_action`, `ix_audit_logs_resource_type`

> Registros de `audit_logs` **nunca** são atualizados ou deletados.

---

## Enums

> **Convenção SQLAlchemy 2.0 (obrigatória):** Todos os enums com valores lowercase no banco devem usar
> `values_callable=lambda x: [e.value for e in x]` no `SQLEnum(...)` do model. Isso força o SQLAlchemy
> a usar o `.value` do enum (ex: `"admin"`) em vez do `.name` (ex: `"ADMIN"`) nas queries.
> Enums com valores UPPERCASE no banco (plan_type, mensalidade_status) NÃO usam values_callable.

| DB Enum Name | Valores no banco (PostgreSQL) | Python `.value` | Model usa `values_callable`? | Criado em |
|---|---|---|---|---|
| `user_role` | `super_admin`, `admin`, `operator`, `medium` | lowercase | ✅ sim | 002 (renomeado para lowercase em maio/2026); `medium` na 063 (AM-02) |
| `ticket_status` | `emitted`, `called`, `completed`, `cancelled`, `no_show` | lowercase | ✅ sim | 002 (renomeado para lowercase em maio/2026) |
| `audit_action` | `create`, `read`, `update`, `delete`, `login`, `logout`, `token_refresh`, `TENANT_DELETED` | lowercase (exceto TENANT_DELETED) | ✅ sim | 002 (renomeado para lowercase em maio/2026) |
| `subscription_status` | `active`, `suspended`, `cancelled`, `expired` | lowercase | ✅ sim | 003 (renomeado para lowercase em maio/2026) |
| `invoice_status` | `draft`, `sent`, `paid`, `overdue`, `cancelled` | lowercase | ✅ sim | 003 (renomeado para lowercase em maio/2026) |
| `estoque_movimentacao_tipo` | `entrada`, `saida` | lowercase | ✅ sim | 018 |
| `plan_type` | `FREE`, `BASIC`, `PRO`, `PREMIUM` | uppercase (= nome) | ❌ não (usa `.name`) | 003 |
| `mensalidade_status` | `PENDENTE`, `PAGO`, `ISENTO` | uppercase (= nome) | ❌ não | 027 |
| `site_status` | `DRAFT`, `PUBLISHED`, `UNPUBLISHED` | uppercase (= nome) | ❌ não | 036 |
| `site_section_type` | `HERO`, `ABOUT`, `VIDEO_EMBED`, ... | uppercase (= nome) | ❌ não | 036 |

### Regra para novos enums

Ao criar um novo enum em Alembic + model Python:
- Se valores serão **lowercase** no banco: usar `values_callable=lambda x: [e.value for e in x]` e `.value = "lowercase"`
- Se valores serão **UPPERCASE** no banco: não usar `values_callable`; `.value` e `.name` iguais
- Nunca misturar: DB uppercase com `values_callable` (ou vice-versa) causa `LookupError` em runtime

---

## Limites por Plano

| Plano | Max Users | Max Giras/Mês | Max Médiuns | Preço/Mês |
|---|---|---|---|---|
| FREE | ilimitado (99999) | 2 | 0 | R$ 0 |
| BASIC | ilimitado (99999) | 3 | 15 | R$ 49 |
| PRO | ilimitado (99999) | 4 | 30 | R$ 79 |
| PREMIUM | ilimitado (99999) | ilimitado (999999) | ilimitado (9999999) | R$ 99 |

> Fonte: `PLAN_LIMITS` em `backend/src/repositories/subscription_repo.py` (reestruturação de out/2026).
> Os valores são copiados para a linha de `subscriptions` (`max_users`, `max_giras_per_month`,
> `max_mediuns`) na troca de plano e é ela que o runtime lê (`effective_limit`). Mudou um número,
> crie migração de dados para as assinaturas existentes (ex.: `059_planos_limites_out_2026`,
> `060_usuarios_ilimitados`). Usuários não têm limite em nenhum plano desde out/2026: o campo
> `max_users` fica com o sentinela 99999 e não é mais checado.

---

## Cadeia de Migrações Alembic

| # | Revisão | down_revision | Descrição |
|---|---|---|---|
| 1 | `001_init_schema` | `None` | No-op — substituída por 002 |
| 2 | `002_create_tables` | `001_init_schema` | Tabelas core: `tenants`, `users`, `giras`, `consulentes`, `tickets`, `senha_controls`, `audit_logs`; enums `user_role`, `ticket_status`, `audit_action` |
| 3 | `003_platform_tables` | `002_create_tables` | `subscriptions`, `invoices`, `feature_flags`; enums `plan_type`, `subscription_status`, `invoice_status`; `users.tenant_id` nullable para SUPER_ADMIN |
| 4 | `004_gira_senha_fields` | `003_platform_tables` | `giras.(max_tickets, release_start_at, release_end_at)`; `consulentes.(email_normalized, phone_normalized)`; `tickets.emitido_por_id` nullable |
| 5 | `005_ticket_door_fields` | `004_gira_senha_fields` | `tickets.(checkin_em, atendido_em, medium_nome, cambone_nome, atendimento_descricao)` |
| 6 | `006_sponsor_tickets` | `005_ticket_door_fields` | `giras.(sponsor_max_tickets, sponsor_release_*)`; `tickets.is_sponsor`; `senha_controls.is_sponsor` + nova UK; `tenant_configs.sponsor_priority_mode` |
| 7 | `007_walk_in_tickets` | `006_sponsor_tickets` | `tenant_configs.enable_walk_in`; `tickets.is_walk_in` |
| 8 | `008_user_profile_fields` | `007_walk_in_tickets` | `users.(full_name, phone, profile_photo_url)` |
| 9a | `009_image_binary_storage` | `008_user_profile_fields` | `tenant_configs.(logo_data, logo_content_type)`; `users.(profile_photo_data, profile_photo_content_type)` |
| 9b | `009_repair_missing_004_fields` | `008_user_profile_fields` | Repair idempotente de colunas missing em DBs legados |
| 10 | `010_merge_009_heads` | `(009a, 009b)` | Merge no-op — colapsa dois heads 009 |
| 11 | `011_tenant_endereco` | `010_merge_009_heads` | `tenant_configs.endereco` |
| 12 | `012_associados` | `011_tenant_endereco` | Cria tabela `associados`; `tenant_configs.validate_associado_on_emit` |
| 13 | `013_audit_logs_drop_timestamps` | `012_associados` | Remove `audit_logs.(updated_at, deleted_at)` — tabela imutável |
| 14 | `014_add_free_plan_type` | `013_audit_logs_drop_timestamps` | `ALTER TYPE plan_type ADD VALUE 'FREE'` |
| 15 | `015_widen_invoice_number` | `014_add_free_plan_type` | `invoices.invoice_number`: `VARCHAR(50)` → `VARCHAR(100)` |
| 16 | `016_remove_enterprise_plan` | `015_widen_invoice_number` | Remove `ENTERPRISE`; migra para `PREMIUM`; normaliza para uppercase; default → `FREE` |
| 17 | `017_default_brand_colors` | `016_remove_enterprise_plan` | Data migration: atualiza `tenant_configs` de preto/branco para índigo (`#4f46e5`/`#818cf8`) |
| 18 | `018_estoque` | `017_default_brand_colors` | Cria `estoque_grupos`, `estoque_itens`, `estoque_movimentacoes`; enum `estoque_movimentacao_tipo`; `tenant_configs.enable_estoque_log` |
| 19 | `019_fix_movimentacoes_fk` | `018_estoque` | `estoque_movimentacoes.item_id` FK: `CASCADE` → `RESTRICT` (protege integridade do ledger) |

A tabela acima vai até a 019. A cadeia completa e a head atual (`089_ficha_espiritual`, F-05/AM-19) estão em
AGENTS.md §11.8.

### Comandos Alembic

```bash
# Aplicar todas as migrações
alembic upgrade head

# Criar nova migração via autogenerate
alembic revision --autogenerate -m "descricao_em_snake_case"

# Reverter a última migração
alembic downgrade -1

# Ver histórico
alembic history --verbose

# Ver migração atual
alembic current
```

---

## Resumo de Índices e Constraints

| Tabela | Coluna(s) | Tipo |
|---|---|---|
| `tenants` | `slug` | UNIQUE + B-tree |
| `tenants` | `is_active` | B-tree |
| `users` | `(tenant_id, email)`; `(email) WHERE tenant_id IS NULL`; `(email_pendente_token_hash)` | UNIQUE |
| `users` | `tenant_id`, `is_active`, `email` | B-tree |
| `tenant_configs` | `(tenant_id)` | UNIQUE |
| `giras` | `tenant_id`, `data_inicio`, `is_active` | B-tree |
| `tickets` | `tenant_id`, `gira_id`, `consulente_id`, `status`, `numero`, `created_at` | B-tree |
| `consulentes` | `tenant_id`, `email`, `telefone` | B-tree |
| `senha_controls` | `(tenant_id, gira_id, is_sponsor)` | UNIQUE |
| `senha_controls` | `tenant_id`, `gira_id` | B-tree |
| `associados` | `(tenant_id, email_normalized)` | UNIQUE |
| `associados` | `tenant_id`, `email_normalized` | B-tree |
| `subscriptions` | `tenant_id`, `plan`, `status` | B-tree |
| `invoices` | `invoice_number` | UNIQUE |
| `invoices` | `tenant_id`, `status`, `period_start` | B-tree |
| `feature_flags` | `tenant_id`, `feature` | B-tree |
| `estoque_grupos` | `tenant_id` | B-tree |
| `estoque_itens` | `tenant_id`, `grupo_id` | B-tree |
| `estoque_movimentacoes` | `tenant_id`, `item_id`, `data_movimentacao` | B-tree |
| `audit_logs` | `tenant_id`, `user_id`, `created_at`, `action`, `resource_type` | B-tree |
| `medium_convites` | `token_hash` | UNIQUE |
| `medium_convites` | `(medium_id) WHERE usado_em IS NULL AND revogado_em IS NULL` | UNIQUE parcial (`uq_medium_convites_aberto`) |
| `medium_convites` | `tenant_id`, `medium_id` | B-tree |
| `comunicados` | `tenant_id`, `(tenant_id, publicar_em)` | B-tree |
| `comunicado_leituras` | `(comunicado_id, medium_id)` | UNIQUE (`uq_comunicado_leituras_comunicado_medium`) |
| `comunicado_leituras` | `tenant_id`, `medium_id` | B-tree |
| `corrente_grupos` | `(tenant_id, lower(nome)) WHERE arquivado_em IS NULL` | UNIQUE parcial (`uq_corrente_grupos_tenant_nome_ativo`) |
| `corrente_grupos` | `tenant_id` | B-tree |
| `corrente_grupo_membros` | `(grupo_id, medium_id)` | PK |
| `corrente_grupo_membros` | `tenant_id`, `medium_id` | B-tree |
| `comunicado_grupos` | `(comunicado_id, grupo_id)` | PK |
| `comunicado_grupos` | `tenant_id`, `grupo_id` | B-tree |
| `atividade_tipos` | `(tenant_id, lower(nome)) WHERE arquivado_em IS NULL` | UNIQUE parcial (`uq_atividade_tipos_tenant_nome_ativo`) |
| `atividade_tipos` | `(tenant_id) WHERE natureza = 'gira'` | UNIQUE parcial (`uq_atividade_tipos_gira`) |
| `atividade_tipos` | `tenant_id` | B-tree |
| `atividade_tipo_grupos` | `(tipo_id, grupo_id)` | PK |
| `atividade_tipo_grupos` | `tenant_id`, `grupo_id` | B-tree |
| `funcoes_corrente` | `(tenant_id, lower(nome)) WHERE arquivado_em IS NULL` | UNIQUE parcial (`uq_funcoes_corrente_tenant_nome_ativo`) |
| `funcoes_corrente` | `tenant_id` | B-tree |
| `atividades` | `(gira_id) WHERE gira_id IS NOT NULL` | UNIQUE parcial (`uq_atividades_gira_id`) |
| `atividades` | `tenant_id`, `(tenant_id, inicio)`, `tipo_id` | B-tree |
