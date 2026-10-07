"""AM-06 — regras da tela Início da Área do Médium (sem banco).

O comportamento HTTP com Postgres real está em tests/integration_pg/test_am06_inicio.py.
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi.routing import APIRoute, iter_route_contexts

from src.api.dependencies import require_medium
from src.main import create_app
from src.models.mensalidades import MensalidadeStatus
from src.services.medium_inicio import (
    MensalidadeDoMes,
    montar_pendencias,
    situacao_mensalidade,
    vencimento_do_mes,
)

HOJE = date(2026, 10, 7)


def _situacao(**kw):
    base = dict(
        hoje=HOJE,
        data_entrada=None,
        isento_permanente=False,
        valor_config=Decimal("50.00"),
        dia_vencimento=10,
        pagamento_status=None,
        pagamento_valor_vigente=None,
        pagamento_valor_pago=None,
        pagamento_data=None,
    )
    base.update(kw)
    return situacao_mensalidade(**base)


def test_vencimento_respeita_o_ultimo_dia_do_mes():
    assert vencimento_do_mes(date(2026, 2, 1), 31) == date(2026, 2, 28)
    assert vencimento_do_mes(date(2026, 10, 1), 10) == date(2026, 10, 10)


def test_sem_pagamento_fica_pendente_ate_o_vencimento():
    s = _situacao()
    assert s.status == "pendente"
    assert s.valor == 50.0
    assert s.vencimento == date(2026, 10, 10)
    assert s.mes == "2026-10"


def test_no_dia_do_vencimento_ainda_nao_esta_atrasada_e_no_seguinte_esta():
    assert _situacao(hoje=date(2026, 10, 10)).status == "pendente"
    assert _situacao(hoje=date(2026, 10, 11)).status == "atrasada"


def test_paga_usa_o_valor_pago_e_a_data():
    pago_em = datetime(2026, 10, 3, 15, tzinfo=timezone.utc)
    s = _situacao(
        pagamento_status=MensalidadeStatus.PAGO,
        pagamento_valor_vigente=Decimal("50.00"),
        pagamento_valor_pago=Decimal("45.00"),
        pagamento_data=pago_em,
    )
    assert s.status == "paga"
    assert s.valor == 45.0
    assert s.data_pagamento == pago_em


def test_isento_permanente_ou_no_mes():
    assert _situacao(isento_permanente=True).status == "isento"
    s = _situacao(pagamento_status=MensalidadeStatus.ISENTO)
    assert s.status == "isento"
    assert s.valor is None and s.vencimento is None


def test_valor_vigente_do_registro_vence_o_da_configuracao():
    s = _situacao(pagamento_status=MensalidadeStatus.PENDENTE, pagamento_valor_vigente=Decimal("40.00"))
    assert s.status == "pendente"
    assert s.valor == 40.0


def test_medium_que_entrou_depois_do_mes_nao_tem_mensalidade():
    assert _situacao(data_entrada=date(2026, 11, 2)) is None
    assert _situacao(data_entrada=date(2026, 10, 31)).status == "pendente"


def test_casa_sem_valor_configurado_nao_cobra():
    assert _situacao(valor_config=Decimal("0.00")) is None


def test_pendencias_na_ordem_escala_mensalidade_aviso():
    mens = MensalidadeDoMes(mes="2026-10", status="atrasada", valor=50.0, vencimento=date(2026, 10, 5), data_pagamento=None)
    itens = montar_pendencias(hoje=HOJE, mensalidade=mens, avisos_nao_lidos=2, escalas_a_responder=1)
    assert [p["tipo"] for p in itens] == ["escala", "mensalidade", "aviso"]
    assert itens[1]["situacao"] == "atrasada"
    assert itens[1]["dias_para_vencer"] == -2


def test_mensalidade_em_aberto_so_e_pendencia_a_5_dias_do_vencimento():
    def pend(venc):
        mens = MensalidadeDoMes(mes="2026-10", status="pendente", valor=50.0, vencimento=venc, data_pagamento=None)
        return montar_pendencias(hoje=HOJE, mensalidade=mens)

    assert pend(date(2026, 10, 13)) == []  # faltam 6 dias: fica em "Acompanhando"
    assert pend(date(2026, 10, 12))[0]["dias_para_vencer"] == 5
    assert pend(date(2026, 10, 7))[0]["dias_para_vencer"] == 0


def test_mensalidade_paga_ou_isenta_nao_e_pendencia():
    for status in ("paga", "isento"):
        mens = MensalidadeDoMes(mes="2026-10", status=status, valor=None, vencimento=None, data_pagamento=None)
        assert montar_pendencias(hoje=HOJE, mensalidade=mens) == []
    assert montar_pendencias(hoje=HOJE, mensalidade=None) == []


def test_rota_inicio_esta_na_area_do_medium_e_nao_recebe_parametros():
    rotas = [
        (ctx.path, ctx.original_route)
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path == "/api/v1/medium/inicio"
    ]
    assert len(rotas) == 1
    _, rota = rotas[0]
    assert rota.methods == {"GET"}
    # Nada vem da requisição: nem medium_id, nem query/path/corpo.
    assert rota.dependant.query_params == []
    assert rota.dependant.path_params == []
    assert rota.dependant.body_params == []
    assert any(d.call is require_medium for d in rota.dependant.dependencies)
