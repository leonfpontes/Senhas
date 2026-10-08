"""AM-17/AM-28 — Presença: regras puras, QR do dia, guards, plano e auditor (sem banco).

O comportamento HTTP com Postgres real (vou/não vou até o início, motivo obrigatório pelo tipo,
"Cheguei" na janela e com o QR, confiança no encerramento, chamada por ESCALAS e pela PORTA,
avulso, encerrar idempotente, encerramento automático, prazo da justificativa, isolamento entre
médiuns e terreiros, justificativa fora da auditoria, impersonação, plano e concorrência) está em
tests/integration_pg/test_am17_28_presenca.py.
"""
import importlib.util
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.core.errors import ValidationError
from src.core.tz import APP_TZ
from src.models import PermissionFeature
from src.models import atividades as modelos
from src.services import presenca as svc

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
T1, T2 = uuid.uuid4(), uuid.uuid4()
A1, A2 = uuid.uuid4(), uuid.uuid4()
SEGREDO = "x" * 40
INICIO = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)  # sábado 9h em Brasília


def _migracao(nome: str):
    spec = importlib.util.spec_from_file_location(nome, BACKEND_DIR / f"alembic/versions/{nome}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── Catálogo, migração e espelho no front ───────────────────────────────────


def test_migracao_079_depois_da_078_com_as_listas_do_modelo():
    mig = _migracao("079_presenca")
    assert (mig.revision, mig.down_revision) == ("079_presenca", "078_atividades")
    assert mig.MODOS == modelos.MODOS_PRESENCA
    # A 086 (AM-27) acrescentou "troca"; a 079 congela as de antes.
    assert mig.ORIGENS == tuple(o for o in modelos.ORIGENS_PARTICIPACAO if o != "troca")
    assert mig.RESPOSTAS == modelos.RESPOSTAS
    assert mig.PRESENCAS == modelos.PRESENCAS
    assert mig.PRESENCA_ORIGENS == modelos.PRESENCA_ORIGENS


def test_participacao_unica_por_atividade_e_medium():
    tabela = modelos.AtividadeParticipacao.__table__
    unicas = {tuple(c.name for c in u.columns) for u in tabela.constraints if u.__class__.__name__ == "UniqueConstraint"}
    assert ("atividade_id", "medium_id") in unicas
    assert tabela.c.justificativa.type.length == modelos.JUSTIFICATIVA_MAX == 500


def test_modos_e_situacoes_espelhados_no_front():
    front = (REPO_DIR / "frontend/src/constants/presenca.ts").read_text()
    bloco = front.split("export const OPCOES_MODO_PRESENCA", 1)[1].split("];", 1)[0]
    assert tuple(re.findall(r"valor: '([a-z_]+)'", bloco)) == modelos.MODOS_PRESENCA
    rotulos = front.split("export const ROTULO_SITUACAO", 1)[1].split("};", 1)[0]
    assert set(re.findall(r"^\s+([a-z_]+):", rotulos, re.M)) == set(svc.SITUACOES)


# ── Situação derivada (§8.5) ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "kw, esperado",
    [
        ({"convocado": True}, "convocado"),
        ({"convocado": True, "resposta": "vou"}, "confirmado"),
        ({"convocado": True, "resposta": "nao_vou", "justificativa": "Viagem"}, "ausencia_avisada"),
        ({"convocado": True, "resposta": "nao_vou", "presenca": "presente"}, "presente"),
        ({"convocado": True, "presenca": "ausente", "justificativa": "Febre"}, "ausente_justificado"),
        ({"convocado": True, "presenca": "ausente", "justificativa": "  "}, "ausente"),
        ({"convocado": True, "presenca": "ausente"}, "ausente"),
        ({"convocado": True, "resposta": "vou", "dispensado": True}, "dispensado"),
        ({"convocado": True, "presenca": "presente", "cancelada": True}, "dispensado"),
        ({"convocado": True, "substituido": True, "dispensado": True}, "substituido"),
        ({"convocado": True, "resposta": "vou", "confianca_terminou": True}, "presente"),
        ({"convocado": True, "resposta": "nao_vou", "confianca_terminou": True}, "ausencia_avisada"),
        ({"convocado": False, "presenca": "presente"}, "presente"),
    ],
)
def test_situacao_derivada(kw, esperado):
    assert svc.situacao(**kw) == esperado


def test_modo_efetivo_tipo_vence_a_casa():
    assert svc.modo_efetivo(None, None) == "confianca"
    assert svc.modo_efetivo(None, "qr") == "qr"
    assert svc.modo_efetivo("app", "qr") == "app"
    assert svc.modo_efetivo("gps", "invalido") == "confianca"
    with pytest.raises(ValidationError):
        svc.validar_modo("gps")
    assert svc.validar_modo("", permite_nulo=True) is None
    assert svc.validar_prazo(7) == 7
    for ruim in (0, 31):
        with pytest.raises(ValidationError):
            svc.validar_prazo(ruim)


def test_janela_do_cheguei():
    abre, fecha = svc.janela_checkin(INICIO, 60, 180)
    assert (abre, fecha) == (INICIO - timedelta(hours=1), INICIO + timedelta(hours=3))
    assert svc.dentro_da_janela(abre, abre, fecha) and svc.dentro_da_janela(fecha, abre, fecha)
    assert not svc.dentro_da_janela(abre - timedelta(seconds=1), abre, fecha)
    assert not svc.dentro_da_janela(fecha + timedelta(seconds=1), abre, fecha)


def test_fim_efetivo_e_prazo_da_justificativa_em_brasilia():
    assert svc.fim_efetivo(INICIO, None) == INICIO + timedelta(hours=3)
    assert svc.fim_efetivo(INICIO, None, 120) == INICIO + timedelta(hours=2)
    assert svc.fim_efetivo(INICIO, INICIO + timedelta(hours=1), 120) == INICIO + timedelta(hours=1)
    # 01h UTC do dia 8 = 22h do dia 7 em Brasília: o prazo conta do dia 7.
    fim = datetime(2026, 11, 8, 1, 0, tzinfo=timezone.utc)
    assert svc.prazo_justificativa(fim, 7) == date(2026, 11, 14)
    assert svc.dentro_do_prazo(date(2026, 11, 14), date(2026, 11, 14))
    assert not svc.dentro_do_prazo(date(2026, 11, 15), date(2026, 11, 14))


def test_justificativa_limpa_obrigatoria_e_ate_500():
    assert svc.limpar_justificativa(" <b>Viagem</b> a trabalho ", obrigatoria=True) == "Viagem a trabalho"
    assert svc.limpar_justificativa("", obrigatoria=False) is None
    with pytest.raises(ValidationError):
        svc.limpar_justificativa("   ", obrigatoria=True)
    with pytest.raises(ValidationError):
        svc.limpar_justificativa("a" * 501, obrigatoria=False)
    assert len(svc.limpar_justificativa("a" * 500, obrigatoria=True)) == 500


@pytest.mark.parametrize(
    "kw, esperado",
    [
        ({"convocado": True, "resposta": "vou", "presenca": "nao_registrada", "dispensado": False, "modo": "confianca"}, ("presente", "confianca")),
        ({"convocado": True, "resposta": "vou", "presenca": "nao_registrada", "dispensado": False, "modo": "app"}, ("ausente", "encerramento")),
        ({"convocado": True, "resposta": "nao_vou", "presenca": "nao_registrada", "dispensado": False, "modo": "confianca"}, ("ausente", "encerramento")),
        ({"convocado": True, "resposta": "sem_resposta", "presenca": "nao_registrada", "dispensado": False, "modo": "qr"}, ("ausente", "encerramento")),
        ({"convocado": True, "resposta": "vou", "presenca": "ausente", "dispensado": False, "modo": "confianca"}, None),
        ({"convocado": True, "resposta": "sem_resposta", "presenca": "presente", "dispensado": False, "modo": "app"}, None),
        ({"convocado": True, "resposta": "vou", "presenca": "nao_registrada", "dispensado": True, "modo": "confianca"}, None),
        ({"convocado": False, "resposta": "sem_resposta", "presenca": "nao_registrada", "dispensado": False, "modo": "app"}, None),
    ],
)
def test_resolucao_do_encerramento(kw, esperado):
    assert svc.resolver_encerramento(**kw) == esperado


def test_percentual_e_sinal_do_encerramento_automatico():
    assert svc.percentual(11, 12) == 92
    assert svc.percentual(0, 0) is None
    assert svc.deve_encerrar_sozinha(1, 0, "app")
    assert not svc.deve_encerrar_sozinha(0, 3, "app")
    assert svc.deve_encerrar_sozinha(0, 1, "confianca")
    assert not svc.deve_encerrar_sozinha(0, 0, "confianca")


# ── QR do dia (AM-28) ───────────────────────────────────────────────────────


def test_codigo_qr_curto_sem_ambiguidade_e_por_atividade():
    janela = svc.janela_qr(INICIO)
    codigo = svc.codigo_qr(T1, "atividade", A1, janela, segredo=SEGREDO)
    assert len(codigo) == 6 and set(codigo) <= set(svc.QR_ALFABETO)
    assert not set(codigo) & set("01OIL")
    assert codigo == svc.codigo_qr(T1, "atividade", A1, janela, segredo=SEGREDO)
    outros = {
        svc.codigo_qr(T1, "atividade", A2, janela, segredo=SEGREDO),
        svc.codigo_qr(T2, "atividade", A1, janela, segredo=SEGREDO),
        svc.codigo_qr(T1, "gira", A1, janela, segredo=SEGREDO),
        svc.codigo_qr(T1, "atividade", A1, janela + 1, segredo=SEGREDO),
        svc.codigo_qr(T1, "atividade", A1, janela, segredo="y" * 40),
    }
    assert codigo not in outros


def test_codigo_qr_valido_na_janela_atual_e_na_anterior_e_vence():
    agora = INICIO + timedelta(seconds=30)
    codigo = svc.codigo_qr(T1, "gira", A1, svc.janela_qr(agora), segredo=SEGREDO)
    ok = lambda c, quando, ref=A1, origem="gira", t=T1: svc.codigo_qr_valido(t, origem, ref, c, quando, segredo=SEGREDO)  # noqa: E731
    assert ok(codigo, agora)
    assert ok(codigo.lower(), agora) and ok(f" {codigo[:3]} {codigo[3:]} ", agora)
    assert ok(codigo, agora + timedelta(seconds=60))  # quem leu no fim do minuto
    assert not ok(codigo, agora + timedelta(seconds=150))  # venceu
    assert not ok(codigo, agora, ref=A2)  # outra atividade
    assert not ok(codigo, agora, origem="atividade")
    assert not ok(codigo, agora, t=T2)  # outro terreiro
    assert not ok("", agora) and not ok(None, agora) and not ok("ABCDEFG", agora)


def test_codigo_vem_do_link_do_qr_sem_dado_pessoal():
    agora = INICIO
    codigo = svc.codigo_qr(T1, "gira", A1, svc.janela_qr(agora))
    conteudo = svc.conteudo_qr("https://girahub.com.br/", "gira", A1, codigo)
    assert conteudo == f"https://girahub.com.br/medium/agenda/gira/{A1}?cheguei={codigo}"
    assert svc.normalizar_codigo(conteudo) == codigo
    assert svc.codigo_qr_valido(T1, "gira", A1, conteudo, agora)
    assert svc.normalizar_codigo("https://x/sem-codigo") == ""


# ── Minha participação (Área) ───────────────────────────────────────────────


def _tipo(**kw):
    base = dict(
        id=uuid.uuid4(), nome="Faxina", icone="faxina", cor=None, controla_presenca=True, pede_confirmacao=True,
        exige_justificativa=True, checkin_antes_min=60, checkin_depois_min=180, elegiveis="todos",
        convocacao_padrao="todos_elegiveis", duracao_min=180, presenca_modo=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _ctx(tipo=None, encerrada=None, cancelada=False):
    atividade = SimpleNamespace(id=A1, chamada_encerrada_em=encerrada)
    return svc.AtividadeCtx(
        origem="atividade", ref_id=A1, tipo=tipo or _tipo(), titulo="Faxina", inicio=INICIO, fim=None,
        local=None, cancelada=cancelada, atividade=atividade,
    )


def _linha(**kw):
    base = dict(
        convocado=True, resposta="sem_resposta", presenca="nao_registrada", justificativa=None, dispensado_em=None,
        substituida_por_id=None, presenca_registrada_em=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _minha(ctx=None, linha=None, esperado=True, modo="app", agora=INICIO - timedelta(days=1)):
    return svc.minha_participacao(
        ctx=ctx or _ctx(), linha=linha, esperado=esperado, modo=modo, prazo_dias=7, agora=agora, grupo="G2"
    )


def test_fora_da_escala_nao_aparece():
    assert _minha(esperado=False) is None
    assert _minha(esperado=False, linha=_linha(convocado=False, presenca="presente"))["situacao"] == "presente"


def test_responder_ate_o_inicio():
    antes = _minha()
    assert antes["convocado"] and antes["situacao"] == "convocado" and antes["pode_responder"]
    assert antes["grupo"] == "G2" and antes["responder_ate"] == INICIO
    assert not _minha(agora=INICIO)["pode_responder"]
    assert not _minha(ctx=_ctx(_tipo(pede_confirmacao=False)))["pode_responder"]
    assert not _minha(linha=_linha(dispensado_em=INICIO))["pode_responder"]
    assert _minha(linha=_linha(dispensado_em=INICIO))["situacao"] == "dispensado"
    assert not _minha(ctx=_ctx(cancelada=True))["pode_responder"]


def test_cheguei_so_no_modo_app_ou_qr_e_na_janela():
    na_janela = INICIO - timedelta(minutes=30)
    app = _minha(agora=na_janela)
    assert app["pode_checkin"] and app["checkin_abre_em"] == INICIO - timedelta(hours=1)
    assert _minha(agora=na_janela, modo="qr")["pode_checkin"]
    confianca = _minha(agora=na_janela, modo="confianca")
    assert not confianca["pode_checkin"] and confianca["checkin_abre_em"] is None
    assert not _minha(agora=INICIO - timedelta(minutes=61))["pode_checkin"]
    assert not _minha(agora=INICIO + timedelta(minutes=181))["pode_checkin"]
    assert not _minha(agora=na_janela, linha=_linha(presenca="presente"))["pode_checkin"]
    assert not _minha(agora=na_janela, ctx=_ctx(encerrada=INICIO))["pode_checkin"]
    assert not _minha(agora=na_janela, ctx=_ctx(_tipo(controla_presenca=False)))["pode_checkin"]


def test_confianca_conta_presente_depois_do_fim():
    depois = INICIO + timedelta(hours=4)
    assert _minha(linha=_linha(resposta="vou"), modo="confianca", agora=depois)["situacao"] == "presente"
    assert _minha(linha=_linha(resposta="vou"), modo="app", agora=depois)["situacao"] == "confirmado"
    marcado = _linha(resposta="vou", presenca="ausente")
    assert _minha(linha=marcado, modo="confianca", agora=depois)["situacao"] == "ausente"


def test_contar_o_motivo_ate_o_prazo():
    ausente = _linha(presenca="ausente")
    dentro = _minha(linha=ausente, agora=INICIO + timedelta(days=3))
    assert dentro["pode_justificar"] and dentro["justificar_ate"] == date(2026, 11, 14)
    assert not _minha(linha=ausente, agora=datetime(2026, 11, 15, 3, 1, tzinfo=timezone.utc))["pode_justificar"]
    assert _minha(linha=ausente, agora=datetime(2026, 11, 15, 2, 59, tzinfo=timezone.utc))["pode_justificar"]
    assert not _minha(linha=_linha(presenca="presente"), agora=INICIO + timedelta(days=1))["pode_justificar"]


def test_medium_esperado_pela_convocacao_e_entrada():
    dia = INICIO.astimezone(APP_TZ).date()
    kw = dict(is_atendimento=True, data_entrada=None, dia=dia, grupos_do_medium=set(), grupos_do_tipo=set())
    assert svc.medium_esperado(_tipo(), **kw)
    assert not svc.medium_esperado(_tipo(convocacao_padrao="so_escalados"), **kw)
    assert not svc.medium_esperado(_tipo(elegiveis="cambones"), **kw)
    assert not svc.medium_esperado(_tipo(), **{**kw, "data_entrada": dia + timedelta(days=1)})
    g = uuid.uuid4()
    assert svc.medium_esperado(_tipo(elegiveis="grupos"), **{**kw, "grupos_do_medium": {g}, "grupos_do_tipo": {g}})


# ── Guards, plano e rotas ───────────────────────────────────────────────────


def _guards(dependencies) -> set:
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        feats += [f for c in cells if isinstance(c, tuple) for f in c if isinstance(f, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_admin_da_presenca_por_grupo_e_plano():
    from src.api.v1.admin.atividades_presenca import router
    from tests.plan_gate_helpers import plan_gate_features

    base = "/api/v1/admin/atividades"
    assert router.prefix == base
    assert plan_gate_features(router) == ["area_medium", "atividades_corrente"]
    escalas = frozenset({PermissionFeature.ESCALAS})
    escalas_ou_porta = frozenset({PermissionFeature.ESCALAS, PermissionFeature.PORTA})
    esperado = {
        ("POST", f"{base}/da-gira/{{gira_id}}/chamada"): (escalas_ou_porta, "edit"),
        ("GET", f"{base}/da-gira/{{gira_id}}/qr"): (escalas_ou_porta, "view"),
        ("GET", f"{base}/{{atividade_id}}/confirmacoes"): (escalas, "view"),
        ("POST", f"{base}/{{atividade_id}}/convocar"): (escalas, "insert"),
        ("GET", f"{base}/convocar/mediuns"): (escalas, "insert"),
        ("POST", f"{base}/{{atividade_id}}/dispensar"): (escalas, "edit"),
        ("GET", f"{base}/{{atividade_id}}/chamada"): (escalas_ou_porta, "edit"),
        ("PUT", f"{base}/{{atividade_id}}/chamada"): (escalas_ou_porta, "edit"),
        ("POST", f"{base}/{{atividade_id}}/chamada/encerrar"): (escalas_ou_porta, "edit"),
        ("GET", f"{base}/{{atividade_id}}/qr"): (escalas_ou_porta, "view"),
        # Abono da justificativa (AM-27).
        ("PUT", f"{base}/{{atividade_id}}/justificativas/{{medium_id}}"): (escalas, "edit"),
    }
    vistos = {(m, r.path): _guards(r.dependencies) for r in router.routes for m in r.methods}
    assert set(vistos) == set(esperado)
    for chave, guard in esperado.items():
        assert vistos[chave] == {guard}, chave


def test_rotas_da_area_com_plano_e_escritas_sem_impersonacao():
    from src.api.dependencies import require_not_impersonated
    from src.api.v1.medium.presencas import router

    rotas = {(m, r.path): r for r in router.routes for m in r.methods}
    assert set(rotas) == {
        ("POST", "/atividades/{origem}/{ref_id}/resposta"),
        ("POST", "/atividades/{origem}/{ref_id}/checkin"),
        ("POST", "/atividades/{origem}/{ref_id}/justificativa"),
        ("GET", "/presencas"),
    }
    for (metodo, caminho), rota in rotas.items():
        deps = [d.dependency for d in rota.dependencies]
        assert any(getattr(d, "plan_feature", None) == "atividades_corrente" for d in deps), caminho
        assert (require_not_impersonated in deps) == (metodo == "POST"), caminho
        assert "medium_id" not in caminho


def test_agendador_registrado_com_lock_proprio():
    from src.services import scheduler_guard

    assert scheduler_guard.PRESENCA_LOCK_KEY == 0x6769726168756204
    assert len({scheduler_guard.TRIAL_LOCK_KEY, scheduler_guard.BIRTHDAY_LOCK_KEY, scheduler_guard.PRESENCA_LOCK_KEY}) == 3
    main = (BACKEND_DIR / "src/main.py").read_text()
    assert "presenca_scheduler.start()" in main and "await presenca_scheduler.stop()" in main


# ── Auditor de tenant (checagem 4): tirar a validação faz falhar ────────────

_spec = importlib.util.spec_from_file_location("audit_tenant_am17", BACKEND_DIR / "scripts/audit_tenant_isolation.py")
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
            "    mediuns = await _validar_mediuns_do_tenant(db, tenant_id, pedidos)\n",
            "    mediuns = pedidos\n",
            {("convocar", "body.medium_ids")},
        ),
        (
            "    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, grupo_ids)\n",
            "    grupos = grupo_ids\n",
            {("convocar", "body.grupo_ids")},
        ),
        (
            "    mediuns = await _validar_mediuns_do_tenant(db, tenant_id, body.medium_ids, so_ativos=False)\n",
            "    mediuns = list(body.medium_ids)\n",
            {("dispensar", "body.medium_ids")},
        ),
    ],
)
def test_mutacao_fk_sem_validacao_quebra_o_auditor(tmp_path, real_info, old, new, esperado):
    info, callees = real_info
    real = audit.ADMIN_DIR / "atividades_presenca.py"
    baseline, checked = audit.find_unvalidated_fks(real, info, callees)
    assert baseline == [] and checked >= 3
    source = real.read_text()
    assert old in source, "trecho do teste de mutação não existe mais em atividades_presenca.py — atualize o teste"
    copy = tmp_path / "atividades_presenca.py"
    copy.write_text(source.replace(old, new, 1))
    violations, _ = audit.find_unvalidated_fks(copy, info, callees)
    assert {(v[1], v[2]) for v in violations} == esperado
