#!/usr/bin/env python3
"""Audita o isolamento de tenant no backend (item Q-02 de docs/plano-execucao.md).

Falha (exit 1) se qualquer uma das quatro checagens abaixo encontrar problema fora das listas
de exceções justificadas. Mesmo padrão de scripts/audit_permission_guards.py: heurística AST,
sem importar a aplicação.

Uso: python scripts/audit_tenant_isolation.py

Checagens
=========

1. Queries em endpoints admin (``src/api/v1/admin/``) — modo "admin" (Q-02 original).
   Todo ``select()``/``update()``/``delete()``/``exists()`` do SQLAlchemy (ou
   ``session.get(Modelo, id)``) sobre modelo com coluna ``tenant_id`` precisa de filtro de
   tenant: comparação entre ``<Modelo>.tenant_id`` e um valor "de tenant" (nome contendo
   ``tenant``/``tid``, ``current_user.tenant_id``, ``tenant.id``...), ``filter_by(tenant_id=)``
   ou ``.tenant_id.in_(...)``. Exceções: ``EXEMPT_QUERIES``.

2. Queries em repositories e services (``src/repositories/``, ``src/services/``) — modo
   "scoped" (ampliação de 2026-10-05). A convenção ali é o método RECEBER o tenant como
   parâmetro (``tenant_id``, ``tenant``, ``tid``, ``*tenant*``):
   - método COM parâmetro de tenant (rigoroso): toda query sobre modelo multi-tenant precisa
     filtrar por um valor DERIVADO desse parâmetro (o próprio nome, ou variável local cujo
     valor o cita — ex. ``tid = tenant.id``; ``gira = <select filtrado por tenant_id>``). Um
     ``Modelo.tenant_id == current_user.tenant_id`` dentro de um método que recebeu
     ``tenant_id`` e o ignorou NÃO passa. Também passa a query cujo filtro vem de chamada que
     recebe o parâmetro (``conditions = self._build_conditions(tenant_id, ...)``;
     ``gira = await self.get_by_id(gira_id, tenant_id)`` seguido de ``Ticket.gira_id ==
     gira.id``) — "delegação": o filtro é responsabilidade da função chamada, auditada por
     conta própria;
   - método SEM parâmetro de tenant: a query precisa de filtro de tenant (critério generoso do
     modo admin, ex. ``obj.tenant_id``) ou de uma entrada em ``EXEMPT_SCOPED_QUERIES``
     (cross-tenant por design: schedulers, visão de plataforma...) ou em
     ``RESOLVED_ID_QUERIES`` (o método só recebe id já resolvido dentro do tenant). Entradas
     de ``RESOLVED_ID_QUERIES`` listam os chamadores revisados; o auditor procura TODAS as
     chamadas ao método em ``src/`` e falha se aparecer chamador novo — a premissa "o id já
     vem resolvido" precisa ser revista a cada chamador novo.
   Nível de rigor escolhido para manter falso positivo baixo: a regra rigorosa só vale onde a
   convenção existe (o parâmetro está lá); sem o parâmetro, a exceção explícita documenta a
   intenção em vez de forçar um filtro que o método não tem como aplicar.

3. Queries em rotas públicas (``src/api/v1/public/``) — modo "public". Não há usuário logado:
   o tenant vem de um slug (``Tenant.slug == tenant_slug``) ou de um objeto pai identificado
   por UUID/token recebido na URL. A query passa se:
   - filtra por tenant (critério generoso: ``Gira.tenant_id == tenant.id``,
     ``== ticket.tenant_id``...); ou
   - é a "busca raiz" do objeto: compara ``<Modelo>.id``/``<Modelo>.slug``/coluna com
     ``token`` no nome diretamente com um parâmetro da requisição (``Ticket.id ==
     ticket_uuid`` onde ``ticket_uuid = UUID(ticket_id)``). O objeto raiz é o próprio recurso
     público endereçado por UUID v4/slug/token — não há tenant "do chamador" a comparar; o
     tenant passa a ser o do objeto, e as queries SEGUINTES (filhas) precisam filtrar por ele.
     ``Gira.id == ticket.gira_id`` NÃO é busca raiz (valor vem de objeto carregado, não da
     requisição) e precisa de ``Gira.tenant_id == ticket.tenant_id``.
   Exceções: ``EXEMPT_PUBLIC_QUERIES`` (unicidade global de e-mail/username no onboarding...).

4. FKs recebidos na requisição (endpoints admin) — checagem "fk". Para cada rota
   (``@router.<verbo>``), campos do body (schema Pydantic do mesmo arquivo) e parâmetros
   escalares de path/query ``*_id``/``*_ids`` cujo nome é coluna FK para tabela de modelo
   multi-tenant (inferido dos ``ForeignKey("tabela.id")`` em ``src/models/``, ex.
   ``ContaFinanceira.categoria_id → categorias_financeiras``) são rastreados até um "sink":
   - construtor de modelo com a coluna (``ContaFinanceira(categoria_id=body.categoria_id)``,
     ``Modelo(**body.model_dump())``);
   - atribuição ``obj.<coluna> = <id>`` ou ``setattr`` em laço sobre ``body.model_dump().items()``;
   - chamada de escrita (nome ``create*``/``add*``/``update*``/``set*``/``registrar*``...) que
     recebe o id por keyword com o nome da coluna, por ``**dados_do_body`` ou — quando o
     callee é resolvido (repository/service/função do arquivo) — por posição.
   O sink precisa de uma busca do id ESCOPADA NO TENANT antes dele na mesma função:
   - query (``select``/``exists``) com filtro de tenant cuja expressão cita o id; ou
   - chamada que recebe o id (ou o body inteiro) E um valor de tenant — padrão dos validadores
     ``_validar_referencias_do_tenant(db, current_user.tenant_id, body.categoria_id, ...)``,
     ``_validar_grupo_do_tenant(...)`` e de ``repo.get_by_id(body.item_id, tenant_id)``; ou
   - o próprio sink é método resolvido que valida aquele parâmetro internamente (ex.
     ``PermissionGroupRepository.add_member`` busca grupo e usuário filtrando por tenant antes
     de criar a membership).
   Exceções: ``EXEMPT_BODY_FKS`` por (arquivo, função, campo).

5. Área do Médium (``src/api/v1/medium/``) — modo "medium" (AM-02). O tenant vem de
   ``ctx.tenant_id`` e o médium de ``ctx.medium`` (``MediumContext`` do ``require_medium``):
   - toda query sobre modelo multi-tenant filtra por tenant (critério generoso do modo admin:
     ``Modelo.tenant_id == ctx.tenant_id``);
   - toda query sobre modelo "do médium" — ``Medium`` e modelos com FK para ``mediuns``
     (descobertos em ``src/models/``, ex. ``MensalidadePagamento.mediun_id``) — filtra também
     pelo médium logado: ``<Modelo>.<fk> == ctx.medium.id`` (``Medium.id == ctx.medium.id``
     no próprio cadastro). O valor precisa citar ``.medium`` (``ctx.medium.id``) ou a
     variável ``medium``; ``session.get`` em modelo do médium é sempre violação;
   - nenhuma rota recebe ``medium_id``/``mediun_id`` (parâmetro, trecho de path ou campo de
     schema do arquivo): as rotas da Área são "minhas".
   Exceções: ``EXEMPT_MEDIUM_QUERIES``.

Limites conhecidos (o auditor é rede de segurança, não prova)
=============================================================
- Não verifica QUAL valor é comparado no modo admin/public: ``Gira.tenant_id ==
  variavel_com_tenant`` passa mesmo se a variável vier de input. No modo scoped o valor
  precisa derivar do parâmetro de tenant, mas a derivação é por fluxo de dados generoso
  (qualquer atribuição que cite o parâmetro).
- Não verifica fluxo de controle: filtro dentro de ``if`` (ex. ``if tenant_id is not None:
  conditions.append(...)``) conta como sempre aplicado. Parâmetro de tenant ``Optional`` com
  default ``None`` (TicketAnalyticsRepository) não é detectado.
- Delegação (modo scoped) confia na função chamada: ``self._helper(tenant_id)`` conta como
  filtro sem olhar o helper — que é auditado separadamente se estiver em repositories/services.
- O filtro via pai só é reconhecido na mesma função; exceções valem para a função inteira.
- Checagem de FK: só rotas admin; só schemas definidos no próprio arquivo; só nomes de campo
  iguais ao nome da coluna FK (``user_ids`` → ``user_id``); body passado inteiro para um
  service (``service.criar(db, tenant_id, body)``) não é seguido; qualquer chamada que receba
  o id e um valor de tenant é aceita como validação, sem conferir o que ela faz (o que ela faz
  é coberto pelas checagens 1/2 se estiver em admin/repositories/services); callee de escrita
  não resolvido só é sink por keyword/``**``, não por posição.
- SQL textual (``text("...")``) não é analisado. Rotas ``platform/`` e ``auth/`` não são
  auditadas (são cross-tenant por design ou operam sobre o próprio usuário).
"""

import ast
import sys
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = BACKEND_DIR / "src"
ADMIN_DIR = SRC_DIR / "api" / "v1" / "admin"
PUBLIC_DIR = SRC_DIR / "api" / "v1" / "public"
MEDIUM_DIR = SRC_DIR / "api" / "v1" / "medium"
REPOSITORIES_DIR = SRC_DIR / "repositories"
SERVICES_DIR = SRC_DIR / "services"
MODELS_DIR = SRC_DIR / "models"

# ─── Exceções justificadas ──────────────────────────────────────────────────────────

# Arquivos admin inteiros fora da auditoria. Diferente do auditor de RBAC, as rotas de sistema
# (health, billing, subscription_info, support_chat...) SÃO auditadas — isolamento de tenant
# não tem exceção de "rota de plataforma"; se não fazem query multi-tenant, passam sozinhas.
EXEMPT_FILES: dict[str, str] = {
    "__init__.py": "só registra routers, não tem query",
}

# Modo admin. Chave: (arquivo, função mais externa que contém a query).
EXEMPT_QUERIES: dict[tuple[str, str], str] = {
    ("audit_trail.py", "_resolve_user_names"): (
        "resolve nomes de impersonated_by (super_admins, tenant_id NULL) a partir de logs já "
        "filtrados por tenant em list_audit_logs; filtrar por tenant esconderia o impersonador"
    ),
    ("sites.py", "_sync_slug_with_tenant"): (
        "checagem de unicidade de slug é global por design (slug do site público é único "
        "entre todos os tenants); só retorna existência, nenhum dado de outro tenant"
    ),
    ("users.py", "list_users"): (
        "ramo `current_user.tenant_id is None` é o super_admin vendo todos os usuários; "
        "usuários de tenant caem nos ramos via UserRepository filtrados por tenant_id"
    ),
}

# Modo scoped (repositories/services) — cross-tenant por design ou sem tenant disponível.
# Chave: (caminho relativo a src/, "Classe.metodo" ou "funcao").
EXEMPT_SCOPED_QUERIES: dict[tuple[str, str], str] = {
    # ── visão de plataforma (super_admin) ──
    # BillingRepository: faturas (Invoice) são da plataforma; estes 4 métodos não têm chamador
    # em src/ hoje (só testes unitários). Se ganharem, deve ser rota platform/.
    ("repositories/billing_repo.py", "BillingRepository.get_by_number"): (
        "fatura da plataforma por número único global; sem chamador em src/ (só testes)"
    ),
    ("repositories/billing_repo.py", "BillingRepository.list_by_status"): (
        "faturas de todos os tenants (painel de billing da plataforma); sem chamador em src/"
    ),
    ("repositories/billing_repo.py", "BillingRepository.mark_as_paid"): (
        "baixa de fatura da plataforma pelo id da fatura; sem chamador em src/ (só testes)"
    ),
    ("repositories/billing_repo.py", "BillingRepository.total_revenue"): (
        "receita agregada de todos os tenants (plataforma); sem chamador em src/ (só testes)"
    ),
    ("repositories/consolidated_audit_repo.py", "ConsolidatedAuditRepository.get_range"): (
        "auditoria consolidada cross-tenant; só via ConsolidatedAuditService, usado só por "
        "platform/consolidated_audit.py (super_admin)"
    ),
    ("repositories/consolidated_audit_repo.py", "ConsolidatedAuditRepository.count_by_tenant"): (
        "agregação por tenant da auditoria consolidada (super_admin)"
    ),
    ("repositories/consolidated_audit_repo.py", "ConsolidatedAuditRepository.count_by_action"): (
        "agregação cross-tenant da auditoria consolidada (super_admin)"
    ),
    ("repositories/consolidated_audit_repo.py", "ConsolidatedAuditRepository.count_by_user"): (
        "agregação cross-tenant da auditoria consolidada (super_admin)"
    ),
    ("repositories/consolidated_audit_repo.py", "ConsolidatedAuditRepository._count_total"): (
        "total da auditoria consolidada (super_admin)"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.get_by_id"): (
        "repositório de usuários da plataforma: só instanciado em platform/users_global.py "
        "(super_admin), escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.get_by_email"): (
        "repositório de usuários da plataforma (super_admin): escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.list_all"): (
        "repositório de usuários da plataforma (super_admin): escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.count_all"): (
        "repositório de usuários da plataforma (super_admin): escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.count_active"): (
        "super-admins ativos (tenant_id IS NULL) para a trava do último super-admin: escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.update"): (
        "repositório de usuários da plataforma (super_admin): escopo global"
    ),
    ("repositories/platform_user_repo.py", "PlatformUserRepository.soft_delete"): (
        "repositório de usuários da plataforma (super_admin): escopo global"
    ),
    ("repositories/subscription_repo.py", "SubscriptionRepository.list_by_plan"): (
        "assinaturas de todos os tenants por plano (visão de plataforma); sem chamador em src/"
    ),
    ("repositories/subscription_repo.py", "SubscriptionRepository.list_by_status"): (
        "assinaturas de todos os tenants por status (visão de plataforma); sem chamador em src/"
    ),
    ("repositories/support_chat_repo.py", "SupportChatRepository.count_unread_global"): (
        "contador de não lidas de TODAS as conversas; só chamado por platform/support_chat.py"
    ),
    ("services/activation_service.py", "get_activation"): (
        "métricas de ativação de todos os tenants; só chamado por platform/tenant_observatory.py"
    ),
    ("services/tenant_retention_service.py", "get_at_risk_tenants"): (
        "tenants em risco (cross-tenant por definição); só chamado por platform/dashboard.py e "
        "platform/tenant_observatory.py"
    ),
    # ── schedulers: varrem todos os tenants e agem por tenant em seguida ──
    ("services/birthday_scheduler.py", "BirthdayScheduler._send_all_digests_locked"): (
        "scheduler diário: lista assinaturas de todos os tenants para mandar o digest de cada um"
    ),
    ("services/onboarding_email_scheduler.py", "load_candidates"): (
        "scheduler de onboarding: varre todos os tenants para decidir quem recebe e-mail"
    ),
    ("services/trial_scheduler.py", "TrialScheduler._process_trials_locked"): (
        "scheduler de trials: varre assinaturas de todos os tenants para expirar/avisar"
    ),
    ("services/assinatura_pix.py", "_processar_pix_mensal_locked"): (
        "rodada diária do PIX mês a mês ($-04): varre as assinaturas pagas por PIX de todos os "
        "tenants para avisar/expirar; cada ação depois roda com o tenant da assinatura"
    ),
    ("services/presenca.py", "candidatos_ao_encerramento"): (
        "agendador da presença (AM-17): varre as chamadas abertas de todos os tenants; cada "
        "encerramento depois roda com o tenant da atividade (ctx_da_atividade/encerrar_chamada)"
    ),
    # ── sites públicos: busca raiz por slug, sem tenant do chamador ──
    ("repositories/site_repo.py", "SiteRepository.get_published_by_slug"): (
        "site público publicado é endereçado por slug único global (rota public/sites.py); "
        "não há tenant do chamador — o tenant passa a ser o do site"
    ),
    ("repositories/site_image_repo.py", "SiteImageRepository.get_public"): (
        "rota pública public/sites.py serve a imagem por UUID v4 sem auth (capability URL, "
        "inclusive de site não publicado); devolve só o binário da imagem"
    ),
    # ── consultas correlacionadas ──
    ("repositories/ticket_analytics_repo.py", "TicketAnalyticsRepository._gira_nao_apagada"): (
        "helper que só devolve o EXISTS correlacionado a Ticket (Gira.id == Ticket.gira_id) "
        "para excluir giras apagadas; o escopo vem do Ticket.tenant_id da query externa"
    ),
    # ── escopo por usuário (mais restrito que por tenant) ──
    ("services/session_service.py", "rotate_session"): (
        "sessão de refresh token filtrada por id + user_id vindos do JWT de refresh validado; "
        "usuário pertence a um único tenant, filtro por usuário é mais restrito que por tenant"
    ),
    ("services/session_service.py", "end_session"): (
        "logout: apaga a sessão por id + user_id do JWT validado (escopo do próprio usuário)"
    ),
    ("services/session_service.py", "end_all_sessions"): (
        "apaga as sessões de um user_id — o próprio usuário logado ou usuário já carregado "
        "com filtro de tenant (admin/users.py) / pela plataforma (platform/tenants.py)"
    ),
}

# Modo scoped — métodos sem parâmetro de tenant que só recebem id já resolvido no tenant.
# O auditor confere que TODA chamada ao método em src/ está entre os chamadores listados.
RESOLVED_ID_QUERIES: dict[tuple[str, str], dict] = {
    ("repositories/support_chat_repo.py", "SupportChatRepository.list_messages"): {
        "motivo": (
            "recebe o id de conversa já carregada com filtro de tenant no admin "
            "(get_or_create_conversation/list_conversations_for_tenant/get_conversation com "
            "tenant_id) ou pela plataforma (super_admin, cross-tenant por design)"
        ),
        "chamadores": [
            ("api/v1/admin/support_chat.py", "get_my_conversation"),
            ("api/v1/admin/support_chat.py", "list_tenant_conversations"),
            ("api/v1/admin/support_chat.py", "get_tenant_conversation_messages"),
            ("api/v1/platform/support_chat.py", "get_conversation_messages"),
        ],
    },
    ("repositories/support_chat_repo.py", "SupportChatRepository.last_message_previews"): {
        "motivo": (
            "recebe ids de conversas já carregadas pela inbox da plataforma "
            "(super_admin, cross-tenant por design)"
        ),
        "chamadores": [
            ("api/v1/platform/support_chat.py", "list_conversations"),
            ("api/v1/platform/support_chat.py", "get_conversation"),
            ("api/v1/platform/support_chat.py", "set_conversation_status"),
        ],
    },
    ("services/email/email_queue.py", "EmailQueueService._write_email_tracking"): {
        "motivo": (
            "ticket_id vem do próprio job da fila (EmailQueueItem montado pelo código com "
            "str(ticket.id) de ticket recém-emitido), nunca de input; só grava campos de "
            "rastreio de e-mail"
        ),
        "chamadores": [
            ("services/email/email_queue.py", "EmailQueueService._dispatch"),
        ],
    },
}

# Modo public. Chave: (caminho relativo a src/, função).
EXEMPT_PUBLIC_QUERIES: dict[tuple[str, str], str] = {
    ("api/v1/public/onboarding.py", "_unique_username"): (
        "username é único global (login não tem tenant); só testa existência"
    ),
    ("api/v1/public/onboarding.py", "_check_trial_eligibility"): (
        "TrialGrant é global por design (CPF/CNPJ ou e-mail que já ganhou trial em qualquer "
        "tenant não ganha outro); só testa existência"
    ),
    ("api/v1/public/onboarding.py", "_email_em_conta_nao_excluida"): (
        "cadastro cria tenant novo: e-mail sem conta ativa mas com conta inativa/terreiro desativado em "
        "qualquer tenant barra (409); só testa existência"
    ),
    ("api/v1/public/stats.py", "_compute_stats"): (
        "números da landing (V-02): só COUNT somado entre todos os tenants, nenhum dado de "
        "terreiro sai na resposta"
    ),
    ("api/v1/public/sitemap.py", "_published_sites"): (
        "sitemap (T-03): lista slugs de sites PUBLICADOS de terreiros ativos — o mesmo que já é "
        "público em /{slug}; nenhum outro dado"
    ),
    ("api/v1/public/stats.py", "_tenant_publico"): (
        "filtro auxiliar do _compute_stats (terreiro ativo, não demo); não consulta nada sozinho"
    ),
    ("api/v1/public/convite.py", "_convite_pelo_token"): (
        "busca raiz do convite da Área do Médium (AM-03): token opaco de 256 bits comparado pelo "
        "sha256 (token_hash == hash_token(token)) — o hash esconde do auditor o parâmetro da "
        "requisição; o tenant passa a ser o do convite e as queries seguintes filtram por ele"
    ),
    ("api/v1/public/email_confirmacao.py", "_conta_pelo_token"): (
        "busca raiz da confirmação do novo e-mail de login (AM-13): token opaco de 256 bits pelo "
        "sha256 (email_pendente_token_hash == hash_token(token)); o tenant passa a ser o da conta "
        "e as queries seguintes filtram por user.tenant_id"
    ),
}

# Checagem de FK. Chave: (arquivo admin, função, campo).
EXEMPT_BODY_FKS: dict[tuple[str, str, str], str] = {}

# Modo medium (src/api/v1/medium/, AM-02). Chave: (caminho relativo a src/, função).
EXEMPT_MEDIUM_QUERIES: dict[tuple[str, str], str] = {
    ("api/v1/medium/inicio.py", "_aniversariantes"): (
        "AM-20: aniversariantes da semana da MESMA casa (filtro por ctx.tenant_id) que ligaram o "
        "opt-in aniversario_visivel; só primeiro nome + dia/mês saem da rota"
    ),
}

# Tabela do cadastro de médiuns e nomes que a Área nunca recebe da requisição.
MEDIUM_TABLE = "mediuns"
MEDIUM_ID_INPUTS = {"medium_id", "mediun_id"}

QUERY_FUNCS = {"select", "update", "delete", "exists"}

# Prefixos de nome de chamada considerada "escrita" (sink de FK).
WRITE_PREFIXES = (
    "create", "add", "insert", "update", "set", "save", "upsert", "register", "registrar",
    "criar", "atualizar", "salvar", "emit", "emitir", "assign", "move", "replace",
    "get_or_create", "bulk_create", "bulk_update",
)
# Prefixos de nome de chamada considerada busca/validação do id (padrão "seguro" de FK).
READ_PREFIXES = (
    "get", "find", "fetch", "load", "list", "count", "exists", "resolve", "require",
    "validar", "validate", "verificar", "verify", "check", "ensure", "garantir", "buscar",
    "obter", "carregar",
)
# Conversões que preservam a identidade do valor (UUID(x), str(x)...).
CONVERSIONS = {"UUID", "str", "int", "list", "set", "tuple", "sorted", "frozenset"}
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


# ─── Descoberta de modelos ──────────────────────────────────────────────────────────


def discover_tenant_models(models_dir: Path = MODELS_DIR) -> set[str]:
    """Nomes de classe em src/models/*.py cujo corpo atribui a coluna ``tenant_id``."""
    return discover_model_info(models_dir).tenant_models


@dataclass
class ModelInfo:
    tenant_models: set[str] = field(default_factory=set)
    tables: dict[str, str] = field(default_factory=dict)  # Modelo → __tablename__
    fks: dict[str, dict[str, str]] = field(default_factory=dict)  # Modelo → {coluna: tabela}

    @property
    def tenant_tables(self) -> set[str]:
        return {self.tables[m] for m in self.tenant_models if m in self.tables}

    def tenant_fk_columns(self, model: str | None = None) -> dict[str, set[str]]:
        """{coluna FK: tabelas-alvo multi-tenant} — de um modelo ou de todos."""
        out: dict[str, set[str]] = {}
        tenant_tables = self.tenant_tables
        models = [model] if model else list(self.fks)
        for m in models:
            for col, table in self.fks.get(m, {}).items():
                if col != "tenant_id" and table in tenant_tables:
                    out.setdefault(col, set()).add(table)
        return out


def discover_model_info(models_dir: Path = MODELS_DIR) -> ModelInfo:
    info = ModelInfo()
    for path in sorted(models_dir.glob("*.py")):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign):
                    targets, value = [stmt.target], stmt.value
                elif isinstance(stmt, ast.Assign):
                    targets, value = list(stmt.targets), stmt.value
                else:
                    continue
                names = [t.id for t in targets if isinstance(t, ast.Name)]
                if not names:
                    continue
                if "tenant_id" in names:
                    info.tenant_models.add(node.name)
                if "__tablename__" in names and isinstance(value, ast.Constant):
                    info.tables[node.name] = value.value
                if value is None:
                    continue
                for sub in ast.walk(value):
                    if (
                        isinstance(sub, ast.Call)
                        and _call_name(sub) == "ForeignKey"
                        and sub.args
                        and isinstance(sub.args[0], ast.Constant)
                        and isinstance(sub.args[0].value, str)
                    ):
                        table = sub.args[0].value.split(".")[0]
                        for n in names:
                            info.fks.setdefault(node.name, {})[n] = table
    return info


def discover_medium_models(info: ModelInfo) -> dict[str, set[str]]:
    """{Modelo: colunas que apontam para o médium} — ``Medium`` (``id``) e todo modelo com
    FK para ``mediuns`` (ex. ``MensalidadePagamento: {"mediun_id"}``)."""
    out: dict[str, set[str]] = {}
    for model, table in info.tables.items():
        if table == MEDIUM_TABLE:
            out[model] = {"id"}
    for model, fks in info.fks.items():
        cols = {col for col, table in fks.items() if table == MEDIUM_TABLE}
        if cols:
            out.setdefault(model, set()).update(cols)
    return out


# ─── Resolução de nomes no arquivo auditado ─────────────────────────────────────────


def _is_models_import(node: ast.ImportFrom) -> bool:
    return bool(node.module) and (
        node.module.startswith("src.models")
        or (node.level > 0 and node.module.split(".")[0] == "models")
    )


def _resolve_names(tree: ast.Module, tenant_models: set[str]) -> tuple[set[str], set[str]]:
    """Retorna (nomes locais de modelos multi-tenant, nomes locais de select/update/delete)."""
    model_names = set(tenant_models)
    query_funcs: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                local = alias.asname or alias.name
                if _is_models_import(node) and alias.name in tenant_models:
                    model_names.add(local)
                elif node.module.split(".")[0] == "sqlalchemy" and alias.name in QUERY_FUNCS:
                    query_funcs.add(local)
    # X = aliased(Modelo)
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and _call_name(node.value) == "aliased"
            and node.value.args
            and isinstance(node.value.args[0], ast.Name)
            and node.value.args[0].id in model_names
        ):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    model_names.add(t.id)
    return model_names, query_funcs


def _model_aliases(tree: ast.Module, all_models: set[str]) -> dict[str, str]:
    """{nome local: classe do modelo} para TODOS os modelos (inclusive sem tenant_id)."""
    out = {m: m for m in all_models}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and _is_models_import(node):
            for alias in node.names:
                if alias.name in all_models:
                    out[alias.asname or alias.name] = alias.name
    return out


def _self_model_classes(tree: ast.Module, model_names: set[str]) -> set[str]:
    """Classes cujo ``self.model`` é (ou pode ser) modelo multi-tenant.

    ``super().__init__(db, Modelo)`` / ``self.model = Modelo`` resolvem o modelo; classe que
    usa ``self.model`` sem resolvê-lo (BaseRepository genérico, ``Repo(db, Modelo)`` montado
    pelo chamador) é tratada como multi-tenant — conservador."""
    out: set[str] = set()
    for cls in (n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)):
        resolved: str | None = None
        for node in ast.walk(cls):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "__init__"
                and len(node.args) >= 2
                and isinstance(node.args[-1], ast.Name)
            ):
                resolved = node.args[-1].id
            elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Name):
                for t in node.targets:
                    if (
                        isinstance(t, ast.Attribute)
                        and t.attr == "model"
                        and isinstance(t.value, ast.Name)
                        and t.value.id == "self"
                    ):
                        resolved = node.value.id
        if resolved is None or resolved in model_names or resolved[:1].islower():
            out.add(cls.name)
    return out


def _call_name(call: ast.Call) -> str | None:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _is_self_model(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and node.attr == "model"
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    )


def _is_query_call(node: ast.AST, query_funcs: set[str]) -> bool:
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Name):
        return func.id in query_funcs
    # sa.select(...) / sqlalchemy.select(...)
    return (
        isinstance(func, ast.Attribute)
        and func.attr in QUERY_FUNCS
        and isinstance(func.value, ast.Name)
        and func.value.id in {"sa", "sqlalchemy"}
    )


def _chain_method_args(root: ast.AST, call: ast.Call, methods: set[str] | None) -> list[ast.AST]:
    """Argumentos dos métodos encadeados entre ``root`` e o ``call`` base
    (``select(...).select_from(X).where(...)``). ``methods=None`` → todos os métodos."""
    args: list[ast.AST] = []
    node = root
    while node is not call:
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and (methods is None or node.func.attr in methods):
                args.extend(node.args)
                args.extend(kw.value for kw in node.keywords)
            node = node.func
        elif isinstance(node, ast.Attribute):
            node = node.value
        else:
            break
    return args


def _referenced_models(
    call: ast.Call,
    root: ast.AST,
    model_names: set[str],
    query_funcs: set[str],
    self_model: bool = False,
) -> list[str]:
    """Modelos multi-tenant consultados pela query: argumentos do select/update/delete e do
    ``.select_from(...)`` encadeado; para ``exists()`` sem argumentos, os modelos citados na
    cadeia (``exists().where(Gira.x == y)``). Não desce em sub-selects, que são auditados como
    queries próprias. ``self_model=True`` conta ``self.model`` (repositories genéricos)."""
    found: list[str] = []
    stack: list[ast.AST] = list(call.args) + [kw.value for kw in call.keywords]
    stack += _chain_method_args(root, call, {"select_from"})
    if _call_name(call) == "exists" and not call.args:
        stack += _chain_method_args(root, call, None)
    while stack:
        node = stack.pop()
        if _is_query_call(node, query_funcs):
            continue
        if self_model and _is_self_model(node):
            if "self.model" not in found:
                found.append("self.model")
            continue
        if isinstance(node, ast.Name) and node.id in model_names and node.id not in found:
            found.append(node.id)
        stack.extend(ast.iter_child_nodes(node))
    return found


# ─── Detecção de filtro de tenant ───────────────────────────────────────────────────


def _is_model_attr(node: ast.AST, model_names: set[str]) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id in model_names
    )


def _has_tenant_attr(node: ast.AST) -> bool:
    return any(isinstance(n, ast.Attribute) and n.attr == "tenant_id" for n in ast.walk(node))


def _is_tenant_value(node: ast.AST, model_names: set[str]) -> bool:
    """Lado "valor" de um filtro de tenant: algo que carrega o tenant do chamador."""
    for n in ast.walk(node):
        if isinstance(n, ast.Name):
            # Nomes de classe (Tenant, Gira...) são colunas/tabelas, não valores — comparar
            # Gira.tenant_id == Tenant.id é condição de join, não filtro.
            if n.id in model_names or n.id[:1].isupper():
                continue
            low = n.id.lower()
            if "tenant" in low or low == "tid" or low.endswith("_tid"):
                return True
        elif isinstance(n, ast.Attribute):
            # current_user.tenant_id, gira.tenant_id — mas não Gira.tenant_id (coluna) nem
            # self.model.tenant_id (coluna do repository genérico).
            if n.attr == "tenant_id" and not _is_model_attr(n, model_names) and not _is_self_model(n.value):
                if not (isinstance(n.value, ast.Name) and n.value.id[:1].isupper()):
                    return True
            # tenant.id, self.tenant.id — mas não Tenant.id (coluna).
            if n.attr == "id" and isinstance(n.value, (ast.Name, ast.Attribute)):
                base = n.value.id if isinstance(n.value, ast.Name) else n.value.attr
                if "tenant" in base.lower() and not base[:1].isupper():
                    return True
    return False


def _contains_tenant_filter(expr: ast.AST, model_names: set[str], value_pred=None) -> bool:
    """``value_pred(nó) -> bool`` decide o que é "valor de tenant" (padrão: generoso)."""
    if value_pred is None:
        def value_pred(n: ast.AST) -> bool:
            return _is_tenant_value(n, model_names)

    for node in ast.walk(expr):
        if isinstance(node, ast.Compare):
            sides = [node.left, *node.comparators]
            for i, side in enumerate(sides):
                if not _has_tenant_attr(side):
                    continue
                others = sides[:i] + sides[i + 1 :]
                if any(value_pred(o) for o in others):
                    return True
        elif isinstance(node, ast.Call):
            # .filter_by(tenant_id=...)
            if _call_name(node) == "filter_by" and any(
                kw.arg == "tenant_id" and value_pred(kw.value) for kw in node.keywords
            ):
                return True
            # Modelo.tenant_id.in_(...)
            func = node.func
            if (
                isinstance(func, ast.Attribute)
                and func.attr == "in_"
                and isinstance(func.value, ast.Attribute)
                and func.value.attr == "tenant_id"
                and any(value_pred(a) for a in node.args)
            ):
                return True
    return False


# ─── Análise por função ─────────────────────────────────────────────────────────────


class _Assignment:
    """Uma atribuição/acúmulo em variável local: ``x = v``, ``x += v``, ``x.append(v)``."""

    __slots__ = ("lineno", "value", "self_ref")

    def __init__(self, lineno: int, value: ast.AST, self_ref: bool):
        self.lineno = lineno
        self.value = value
        # True quando a atribuição estende o valor anterior (stmt = stmt.where(...),
        # conds += [...], conds.append(...)) em vez de substituí-lo.
        self.self_ref = self_ref


class _FunctionIndex:
    """Mapa de variáveis locais → atribuições (em ordem de código) dentro da função."""

    def __init__(self, func: ast.AST):
        self.assignments: dict[str, list[_Assignment]] = {}
        self.parents: dict[ast.AST, ast.AST] = {}
        # Variáveis de laço: for x in <iter> / [... for x in <iter>] → (alvo, iter)
        self.loops: list[tuple[ast.AST, ast.AST]] = []
        for node in ast.walk(func):
            for child in ast.iter_child_nodes(node):
                self.parents[child] = node
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    for name in _target_names(t):
                        self._add(name, node.lineno, node.value, _references(node.value, name))
            elif isinstance(node, ast.AnnAssign) and node.value is not None:
                for name in _target_names(node.target):
                    self._add(name, node.lineno, node.value, _references(node.value, name))
            elif isinstance(node, ast.AugAssign):
                for name in _target_names(node.target):
                    self._add(name, node.lineno, node.value, True)
            elif isinstance(node, ast.NamedExpr):
                name = node.target.id
                self._add(name, node.lineno, node.value, _references(node.value, name))
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"append", "extend", "insert"}
                and isinstance(node.func.value, ast.Name)
            ):
                for arg in node.args:
                    self._add(node.func.value.id, node.lineno, arg, True)
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
                self.loops.append((node.target, node.iter))
        for items in self.assignments.values():
            items.sort(key=lambda a: a.lineno)

    def _add(self, name: str, lineno: int, value: ast.AST, self_ref: bool) -> None:
        self.assignments.setdefault(name, []).append(_Assignment(lineno, value, self_ref))

    def chain_root(self, call: ast.Call) -> ast.AST:
        """Sobe pela cadeia de métodos: select(X).where(...).order_by(...) → nó do topo."""
        node: ast.AST = call
        while True:
            parent = self.parents.get(node)
            if isinstance(parent, ast.Attribute) and parent.value is node:
                node = parent
                continue
            if isinstance(parent, ast.Call) and parent.func is node:
                node = parent
                continue
            return node

    def assigned_names(self, node: ast.AST) -> set[str]:
        parent = self.parents.get(node)
        if isinstance(parent, ast.Await) and parent.value is node:
            node, parent = parent, self.parents.get(parent)
        if isinstance(parent, (ast.Assign, ast.AnnAssign, ast.NamedExpr)) and parent.value is node:
            targets = parent.targets if isinstance(parent, ast.Assign) else [parent.target]
            return {n for t in targets for n in _target_names(t)}
        return set()

    def lifetime(self, name: str, lineno: int) -> list[_Assignment]:
        """Atribuições a ``name`` que estendem o valor atribuído na linha ``lineno``: as
        auto-referentes seguintes, até a próxima atribuição que substitui a variável."""
        out: list[_Assignment] = []
        for a in self.assignments.get(name, []):
            if a.lineno <= lineno:
                continue
            if not a.self_ref:
                break
            out.append(a)
        return out

    def next_fresh_lineno(self, name: str, lineno: int) -> float:
        for a in self.assignments.get(name, []):
            if a.lineno > lineno and not a.self_ref:
                return a.lineno
        return float("inf")

    def derived_names(self, seeds: set[str]) -> set[str]:
        """Fecho por fluxo de dados: ``seeds`` + variáveis locais com alguma atribuição (ou
        laço) cujo valor cita um nome já derivado."""
        out = set(seeds)
        changed = True
        while changed:
            changed = False
            for name, items in self.assignments.items():
                if name not in out and any(_references_any(a.value, out) for a in items):
                    out.add(name)
                    changed = True
            for target, iter_ in self.loops:
                if _references_any(iter_, out):
                    for name in _target_names(target):
                        if name not in out:
                            out.add(name)
                            changed = True
        return out


def _references(expr: ast.AST, name: str) -> bool:
    return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(expr))


def _references_any(expr: ast.AST, names: set[str]) -> bool:
    return any(isinstance(n, ast.Name) and n.id in names for n in ast.walk(expr))


def _chain_base_name(expr: ast.AST) -> str | None:
    """``base.where(...).order_by(...)`` → ``"base"`` (só cadeias de método sobre um nome)."""
    node = expr.value if isinstance(expr, ast.Await) else expr
    hops = 0
    while True:
        if isinstance(node, ast.Call):
            node = node.func
        elif isinstance(node, ast.Attribute):
            node = node.value
            hops += 1
        elif isinstance(node, ast.Name):
            return node.id if hops else None
        else:
            return None


def _target_names(target: ast.AST) -> list[str]:
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for elt in target.elts for n in _target_names(elt)]
    if isinstance(target, ast.Starred):
        return _target_names(target.value)
    return []


def _related_expressions(root: ast.AST, idx: _FunctionIndex, data_flow: bool = True) -> list[ast.AST]:
    """Expressões que compõem a query: a cadeia do statement, as extensões da variável que o
    guarda (``stmt = stmt.where(...)``), variáveis derivadas (``q2 = stmt.where(...)``) e, por
    fluxo de dados, os valores das variáveis locais citadas (``where(*conditions)``).
    ``data_flow=False`` para só no statement e nas extensões da variável."""
    exprs: list[ast.AST] = [root]
    seen: set[str] = set()
    lineno = getattr(root, "lineno", 0)

    def follow_statement_var(name: str, start: int) -> None:
        # A variável que guarda o statement: só a "vida" dela a partir desta atribuição —
        # reusar o nome `stmt` para outra query mais abaixo não conta.
        seen.add(name)
        for a in idx.lifetime(name, start):
            exprs.append(a.value)
        end = idx.next_fresh_lineno(name, start)
        for other, items in idx.assignments.items():
            if other in seen:
                continue
            for a in items:
                if start < a.lineno < end and not a.self_ref and _chain_base_name(a.value) == name:
                    exprs.append(a.value)
                    follow_statement_var(other, a.lineno)
                    break

    for name in idx.assigned_names(root):
        follow_statement_var(name, lineno)
    if not data_flow:
        return exprs

    # Fluxo de dados: valores de variáveis locais citadas nas expressões (todas as
    # atribuições — ex. conditions = [...]; conditions.append(...)).
    i = 0
    while i < len(exprs):
        for n in ast.walk(exprs[i]):
            if isinstance(n, ast.Name) and n.id not in seen and n.id in idx.assignments:
                seen.add(n.id)
                exprs.extend(a.value for a in idx.assignments[n.id])
        i += 1
    return exprs


def _session_get_target(call: ast.Call, model_names: set[str], self_model: bool = False) -> str | None:
    """<sessão>.get(Modelo, id) sobre modelo multi-tenant → nome do modelo."""
    if not (isinstance(call.func, ast.Attribute) and call.func.attr == "get" and len(call.args) >= 2):
        return None
    first = call.args[0]
    if isinstance(first, ast.Name) and first.id in model_names:
        return first.id
    if self_model and _is_self_model(first):
        return "self.model"
    return None


def _check_session_get(call: ast.Call, func: ast.AST, idx: _FunctionIndex, value_pred=None) -> bool:
    """True se o resultado de session.get é comparado com tenant na função."""
    node: ast.AST = call
    parent = idx.parents.get(node)
    if isinstance(parent, ast.Await):
        node = parent
    names = idx.assigned_names(node)
    for sub in ast.walk(func):
        if not isinstance(sub, ast.Compare):
            continue
        sides = [sub.left, *sub.comparators]
        for i, side in enumerate(sides):
            if (
                isinstance(side, ast.Attribute)
                and side.attr == "tenant_id"
                and isinstance(side.value, ast.Name)
                and side.value.id in names
            ):
                if value_pred is None:
                    return True
                if any(value_pred(o) for o in sides[:i] + sides[i + 1 :]):
                    return True
    return False


def _iter_units(tree: ast.Module):
    """Unidade de análise: função mais externa (módulo ou método de classe) → (qualname,
    função, classe). Funções aninhadas entram no escopo da externa."""
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node.name, node, None
        elif isinstance(node, ast.ClassDef):
            for n in node.body:
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    yield f"{node.name}.{n.name}", n, node


def _param_names(func: ast.AST) -> list[str]:
    a = func.args
    return [p.arg for p in [*a.posonlyargs, *a.args, *a.kwonlyargs]]


def _tenant_params(func: ast.AST) -> set[str]:
    return {
        p for p in _param_names(func)
        if p == "tid" or "tenant" in p.lower()
    }


def rel_key(path: Path) -> str:
    """Chave de exceção: caminho relativo a src/ (ou só o nome, fora de src/)."""
    try:
        return path.resolve().relative_to(SRC_DIR).as_posix()
    except ValueError:
        return path.name


# ─── Busca raiz em rota pública ─────────────────────────────────────────────────────


def _request_values(func: ast.AST, idx: _FunctionIndex) -> set[str]:
    """Parâmetros da função + variáveis locais que são só conversão deles (``UUID(x)``)."""
    params = set(_param_names(func))
    out = set(params)
    changed = True
    while changed:
        changed = False
        for name, items in idx.assignments.items():
            if name not in out and any(_is_request_value(a.value, out, params) for a in items):
                out.add(name)
                changed = True
    return out


def _is_request_value(node: ast.AST, req: set[str], params: set[str]) -> bool:
    if isinstance(node, ast.Name):
        return node.id in req
    if isinstance(node, ast.Attribute):
        # body.slug — atributo direto de parâmetro (dado da requisição), não de objeto carregado
        return isinstance(node.value, ast.Name) and node.value.id in params
    if isinstance(node, ast.Call) and node.args:
        name = _call_name(node)
        if name in CONVERSIONS and isinstance(node.func, (ast.Name, ast.Attribute)):
            return _is_request_value(node.args[0], req, params)
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in {"strip", "lower", "upper"}
    ):
        return _is_request_value(node.func.value, req, params)
    return False


def _is_root_key(attr: str) -> bool:
    return attr in {"id", "slug"} or "token" in attr


def _is_root_lookup(
    exprs: list[ast.AST], model_names: set[str], req: set[str], params: set[str]
) -> bool:
    for expr in exprs:
        for node in ast.walk(expr):
            if not isinstance(node, ast.Compare) or not all(isinstance(o, ast.Eq) for o in node.ops):
                continue
            sides = [node.left, *node.comparators]
            for i, side in enumerate(sides):
                if (
                    isinstance(side, ast.Attribute)
                    and _is_root_key(side.attr)
                    and (_is_model_attr(side, model_names) or _is_self_model(side.value))
                ):
                    if any(_is_request_value(o, req, params) for o in sides[:i] + sides[i + 1 :]):
                        return True
    return False


# ─── Filtro pelo médium logado (modo medium) ────────────────────────────────────────


def _is_medium_value(node: ast.AST) -> bool:
    """Valor que carrega o médium do ``MediumContext``: ``ctx.medium.id``, ``medium.id``."""
    for n in ast.walk(node):
        if isinstance(n, ast.Attribute) and n.attr == "medium":
            if not (isinstance(n.value, ast.Name) and n.value.id[:1].isupper()):
                return True
        if isinstance(n, ast.Name) and n.id == "medium":
            return True
    return False


def _contains_medium_filter(expr: ast.AST, medium_cols: dict[str, set[str]]) -> bool:
    """``<Modelo>.<coluna do médium> == <valor do médium>`` (ou ``filter_by(coluna=...)``)."""
    def is_medium_col(side: ast.AST) -> bool:
        return (
            isinstance(side, ast.Attribute)
            and isinstance(side.value, ast.Name)
            and side.attr in medium_cols.get(side.value.id, ())
        )

    all_cols = set().union(*medium_cols.values()) if medium_cols else set()
    for node in ast.walk(expr):
        if isinstance(node, ast.Compare) and all(isinstance(o, ast.Eq) for o in node.ops):
            sides = [node.left, *node.comparators]
            for i, side in enumerate(sides):
                if is_medium_col(side) and any(_is_medium_value(o) for o in sides[:i] + sides[i + 1 :]):
                    return True
        elif isinstance(node, ast.Call) and _call_name(node) == "filter_by":
            if any(kw.arg in all_cols and _is_medium_value(kw.value) for kw in node.keywords):
                return True
    return False


def find_medium_id_inputs(path: Path, source: str | None = None) -> list[tuple[int, str, str]]:
    """Rotas da Área que recebem ``medium_id``: [(linha, função/schema, onde)]."""
    tree = ast.parse(source if source is not None else path.read_text(), filename=str(path))
    found: list[tuple[int, str, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and _is_route(node):
            for p in _param_names(node):
                if p in MEDIUM_ID_INPUTS:
                    found.append((node.lineno, node.name, f"parâmetro {p}"))
            for dec in node.decorator_list:
                for arg in getattr(dec, "args", [])[:1]:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        for name in sorted(MEDIUM_ID_INPUTS):
                            if "{" + name + "}" in arg.value:
                                found.append((node.lineno, node.name, f"path {arg.value}"))
        elif isinstance(node, ast.ClassDef):
            for stmt in node.body:
                if (
                    isinstance(stmt, ast.AnnAssign)
                    and isinstance(stmt.target, ast.Name)
                    and stmt.target.id in MEDIUM_ID_INPUTS
                ):
                    found.append((stmt.lineno, node.name, f"campo {stmt.target.id}"))
    return found


# ─── Checagens 1-3: queries ─────────────────────────────────────────────────────────


def find_unfiltered_queries(
    path: Path,
    tenant_models: set[str],
    exempt_queries: dict | None = None,
    source: str | None = None,
    mode: str = "admin",
    medium_models: dict[str, set[str]] | None = None,
) -> tuple[list[tuple[int, str, str]], int]:
    """Retorna (violações [(linha, função, modelo)], total de queries multi-tenant checadas).

    ``mode``: "admin" (filtro generoso), "scoped" (repositories/services — filtro derivado
    do parâmetro de tenant), "public" (filtro generoso ou busca raiz) ou "medium" (filtro
    generoso de tenant + filtro pelo médium logado nos modelos de ``medium_models``)."""
    if exempt_queries is None:
        exempt_queries = {
            "admin": EXEMPT_QUERIES,
            "scoped": {**EXEMPT_SCOPED_QUERIES, **RESOLVED_ID_QUERIES},
            "public": EXEMPT_PUBLIC_QUERIES,
            "medium": EXEMPT_MEDIUM_QUERIES,
        }[mode]
    key_file = path.name if mode == "admin" else rel_key(path)
    tree = ast.parse(source if source is not None else path.read_text(), filename=str(path))
    model_names, query_funcs = _resolve_names(tree, tenant_models)
    # Modo medium: nomes locais (com alias) dos modelos "do médium" → colunas do médium.
    medium_cols: dict[str, set[str]] = {}
    if mode == "medium":
        medium_models = medium_models or {}
        aliases = _model_aliases(tree, set(medium_models))
        medium_cols = {local: medium_models[cls] for local, cls in aliases.items()}
    self_model_classes = _self_model_classes(tree, model_names) if mode == "scoped" else set()

    violations: list[tuple[int, str, str]] = []
    checked = 0
    for qualname, func, cls in _iter_units(tree):
        idx = _FunctionIndex(func)
        exempt = (key_file, qualname) in exempt_queries
        self_model = cls is not None and cls.name in self_model_classes

        strict_pred = None
        derived: set[str] = set()
        if mode == "scoped":
            tparams = _tenant_params(func)
            if tparams:
                derived = idx.derived_names(tparams)

                def strict_pred(n: ast.AST, _d=derived) -> bool:
                    return _references_any(n, _d) and not _is_model_attr(n, model_names)

        req: set[str] = set()
        params: set[str] = set()
        if mode == "public":
            params = set(_param_names(func))
            req = _request_values(func, idx)

        def query_ok(exprs: list[ast.AST]) -> bool:
            if strict_pred is not None:
                if any(_contains_tenant_filter(e, model_names, strict_pred) for e in exprs):
                    return True
                # Delegação: o filtro vem de chamada que recebe o parâmetro de tenant.
                return any(
                    isinstance(n, ast.Call)
                    and any(
                        _references_any(a, derived)
                        for a in [*n.args, *(kw.value for kw in n.keywords)]
                    )
                    for e in exprs
                    for n in ast.walk(e)
                )
            if any(_contains_tenant_filter(e, model_names) for e in exprs):
                return True
            return False

        def medium_ok(models: list[str], exprs: list[ast.AST]) -> bool:
            if mode != "medium" or not any(m in medium_cols for m in models):
                return True
            return any(_contains_medium_filter(e, medium_cols) for e in exprs)

        for node in ast.walk(func):
            if not isinstance(node, ast.Call):
                continue
            if _is_query_call(node, query_funcs):
                root = idx.chain_root(node)
                models = _referenced_models(node, root, model_names, query_funcs, self_model)
                if not models:
                    continue
                checked += 1
                related = _related_expressions(root, idx)
                ok = query_ok(related) and medium_ok(models, related)
                if not ok and mode == "public":
                    # Busca raiz: só no próprio statement — o fluxo de dados traria a busca
                    # do objeto pai e "aprovaria" a query filha por tabela.
                    ok = _is_root_lookup(
                        _related_expressions(root, idx, data_flow=False), model_names, req, params
                    )
                if not ok and not exempt:
                    violations.append((node.lineno, qualname, ", ".join(models)))
            else:
                model = _session_get_target(node, model_names, self_model)
                if model is None:
                    continue
                checked += 1
                # Modo medium: session.get não filtra pelo médium — use select com filtro.
                if mode == "medium" and model in medium_cols and not exempt:
                    violations.append((node.lineno, qualname, model))
                    continue
                if not _check_session_get(node, func, idx, strict_pred) and not exempt:
                    violations.append((node.lineno, qualname, model))
    return violations, checked


# ─── Índice de callees (repositories, services, funções do arquivo) ─────────────────


@dataclass
class CalleeInfo:
    params: list[str]  # posicionais, sem self/cls
    has_kwargs: bool
    validated: set[str]  # parâmetros cujo id a função busca escopado no tenant
    is_write: bool = False
    # Chamadas de busca a resolver (self.metodo(...) / funcao_do_modulo(...)) com o tenant:
    # (alvo, nó da chamada, parâmetros da função). Resolvidas por ``_resolve_pending``.
    pending: list = field(default_factory=list)
    all_params: set[str] = field(default_factory=set)


def _has_prefix(name: str | None, prefixes: tuple[str, ...]) -> bool:
    if not name:
        return False
    n = name.lstrip("_")
    return any(n == p or n.startswith(p + "_") for p in prefixes)


def _is_write_name(name: str | None) -> bool:
    return _has_prefix(name, WRITE_PREFIXES)


def _is_read_name(name: str | None) -> bool:
    # get_or_create_* é escrita, apesar do prefixo get
    return _has_prefix(name, READ_PREFIXES) and not _is_write_name(name)


def _compares_id_with(exprs: list[ast.AST], pred) -> bool:
    """Alguma expressão compara uma coluna ``.id`` com valor que satisfaz ``pred``
    (``Modelo.id == x``, ``Modelo.id.in_(xs)``) — a busca é PELO id, na tabela-alvo."""
    for expr in exprs:
        for node in ast.walk(expr):
            if isinstance(node, ast.Compare):
                sides = [node.left, *node.comparators]
                for i, side in enumerate(sides):
                    if isinstance(side, ast.Attribute) and side.attr == "id":
                        if any(pred(o) for o in sides[:i] + sides[i + 1 :]):
                            return True
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "in_"
                and isinstance(node.func.value, ast.Attribute)
                and node.func.value.attr == "id"
                and any(pred(x) for x in node.args)
            ):
                return True
    return False


def _bound_params(call: ast.Call, callee: "CalleeInfo") -> list[tuple[str, ast.AST]]:
    """[(nome do parâmetro do callee, argumento)] da chamada."""
    out = [(callee.params[i], arg) for i, arg in enumerate(call.args) if i < len(callee.params)]
    out += [(kw.arg, kw.value) for kw in call.keywords if kw.arg]
    return out


def _callee_info(func: ast.AST, query_funcs: set[str], model_names: set[str]) -> CalleeInfo:
    a = func.args
    params = [p.arg for p in [*a.posonlyargs, *a.args]]
    if params and params[0] in {"self", "cls"}:
        params = params[1:]
    all_params = set(params) | {p.arg for p in a.kwonlyargs}
    idx = _FunctionIndex(func)
    validated: set[str] = set()
    pending: list = []
    for node in ast.walk(func):
        if not isinstance(node, ast.Call):
            continue
        if _is_query_call(node, query_funcs):
            exprs = _related_expressions(idx.chain_root(node), idx)
            if any(_contains_tenant_filter(e, model_names) for e in exprs):
                for p in all_params:
                    if _compares_id_with(exprs, lambda n, _p=p: _references(n, _p)):
                        validated.add(p)
        elif _is_read_name(_call_name(node)):
            args = [*node.args, *(kw.value for kw in node.keywords)]
            if not any(_is_tenant_value(x, model_names) for x in args):
                continue
            f = node.func
            if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "self":
                pending.append((("self", f.attr), node))
            elif isinstance(f, ast.Name):
                pending.append((("module", f.id), node))
            else:
                # Callee fora do índice (outro repository em variável local...): aceita pelo
                # nome de busca + tenant — limite documentado.
                for p in all_params:
                    if any(_references(x, p) and not _is_tenant_value(x, model_names) for x in args):
                        validated.add(p)
    return CalleeInfo(
        params, a.kwarg is not None, validated, _is_write_name(func.name), pending, all_params
    )


def _resolve_pending(infos: list[tuple["CalleeInfo", object]], resolver) -> None:
    """Propaga validação por chamadas internas: ``self.get_by_id(grupo_id, tenant_id)`` valida
    ``grupo_id`` se ``get_by_id`` busca pelo id o parâmetro que recebe. ``resolver(contexto,
    alvo)`` → CalleeInfo ou None; alvo não resolvido conta pelo nome (limite documentado)."""
    changed = True
    while changed:
        changed = False
        for info, ctx in infos:
            for target, call in info.pending:
                callee = resolver(ctx, target)
                for p in info.all_params - info.validated:
                    if callee is None:
                        args = [*call.args, *(kw.value for kw in call.keywords)]
                        ok = any(_references(x, p) for x in args)
                    else:
                        ok = any(
                            param in callee.validated and _references(arg, p)
                            for param, arg in _bound_params(call, callee)
                        )
                    if ok:
                        info.validated.add(p)
                        changed = True


@dataclass
class CalleeIndex:
    classes: dict[str, tuple[list[str], dict[str, CalleeInfo]]] = field(default_factory=dict)
    modules: dict[str, dict[str, CalleeInfo]] = field(default_factory=dict)

    def method(self, cls: str, name: str, _depth: int = 0) -> CalleeInfo | None:
        if cls not in self.classes or _depth > 5:
            return None
        bases, methods = self.classes[cls]
        if name in methods:
            return methods[name]
        for b in bases:
            found = self.method(b, name, _depth + 1)
            if found:
                return found
        return None


def build_callee_index(tenant_models: set[str], dirs: tuple[Path, ...] = (REPOSITORIES_DIR, SERVICES_DIR)) -> CalleeIndex:
    index = CalleeIndex()
    for d in dirs:
        for path in sorted(d.rglob("*.py")):
            tree = ast.parse(path.read_text(), filename=str(path))
            model_names, query_funcs = _resolve_names(tree, tenant_models)
            funcs: dict[str, CalleeInfo] = {}
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    funcs[node.name] = _callee_info(node, query_funcs, model_names)
                elif isinstance(node, ast.ClassDef):
                    bases = [b.id if isinstance(b, ast.Name) else getattr(b, "attr", "") for b in node.bases]
                    methods = {
                        n.name: _callee_info(n, query_funcs, model_names)
                        for n in node.body
                        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                    }
                    index.classes[node.name] = (bases, methods)
            index.modules[path.stem] = funcs
    # Aliases de import entre repositories (``SenhaControlRepository as BaseSenhaControlRepository``)
    for d in dirs:
        for path in sorted(d.rglob("*.py")):
            tree = ast.parse(path.read_text(), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    for alias in node.names:
                        if alias.asname and alias.name in index.classes and alias.asname not in index.classes:
                            index.classes[alias.asname] = index.classes[alias.name]
    infos: list = []
    for cls, (_bases, methods) in index.classes.items():
        infos += [(m, ("class", cls)) for m in methods.values()]
    for mod, funcs in index.modules.items():
        infos += [(f, ("module", mod)) for f in funcs.values()]

    def resolver(ctx, target):
        kind, name = target
        if kind == "self" and ctx[0] == "class":
            return index.method(ctx[1], name)
        if kind == "module" and ctx[0] == "module":
            return index.modules[ctx[1]].get(name)
        return None

    _resolve_pending(infos, resolver)
    return index


# ─── Checagem 4: FKs recebidos na requisição ────────────────────────────────────────


def _schema_index(tree: ast.Module) -> dict[str, list[str]]:
    """{Classe: campos} para classes do arquivo (com herança entre elas)."""
    raw: dict[str, tuple[list[str], list[str]]] = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            fields = [
                s.target.id for s in node.body
                if isinstance(s, ast.AnnAssign) and isinstance(s.target, ast.Name)
            ]
            bases = [b.id for b in node.bases if isinstance(b, ast.Name)]
            raw[node.name] = (bases, fields)

    def collect(name: str, depth: int = 0) -> list[str]:
        if name not in raw or depth > 5:
            return []
        bases, fields = raw[name]
        out = list(fields)
        for b in bases:
            out += [f for f in collect(b, depth + 1) if f not in out]
        return out

    return {name: collect(name) for name in raw}


def _annotation_schema(ann: ast.AST | None, schemas: dict[str, list[str]]) -> str | None:
    if ann is None:
        return None
    for n in ast.walk(ann):
        if isinstance(n, ast.Name) and n.id in schemas:
            return n.id
    return None


def _is_route(func: ast.AST) -> bool:
    return any(
        isinstance(d, ast.Call)
        and isinstance(d.func, ast.Attribute)
        and d.func.attr in HTTP_METHODS
        for d in func.decorator_list
    )


def _is_depends_default(default: ast.AST | None) -> bool:
    return isinstance(default, ast.Call) and _call_name(default) in {"Depends", "Security"}


@dataclass
class _Tracked:
    param: str
    field: str | None  # None → parâmetro escalar
    column: str

    @property
    def label(self) -> str:
        return f"{self.param}.{self.field}" if self.field else self.param


class _FkFunction:
    """Rastreamento de ids da requisição dentro de uma rota admin."""

    def __init__(self, func, idx: _FunctionIndex, body_params: dict[str, list[str]], tracked: list[_Tracked]):
        self.func = func
        self.idx = idx
        self.tracked = tracked
        # dados derivados do body: body, data = body.model_dump(), kw = dict(data)...
        self.body_derived: dict[str, str] = {p: p for p in body_params}
        changed = True
        while changed:
            changed = False
            for name, items in idx.assignments.items():
                if name in self.body_derived:
                    continue
                for a in items:
                    origin = self._body_origin(a.value)
                    if origin:
                        self.body_derived[name] = origin
                        changed = True
                        break
        self.carriers: dict[int, set[str]] = {}
        for i, t in enumerate(tracked):
            self.carriers[i] = self._carrier_locals(t)

    def _body_origin(self, value: ast.AST) -> str | None:
        """Parâmetro de body de onde vem o dict/objeto (``body.model_dump()``, ``data``)."""
        if isinstance(value, ast.Name) and value.id in self.body_derived:
            return self.body_derived[value.id]
        for n in ast.walk(value):
            if (
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr in {"model_dump", "dict"}
                and isinstance(n.func.value, ast.Name)
                and n.func.value.id in self.body_derived
            ):
                return self.body_derived[n.func.value.id]
            if isinstance(n, ast.Dict):
                for k, v in zip(n.keys, n.values):
                    if k is None and isinstance(v, ast.Name) and v.id in self.body_derived:
                        return self.body_derived[v.id]
        return None

    def _is_carrier_expr(self, node: ast.AST, t: _Tracked, locals_: set[str]) -> bool:
        if isinstance(node, ast.Name):
            return node.id in locals_ or (t.field is None and node.id == t.param)
        if t.field is not None:
            if (
                isinstance(node, ast.Attribute)
                and node.attr == t.field
                and isinstance(node.value, ast.Name)
                and self.body_derived.get(node.value.id) == t.param
            ):
                return True
            if (
                isinstance(node, ast.Subscript)
                and isinstance(node.value, ast.Name)
                and self.body_derived.get(node.value.id) == t.param
                and isinstance(node.slice, ast.Constant)
                and node.slice.value == t.field
            ):
                return True
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"get", "pop"}
                and isinstance(node.func.value, ast.Name)
                and self.body_derived.get(node.func.value.id) == t.param
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and node.args[0].value == t.field
            ):
                return True
        if isinstance(node, ast.Call) and _call_name(node) in CONVERSIONS and node.args:
            return self._is_carrier_expr(node.args[0], t, locals_)
        if isinstance(node, ast.IfExp):
            return self._is_carrier_expr(node.body, t, locals_) or self._is_carrier_expr(node.orelse, t, locals_)
        if isinstance(node, ast.BoolOp):
            return any(self._is_carrier_expr(v, t, locals_) for v in node.values)
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
            return any(self._is_carrier_expr(g.iter, t, locals_) for g in node.generators)
        return False

    def _carrier_locals(self, t: _Tracked) -> set[str]:
        out: set[str] = set()
        changed = True
        while changed:
            changed = False
            for name, items in self.idx.assignments.items():
                if name not in out and any(self._is_carrier_expr(a.value, t, out) for a in items):
                    out.add(name)
                    changed = True
            for target, iter_ in self.idx.loops:
                if self._is_carrier_expr(iter_, t, out):
                    for name in _target_names(target):
                        if name not in out:
                            out.add(name)
                            changed = True
        return out

    def contains_carrier(self, expr: ast.AST, i: int, whole_body: bool = False) -> bool:
        t = self.tracked[i]
        for n in ast.walk(expr):
            if self._is_carrier_expr(n, t, self.carriers[i]):
                return True
            if (
                whole_body
                and t.field is not None
                and isinstance(n, ast.Name)
                and self.body_derived.get(n.id) == t.param
            ):
                return True
        return False

    def is_body_spread(self, expr: ast.AST, i: int) -> bool:
        """``**X`` com X derivado do body do campo rastreado."""
        t = self.tracked[i]
        if t.field is None:
            return False
        if isinstance(expr, ast.Name):
            return self.body_derived.get(expr.id) == t.param
        return self._body_origin(expr) == t.param


def find_unvalidated_fks(
    path: Path,
    info: ModelInfo,
    callees: CalleeIndex | None = None,
    exempt: dict[tuple[str, str, str], str] | None = None,
    source: str | None = None,
    report: list | None = None,
) -> tuple[list[tuple[int, str, str, str]], int]:
    """Retorna (violações [(linha, função, campo, coluna)], sinks checados). ``report``, se
    dado, recebe (linha, função, campo, validado?) de cada sink — para depuração/testes."""
    exempt = EXEMPT_BODY_FKS if exempt is None else exempt
    callees = callees if callees is not None else CalleeIndex()
    tree = ast.parse(source if source is not None else path.read_text(), filename=str(path))
    model_names, query_funcs = _resolve_names(tree, info.tenant_models)
    aliases = _model_aliases(tree, set(info.tables) | set(info.fks))
    schemas = _schema_index(tree)
    fk_cols = info.tenant_fk_columns()
    file_funcs = {
        n.name: _callee_info(n, query_funcs, model_names)
        for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    _resolve_pending(
        [(f, None) for f in file_funcs.values()],
        lambda _ctx, target: file_funcs.get(target[1]) if target[0] == "module" else None,
    )
    module_aliases: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("src.services"):
            for alias in node.names:
                if alias.name in callees.modules:
                    module_aliases[alias.asname or alias.name] = alias.name

    violations: list[tuple[int, str, str, str]] = []
    sinks_checked = 0
    for qualname, func, _cls in _iter_units(tree):
        if not _is_route(func):
            continue
        a = func.args
        all_args = [*a.posonlyargs, *a.args, *a.kwonlyargs]
        defaults: dict[str, ast.AST | None] = {}
        pos = [*a.posonlyargs, *a.args]
        for p, d in zip(pos[len(pos) - len(a.defaults):], a.defaults):
            defaults[p.arg] = d
        for p, d in zip(a.kwonlyargs, a.kw_defaults):
            defaults[p.arg] = d

        body_params: dict[str, list[str]] = {}
        tracked: list[_Tracked] = []
        for p in all_args:
            if _is_depends_default(defaults.get(p.arg)):
                continue
            schema = _annotation_schema(p.annotation, schemas)
            if schema:
                body_params[p.arg] = schemas[schema]
                for f in schemas[schema]:
                    col = f if f in fk_cols else (f[:-1] if f.endswith("_ids") and f[:-1] in fk_cols else None)
                    if col:
                        tracked.append(_Tracked(p.arg, f, col))
            elif p.arg.endswith(("_id", "_ids")):
                col = p.arg if p.arg in fk_cols else (p.arg[:-1] if p.arg[:-1] in fk_cols else None)
                if col:
                    tracked.append(_Tracked(p.arg, None, col))
        if not tracked:
            continue

        idx = _FunctionIndex(func)
        fk = _FkFunction(func, idx, body_params, tracked)

        # Variáveis que guardam instância de repository/service conhecido.
        var_class: dict[str, str] = {}
        for name, items in idx.assignments.items():
            for asg in items:
                v = asg.value.value if isinstance(asg.value, ast.Await) else asg.value
                if isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id in callees.classes:
                    var_class[name] = v.func.id

        def resolve(call: ast.Call) -> CalleeInfo | None:
            f = call.func
            if isinstance(f, ast.Name):
                return file_funcs.get(f.id)
            if isinstance(f, ast.Attribute):
                base = f.value
                if isinstance(base, ast.Name):
                    if base.id in var_class:
                        return callees.method(var_class[base.id], f.attr)
                    if base.id in module_aliases:
                        return callees.modules[module_aliases[base.id]].get(f.attr)
                    if base.id in callees.classes:
                        return callees.method(base.id, f.attr)
                if isinstance(base, ast.Call) and isinstance(base.func, ast.Name) and base.func.id in callees.classes:
                    return callees.method(base.func.id, f.attr)
            return None

        # Buscas escopadas no tenant: (linha, índice do campo rastreado).
        lookups: list[tuple[int, int]] = []
        sinks: list[tuple[int, int]] = []

        for node in ast.walk(func):
            if not isinstance(node, ast.Call):
                continue
            if _is_query_call(node, query_funcs):
                root = idx.chain_root(node)
                exprs = _related_expressions(root, idx)
                if any(_contains_tenant_filter(e, model_names) for e in exprs):
                    for i in range(len(tracked)):
                        if _compares_id_with(exprs, lambda n, _i=i: fk.contains_carrier(n, _i)):
                            lookups.append((node.lineno, i))
                continue

            name = _call_name(node)
            model = aliases.get(name) if isinstance(node.func, (ast.Name, ast.Attribute)) else None
            if model is not None and name[:1].isupper() and model in info.fks:
                # Construtor de modelo: sink pelas colunas FK multi-tenant do modelo.
                cols = info.tenant_fk_columns(model)
                for i, t in enumerate(tracked):
                    if t.column not in cols:
                        continue
                    for kw in node.keywords:
                        if (kw.arg is None and fk.is_body_spread(kw.value, i)) or (
                            kw.arg == t.column and fk.contains_carrier(kw.value, i)
                        ):
                            sinks.append((node.lineno, i))
                continue

            if name == "setattr" and len(node.args) == 3:
                key, value = node.args[1], node.args[2]
                for i, t in enumerate(tracked):
                    if isinstance(key, ast.Constant) and key.value == t.column and fk.contains_carrier(value, i):
                        sinks.append((node.lineno, i))
                    elif not isinstance(key, ast.Constant) and _inside_body_items_loop(node, idx, fk, i):
                        sinks.append((node.lineno, i))
                continue

            args = [*node.args, *(kw.value for kw in node.keywords)]
            callee = resolve(node)
            if _is_read_name(name):
                # Busca/validação que recebe o id (ou o body inteiro) E um valor de tenant:
                # _validar_*_do_tenant(db, tenant_id, body.x_id), repo.get_by_id(id, tenant_id).
                if any(_is_tenant_value(x, model_names) for x in args):
                    for i in range(len(tracked)):
                        if callee is not None:
                            # Callee resolvido: o argumento precisa cair num parâmetro que
                            # ele de fato busca pelo id, escopado no tenant.
                            ok = any(
                                param in callee.validated
                                and fk.contains_carrier(arg, i, whole_body=True)
                                for param, arg in _bound_params(node, callee)
                            )
                        else:
                            ok = any(
                                fk.contains_carrier(x, i, whole_body=True)
                                and not _is_tenant_value(x, model_names)
                                for x in args
                            )
                        if ok:
                            lookups.append((node.lineno, i))
                continue
            if not _is_write_name(name):
                continue

            # Chamada de escrita: sink por keyword/**/posição (posição só com callee resolvido).
            for i, t in enumerate(tracked):
                bound: list[str] = []
                for kw in node.keywords:
                    if kw.arg is None and fk.is_body_spread(kw.value, i):
                        bound.append(t.field)
                    elif kw.arg == t.column and fk.contains_carrier(kw.value, i):
                        bound.append(kw.arg)
                if callee is not None:
                    for pos_i, arg in enumerate(node.args):
                        if pos_i < len(callee.params) and callee.params[pos_i] == t.column and fk.contains_carrier(arg, i):
                            bound.append(t.column)
                for param in bound:
                    if callee is not None and param in callee.validated:
                        # o callee busca o id escopado no tenant antes de gravar
                        if report is not None:
                            report.append((node.lineno, qualname, t.label, "callee"))
                        sinks_checked += 1
                        continue
                    sinks.append((node.lineno, i))

        for node in ast.walk(func):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if not isinstance(target, ast.Attribute):
                        continue
                    for i, t in enumerate(tracked):
                        if target.attr == t.column and fk.contains_carrier(node.value, i):
                            sinks.append((node.lineno, i))

        seen: set[tuple[int, int]] = set()
        for line, i in sorted(set(sinks)):
            if (line, i) in seen:
                continue
            seen.add((line, i))
            sinks_checked += 1
            t = tracked[i]
            safe = any(li < line and ii == i for li, ii in lookups)
            if report is not None:
                report.append((line, qualname, t.label, safe))
            if safe:
                continue
            if (path.name, qualname, t.field or t.param) in exempt:
                continue
            violations.append((line, qualname, t.label, t.column))
    return violations, sinks_checked


def _inside_body_items_loop(node: ast.AST, idx: _FunctionIndex, fk: _FkFunction, i: int) -> bool:
    """``for k, v in <body>.model_dump().items(): setattr(obj, k, v)``."""
    cur = idx.parents.get(node)
    while cur is not None:
        if isinstance(cur, (ast.For, ast.AsyncFor)):
            it = cur.iter
            if (
                isinstance(it, ast.Call)
                and isinstance(it.func, ast.Attribute)
                and it.func.attr == "items"
                and fk.is_body_spread(it.func.value, i)
            ):
                return True
        cur = idx.parents.get(cur)
    return False


# ─── Chamadores de RESOLVED_ID_QUERIES ──────────────────────────────────────────────


def find_callers(method_name: str, src_dir: Path = SRC_DIR) -> set[tuple[str, str]]:
    """Todas as unidades (arquivo relativo a src/, qualname) que chamam ``*.method_name(``."""
    out: set[tuple[str, str]] = set()
    for path in sorted(src_dir.rglob("*.py")):
        text = path.read_text()
        if method_name not in text:
            continue
        tree = ast.parse(text, filename=str(path))
        for qualname, func, _cls in _iter_units(tree):
            for node in ast.walk(func):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == method_name
                ):
                    out.add((_rel_to(path, src_dir), qualname))
    return out


def _rel_to(path: Path, base: Path) -> str:
    try:
        return path.resolve().relative_to(base.resolve()).as_posix()
    except ValueError:
        return path.name


def check_resolved_id_callers(entries: dict | None = None, src_dir: Path = SRC_DIR) -> list[str]:
    """Falha para cada chamador de método de ``RESOLVED_ID_QUERIES`` não listado."""
    entries = RESOLVED_ID_QUERIES if entries is None else entries
    problems: list[str] = []
    for (file, qualname), entry in entries.items():
        declared = {tuple(c) for c in entry["chamadores"]}
        actual = find_callers(qualname.split(".")[-1], src_dir)
        for caller in sorted(actual - declared):
            problems.append(
                f"  {file}:{qualname}() — chamador novo não revisado: {caller[0]}:{caller[1]}()"
            )
    return problems


# ─── main ───────────────────────────────────────────────────────────────────────────


def _scoped_files() -> list[Path]:
    return sorted([*REPOSITORIES_DIR.rglob("*.py"), *SERVICES_DIR.rglob("*.py")])


def main() -> int:
    info = discover_model_info()
    tenant_models = info.tenant_models
    failed = False

    # 1. admin
    admin_v: list[str] = []
    admin_checked = 0
    for path in sorted(ADMIN_DIR.glob("*.py")):
        if path.name in EXEMPT_FILES:
            continue
        violations, checked = find_unfiltered_queries(path, tenant_models)
        admin_checked += checked
        admin_v += [
            f"  admin/{path.name}:{ln}: {fn}() — modelo {m} sem filtro de tenant_id"
            for ln, fn, m in violations
        ]

    # 2. repositories/services
    scoped_v: list[str] = []
    scoped_checked = 0
    for path in _scoped_files():
        violations, checked = find_unfiltered_queries(path, tenant_models, mode="scoped")
        scoped_checked += checked
        scoped_v += [
            f"  {rel_key(path)}:{ln}: {fn}() — modelo {m} sem filtro pelo tenant recebido"
            for ln, fn, m in violations
        ]
    scoped_v += check_resolved_id_callers()

    # 3. public
    public_v: list[str] = []
    public_checked = 0
    for path in sorted(PUBLIC_DIR.glob("*.py")):
        violations, checked = find_unfiltered_queries(path, tenant_models, mode="public")
        public_checked += checked
        public_v += [
            f"  {rel_key(path)}:{ln}: {fn}() — modelo {m} sem filtro de tenant nem busca raiz"
            for ln, fn, m in violations
        ]

    # 5. Área do Médium
    medium_models = discover_medium_models(info)
    medium_v: list[str] = []
    medium_checked = 0
    for path in sorted(MEDIUM_DIR.rglob("*.py")) if MEDIUM_DIR.is_dir() else []:
        violations, checked = find_unfiltered_queries(
            path, tenant_models, mode="medium", medium_models=medium_models
        )
        medium_checked += checked
        medium_v += [
            f"  {rel_key(path)}:{ln}: {fn}() — modelo {m} sem filtro de tenant e/ou do médium logado"
            for ln, fn, m in violations
        ]
        medium_v += [
            f"  {rel_key(path)}:{ln}: {fn} — {onde}: a Área nunca recebe o médium da requisição"
            for ln, fn, onde in find_medium_id_inputs(path)
        ]

    # 4. FKs da requisição
    callees = build_callee_index(tenant_models)
    fk_v: list[str] = []
    fk_checked = 0
    for path in sorted(ADMIN_DIR.glob("*.py")):
        if path.name in EXEMPT_FILES:
            continue
        violations, checked = find_unvalidated_fks(path, info, callees)
        fk_checked += checked
        fk_v += [
            f"  admin/{path.name}:{ln}: {fn}() — {campo} (FK {col}) gravado sem busca escopada no tenant"
            for ln, fn, campo, col in violations
        ]

    sections = [
        ("Queries admin sobre modelo multi-tenant SEM filtro de tenant_id", admin_v,
         "Adicione `.where(<Modelo>.tenant_id == current_user.tenant_id)` ou justifique em "
         "EXEMPT_QUERIES."),
        ("Queries em repositories/services SEM filtro pelo tenant recebido", scoped_v,
         "Filtre pelo parâmetro de tenant do método (`<Modelo>.tenant_id == tenant_id`). Sem "
         "parâmetro de tenant: justifique em EXEMPT_SCOPED_QUERIES (cross-tenant por design) "
         "ou RESOLVED_ID_QUERIES (id já resolvido no tenant, listando os chamadores)."),
        ("Queries públicas SEM filtro de tenant nem busca raiz", public_v,
         "Filtre pelo tenant do objeto pai (`<Modelo>.tenant_id == ticket.tenant_id`) ou "
         "justifique em EXEMPT_PUBLIC_QUERIES."),
        ("Área do Médium: query sem filtro de tenant/médium ou medium_id vindo da requisição", medium_v,
         "Filtre por `ctx.tenant_id` e, em modelo do médium, por `ctx.medium.id` "
         "(`<Modelo>.mediun_id == ctx.medium.id`); nunca receba medium_id na rota. Exceção "
         "justificada em EXEMPT_MEDIUM_QUERIES."),
        ("FKs recebidos na requisição gravados SEM busca escopada no tenant", fk_v,
         "Valide o id antes de gravar (`_validar_*_do_tenant(db, current_user.tenant_id, "
         "body.x_id)` ou `repo.get_by_id(body.x_id, current_user.tenant_id)`) ou justifique "
         "em EXEMPT_BODY_FKS."),
    ]
    for title, lines, hint in sections:
        if lines:
            failed = True
            print(f"{title}:\n")
            print("\n".join(lines))
            print(f"\n{hint}\n")

    if failed:
        print("Exceções ficam em scripts/audit_tenant_isolation.py, com justificativa de uma linha.")
        return 1
    print(
        f"OK: {len(tenant_models)} modelos multi-tenant; queries com filtro de tenant — "
        f"admin {admin_checked}, repositories/services {scoped_checked}, public "
        f"{public_checked}, medium {medium_checked}; {fk_checked} gravações de FK da "
        f"requisição validadas no tenant "
        f"({len(EXEMPT_QUERIES)} + {len(EXEMPT_SCOPED_QUERIES) + len(RESOLVED_ID_QUERIES)} + "
        f"{len(EXEMPT_PUBLIC_QUERIES)} + {len(EXEMPT_BODY_FKS)} exceções justificadas)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
