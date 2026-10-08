"""AM-18 — Escala de gira por função: rodízio, plano da escala, guardas e rotas (sem banco).

O comportamento HTTP com Postgres real (escala por função com médiuns e com grupo inteiro, uma
função por médium, trocar de função, tirar → dispensado, copiar da anterior, rodízio pelas
próximas giras, o médium vê a própria função, outro terreiro recusado, sem `escalas` → 403,
chave do piloto desligada → 403) está em tests/integration_pg/test_am18_escala_gira.py.
"""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.core.errors import ConflictError, ValidationError
from src.models import PermissionFeature
from src.services import escala_gira as svc
from src.services import presenca

CAMBONE, PORTEIRO, OGA = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
G1, G2 = uuid.uuid4(), uuid.uuid4()
ANA, BETO, CAIO, DANI, EDU = (uuid.uuid4() for _ in range(5))
INICIO = datetime(2026, 11, 7, 23, 0, tzinfo=timezone.utc)  # sábado 20h em Brasília


# ── Rodízio (função pura, herdada do F-07) ──────────────────────────────────


def test_rodizio_entre_mediuns_em_ordem_circular_com_volta():
    assert svc.rodizio(["A", "B", "C"], 5) == [["A"], ["B"], ["C"], ["A"], ["B"]]


def test_rodizio_varios_por_vez_dando_a_volta_no_fim_da_lista():
    assert svc.rodizio(["A", "B", "C", "D", "E"], 4, por_vez=2) == [
        ["A", "B"],
        ["C", "D"],
        ["E", "A"],
        ["B", "C"],
    ]


def test_rodizio_entre_grupos_pelas_proximas_n_giras():
    assert svc.rodizio([G1, G2], 3) == [[G1], [G2], [G1]]


def test_rodizio_comeca_de_onde_parou_e_ignora_repetidos():
    assert svc.rodizio(["A", "B", "C"], 3, comeca_em=2) == [["C"], ["A"], ["B"]]
    assert svc.rodizio(["A", "B", "A", "C"], 4) == [["A"], ["B"], ["C"], ["A"]]


def test_rodizio_por_vez_maior_que_a_lista_nao_repete_na_mesma_gira():
    assert svc.rodizio(["A", "B"], 2, por_vez=5) == [["A", "B"], ["B", "A"]]
    assert all(len(set(x)) == len(x) for x in svc.rodizio(["A", "B", "C"], 6, por_vez=2))


@pytest.mark.parametrize("ordem, quantidade, por_vez", [([], 3, 1), (["A"], 0, 1), (["A"], 2, 0)])
def test_rodizio_sem_ninguem_ou_sem_atividades_e_erro(ordem, quantidade, por_vez):
    with pytest.raises(ValidationError):
        svc.rodizio(ordem, quantidade, por_vez)


# ── Plano da escala (uma atividade) ─────────────────────────────────────────


def _atual(funcao=None, grupo=None, ativa=True):
    return svc.LinhaAtual(funcao_id=funcao, grupo_id=grupo, ativa=ativa)


def _plano(pedidos, *, membros=None, elegiveis=None, atuais=None, **kw):
    membros = membros or {}
    if elegiveis is None:
        elegiveis = {m for ms in membros.values() for m in ms}
    return svc.planejar_escala(pedidos, membros=membros, elegiveis=elegiveis, atuais=atuais or {}, **kw)


def test_por_funcao_com_mediuns_e_com_grupo_inteiro():
    plano = _plano(
        [svc.PedidoFuncao(CAMBONE, medium_ids=(ANA,)), svc.PedidoFuncao(PORTEIRO, grupo_ids=(G1,))],
        membros={G1: [BETO, CAIO]},
    )
    assert plano.atribuir == {
        ANA: svc.Atribuicao(CAMBONE, None, "funcao"),
        BETO: svc.Atribuicao(PORTEIRO, G1, "grupo"),
        CAIO: svc.Atribuicao(PORTEIRO, G1, "grupo"),
    }
    assert plano.novos == [ANA, BETO, CAIO] and not plano.tirados


def test_pedido_um_a_um_ganha_do_grupo_e_grupo_respeita_quem_o_tipo_alcanca():
    plano = _plano(
        [svc.PedidoFuncao(CAMBONE, medium_ids=(BETO,)), svc.PedidoFuncao(PORTEIRO, grupo_ids=(G1,))],
        membros={G1: [BETO, CAIO, DANI]},
        elegiveis={BETO, CAIO},
    )
    assert plano.atribuir[BETO] == svc.Atribuicao(CAMBONE, None, "funcao")
    assert set(plano.atribuir) == {BETO, CAIO}
    assert plano.fora_da_elegibilidade == [DANI] and plano.repetidos == []


def test_membro_de_dois_grupos_em_funcoes_diferentes_fica_na_primeira():
    plano = _plano(
        [svc.PedidoFuncao(CAMBONE, grupo_ids=(G1,)), svc.PedidoFuncao(PORTEIRO, grupo_ids=(G2,))],
        membros={G1: [ANA, BETO], G2: [BETO, CAIO]},
    )
    assert plano.atribuir[BETO].funcao_id == CAMBONE and plano.repetidos == [BETO]


def test_uma_funcao_por_medium_e_funcao_repetida_dao_erro():
    with pytest.raises(ValidationError):
        _plano([svc.PedidoFuncao(CAMBONE, medium_ids=(ANA,)), svc.PedidoFuncao(PORTEIRO, medium_ids=(ANA,))])
    with pytest.raises(ValidationError):
        _plano([svc.PedidoFuncao(CAMBONE, medium_ids=(ANA,)), svc.PedidoFuncao(CAMBONE, medium_ids=(BETO,))])


def test_trocar_de_funcao_manter_e_tirar():
    atuais = {
        ANA: _atual(CAMBONE),
        BETO: _atual(PORTEIRO),
        CAIO: _atual(OGA),
        DANI: _atual(None),  # respondeu "vou" sem função: a escala não mexe
        EDU: _atual(CAMBONE, ativa=False),  # já tinha saído
    }
    plano = _plano(
        [svc.PedidoFuncao(CAMBONE, medium_ids=(ANA, EDU)), svc.PedidoFuncao(OGA, medium_ids=(BETO,))],
        atuais=atuais,
    )
    assert plano.mantidos == [ANA]
    assert plano.trocados == [BETO]
    assert plano.novos == [EDU]  # volta para a escala
    assert plano.tirados == [CAIO]
    assert DANI not in plano.tirados and DANI not in plano.atribuir


def test_rodizio_so_mexe_na_funcao_dele():
    atuais = {ANA: _atual(PORTEIRO), BETO: _atual(CAMBONE), CAIO: _atual(OGA)}
    plano = _plano(
        [svc.PedidoFuncao(CAMBONE, medium_ids=(ANA, DANI))],
        atuais=atuais,
        funcoes_afetadas={CAMBONE},
        origem_individual="rodizio",
    )
    # Ana já é Porteiro nesta gira: continua (uma função por médium) e volta no resultado.
    assert plano.em_outra_funcao == [ANA]
    assert plano.atribuir == {DANI: svc.Atribuicao(CAMBONE, None, "rodizio")}
    assert plano.tirados == [BETO]  # o Cambone de antes sai; o Ogã fica
    assert CAIO not in plano.tirados


def test_escala_vazia_tira_todo_mundo_que_tinha_funcao():
    plano = _plano([], atuais={ANA: _atual(CAMBONE), BETO: _atual(None)})
    assert plano.tirados == [ANA] and not plano.atribuir


def test_linha_atual_so_guarda_grupo_quando_veio_do_grupo():
    agora = INICIO
    de_grupo = SimpleNamespace(funcao_id=CAMBONE, grupo_id=G1, origem="grupo", dispensado_em=None, substituida_por_id=None)
    um_a_um = SimpleNamespace(funcao_id=CAMBONE, grupo_id=G1, origem="funcao", dispensado_em=agora, substituida_por_id=None)
    assert svc.linha_atual(de_grupo) == svc.LinhaAtual(CAMBONE, G1, True)
    assert svc.linha_atual(um_a_um) == svc.LinhaAtual(CAMBONE, None, False)


# ── Guardas ─────────────────────────────────────────────────────────────────


def _ctx(modo="funcoes", cancelada=False, encerrada=None):
    tipo = SimpleNamespace(modo_escala=modo)
    atividade = SimpleNamespace(id=uuid.uuid4(), chamada_encerrada_em=encerrada)
    return presenca.AtividadeCtx(
        origem="gira", ref_id=uuid.uuid4(), tipo=tipo, titulo="Gira", inicio=INICIO, fim=None, local=None,
        cancelada=cancelada, atividade=atividade,
    )


def test_so_tipo_com_escala_por_funcao():
    svc.exigir_modo_funcoes(_ctx())
    for modo in ("nenhuma", "grupos_por_dia"):
        with pytest.raises(ConflictError):
            svc.exigir_modo_funcoes(_ctx(modo))


def test_cancelada_ou_chamada_encerrada_nao_muda_a_escala():
    svc.exigir_editavel(_ctx())
    assert svc.editavel(_ctx()) and not svc.editavel(_ctx(cancelada=True))
    with pytest.raises(ConflictError):
        svc.exigir_editavel(_ctx(cancelada=True))
    with pytest.raises(ConflictError):
        svc.exigir_editavel(_ctx(encerrada=INICIO))


def test_dispensado_nao_mostra_a_funcao_ao_medium():
    tipo = SimpleNamespace(
        controla_presenca=True, pede_confirmacao=True, exige_justificativa=False, checkin_antes_min=60,
        checkin_depois_min=180, duracao_min=None,
    )
    ctx = presenca.AtividadeCtx(
        origem="gira", ref_id=uuid.uuid4(), tipo=tipo, titulo="Gira", inicio=INICIO, fim=None, local=None,
        cancelada=False, atividade=SimpleNamespace(id=uuid.uuid4(), chamada_encerrada_em=None),
    )

    def linha(dispensado=None):
        return SimpleNamespace(
            convocado=True, resposta="sem_resposta", presenca="nao_registrada", justificativa=None,
            dispensado_em=dispensado, substituida_por_id=None, presenca_registrada_em=None,
        )

    kw = dict(ctx=ctx, esperado=True, modo="confianca", prazo_dias=7, agora=datetime(2026, 11, 1, tzinfo=timezone.utc))
    assert presenca.minha_participacao(linha=linha(), funcao="Cambone", **kw)["funcao"] == "Cambone"
    assert presenca.minha_participacao(linha=linha(INICIO), funcao="Cambone", **kw)["funcao"] is None


# ── Rotas: grupo de permissão e plano ───────────────────────────────────────


def _guards(dependencies) -> set:
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_da_escala_por_grupo_e_plano_pro():
    from src.api.v1.admin.atividades_escala import router
    from tests.plan_gate_helpers import plan_gate_features

    base = "/api/v1/admin/atividades"
    assert router.prefix == base
    assert plan_gate_features(router) == ["area_medium", "atividades_corrente", "escalas"]
    escalas = frozenset({PermissionFeature.ESCALAS})
    esperado = {
        ("POST", f"{base}/da-gira/{{gira_id}}/escala"): (escalas, "view"),
        ("GET", f"{base}/{{atividade_id}}/escala"): (escalas, "view"),
        ("PUT", f"{base}/{{atividade_id}}/escala"): (escalas, "edit"),
        ("POST", f"{base}/{{atividade_id}}/escala/copiar-anterior"): (escalas, "edit"),
        ("POST", f"{base}/{{atividade_id}}/escala/rodizio"): (escalas, "edit"),
    }
    vistos = {(m, r.path): _guards(r.dependencies) for r in router.routes for m in r.methods}
    assert set(vistos) == set(esperado)
    for chave, guard in esperado.items():
        assert vistos[chave] == {guard}, chave


def test_rodizio_pede_medium_ou_grupo_e_limita_as_atividades():
    from pydantic import ValidationError as PydanticError

    from src.api.v1.admin.atividades_escala import RodizioBody

    ok = RodizioBody(funcao_id=CAMBONE, medium_ids=[ANA, BETO], quantidade=4)
    assert ok.por_vez == 1
    for kw in (
        {},
        {"medium_ids": [ANA], "grupo_ids": [G1]},
        {"medium_ids": [ANA], "quantidade": 13},
        {"medium_ids": [ANA], "quantidade": 0},
    ):
        with pytest.raises(PydanticError):
            RodizioBody(funcao_id=CAMBONE, **kw)
