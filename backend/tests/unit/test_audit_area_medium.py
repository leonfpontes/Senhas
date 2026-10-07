"""AM-02 — auditores estendidos para a Área do Médium (src/api/v1/medium/).

- scripts/audit_tenant_isolation.py, modo "medium": query em modelo multi-tenant filtra por
  `ctx.tenant_id`; query em modelo "do médium" (Medium e FK para `mediuns`) filtra também por
  `ctx.medium.id`; nenhuma rota recebe `medium_id`.
- scripts/audit_permission_guards.py: `admin_router` com `require_backoffice` e
  `medium_router` com `require_medium` (todo router da pasta incluído nele).
"""
import importlib.util
import textwrap
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, BACKEND_DIR / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tenant_audit = _load("audit_tenant_isolation_medium", "audit_tenant_isolation.py")
guard_audit = _load("audit_permission_guards_medium", "audit_permission_guards.py")

TENANT_MODELS = {"Medium", "MensalidadePagamento", "TenantConfig", "Gira"}
MEDIUM_MODELS = {"Medium": {"id"}, "MensalidadePagamento": {"mediun_id"}}

HEADER = """\
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from src.models import Medium, MensalidadePagamento, TenantConfig, Gira
router = APIRouter()
"""


def _medium_queries(tmp_path, body):
    path = tmp_path / "fake.py"
    path.write_text(HEADER + textwrap.dedent(body))
    return tenant_audit.find_unfiltered_queries(
        path, TENANT_MODELS, exempt_queries={}, mode="medium", medium_models=MEDIUM_MODELS
    )


# ─── Tenant isolation, modo medium ──────────────────────────────────────────────────


def test_descobre_os_modelos_do_medium_nos_models_reais():
    found = tenant_audit.discover_medium_models(tenant_audit.discover_model_info())
    assert found["Medium"] == {"id"}
    assert found["MensalidadePagamento"] == {"mediun_id"}


def test_query_filtrada_por_tenant_e_pelo_medium_logado_passa(tmp_path):
    violations, checked = _medium_queries(
        tmp_path,
        """
        @router.get("/mensalidades")
        async def minhas(ctx=Depends(x), db=Depends(y)):
            stmt = select(MensalidadePagamento).where(
                MensalidadePagamento.tenant_id == ctx.tenant_id,
                MensalidadePagamento.mediun_id == ctx.medium.id,
            )
            return (await db.execute(stmt)).scalars().all()
        """,
    )
    assert checked == 1 and violations == []


def test_modelo_do_medium_sem_filtro_do_medium_falha(tmp_path):
    """Só o tenant não basta: a mensalidade de OUTRO médium do mesmo terreiro vazaria."""
    violations, _ = _medium_queries(
        tmp_path,
        """
        @router.get("/mensalidades")
        async def todas(ctx=Depends(x), db=Depends(y)):
            return await db.execute(
                select(MensalidadePagamento).where(MensalidadePagamento.tenant_id == ctx.tenant_id)
            )
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("todas", "MensalidadePagamento")]


def test_filtro_do_medium_sem_tenant_falha(tmp_path):
    violations, _ = _medium_queries(
        tmp_path,
        """
        async def so_medium(ctx, db):
            return await db.execute(select(Medium).where(Medium.id == ctx.medium.id))
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("so_medium", "Medium")]


def test_medium_comparado_com_valor_que_nao_e_do_contexto_falha(tmp_path):
    violations, _ = _medium_queries(
        tmp_path,
        """
        async def outro(ctx, db, outro_id):
            return await db.execute(
                select(Medium).where(Medium.tenant_id == ctx.tenant_id, Medium.id == outro_id)
            )
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("outro", "Medium")]


def test_modelo_comum_so_precisa_do_tenant(tmp_path):
    violations, checked = _medium_queries(
        tmp_path,
        """
        async def marca(ctx, db):
            return await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == ctx.tenant_id))

        async def giras(ctx, db):
            return await db.execute(select(Gira))
        """,
    )
    assert checked == 2
    assert [(v[1], v[2]) for v in violations] == [("giras", "Gira")]


def test_session_get_em_modelo_do_medium_falha(tmp_path):
    violations, _ = _medium_queries(
        tmp_path,
        """
        async def pega(ctx, db):
            m = await db.get(Medium, ctx.medium.id)
            if m.tenant_id != ctx.tenant_id:
                return None
            return m
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("pega", "Medium")]


def test_medium_id_vindo_da_requisicao_e_apontado(tmp_path):
    path = tmp_path / "fake.py"
    path.write_text(HEADER + textwrap.dedent(
        """
        class Corpo(BaseModel):
            mediun_id: str

        @router.get("/mensalidades/{medium_id}")
        async def de_outro(medium_id: str, ctx=Depends(x)):
            return medium_id

        @router.get("/me")
        async def eu(ctx=Depends(x)):
            return ctx.medium.id
        """
    ))
    found = {(fn, onde) for _, fn, onde in tenant_audit.find_medium_id_inputs(path)}
    assert found == {
        ("Corpo", "campo mediun_id"),
        ("de_outro", "parâmetro medium_id"),
        ("de_outro", "path /mensalidades/{medium_id}"),
    }


def test_area_do_medium_real_passa():
    info = tenant_audit.discover_model_info()
    medium_models = tenant_audit.discover_medium_models(info)
    for path in sorted(tenant_audit.MEDIUM_DIR.rglob("*.py")):
        violations, _ = tenant_audit.find_unfiltered_queries(
            path, info.tenant_models, mode="medium", medium_models=medium_models
        )
        assert violations == [], path
        assert tenant_audit.find_medium_id_inputs(path) == [], path


def test_mutacao_tirar_filtro_de_tenant_do_me_quebra_o_auditor(tmp_path):
    real = tenant_audit.MEDIUM_DIR / "me.py"
    old = "select(TenantConfig).where(TenantConfig.tenant_id == ctx.tenant_id)"
    source = real.read_text()
    assert old in source, "trecho do teste de mutação não existe mais em medium/me.py"
    copy = tmp_path / "me.py"
    copy.write_text(source.replace(old, "select(TenantConfig)", 1))
    info = tenant_audit.discover_model_info()
    violations, _ = tenant_audit.find_unfiltered_queries(
        copy, info.tenant_models, mode="medium", medium_models=tenant_audit.discover_medium_models(info)
    )
    assert [(v[1], v[2]) for v in violations] == [("get_medium_me", "TenantConfig")]


# ─── Guards de área (audit_permission_guards) ───────────────────────────────────────


def test_routers_reais_tem_os_guards_de_area():
    assert guard_audit.check_admin_router_backoffice() == []
    assert guard_audit.check_medium_routers() == []


def test_admin_router_sem_require_backoffice_falha(tmp_path):
    admin = tmp_path / "admin"
    admin.mkdir()
    (admin / "__init__.py").write_text(
        "from fastapi import APIRouter\nadmin_router = APIRouter()\n"
    )
    problems = guard_audit.check_admin_router_backoffice(admin)
    assert len(problems) == 1 and "require_backoffice" in problems[0]


def _medium_pkg(tmp_path, init, files):
    pkg = tmp_path / "medium"
    pkg.mkdir()
    (pkg / "__init__.py").write_text(textwrap.dedent(init))
    for name, body in files.items():
        (pkg / name).write_text(textwrap.dedent(body))
    return pkg


def test_medium_router_sem_require_medium_falha(tmp_path):
    pkg = _medium_pkg(
        tmp_path,
        """
        from fastapi import APIRouter
        medium_router = APIRouter(prefix="/api/v1/medium")
        """,
        {},
    )
    problems = guard_audit.check_medium_routers(pkg)
    assert any("require_medium" in p for p in problems)


def test_prefixo_errado_falha(tmp_path):
    pkg = _medium_pkg(
        tmp_path,
        """
        from fastapi import APIRouter, Depends
        medium_router = APIRouter(prefix="/api/v1/admin/medium", dependencies=[Depends(require_medium)])
        """,
        {},
    )
    problems = guard_audit.check_medium_routers(pkg)
    assert any("prefix" in p for p in problems)


def test_router_de_arquivo_fora_do_medium_router_falha(tmp_path):
    pkg = _medium_pkg(
        tmp_path,
        """
        from fastapi import APIRouter, Depends
        from .me import router as me_router
        from .avisos import router as avisos_router
        medium_router = APIRouter(prefix="/api/v1/medium", dependencies=[Depends(require_medium)])
        medium_router.include_router(me_router)
        """,
        {
            "me.py": "from fastapi import APIRouter\nrouter = APIRouter()\n",
            # importado mas não incluído no medium_router (e sem dependência própria)
            "avisos.py": "from fastapi import APIRouter\nrouter = APIRouter()\n",
            # router com a própria dependência passa mesmo fora do medium_router
            "extra.py": (
                "from fastapi import APIRouter, Depends\n"
                "router = APIRouter(dependencies=[Depends(require_medium)])\n"
            ),
        },
    )
    problems = guard_audit.check_medium_routers(pkg)
    assert len(problems) == 1 and "avisos.py" in problems[0], problems
