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
| `email` | `String(255)` | Não | — | `UNIQUE`, indexed |
| `username` | `String(255)` | Não | — | — |
| `full_name` | `String(255)` | Sim | — | adicionado em 008 |
| `phone` | `String(20)` | Sim | — | adicionado em 008 |
| `profile_photo_url` | `String(500)` | Sim | — | adicionado em 008 |
| `profile_photo_data` | `LargeBinary` (BYTEA) | Sim | — | adicionado em 009; foto binária |
| `profile_photo_content_type` | `String(50)` | Sim | — | adicionado em 009; ex.: `image/jpeg` |
| `password_hash` | `String(255)` | Não | — | bcrypt |
| `role` | `Enum(UserRole)` | Não | `OPERATOR` | DB enum `user_role` |
| `is_active` | `Boolean` | Não | `True` | indexed |
| `created_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `updated_at` | `DateTime(tz)` | Não | `utcnow()` | from base |
| `deleted_at` | `DateTime(tz)` | Sim | — | soft-delete |

**Unique constraint:** `uq_users_email` em `(email)`

**Indexes:** `ix_users_tenant_id`, `ix_users_is_active`, `ix_users_email`

**Properties:** `.is_super_admin`, `.is_admin`

---

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
| `enable_analytics` | `Boolean` | Não | `True` | — |
| `enable_webhooks` | `Boolean` | Não | `False` | — |
| `enable_walk_in` | `Boolean` | Não | `False` | adicionado em 007; habilita emissão walk-in |
| `sponsor_priority_mode` | `String(20)` | Não | `"first"` | `"first"` ou `"interleave"`; adicionado em 006 |
| `validate_associado_on_emit` | `Boolean` | Não | `False` | adicionado em 012; verifica email na tabela `associados` |
| `enable_estoque_log` | `Boolean` | Não | `True` | adicionado em 018 |
| `custom_settings` | `JSON` | Sim | — | dicionário arbitrário |
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

| DB Enum Name | Valores | Criado em |
|---|---|---|
| `user_role` | `SUPER_ADMIN`, `ADMIN`, `OPERATOR` | 002 |
| `ticket_status` | `EMITTED`, `CALLED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` | 002 |
| `audit_action` | `CREATE`, `READ`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `TOKEN_REFRESH` | 002 |
| `plan_type` | `FREE`, `BASIC`, `PRO`, `PREMIUM` | 003 → FREE adicionado em 014 → ENTERPRISE removido e normalizado em 016 |
| `subscription_status` | `active`, `suspended`, `cancelled`, `expired` | 003 |
| `invoice_status` | `draft`, `sent`, `paid`, `overdue`, `cancelled` | 003 |
| `estoque_movimentacao_tipo` | `entrada`, `saida` | 018 |

---

## Limites por Plano

| Plano | Max Users | Max Giras/Mês | Preço/Mês |
|---|---|---|---|
| FREE | — | — | R$ 0 |
| BASIC | configurável | configurável | — |
| PRO | configurável | configurável | — |
| PREMIUM | configurável | configurável | — |

> Limites são definidos em runtime no objeto `Subscription` (`max_users`, `max_giras_per_month`), não hardcoded.

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
| `users` | `(email)` | UNIQUE |
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
