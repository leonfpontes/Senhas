"""Phase 2 Implementation Validation Script.

Validates that all required files are created and have correct structure.
"""
import os
import sys
import ast
import json
from pathlib import Path
from datetime import datetime

BACKEND_ROOT = Path(__file__).parent / "backend" / "src"


def check_file_exists(path: str) -> bool:
    """Check if file exists."""
    return (BACKEND_ROOT / path).exists()


def check_file_syntax(path: str) -> dict:
    """Check Python file syntax."""
    full_path = BACKEND_ROOT / path
    result = {"exists": full_path.exists(), "valid_syntax": False, "error": None}
    
    if not result["exists"]:
        result["error"] = "File not found"
        return result
    
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            code = f.read()
        ast.parse(code)
        result["valid_syntax"] = True
    except SyntaxError as e:
        result["error"] = str(e)
    
    return result


def validate_phase_2():
    """Validate Phase 2 implementation."""
    results = {
        "phase": "2",
        "timestamp": datetime.utcnow().isoformat(),
        "status": "COMPLETE",
        "files_created": [],
        "models": [],
        "security": [],
        "middleware": [],
        "api": [],
        "repositories": [],
        "core": [],
        "alembic": [],
        "errors": [],
    }
    
    # ========== CHECK CORE FILES ==========
    core_files = [
        "core/config.py",
        "core/database.py",
        "core/errors.py",
        "core/logging.py",
        "core/__init__.py",
    ]
    
    for f in core_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["core"].append({"file": f, "status": "✅ OK"})
        else:
            results["core"].append({"file": f, "status": "❌ INVALID", "error": result["error"]})
            results["errors"].append(f"Core file {f}: {result['error']}")
    
    # ========== CHECK MODELS ==========
    model_files = [
        ("models/base.py", "T?"),
        ("models/tenants.py", "T011"),
        ("models/users.py", "T012"),
        ("models/giras.py", "T013"),
        ("models/consulentes.py", "T014"),
        ("models/tickets.py", "T015"),
        ("models/senha_controls.py", "T016"),
        ("models/audit_logs.py", "T017"),
        ("models/__init__.py", "T?"),
    ]
    
    for f, task in model_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["models"].append({"file": f, "task": task, "status": "✅ OK"})
        else:
            results["models"].append({"file": f, "task": task, "status": "❌ INVALID"})
            results["errors"].append(f"Model {f} ({task}): {result['error']}")
    
    # ========== CHECK SECURITY & AUTH ==========
    security_files = [
        ("security/jwt.py", "T019"),
        ("security/password.py", "T021"),
        ("security/__init__.py", "T?"),
        ("middleware/jwt_middleware.py", "T020"),
        ("middleware/tenant_context.py", "T027"),
        ("middleware/__init__.py", "T?"),
    ]
    
    for f, task in security_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["security"].append({"file": f, "task": task, "status": "✅ OK"})
        else:
            results["security"].append({"file": f, "task": task, "status": "❌ INVALID"})
            results["errors"].append(f"Security {f} ({task}): {result['error']}")
    
    # ========== CHECK API & DEPENDENCIES ==========
    api_files = [
        ("api/dependencies.py", "T022"),
        ("api/v1/auth/login.py", "T023-T025"),
        ("api/v1/auth/__init__.py", "T?"),
        ("api/v1/__init__.py", "T?"),
        ("api/__init__.py", "T?"),
    ]
    
    for f, task in api_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["api"].append({"file": f, "task": task, "status": "✅ OK"})
        else:
            results["api"].append({"file": f, "task": task, "status": "❌ INVALID"})
            results["errors"].append(f"API {f} ({task}): {result['error']}")
    
    # ========== CHECK REPOSITORIES ==========
    repo_files = [
        ("repositories/base.py", "T028"),
        ("repositories/__init__.py", "T?"),
    ]
    
    for f, task in repo_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["repositories"].append({"file": f, "task": task, "status": "✅ OK"})
        else:
            results["repositories"].append({"file": f, "task": task, "status": "❌ INVALID"})
            results["errors"].append(f"Repository {f} ({task}): {result['error']}")
    
    # ========== CHECK APP & ALEMBIC ==========
    other_files = [
        ("main.py", "T026"),
        ("__init__.py", "T?"),
    ]
    
    for f, task in other_files:
        result = check_file_syntax(f)
        if result["valid_syntax"]:
            results["alembic"].append({"file": f, "task": task, "status": "✅ OK"})
        else:
            results["alembic"].append({"file": f, "task": task, "status": "❌ INVALID"})
            results["errors"].append(f"App {f} ({task}): {result['error']}")
    
    # Check migration file
    migration_file = Path(__file__).parent / "backend" / "alembic" / "versions" / "002_create_tables.py"
    if migration_file.exists():
        result = check_file_syntax("../../alembic/versions/002_create_tables.py")
        if result["valid_syntax"]:
            results["alembic"].append({"file": "alembic/versions/002_create_tables.py", "task": "T018", "status": "✅ OK"})
        else:
            results["alembic"].append({"file": "alembic/versions/002_create_tables.py", "task": "T018", "status": "❌ INVALID"})
    else:
        results["alembic"].append({"file": "alembic/versions/002_create_tables.py", "task": "T018", "status": "❌ NOT FOUND"})
    
    # ========== COLLECT FILES CREATED ==========
    for category in ["core", "models", "security", "middleware", "api", "repositories", "alembic"]:
        for item in results[category]:
            results["files_created"].append(item.get("file", ""))
    
    # ========== DETERMINE OVERALL STATUS ==========
    if results["errors"]:
        results["status"] = "⚠️ INCOMPLETE - Errors found"
    else:
        results["status"] = "✅ COMPLETE"
    
    return results


if __name__ == "__main__":
    results = validate_phase_2()
    
    print("\n" + "="*80)
    print("PHASE 2: FOUNDATIONAL BACKEND INFRASTRUCTURE - VALIDATION REPORT")
    print("="*80)
    
    print(f"\n📋 Phase: {results['phase']}")
    print(f"📅 Timestamp: {results['timestamp']}")
    print(f"📊 Status: {results['status']}")
    
    print(f"\n📁 Core Components ({len(results['core'])} files):")
    for item in results["core"]:
        print(f"  {item['status']} {item['file']}")
    
    print(f"\n📦 Models - ORM (T011-T017) ({len(results['models'])} files):")
    for item in results["models"]:
        print(f"  {item['status']} {item['file']} [{item['task']}]")
    
    print(f"\n🔐 Security & Auth (T019-T025) ({len(results['security'])} files):")
    for item in results["security"]:
        print(f"  {item['status']} {item['file']} [{item['task']}]")
    
    print(f"\n🌐 API & Dependencies (T022-T025) ({len(results['api'])} files):")
    for item in results["api"]:
        print(f"  {item['status']} {item['file']} [{item['task']}]")
    
    print(f"\n💾 Repositories (T028) ({len(results['repositories'])} files):")
    for item in results["repositories"]:
        print(f"  {item['status']} {item['file']} [{item['task']}]")
    
    print(f"\n🚀 App Factory & Migration (T018, T026) ({len(results['alembic'])} files):")
    for item in results["alembic"]:
        print(f"  {item['status']} {item['file']} [{item['task']}]")
    
    print(f"\n⚠️ Errors Found: {len(results['errors'])}")
    if results["errors"]:
        for error in results["errors"]:
            print(f"  ❌ {error}")
    
    print(f"\n✅ Total Files Created: {len(results['files_created'])}")
    
    # Output JSON for programmatic consumption
    print("\n" + "="*80)
    print("JSON OUTPUT:")
    print("="*80)
    print(json.dumps(results, indent=2))
    
    # Exit code
    sys.exit(0 if not results["errors"] else 1)
