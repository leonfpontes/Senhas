#!/usr/bin/env python3
"""Audita se toda query sobre modelo multi-tenant em endpoints admin filtra por tenant_id.

Falha (exit 1) se encontrar, em backend/src/api/v1/admin/, um ``select()``/``update()``/
``delete()`` do SQLAlchemy (ou ``session.get(Modelo, id)``) sobre modelo que tem coluna
``tenant_id`` sem filtro de tenant associado, fora da lista de exceções justificadas abaixo.
Item Q-02 de docs/plano-execucao.md — mesmo padrão de scripts/audit_permission_guards.py.

Uso: python scripts/audit_tenant_isolation.py

Como funciona (heurística AST, sem importar a aplicação):

1. Modelos multi-tenant são descobertos lendo ``src/models/*.py``: toda classe cujo corpo
   atribui ``tenant_id`` (``tenant_id: Mapped[...] = ...``). A lista se atualiza sozinha
   quando um modelo novo ganha a coluna.
2. Em cada arquivo admin, os nomes de modelo são resolvidos com os aliases dos imports
   (``from src.models.x import Medium as MediumModel``, inclusive relativos) e de
   ``aliased(Modelo)``. As funções ``select``/``update``/``delete``/``exists`` só contam quando
   importadas de ``sqlalchemy`` (inclusive com alias, ex. ``select as sa_select``) —
   ``db.delete(obj)`` e ``dict.update()`` não contam.
3. Para cada chamada ``select(...)``/``update(...)``/``delete(...)`` cujos argumentos (ou o
   ``.select_from(...)`` encadeado) citam um modelo multi-tenant (``select(Gira)``,
   ``select(Gira.id)``, ``select(func.count()).select_from(Ticket)``, ``update(Ticket)``,
   ``exists().where(Gira.x == y)``...), a "expressão relacionada" da query é:
   - a cadeia inteira do statement (``select(X).join(...).where(...).filter_by(...)``);
   - se o statement é atribuído a uma variável (``stmt = select(X)``), as extensões seguintes
     dessa variável (``stmt = stmt.where(...)``) até ela ser reatribuída a outra coisa — reusar
     o nome ``stmt`` para outra query mais abaixo não "empresta" o filtro — e as variáveis
     derivadas dela (``q2 = stmt.where(...)``);
   - por fluxo de dados, os valores de qualquer variável local citada nessas expressões — o
     que cobre ``conditions = [...]``/``conditions.append(...)``/``where(*conditions)``,
     ``where_clause = and_(...)`` e o filtro via pai carregado na mesma função
     (``gira = (await db.execute(select(Gira).where(Gira.tenant_id == tid, ...))).scalar()``
     seguido de ``select(Ticket).where(Ticket.gira_id == gira.id)``).
4. A query passa se a expressão relacionada contém um filtro de tenant:
   - comparação (``==``/``in``) entre um atributo ``.tenant_id`` e um valor "de tenant"
     (nome contendo ``tenant`` ou ``tid``, ``<obj>.tenant_id`` de objeto não-modelo como
     ``current_user.tenant_id``, ou ``<tenant>.id``); ou
   - ``.filter_by(tenant_id=...)``/``.where(Modelo.tenant_id.in_(...))``.
   Comparar dois modelos entre si (``Gira.tenant_id == Ticket.tenant_id``, condição de join)
   NÃO conta como filtro.
5. ``<sessão>.get(Modelo, id)`` sobre modelo multi-tenant exige, na mesma função, uma
   comparação ``<resultado>.tenant_id`` (ex. ``if obj.tenant_id != current_user.tenant_id``).

Limites conhecidos (documentados de propósito — o auditor é rede de segurança, não prova):
- Só olha ``src/api/v1/admin/``. Repositories (``src/repositories/``), services e rotas
  public/platform não são auditados aqui; o filtro feito dentro de um repository chamado
  pelo endpoint (ex. ``repo.get(tenant_id, id)``) não é query montada no endpoint, logo não
  é cobrado nem verificado.
- Não verifica QUAL valor é comparado: ``Gira.tenant_id == outra_variavel_com_tenant`` passa
  mesmo se a variável vier de input do usuário. Também não verifica fluxo de controle: um
  filtro dentro de um ``if`` conta como se sempre fosse aplicado.
- A propagação para variáveis derivadas (``q2 = base.where(...)``) é generosa: um filtro só em
  ``q2`` faz ``base`` passar também, mesmo que ``base`` seja executada sem filtro em outro ponto.
- O filtro via pai só é reconhecido quando o pai foi carregado por ``select`` filtrado na
  MESMA função. Pai validado por repository (``gira = await repo.get(tid, id)``) ou em outra
  função não conta: a query filha precisa de filtro de tenant próprio (preferível, é barato) ou
  de entrada em ``EXEMPT_QUERIES``. Por isso remover o filtro de uma query filha cujo pai foi
  filtrado na mesma função NÃO quebra o auditor (o acesso continua de fato restrito ao tenant).
- Exceções são por função inteira (como ``EXEMPT_ENDPOINTS`` do auditor de RBAC): uma query
  nova adicionada a uma função isenta não é cobrada.
- Valida que o FK recebido no body (``categoria_id``, ``item_id``...) pertence ao tenant? Não —
  isso não é query, é validação de input; continua responsabilidade de quem escreve o endpoint.
- SQL textual (``text("...")``) e ``session.execute()`` com strings não são analisados.
"""
import ast
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ADMIN_DIR = BACKEND_DIR / "src" / "api" / "v1" / "admin"
MODELS_DIR = BACKEND_DIR / "src" / "models"

# Arquivos inteiros fora da auditoria. Diferente do auditor de RBAC, as rotas de sistema
# (health, billing, subscription_info, support_chat...) SÃO auditadas — isolamento de tenant
# não tem exceção de "rota de plataforma"; se não fazem query multi-tenant, passam sozinhas.
EXEMPT_FILES: dict[str, str] = {
    "__init__.py": "só registra routers, não tem query",
}

# Funções individuais isentas, com justificativa obrigatória (lida no código, não suposta).
# Chave: (arquivo, nome da função mais externa que contém a query).
EXEMPT_QUERIES: dict[tuple[str, str], str] = {
    ("audit_trail.py", "_resolve_user_names"): (
        "resolve nomes de impersonated_by (super_admins, tenant_id NULL) a partir de logs já "
        "filtrados por tenant em list_audit_logs; filtrar por tenant esconderia o impersonador"
    ),
    ("sites.py", "update_site"): (
        "checagem de unicidade de slug é global por design (slug do site público é único "
        "entre todos os tenants); só retorna existência, nenhum dado de outro tenant"
    ),
    ("users.py", "list_users"): (
        "ramo `current_user.tenant_id is None` é o super_admin vendo todos os usuários; "
        "usuários de tenant caem nos ramos via UserRepository filtrados por tenant_id"
    ),
}

QUERY_FUNCS = {"select", "update", "delete", "exists"}


# ─── Descoberta de modelos multi-tenant ─────────────────────────────────────────────


def discover_tenant_models(models_dir: Path = MODELS_DIR) -> set[str]:
    """Nomes de classe em src/models/*.py cujo corpo atribui a coluna ``tenant_id``."""
    models: set[str] = set()
    for path in sorted(models_dir.glob("*.py")):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            for stmt in node.body:
                targets: list[ast.AST] = []
                if isinstance(stmt, ast.AnnAssign):
                    targets = [stmt.target]
                elif isinstance(stmt, ast.Assign):
                    targets = list(stmt.targets)
                if any(isinstance(t, ast.Name) and t.id == "tenant_id" for t in targets):
                    models.add(node.name)
                    break
    return models


# ─── Resolução de nomes no arquivo auditado ─────────────────────────────────────────


def _resolve_names(tree: ast.Module, tenant_models: set[str]) -> tuple[set[str], set[str]]:
    """Retorna (nomes locais de modelos multi-tenant, nomes locais de select/update/delete)."""
    model_names = set(tenant_models)
    query_funcs: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                local = alias.asname or alias.name
                # from src.models.x import M / from ....models import M (import relativo)
                is_models = node.module.startswith("src.models") or (
                    node.level > 0 and node.module.split(".")[0] == "models"
                )
                if is_models and alias.name in tenant_models:
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


def _call_name(call: ast.Call) -> str | None:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


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
    call: ast.Call, root: ast.AST, model_names: set[str], query_funcs: set[str]
) -> list[str]:
    """Modelos multi-tenant consultados pela query: argumentos do select/update/delete e do
    ``.select_from(...)`` encadeado; para ``exists()`` sem argumentos, os modelos citados na
    cadeia (``exists().where(Gira.x == y)``). Não desce em sub-selects, que são auditados como
    queries próprias."""
    found: list[str] = []
    stack: list[ast.AST] = list(call.args) + [kw.value for kw in call.keywords]
    stack += _chain_method_args(root, call, {"select_from"})
    if _call_name(call) == "exists" and not call.args:
        stack += _chain_method_args(root, call, None)
    while stack:
        node = stack.pop()
        if _is_query_call(node, query_funcs):
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
            # current_user.tenant_id, gira.tenant_id — mas não Gira.tenant_id (coluna).
            if n.attr == "tenant_id" and not _is_model_attr(n, model_names):
                if not (isinstance(n.value, ast.Name) and n.value.id[:1].isupper()):
                    return True
            # tenant.id, self.tenant.id — mas não Tenant.id (coluna).
            if n.attr == "id" and isinstance(n.value, (ast.Name, ast.Attribute)):
                base = n.value.id if isinstance(n.value, ast.Name) else n.value.attr
                if "tenant" in base.lower() and not base[:1].isupper():
                    return True
    return False


def _contains_tenant_filter(expr: ast.AST, model_names: set[str]) -> bool:
    for node in ast.walk(expr):
        if isinstance(node, ast.Compare):
            sides = [node.left, *node.comparators]
            for i, side in enumerate(sides):
                if not _has_tenant_attr(side):
                    continue
                others = sides[:i] + sides[i + 1 :]
                if any(_is_tenant_value(o, model_names) for o in others):
                    return True
        elif isinstance(node, ast.Call):
            # .filter_by(tenant_id=...)
            if _call_name(node) == "filter_by" and any(kw.arg == "tenant_id" for kw in node.keywords):
                return True
            # Modelo.tenant_id.in_(...)
            func = node.func
            if (
                isinstance(func, ast.Attribute)
                and func.attr == "in_"
                and isinstance(func.value, ast.Attribute)
                and func.value.attr == "tenant_id"
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


def _references(expr: ast.AST, name: str) -> bool:
    return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(expr))


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
    return []


def _related_expressions(root: ast.AST, idx: _FunctionIndex) -> list[ast.AST]:
    """Expressões que compõem a query: a cadeia do statement, as extensões da variável que o
    guarda (``stmt = stmt.where(...)``), variáveis derivadas (``q2 = stmt.where(...)``) e, por
    fluxo de dados, os valores das variáveis locais citadas (``where(*conditions)``)."""
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


def _session_get_target(call: ast.Call, model_names: set[str]) -> str | None:
    """<sessão>.get(Modelo, id) sobre modelo multi-tenant → nome do modelo."""
    if (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "get"
        and len(call.args) >= 2
        and isinstance(call.args[0], ast.Name)
        and call.args[0].id in model_names
    ):
        return call.args[0].id
    return None


def _check_session_get(call: ast.Call, func: ast.AST, idx: _FunctionIndex) -> bool:
    """True se o resultado de session.get é comparado com tenant na função."""
    node: ast.AST = call
    parent = idx.parents.get(node)
    if isinstance(parent, ast.Await):
        node = parent
    names = idx.assigned_names(node)
    for sub in ast.walk(func):
        if not isinstance(sub, ast.Compare):
            continue
        for side in [sub.left, *sub.comparators]:
            if (
                isinstance(side, ast.Attribute)
                and side.attr == "tenant_id"
                and isinstance(side.value, ast.Name)
                and side.value.id in names
            ):
                return True
    return False


def find_unfiltered_queries(
    path: Path,
    tenant_models: set[str],
    exempt_queries: dict[tuple[str, str], str] | None = None,
    source: str | None = None,
) -> tuple[list[tuple[int, str, str]], int]:
    """Retorna (violações [(linha, função, modelo)], total de queries multi-tenant checadas)."""
    exempt_queries = EXEMPT_QUERIES if exempt_queries is None else exempt_queries
    tree = ast.parse(source if source is not None else path.read_text(), filename=str(path))
    model_names, query_funcs = _resolve_names(tree, tenant_models)

    # Unidade de análise: função mais externa (módulo ou método de classe). Funções
    # aninhadas entram no escopo da externa.
    units: list[ast.AST] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            units.append(node)
        elif isinstance(node, ast.ClassDef):
            units.extend(
                n for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            )

    violations: list[tuple[int, str, str]] = []
    checked = 0
    for func in units:
        idx = _FunctionIndex(func)
        exempt = (path.name, func.name) in exempt_queries
        for node in ast.walk(func):
            if not isinstance(node, ast.Call):
                continue
            if _is_query_call(node, query_funcs):
                root = idx.chain_root(node)
                models = _referenced_models(node, root, model_names, query_funcs)
                if not models:
                    continue
                checked += 1
                ok = any(
                    _contains_tenant_filter(e, model_names) for e in _related_expressions(root, idx)
                )
                if not ok and not exempt:
                    violations.append((node.lineno, func.name, ", ".join(models)))
            else:
                model = _session_get_target(node, model_names)
                if model is None:
                    continue
                checked += 1
                if not _check_session_get(node, func, idx) and not exempt:
                    violations.append((node.lineno, func.name, model))
    return violations, checked


def main() -> int:
    tenant_models = discover_tenant_models()
    all_violations: dict[str, list[tuple[int, str, str]]] = {}
    total_checked = 0
    for path in sorted(ADMIN_DIR.glob("*.py")):
        if path.name in EXEMPT_FILES:
            continue
        violations, checked = find_unfiltered_queries(path, tenant_models)
        total_checked += checked
        if violations:
            all_violations[path.name] = violations

    if not all_violations:
        print(
            f"OK: {total_checked} queries sobre {len(tenant_models)} modelos multi-tenant "
            f"em endpoints admin filtram por tenant_id "
            f"({len(EXEMPT_QUERIES)} exceções justificadas)."
        )
        return 0

    print("Queries admin sobre modelo multi-tenant SEM filtro de tenant_id:\n")
    for filename, violations in all_violations.items():
        for lineno, funcname, model in violations:
            print(f"  {ADMIN_DIR.name}/{filename}:{lineno}: {funcname}() — modelo {model} sem filtro de tenant_id")
    print(
        "\nAdicione `.where(<Modelo>.tenant_id == current_user.tenant_id)` à query. Se o acesso "
        "sem filtro é intencional (ex. filtra via pai já validado do tenant, ou é visão "
        "cross-tenant de plataforma), adicione (arquivo, função) a EXEMPT_QUERIES em "
        "scripts/audit_tenant_isolation.py com uma justificativa de uma linha."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
