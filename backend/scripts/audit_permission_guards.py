#!/usr/bin/env python3
"""Audita os guards de acesso das rotas autenticadas do tenant.

Falha (exit 1) se:
1. algum endpoint em backend/src/api/v1/admin/ não tiver guard de grupo de permissão
   (require_group_permission/require_any_group_permission), fora da lista de exceções
   documentada em CLAUDE.md / AGENTS.md §3.3;
2. o ``admin_router`` (admin/__init__.py) perder o ``Depends(require_backoffice)`` — é ele
   que barra o papel ``medium`` (Área do Médium, AM-02) em TODA rota admin, inclusive nas
   exceções acima;
3. a Área do Médium (backend/src/api/v1/medium/) sair do ``require_medium``: o
   ``medium_router`` do __init__.py precisa de prefixo ``/api/v1/medium`` e
   ``dependencies=[Depends(require_medium)]``, e todo router de arquivo da pasta precisa
   ser incluído nele (ou declarar o próprio ``require_medium``). Rotas da Área são isentas
   de grupo de permissão (o médium não tem grupo) — a exceção está em CLAUDE.md/AGENTS.md.

Uso: python scripts/audit_permission_guards.py
"""
import ast
import sys
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parent.parent / "src" / "api" / "v1" / "admin"
MEDIUM_DIR = Path(__file__).resolve().parent.parent / "src" / "api" / "v1" / "medium"
MEDIUM_PREFIX = "/api/v1/medium"

# Rotas de sistema/plataforma isentas do guard de grupo (ver CLAUDE.md).
EXEMPT_FILES = {
    "health.py",
    "billing_stripe.py",
    "subscription_info.py",
    "permission_groups.py",  # usa checagem manual de is_admin (evita paradoxo de lockout)
    "email_resend.py",  # já é is_admin bypass
    "dashboard_summary.py",  # dashboard agregado geral
    "support_chat.py",  # chat de suporte é canal universal, sem gate de grupo (ver CLAUDE.md)
    "__init__.py",
}

GUARD_NAMES = {"require_group_permission", "require_any_group_permission"}
ROUTER_METHODS = {"get", "post", "put", "patch", "delete"}

# Endpoints individuais isentos do guard de grupo (ver CLAUDE.md), em arquivos que
# continuam auditados normalmente para os demais endpoints.
EXEMPT_ENDPOINTS = {
    ("config.py", "get_tenant_branding"),  # branding é dado público, não sensível
}


def _calls_guard(node: ast.AST) -> bool:
    """True se algum Call dentro da subárvore chama uma das funções de guard."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            func = sub.func
            name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)
            if name in GUARD_NAMES:
                return True
    return False


def _is_router_decorator(dec: ast.AST) -> bool:
    if not isinstance(dec, ast.Call):
        return False
    func = dec.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr in ROUTER_METHODS
        and isinstance(func.value, ast.Name)
        and func.value.id == "router"
    )


def find_unguarded_endpoints(path: Path) -> list[tuple[int, str]]:
    tree = ast.parse(path.read_text(), filename=str(path))
    violations = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if not _is_router_decorator(dec):
                continue
            # Guard pode estar no `dependencies=[...]` do decorator OU em
            # `Depends(require_group_permission(...))` como default de parâmetro.
            guarded = _calls_guard(dec) or any(
                _calls_guard(default) for default in node.args.defaults
            )
            if not guarded and (path.name, node.name) not in EXEMPT_ENDPOINTS:
                violations.append((node.lineno, node.name))
    return violations


def _calls_named(node: ast.AST, name: str) -> bool:
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            func = sub.func
            if (func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)) == name:
                return True
        elif isinstance(sub, ast.Name) and sub.id == name:
            # Depends(require_x) — a função passada sem ser chamada.
            return True
    return False


def _router_assignments(tree: ast.Module) -> dict[str, ast.Call]:
    """{nome: chamada APIRouter(...)} das atribuições de módulo ``x = APIRouter(...)``."""
    out = {}
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and getattr(node.value.func, "id", getattr(node.value.func, "attr", None)) == "APIRouter"
        ):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    out[target.id] = node.value
    return out


def _deps_have(call: ast.Call, guard: str) -> bool:
    return any(kw.arg == "dependencies" and _calls_named(kw.value, guard) for kw in call.keywords)


def check_admin_router_backoffice(admin_dir: Path = ADMIN_DIR) -> list[str]:
    """admin_router precisa de dependencies=[Depends(require_backoffice)]."""
    init = admin_dir / "__init__.py"
    routers = _router_assignments(ast.parse(init.read_text(), filename=str(init)))
    call = routers.get("admin_router")
    if call is None:
        return [f"  {admin_dir.name}/__init__.py — admin_router = APIRouter(...) não encontrado"]
    if not _deps_have(call, "require_backoffice"):
        return [
            f"  {admin_dir.name}/__init__.py:{call.lineno} — admin_router sem "
            "dependencies=[Depends(require_backoffice)] (papel `medium` entraria no painel)"
        ]
    return []


def check_medium_routers(medium_dir: Path = MEDIUM_DIR) -> list[str]:
    """Todo router da Área do Médium passa por require_medium (AM-02)."""
    if not medium_dir.is_dir():
        return []
    init = medium_dir / "__init__.py"
    if not init.exists():
        return [f"  {medium_dir.name}/ — falta __init__.py com o medium_router"]
    tree = ast.parse(init.read_text(), filename=str(init))
    routers = _router_assignments(tree)
    call = routers.get("medium_router")
    problems: list[str] = []
    if call is None:
        return [f"  {medium_dir.name}/__init__.py — medium_router = APIRouter(...) não encontrado"]
    prefix = next(
        (kw.value.value for kw in call.keywords if kw.arg == "prefix" and isinstance(kw.value, ast.Constant)),
        None,
    )
    if prefix != MEDIUM_PREFIX:
        problems.append(f"  {medium_dir.name}/__init__.py:{call.lineno} — medium_router sem prefix={MEDIUM_PREFIX!r}")
    if not _deps_have(call, "require_medium"):
        problems.append(
            f"  {medium_dir.name}/__init__.py:{call.lineno} — medium_router sem "
            "dependencies=[Depends(require_medium)]"
        )
    # Rotas declaradas direto no __init__ usam o medium_router (protegido); outro router ali não.
    for name, other in routers.items():
        if name != "medium_router" and not _deps_have(other, "require_medium"):
            problems.append(f"  {medium_dir.name}/__init__.py:{other.lineno} — router {name} sem require_medium")

    # Routers dos arquivos: incluídos no medium_router (herdam a dependência) ou com a própria.
    imported: dict[str, str] = {}  # nome local → módulo
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module:
            for alias in node.names:
                if alias.name == "router":
                    imported[alias.asname or alias.name] = node.module
    included_modules = {
        imported[arg.id]
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "include_router"
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "medium_router"
        for arg in node.args[:1]
        if isinstance(arg, ast.Name) and arg.id in imported
    }
    for path in sorted(medium_dir.rglob("*.py")):
        if path == init:
            continue
        module = path.relative_to(medium_dir).with_suffix("").as_posix().replace("/", ".")
        for name, rcall in _router_assignments(ast.parse(path.read_text(), filename=str(path))).items():
            if module in included_modules and name == "router":
                continue
            if not _deps_have(rcall, "require_medium"):
                problems.append(
                    f"  {medium_dir.name}/{path.relative_to(medium_dir)}:{rcall.lineno} — router {name} "
                    "fora do medium_router e sem require_medium"
                )
    return problems


def main() -> int:
    structural = check_admin_router_backoffice() + check_medium_routers()
    if structural:
        print("Routers sem o guard de área (AM-02):\n")
        print("\n".join(structural))
        print(
            "\nadmin_router precisa de Depends(require_backoffice); medium_router de "
            "prefix='/api/v1/medium' e Depends(require_medium), incluindo todo router de "
            "src/api/v1/medium/."
        )
        return 1

    all_violations: dict[str, list[tuple[int, str]]] = {}
    for path in sorted(ADMIN_DIR.glob("*.py")):
        if path.name in EXEMPT_FILES:
            continue
        violations = find_unguarded_endpoints(path)
        if violations:
            all_violations[path.name] = violations

    if not all_violations:
        print(
            "OK: todos os endpoints admin têm guard de grupo de permissão; admin_router com "
            "require_backoffice; Área do Médium com require_medium."
        )
        return 0

    print("Endpoints admin SEM require_group_permission/require_any_group_permission:\n")
    for filename, violations in all_violations.items():
        for lineno, funcname in violations:
            print(f"  {ADMIN_DIR.name}/{filename}:{lineno} — {funcname}()")
    print(
        "\nSe algum destes é intencional: rota de sistema inteira → EXEMPT_FILES; "
        "endpoint pontual num arquivo majoritariamente guardado → EXEMPT_ENDPOINTS. "
        "Em ambos os casos, adicione também à lista de exceções em CLAUDE.md/AGENTS.md §3.3."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
