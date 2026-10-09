"""Pagamento parcial da mensalidade (migração 092) — contas do mês e situação na Área, sem banco."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from src.core.errors import ValidationError
from src.models.mensalidades import MensalidadeStatus
from src.services.email.templates.mensalidade_report import render_mensalidade_report
from src.services.medium_inicio import montar_pendencias, situacao_mensalidade
from src.services.mensalidade_parcial import ComprovanteInfo, SaldoMes, resumir, saldo_do_mes

T0 = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)


def _comp(status: str, minutos: int = 0, valor_conferido=None, motivo=None, origem="medium", conferido_em=None):
    return ComprovanteInfo(
        id=uuid.uuid4(),
        pagamento_id=uuid.uuid4(),
        mediun_id=uuid.uuid4(),
        origem=origem,
        enviado_em=T0 + timedelta(minutes=minutos),
        arquivo_filename="c.jpg",
        arquivo_mime="image/jpeg",
        arquivo_tamanho=10,
        valor_informado=None,
        status=status,
        valor_conferido=Decimal(str(valor_conferido)) if valor_conferido is not None else None,
        conferido_em=conferido_em,
        motivo=motivo,
    )


# ── Contas ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "devido, conferidos, gateway, recebido, falta, pago_a_mais, quitado, parcial",
    [
        (Decimal("50"), [], [], "0.00", "50.00", "0.00", False, False),
        (Decimal("50"), [Decimal("30")], [], "30.00", "20.00", "0.00", False, True),
        (Decimal("50"), [Decimal("30"), Decimal("20")], [], "50.00", "0.00", "0.00", True, False),
        (Decimal("50"), [Decimal("30")], [Decimal("20")], "50.00", "0.00", "0.00", True, False),
        (Decimal("50"), [Decimal("60")], [], "60.00", "0.00", "10.00", True, False),
        (Decimal("50"), [None, Decimal("10")], [None], "10.00", "40.00", "0.00", False, True),
        (50.0, [30.5], [], "30.50", "19.50", "0.00", False, True),
        # Casa sem valor definido: qualquer valor recebido quita (como a confirmação de sempre).
        (None, [Decimal("25")], [], "25.00", "0.00", "0.00", True, False),
        (None, [], [], "0.00", "0.00", "0.00", False, False),
    ],
)
def test_saldo_do_mes(devido, conferidos, gateway, recebido, falta, pago_a_mais, quitado, parcial):
    saldo = saldo_do_mes(devido, conferidos, gateway)
    assert saldo.recebido == Decimal(recebido)
    assert saldo.falta == Decimal(falta)
    assert saldo.pago_a_mais == Decimal(pago_a_mais)
    assert saldo.quitado is quitado
    assert saldo.parcial is parcial


def test_saldo_nunca_negativo():
    assert SaldoMes(devido=Decimal("10"), recebido=Decimal("100")).falta == Decimal("0.00")


# ── Comprovantes → situação ───────────────────────────────────────────────────


def test_resumo_soma_so_conferidos_e_ordena_pelo_envio():
    r = resumir([
        _comp("conferido", 10, 20),
        _comp("conferido", 0, 30),
        _comp("nao_confirmado", 5, motivo="ilegível"),
        _comp("em_conferencia", 20),
        _comp("conferido", 30, None, origem="painel"),
    ])
    assert [c.enviado_em for c in r.comprovantes] == sorted(c.enviado_em for c in r.comprovantes)
    assert r.recebido == Decimal("50.00")
    assert len(r.em_conferencia) == 1 and r.ultimo.origem == "painel"


def test_para_situacao_em_conferencia_vence():
    r = resumir([_comp("nao_confirmado", 0, motivo="x", conferido_em=T0), _comp("em_conferencia", 10)])
    s = r.para_situacao()
    assert s["comprovante_presente"] is True and s["recusado_em"] is None
    assert s["comprovante_enviado_em"] == T0 + timedelta(minutes=10)


def test_para_situacao_ultimo_nao_confirmado_mostra_o_motivo():
    rec = T0 + timedelta(hours=1)
    r = resumir([_comp("conferido", 0, 30), _comp("nao_confirmado", 10, motivo="ilegível", conferido_em=rec)])
    s = r.para_situacao()
    assert s == {
        "comprovante_enviado_em": T0 + timedelta(minutes=10),
        "comprovante_presente": False,
        "recusado_em": rec,
        "recusa_motivo": "ilegível",
    }
    # Um conferido depois da recusa: não fica mais "não confirmada".
    r2 = resumir([_comp("nao_confirmado", 0, motivo="x", conferido_em=T0), _comp("conferido", 10, 30)])
    assert r2.para_situacao()["recusado_em"] is None


def _sit(**kw):
    base = dict(
        hoje=date(2026, 10, 8),
        data_entrada=date(2026, 1, 1),
        isento_permanente=False,
        valor_config=Decimal("50.00"),
        dia_vencimento=10,
        pagamento_status=MensalidadeStatus.PENDENTE,
        pagamento_valor_vigente=Decimal("50.00"),
        pagamento_valor_pago=None,
        pagamento_data=None,
    )
    base.update(kw)
    return situacao_mensalidade(**base)


def test_situacao_em_aberto_usa_a_falta():
    sit = _sit(valor_recebido=Decimal("30"))
    assert sit.status == "pendente" and sit.valor == 20.0
    assert sit.valor_mensalidade == 50.0 and sit.valor_recebido == 30.0
    sem = _sit()
    assert sem.valor == 50.0 and sem.valor_recebido == 0.0
    # Recebido maior que o mês (mês ainda PENDENTE no banco): falta zero, nunca negativa.
    assert _sit(valor_recebido=Decimal("70")).valor == 0.0


def test_situacao_paga_traz_o_total():
    sit = _sit(pagamento_status=MensalidadeStatus.PAGO, pagamento_valor_pago=Decimal("60"))
    assert sit.status == "paga" and sit.valor == 60.0 and sit.valor_recebido == 60.0 and sit.valor_mensalidade == 50.0


def test_pendencia_do_inicio_fala_da_falta():
    sit = _sit(valor_recebido=Decimal("30"))
    [p] = montar_pendencias(hoje=date(2026, 10, 8), mensalidade=sit)
    assert p["valor"] == 20.0 and p["valor_recebido"] == 30.0


def test_relatorio_mostra_a_falta_de_quem_pagou_parte():
    html = render_mensalidade_report(
        inadimplentes=[{"mediun_nome": "Ana", "falta": 20.0}, {"mediun_nome": "Bia"}],
        config_resumo={"valor_mensal": 50.0},
        tenant_name="Casa",
        mes_referencia="2026-10",
    )
    assert "R$ 20,00" in html and "R$ 50,00" in html and "R$ 70,00" in html


@pytest.mark.parametrize(
    "texto, esperado",
    [(None, None), ("", None), ("  ", None), ("30", "30.00"), ("30,5", "30.50"), ("R$ 1.234,56", "1234.56"), ("20.00", "20.00")],
)
def test_valor_informado_do_medium(texto, esperado):
    from src.api.v1.medium.mensalidades import _valor_informado

    valor = _valor_informado(texto)
    assert (str(valor) if valor is not None else None) == esperado


@pytest.mark.parametrize("texto", ["abc", "0", "-1", "NaN", "Infinity", "1e12"])
def test_valor_informado_invalido(texto):
    from src.api.v1.medium.mensalidades import _valor_informado

    with pytest.raises(ValidationError):
        _valor_informado(texto)
