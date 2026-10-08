"""AM-23 — Grupos da corrente: regras puras, guards e auditor (sem banco).

O comportamento HTTP com Postgres real (CRUD por grupo de permissão, nome único, membros só
ativos do terreiro, ids de outro terreiro, médium inativado sai dos grupos, aviso para grupo,
leituras, `/medium/me`, chave do piloto e migração 075) está em
tests/integration_pg/test_am23_grupos.py.
"""
import importlib.util
import re
import uuid
from pathlib import Path

import pytest

from src.core.errors import ValidationError
from src.models import ComunicadoPublico, PermissionFeature
from src.models.corrente_grupos import CORES_GRUPO, COR_PADRAO
from src.services.comunicados import medium_no_publico
from src.services.corrente_grupos import limpar_descricao, limpar_nome, sem_repetidos, validar_cor
from tests.plan_gate_helpers import plan_gate_features

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent

G1, G2, G3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


# ── Público "grupos" dos avisos ─────────────────────────────────────────────


def test_publico_grupos_vale_para_quem_esta_em_algum_grupo_do_aviso():
    assert ComunicadoPublico.GRUPOS.value == "grupos"
    assert medium_no_publico("grupos", True, {G1}, {G1, G2})
    assert medium_no_publico("grupos", False, {G2, G3}, {G2})
    assert not medium_no_publico("grupos", True, {G3}, {G1, G2})
    assert not medium_no_publico("grupos", True, frozenset(), {G1})
    # Aviso sem grupo (todos arquivados) não alcança ninguém.
    assert not medium_no_publico("grupos", True, {G1}, frozenset())
    # Os públicos fixos não olham grupos.
    assert medium_no_publico("todos", False, frozenset(), {G1})
    assert not medium_no_publico("atendimento", False, {G1}, {G1})


# ── Nome, cor, descrição ────────────────────────────────────────────────────


def test_nome_sem_html_numa_linha_e_com_limite():
    assert limpar_nome("  <b>G1</b>\n  sábado ") == "G1 sábado"
    for ruim in ("", "   ", "<i></i>", "x" * 61, None):
        with pytest.raises(ValidationError):
            limpar_nome(ruim)
    assert limpar_nome("x" * 60) == "x" * 60


def test_descricao_texto_simples_vazia_vira_none():
    assert limpar_descricao(None) is None
    assert limpar_descricao("  ") is None
    assert limpar_descricao("Faxina<script>x</script> de sábado") == "Faxinax de sábado"
    with pytest.raises(ValidationError):
        limpar_descricao("a" * 301)


def test_cor_so_da_paleta_fechada():
    assert COR_PADRAO == CORES_GRUPO[0]
    for cor in CORES_GRUPO:
        assert validar_cor(cor) == cor
    for ruim in ("#ff0000", "red", "", "AMBAR"):
        with pytest.raises(ValidationError):
            validar_cor(ruim)


def test_paleta_igual_na_migracao_e_no_front():
    """Backend (CHECK do modelo e da migração 075) e o espelho do front têm as mesmas chaves."""
    spec = importlib.util.spec_from_file_location("m075", BACKEND_DIR / "alembic/versions/075_corrente_grupos.py")
    m075 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m075)
    assert tuple(m075.CORES) == CORES_GRUPO
    front = (REPO_DIR / "frontend/src/constants/correnteGrupos.ts").read_text()
    bloco = front.split("export const CORES_GRUPO", 1)[1].split("];", 1)[0]
    assert tuple(re.findall(r"chave: '([a-z]+)'", bloco)) == CORES_GRUPO


def test_sem_repetidos_mantem_a_ordem():
    assert sem_repetidos([G2, G1, G2, G3, G1]) == [G2, G1, G3]
    assert sem_repetidos([]) == []


# ── Guards ──────────────────────────────────────────────────────────────────


def _guards(dependencies) -> set:
    """{(features, ação)} dos guards de grupo (require_group_permission/any) na closure."""
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        for c in cells:
            if isinstance(c, tuple) and c and all(isinstance(f, PermissionFeature) for f in c):
                feats = list(c)
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_admin_com_mediuns_por_acao_e_plano_area_medium():
    from src.api.v1.admin.corrente_grupos import router

    base = "/api/v1/admin/corrente-grupos"
    assert router.prefix == base
    assert plan_gate_features(router) == ["area_medium"]
    mediuns = frozenset({PermissionFeature.MEDIUNS})
    esperado = {
        ("GET", base): (mediuns, "view"),
        ("GET", f"{base}/opcoes"): (frozenset({PermissionFeature.MEDIUNS, PermissionFeature.COMUNICADOS}), "view"),
        ("GET", f"{base}/{{grupo_id}}"): (mediuns, "view"),
        ("POST", base): (mediuns, "insert"),
        ("PUT", f"{base}/{{grupo_id}}"): (mediuns, "edit"),
        ("POST", f"{base}/{{grupo_id}}/membros"): (mediuns, "edit"),
        ("DELETE", f"{base}/{{grupo_id}}/membros/{{medium_id}}"): (mediuns, "edit"),
        ("POST", f"{base}/{{grupo_id}}/desarquivar"): (mediuns, "edit"),
        ("DELETE", f"{base}/{{grupo_id}}"): (mediuns, "delete"),
        ("PUT", f"{base}/mediuns/{{medium_id}}"): (mediuns, "edit"),
    }
    vistos = {}
    for rota in router.routes:
        for metodo in rota.methods:
            vistos[(metodo, rota.path)] = _guards(rota.dependencies)
    assert set(vistos) == set(esperado)
    for chave, guard in esperado.items():
        assert vistos[chave] == {guard}, chave


def test_opcoes_vem_antes_do_detalhe_para_nao_virar_grupo_id():
    from src.api.v1.admin.corrente_grupos import router

    caminhos = [r.path for r in router.routes if "GET" in r.methods]
    assert caminhos.index("/api/v1/admin/corrente-grupos/opcoes") < caminhos.index(
        "/api/v1/admin/corrente-grupos/{grupo_id}"
    )


def test_rotas_entram_no_app_pelo_admin_router():
    """O require_backoffice vem do admin_router; tests/unit/test_area_medium_rotas.py varre o app."""
    from fastapi.routing import APIRoute, iter_route_contexts

    from src.main import create_app

    rotas = {
        (metodo, ctx.path)
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/admin/corrente-grupos")
        for metodo in ctx.original_route.methods
    }
    assert len(rotas) == 10


def test_medium_me_devolve_grupos_sem_membros():
    from src.api.v1.medium.me import MediumMeResponse, MeuGrupo

    assert set(MeuGrupo.model_fields) == {"id", "nome", "cor"}
    assert MediumMeResponse.model_fields["grupos"].default == []


# ── Auditor de tenant (checagem 4): tirar a validação faz falhar ────────────

_spec = importlib.util.spec_from_file_location("audit_tenant_am23", BACKEND_DIR / "scripts/audit_tenant_isolation.py")
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


@pytest.fixture(scope="module")
def real_info():
    info = audit.discover_model_info()
    return info, audit.build_callee_index(info.tenant_models)


@pytest.mark.parametrize(
    "filename, old, new, esperado",
    [
        ("corrente_grupos.py",
         "    medium_ids = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)\n    await _nome_livre",
         "    medium_ids = body.medium_ids\n    await _nome_livre",
         {("criar_grupo", "body.medium_ids")}),
        ("corrente_grupos.py",
         "    medium_ids = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)\n    ja_estao",
         "    medium_ids = []\n    ja_estao",
         {("adicionar_membros", "body.medium_ids")}),
        ("corrente_grupos.py",
         "    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)\n",
         "    grupos = list(body.grupo_ids)\n",
         {("definir_grupos_do_medium", "body.grupo_ids")}),
        ("corrente_grupos.py",
         "                Medium.id == medium_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None)\n",
         "                Medium.id == medium_id, Medium.deleted_at.is_(None)\n",
         {("definir_grupos_do_medium", "medium_id")}),
        ("comunicados.py",
         "        grupos = await validar_grupos_ativos_do_tenant(db, current_user.tenant_id, body.grupo_ids)\n",
         "        grupos = list(body.grupo_ids)\n",
         {("criar_comunicado", "body.grupo_ids")}),
        ("comunicados.py",
         "        grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)\n",
         "        grupos = list(body.grupo_ids)\n",
         {("editar_comunicado", "body.grupo_ids")}),
    ],
)
def test_mutacao_fk_sem_validacao_de_grupo_ou_medium_quebra_o_auditor(tmp_path, real_info, filename, old, new, esperado):
    info, callees = real_info
    real = audit.ADMIN_DIR / filename
    baseline, checked = audit.find_unvalidated_fks(real, info, callees)
    assert baseline == [] and checked > 0
    source = real.read_text()
    assert old in source, f"trecho do teste de mutação não existe mais em {filename} — atualize o teste"
    copy = tmp_path / filename
    copy.write_text(source.replace(old, new, 1))
    violations, _ = audit.find_unvalidated_fks(copy, info, callees)
    assert {(v[1], v[2]) for v in violations} == esperado
