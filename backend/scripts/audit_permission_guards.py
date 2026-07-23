#!/usr/bin/env python3
"""Audita se todo endpoint admin tem require_group_permission/require_any_group_permission.

Falha (exit 1) se encontrar endpoint em backend/src/api/v1/admin/ sem guard de grupo
de permissão, fora da lista de exceções documentada em CLAUDE.md / AGENTS.md §3.3.

Uso: python scripts/audit_permission_guards.py
"""
import ast
import sys
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parent.parent / "src" / "api" / "v1" / "admin"

# Rotas de sistema/plataforma isentas do guard de grupo (ver CLAUDE.md).
EXEMPT_FILES = {
    "health.py",
    "billing_stripe.py",
    "subscription_info.py",
    "permission_groups.py",  # usa checagem manual de is_admin (evita paradoxo de lockout)
    "email_resend.py",  # já é is_admin bypass
    "dashboard_summary.py",  # dashboard agregado geral
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


def main() -> int:
    all_violations: dict[str, list[tuple[int, str]]] = {}
    for path in sorted(ADMIN_DIR.glob("*.py")):
        if path.name in EXEMPT_FILES:
            continue
        violations = find_unguarded_endpoints(path)
        if violations:
            all_violations[path.name] = violations

    if not all_violations:
        print("OK: todos os endpoints admin têm guard de grupo de permissão.")
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
