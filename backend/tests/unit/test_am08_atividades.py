"""AM-08 — Atividades da casa: regras puras, guards, plano e auditor (sem banco).

O comportamento HTTP com Postgres real (tipos sugeridos no cadastro, na plataforma e na
migração, tipo Gira de sistema, CRUD por grupo ESCALAS, atividade fora do limite de giras,
Agenda do médium por elegibilidade, público/site/sitemap sem atividade, FKs de outro terreiro e
migrações 077/078) está em tests/integration_pg/test_am08_atividades.py e
test_fk_cross_tenant.py.
"""
import importlib.util
import re
import uuid
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.errors import ValidationError
from src.models import PermissionFeature
from src.models import atividades as modelos
from src.models.subscriptions import PlanType
from src.services import atividades as svc
from src.services.plan_features import _get_plan_features, feature_min_plan
from tests.plan_gate_helpers import make_sub, plan_gate_features

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
G1, G2 = uuid.uuid4(), uuid.uuid4()


def _migracao(nome: str):
    spec = importlib.util.spec_from_file_location(nome, BACKEND_DIR / f"alembic/versions/{nome}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── Catálogo, enum e migrações ──────────────────────────────────────────────


def test_feature_escalas_no_enum_e_planos():
    assert PermissionFeature.ESCALAS.value == "escalas"
    assert feature_min_plan("atividades_corrente") == PlanType.BASIC
    assert feature_min_plan("escalas") == PlanType.PRO
    assert not _get_plan_features(PlanType.FREE).atividades_corrente
    assert _get_plan_features(PlanType.BASIC).atividades_corrente and not _get_plan_features(PlanType.BASIC).escalas
    assert _get_plan_features(PlanType.PRO).escalas


def test_migracoes_077_e_078_encadeadas_e_lista_congelada_igual_ao_servico():
    m077 = _migracao("077_permissao_escalas_enum")
    m078 = _migracao("078_atividades")
    assert (m077.revision, m077.down_revision) == ("077_permissao_escalas_enum", "076_medium_email_pendente")
    assert (m078.revision, m078.down_revision) == ("078_atividades", "077_permissao_escalas_enum")
    assert m078.TIPOS_SUGERIDOS == svc.TIPOS_SUGERIDOS
    assert m078.FUNCOES_SUGERIDAS == svc.FUNCOES_SUGERIDAS
    assert m078.ICONES == modelos.ICONES_ATIVIDADE
    assert m078.CORES == modelos.CORES_TIPO
    assert m078.ELEGIVEIS == modelos.ELEGIVEIS
    assert m078.CONVOCACOES == modelos.CONVOCACOES
    assert m078.MODOS_ESCALA == modelos.MODOS_ESCALA
    assert m078.VISIBILIDADES == modelos.VISIBILIDADES
    assert m078.ORIGENS == modelos.ORIGENS_ATIVIDADE


def test_tipos_sugeridos_do_plano():
    """§8.2: 8 tipos, só "Gira" de sistema e de natureza gira; valores dentro das listas fechadas."""
    assert len(svc.TIPOS_SUGERIDOS) == 8
    sistema = [t for t in svc.TIPOS_SUGERIDOS if t[13]]
    assert [t[0] for t in sistema] == ["Gira"] and sistema[0][1] == "gira"
    assert [t[0] for t in svc.TIPOS_SUGERIDOS if t[1] == "gira"] == ["Gira"]
    assert "Faxina" in [t[0] for t in svc.TIPOS_SUGERIDOS]  # D-20
    for nome, natureza, icone, cor, *_flags, elegiveis, convocacao, modo, hora, duracao, visib, _sis, _ordem in (
        (t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11], t[12], t[13], t[14])
        for t in svc.TIPOS_SUGERIDOS
    ):
        assert natureza in modelos.NATUREZAS and icone in modelos.ICONES_ATIVIDADE, nome
        assert cor is None or cor in modelos.CORES_TIPO, nome
        assert elegiveis in modelos.ELEGIVEIS and convocacao in modelos.CONVOCACOES, nome
        assert modo in modelos.MODOS_ESCALA and visib in modelos.VISIBILIDADES, nome
        assert hora is None or svc.hora_de_texto(hora), nome
        assert duracao is None or svc.validar_duracao(duracao) == duracao, nome
    assert [t[14] for t in svc.TIPOS_SUGERIDOS] == list(range(8))


def test_listas_iguais_no_front():
    """Ícones, cores e opções do tipo espelhados em frontend/src/constants/atividades.ts."""
    front = (REPO_DIR / "frontend/src/constants/atividades.ts").read_text()

    def _chaves(nome: str) -> tuple[str, ...]:
        bloco = front.split(f"export const {nome}", 1)[1].split("];", 1)[0]
        return tuple(re.findall(r"valor: '([a-z_]+)'", bloco))

    assert _chaves("ICONES_ATIVIDADE") == modelos.ICONES_ATIVIDADE
    assert _chaves("OPCOES_ELEGIVEIS") == modelos.ELEGIVEIS
    assert _chaves("OPCOES_CONVOCACAO") == modelos.CONVOCACOES
    assert _chaves("OPCOES_MODO_ESCALA") == modelos.MODOS_ESCALA
    assert _chaves("OPCOES_VISIBILIDADE") == modelos.VISIBILIDADES
    icons = (REPO_DIR / "frontend/src/lib/icons.ts").read_text()
    bloco = icons.split("export const ICONES_DE_ATIVIDADE", 1)[1].split("};", 1)[0]
    assert tuple(re.findall(r"^\s+([a-z_]+):", bloco, re.M)) == modelos.ICONES_ATIVIDADE


# ── Regras puras ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "elegiveis, atendimento, meus, do_tipo, esperado",
    [
        ("todos", True, set(), set(), True),
        ("todos", False, set(), set(), True),
        ("atendimento", True, set(), set(), True),
        ("atendimento", False, set(), set(), False),
        ("cambones", False, set(), set(), True),
        ("cambones", True, set(), set(), False),
        ("grupos", True, {G1}, {G1, G2}, True),
        ("grupos", False, {G2}, {G1}, False),
        ("grupos", True, set(), {G1}, False),
        ("grupos", True, {G1}, set(), False),
        ("ninguem", True, {G1}, {G1}, False),
    ],
)
def test_medium_elegivel(elegiveis, atendimento, meus, do_tipo, esperado):
    assert svc.medium_elegivel(elegiveis, atendimento, meus, do_tipo) is esperado
    # O SQL da Agenda usa os fixos + EXISTS dos grupos: as duas regras batem.
    if elegiveis != "grupos":
        assert (elegiveis in svc.elegiveis_fixos_do_medium(atendimento)) is esperado


def test_limpezas_e_validacoes():
    assert svc.limpar_nome("  <b>Faxina</b>\n geral ") == "Faxina geral"
    for ruim in ("", "<i></i>", "x" * 61, None):
        with pytest.raises(ValidationError):
            svc.limpar_nome(ruim)
    assert svc.limpar_titulo_atividade("Faxina · G1") == "Faxina · G1"
    with pytest.raises(ValidationError):
        svc.limpar_titulo_atividade("x" * 121)
    assert svc.limpar_local("  ") is None and svc.limpar_local("Sala 2") == "Sala 2"
    assert svc.limpar_texto("Leve <script>x</script>luvas") == "Leve xluvas"
    assert svc.limpar_texto("   ") is None
    assert svc.limpar_motivo(" Chuva ") == "Chuva"
    for ruim in ("", "   ", "x" * 301):
        with pytest.raises(ValidationError):
            svc.limpar_motivo(ruim)
    assert svc.validar_icone("faxina") == "faxina"
    assert svc.validar_cor_tipo(None) is None and svc.validar_cor_tipo("") is None
    assert svc.validar_cor_tipo("violeta") == "violeta"
    for fn, ruim in (
        (svc.validar_icone, "foguete"),
        (svc.validar_cor_tipo, "#fff"),
        (svc.validar_elegiveis, "ninguem"),
        (svc.validar_convocacao, "sorteio"),
        (svc.validar_modo_escala, "rodizio"),
        (svc.validar_visibilidade, "publico"),
        (svc.validar_minutos_checkin, -1),
        (svc.validar_minutos_checkin, 1441),
        (svc.validar_duracao, 10),
        (svc.validar_duracao, 1441),
        (svc.hora_de_texto, "25:00"),
        (svc.hora_de_texto, "meio-dia"),
    ):
        with pytest.raises(ValidationError):
            fn(ruim)
    assert svc.hora_de_texto("09:30") == time(9, 30) and svc.hora_de_texto("") is None


def test_fim_padrao_pela_duracao_do_tipo():
    inicio = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
    assert svc.fim_padrao(inicio, None, 180) == inicio + timedelta(minutes=180)
    assert svc.fim_padrao(inicio, None, None) is None
    fim = inicio + timedelta(hours=1)
    assert svc.fim_padrao(inicio, fim, 180) == fim
    with pytest.raises(ValidationError):
        svc.fim_padrao(inicio, inicio, 180)


def test_tipo_resumo_e_item_da_atividade():
    from types import SimpleNamespace

    from src.services.medium_agenda import item_da_atividade

    assert svc.tipo_resumo(None) == {"nome": "Gira", "icone": "gira", "cor": None}
    tipo = SimpleNamespace(nome="Faxina", icone="faxina", cor="petroleo")
    resumo = svc.tipo_resumo(tipo)
    a = SimpleNamespace(
        id=uuid.uuid4(), titulo=None, inicio=datetime(2026, 11, 7, tzinfo=timezone.utc), fim=None, local="",
        cancelada_em=datetime(2026, 11, 1, tzinfo=timezone.utc),
    )
    item = item_da_atividade(a, resumo)
    assert item["origem"] == "atividade" and item["titulo"] == "Faxina" and item["local"] is None
    assert item["cancelada"] is True and item["minha_participacao"] is None
    assert set(item) == {"origem", "id", "tipo", "titulo", "inicio", "fim", "local", "cancelada", "minha_participacao"}


async def test_ensure_default_com_banco_simulado_nao_quebra():
    """Cadastro/plataforma nos testes unitários usam banco simulado: o ensure não pode explodir."""
    res = MagicMock()
    res.scalar.return_value = 8  # já tem os tipos
    res.scalar_one_or_none.return_value = uuid.uuid4()  # e o tipo Gira
    db = AsyncMock()
    db.execute.return_value = res
    assert await svc.ensure_default_atividade_tipos(db, uuid.uuid4()) == 0
    db.flush.assert_not_awaited()


# ── Guards e plano ──────────────────────────────────────────────────────────


def _guards(dependencies) -> set:
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_admin_com_escalas_por_acao_e_planos():
    from src.api.v1.admin.atividades import router

    base = "/api/v1/admin/atividades"
    assert router.prefix == base
    assert plan_gate_features(router) == ["area_medium", "atividades_corrente"]
    esperado = {
        ("GET", f"{base}/calendario"): "view",
        ("GET", f"{base}/tipos"): "view",
        ("POST", f"{base}/tipos"): "insert",
        ("PUT", f"{base}/tipos/{{tipo_id}}"): "edit",
        ("POST", f"{base}/tipos/{{tipo_id}}/desarquivar"): "edit",
        ("DELETE", f"{base}/tipos/{{tipo_id}}"): "delete",
        ("GET", f"{base}/funcoes"): "view",
        ("POST", f"{base}/funcoes"): "insert",
        ("PUT", f"{base}/funcoes/{{funcao_id}}"): "edit",
        ("POST", f"{base}/funcoes/{{funcao_id}}/desarquivar"): "edit",
        ("DELETE", f"{base}/funcoes/{{funcao_id}}"): "delete",
        ("POST", f"{base}/da-gira/{{gira_id}}"): "insert",
        ("GET", base): "view",
        ("GET", f"{base}/{{atividade_id}}"): "view",
        ("POST", base): "insert",
        ("PUT", f"{base}/{{atividade_id}}"): "edit",
        ("POST", f"{base}/{{atividade_id}}/cancelar"): "edit",
        ("POST", f"{base}/{{atividade_id}}/reativar"): "edit",
        ("DELETE", f"{base}/{{atividade_id}}"): "delete",
    }
    vistos = {}
    for rota in router.routes:
        for metodo in rota.methods:
            vistos[(metodo, rota.path)] = _guards(rota.dependencies)
    assert set(vistos) == set(esperado)
    for chave, acao in esperado.items():
        assert vistos[chave] == {(frozenset({PermissionFeature.ESCALAS}), acao)}, chave


def test_rotas_fixas_vem_antes_do_id_da_atividade():
    from src.api.v1.admin.atividades import router

    base = "/api/v1/admin/atividades"
    caminhos = [r.path for r in router.routes if "GET" in r.methods]
    for fixa in ("calendario", "tipos", "funcoes"):
        assert caminhos.index(f"{base}/{fixa}") < caminhos.index(f"{base}/{{atividade_id}}")


def test_rotas_entram_no_app_pelo_admin_router():
    from fastapi.routing import APIRoute, iter_route_contexts

    from src.main import create_app

    rotas = {
        (metodo, ctx.path)
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/admin/atividades")
        for metodo in ctx.original_route.methods
    }
    # 19 do AM-08 + 9 da presença (AM-17/AM-28, admin/atividades_presenca.py) + 1 do AM-29
    # (`GET /convocar/mediuns`) no mesmo prefixo.
    assert len(rotas) == 29


@pytest.mark.parametrize(
    "plan,esperado",
    [(PlanType.FREE, False), (PlanType.BASIC, True), (PlanType.PRO, True), (PlanType.PREMIUM, True)],
)
async def test_operador_so_tem_escalas_no_plano_com_atividades(plan, esperado):
    from src.services.permission_service import PermissionService

    with patch("src.services.permission_service.SubscriptionRepository") as Repo:
        Repo.return_value.get_by_tenant = AsyncMock(return_value=make_sub(plan))
        service = PermissionService(AsyncMock())
        assert await service.is_feature_enabled_for_plan(uuid.uuid4(), PermissionFeature.ESCALAS) is esperado


def test_mensagem_de_plano_das_features_novas():
    from src.api.dependencies import plan_feature_denied_message

    assert plan_feature_denied_message("atividades_corrente") == "Atividades da casa disponível a partir do plano Basic."
    assert plan_feature_denied_message("escalas") == "Escalas da corrente disponível a partir do plano Pro."


# ── Auditor de tenant (checagem 4): tirar a validação faz falhar ────────────

_spec = importlib.util.spec_from_file_location("audit_tenant_am08", BACKEND_DIR / "scripts/audit_tenant_isolation.py")
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


@pytest.fixture(scope="module")
def real_info():
    info = audit.discover_model_info()
    return info, audit.build_callee_index(info.tenant_models)


@pytest.mark.parametrize(
    "old, new, esperado",
    [
        (
            "    tipo = await validar_tipo_ativo_do_tenant(db, tenant_id, body.tipo_id)\n    titulo =",
            "    tipo = None\n    titulo =",
            {("criar_atividade", "body.tipo_id")},
        ),
        (
            "        tipo = await validar_tipo_ativo_do_tenant(db, tenant_id, body.tipo_id)\n        atividade.tipo_id",
            "        tipo = None\n        atividade.tipo_id",
            {("editar_atividade", "body.tipo_id")},
        ),
        (
            "    grupos = await _validar_grupos_elegiveis_do_tenant(db, tenant_id, tipo, body.grupo_ids or [])\n",
            "    grupos = list(body.grupo_ids or [])\n",
            {("criar_tipo", "body.grupo_ids")},
        ),
        (
            "        grupos = await _validar_grupos_elegiveis_do_tenant(db, tenant_id, tipo, body.grupo_ids)\n",
            "        grupos = list(body.grupo_ids or [])\n",
            {("editar_tipo", "body.grupo_ids")},
        ),
    ],
)
def test_mutacao_fk_sem_validacao_quebra_o_auditor(tmp_path, real_info, old, new, esperado):
    info, callees = real_info
    real = audit.ADMIN_DIR / "atividades.py"
    baseline, checked = audit.find_unvalidated_fks(real, info, callees)
    assert baseline == [] and checked >= 4
    source = real.read_text()
    assert old in source, "trecho do teste de mutação não existe mais em atividades.py — atualize o teste"
    copy = tmp_path / "atividades.py"
    copy.write_text(source.replace(old, new, 1))
    violations, _ = audit.find_unvalidated_fks(copy, info, callees)
    assert {(v[1], v[2]) for v in violations} == esperado
