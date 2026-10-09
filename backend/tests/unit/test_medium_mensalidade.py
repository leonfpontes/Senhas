"""AM-11/AM-12 — regras da tela Mensalidade da Área do Médium (sem banco).

O comportamento HTTP com Postgres real está em tests/integration_pg/test_am11_12_mensalidade.py.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.routing import APIRoute, iter_route_contexts

from src.api.dependencies import require_medium, require_not_impersonated
from src.main import create_app
from src.models.mensalidades import MensalidadeStatus
from src.services.medium_inicio import MensalidadeDoMes, montar_pendencias, situacao_mensalidade
from src.services.medium_mensalidade import (
    MAX_COMPROVANTE_MEDIUM_BYTES,
    ComprovanteInvalido,
    chave_alterada_recente,
    comprovante_para_conferir,
    descricao_pix,
    meses_da_area,
    parse_mes,
    validar_comprovante,
)
from src.services.pix_brcode import build_static_brcode, txid_mensalidade

HOJE = date(2026, 10, 15)
T0 = datetime(2026, 10, 12, 18, tzinfo=timezone.utc)

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"0" * 100
PDF = b"%PDF-1.7\n" + b"0" * 100


def _sit(**kw):
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


# ── Status do mês ─────────────────────────────────────────────────────────────


def test_comprovante_enviado_deixa_em_conferencia():
    s = _sit(
        pagamento_status=MensalidadeStatus.PENDENTE,
        pagamento_valor_vigente=Decimal("50.00"),
        comprovante_enviado_em=T0,
        comprovante_presente=True,
    )
    assert s.status == "em_conferencia"
    assert s.comprovante_enviado_em == T0
    assert s.recusa_motivo is None


def test_comprovante_removido_pelo_painel_volta_a_ser_em_aberto():
    s = _sit(pagamento_status=MensalidadeStatus.PENDENTE, comprovante_enviado_em=T0, comprovante_presente=False)
    assert s.status == "atrasada"
    assert s.comprovante_enviado_em is None


def test_recusa_depois_do_envio_e_nao_confirmada_com_motivo():
    s = _sit(
        pagamento_status=MensalidadeStatus.PENDENTE,
        comprovante_enviado_em=T0,
        comprovante_presente=True,
        recusado_em=T0 + timedelta(hours=1),
        recusa_motivo="O valor é diferente da mensalidade.",
    )
    assert s.status == "nao_confirmada"
    assert s.recusa_motivo == "O valor é diferente da mensalidade."
    assert s.recusado_em == T0 + timedelta(hours=1)


def test_reenvio_depois_da_recusa_volta_para_conferencia():
    s = _sit(
        pagamento_status=MensalidadeStatus.PENDENTE,
        comprovante_enviado_em=T0 + timedelta(days=1),
        comprovante_presente=True,
        recusado_em=T0,
        recusa_motivo="ilegível",
    )
    assert s.status == "em_conferencia"
    assert s.recusa_motivo is None


def test_pago_vence_isencao_permanente_e_comprovante():
    s = _sit(
        isento_permanente=True,
        pagamento_status=MensalidadeStatus.PAGO,
        pagamento_valor_pago=Decimal("50.00"),
        comprovante_enviado_em=T0,
        comprovante_presente=True,
    )
    assert s.status == "paga"


def test_mes_passado_sem_registro_esta_atrasado_e_o_futuro_nao_existe():
    s = _sit(mes=date(2026, 8, 1))
    assert s.status == "atrasada"
    assert s.mes == "2026-08"
    assert s.vencimento == date(2026, 8, 10)
    assert _sit(mes=date(2026, 8, 1), data_entrada=date(2026, 9, 3)) is None


def test_pendencias_nao_confirmada_sobe_e_em_conferencia_nao():
    def pend(status):
        mens = MensalidadeDoMes(mes="2026-10", status=status, valor=50.0, vencimento=date(2026, 10, 30), data_pagamento=None)
        return montar_pendencias(hoje=HOJE, mensalidade=mens)

    assert pend("em_conferencia") == []
    assert pend("nao_confirmada")[0]["situacao"] == "nao_confirmada"


# ── Quais meses aparecem ──────────────────────────────────────────────────────


def test_meses_da_entrada_ate_hoje_com_o_atual_primeiro():
    meses = meses_da_area(
        hoje=HOJE, data_entrada=date(2026, 7, 20), inicio_cobranca=date(2026, 1, 5), meses_com_registro=[]
    )
    assert meses == [date(2026, 10, 1), date(2026, 9, 1), date(2026, 8, 1), date(2026, 7, 1)]


def test_meses_nunca_antes_da_casa_configurar_nem_mais_de_12():
    meses = meses_da_area(
        hoje=HOJE, data_entrada=date(2010, 1, 1), inicio_cobranca=date(2026, 9, 20), meses_com_registro=[]
    )
    assert meses == [date(2026, 10, 1), date(2026, 9, 1)]
    meses = meses_da_area(hoje=HOJE, data_entrada=None, inicio_cobranca=date(2015, 1, 1), meses_com_registro=[])
    assert len(meses) == 12 and meses[-1] == date(2025, 11, 1)


def test_meses_com_registro_sempre_aparecem_e_futuro_nao():
    meses = meses_da_area(
        hoje=HOJE,
        data_entrada=None,
        inicio_cobranca=None,
        meses_com_registro=[date(2024, 3, 1), date(2026, 12, 1)],
    )
    assert meses == [date(2024, 3, 1)]


def test_isento_permanente_ve_so_o_mes_atual_e_os_registros():
    meses = meses_da_area(
        hoje=HOJE,
        data_entrada=None,
        inicio_cobranca=date(2026, 1, 1),
        meses_com_registro=[date(2026, 2, 1)],
        isento_permanente=True,
    )
    assert meses == [date(2026, 10, 1), date(2026, 2, 1)]


def test_medium_que_entra_no_futuro_nao_tem_mes():
    assert meses_da_area(hoje=HOJE, data_entrada=date(2026, 11, 2), inicio_cobranca=date(2026, 1, 1), meses_com_registro=[]) == []


@pytest.mark.parametrize("texto", ["2026-1", "2026/10", "2026-13", "abcd-ef", "", "2026-10-01"])
def test_parse_mes_recusa_formato_invalido(texto):
    with pytest.raises(ValueError):
        parse_mes(texto)


def test_parse_mes():
    assert parse_mes("2026-10") == date(2026, 10, 1)


# ── Comprovante ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ct,data,mime,ext",
    [
        ("image/jpeg", JPEG, "image/jpeg", "jpg"),
        ("image/png", PNG, "image/png", "png"),
        ("image/webp", WEBP, "image/webp", "webp"),
        ("application/pdf", PDF, "application/pdf", "pdf"),
        ("application/octet-stream", PDF, "application/pdf", "pdf"),
        ("image/jpg", JPEG, "image/jpeg", "jpg"),
    ],
)
def test_tipos_aceitos_pelos_bytes(ct, data, mime, ext):
    v = validar_comprovante(ct, data, f"Comprovante PIX.{ext}")
    assert v.mime == mime
    assert v.filename.endswith(f".{ext}")


def test_tipo_vale_pelo_conteudo_nao_pelo_nome():
    # Declarou PNG mas é JPEG: grava o tipo real.
    assert validar_comprovante("image/png", JPEG, "foto.png").mime == "image/jpeg"


@pytest.mark.parametrize(
    "ct,data",
    [
        ("image/jpeg", b"<html>nao sou imagem</html>"),
        ("text/html", JPEG),
        ("image/gif", b"GIF89a" + b"0" * 10),
        ("image/heic", b"\x00\x00\x00\x18ftypheic"),
    ],
)
def test_tipo_invalido_recusa(ct, data):
    with pytest.raises(ComprovanteInvalido) as exc:
        validar_comprovante(ct, data, "x")
    assert exc.value.code == "COMPROVANTE_TIPO"


def test_acima_de_2mb_recusa_e_no_limite_aceita():
    no_limite = JPEG + b"0" * (MAX_COMPROVANTE_MEDIUM_BYTES - len(JPEG))
    assert validar_comprovante("image/jpeg", no_limite, "a.jpg").mime == "image/jpeg"
    with pytest.raises(ComprovanteInvalido) as exc:
        validar_comprovante("image/jpeg", no_limite + b"0", "a.jpg")
    assert exc.value.code == "COMPROVANTE_GRANDE"


def test_vazio_recusa():
    with pytest.raises(ComprovanteInvalido) as exc:
        validar_comprovante("image/jpeg", b"", "a.jpg")
    assert exc.value.code == "COMPROVANTE_VAZIO"


def test_nome_do_arquivo_sem_caminho_nem_caracteres_estranhos():
    v = validar_comprovante("application/pdf", PDF, "../../etc/<script>passwd.pdf")
    assert v.filename == "scriptpasswd.pdf"
    assert validar_comprovante("image/jpeg", JPEG, None).filename == "comprovante.jpg"


def test_comprovante_para_conferir():
    assert comprovante_para_conferir("PENDENTE", T0, True, None)
    assert comprovante_para_conferir(MensalidadeStatus.PENDENTE, T0, True, T0 - timedelta(days=1))
    assert not comprovante_para_conferir("PAGO", T0, True, None)
    assert not comprovante_para_conferir("PENDENTE", None, True, None)  # anexado pelo painel
    assert not comprovante_para_conferir("PENDENTE", T0, False, None)  # removido
    assert not comprovante_para_conferir("PENDENTE", T0, True, T0)  # já recusado


# ── PIX do mês ────────────────────────────────────────────────────────────────


def test_txid_identifica_mes_e_medium_e_cabe_no_br_code():
    mid = uuid.UUID("0a1b2c3d-4e5f-6789-abcd-ef0123456789")
    txid = txid_mensalidade(date(2026, 10, 1), mid)
    assert txid == "MENS2026100A1B2C3D4E"
    assert len(txid) <= 25 and txid.isalnum()
    code = build_static_brcode(
        chave="+5511999998888",
        nome_recebedor="Tenda Luz da Mata",
        cidade="São Paulo",
        valor=50,
        txid=txid,
        descricao=descricao_pix(date(2026, 10, 1)),
    )
    assert f"0520{txid}" in code
    assert "540550.00" in code
    assert "Mensalidade 10/2026" in code


def test_chave_alterada_so_aparece_por_30_dias():
    agora = datetime(2026, 10, 15, tzinfo=timezone.utc)
    assert chave_alterada_recente(agora - timedelta(days=29), agora) is not None
    assert chave_alterada_recente(agora - timedelta(days=31), agora) is None
    assert chave_alterada_recente(None, agora) is None


# ── Rotas ─────────────────────────────────────────────────────────────────────


def _rotas():
    return {
        (m, ctx.path): ctx.original_route
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/medium/mensalidades")
        for m in ctx.original_route.methods
    }


def _deps(rota):
    out, pilha = [], list(rota.dependant.dependencies)
    while pilha:
        d = pilha.pop()
        out.append(d.call)
        pilha.extend(d.dependencies)
    return out


def test_rotas_da_mensalidade_so_recebem_o_mes():
    rotas = _rotas()
    assert set(rotas) == {
        ("GET", "/api/v1/medium/mensalidades"),
        ("GET", "/api/v1/medium/mensalidades/{mes}/pix"),
        ("POST", "/api/v1/medium/mensalidades/{mes}/comprovante"),
        # Baixa automática (F-02/AM-22): cobrança dinâmica na conta da casa.
        ("POST", "/api/v1/medium/mensalidades/{mes}/cobranca"),
        ("GET", "/api/v1/medium/mensalidades/{mes}/cobranca"),
    }
    for (_, _), rota in rotas.items():
        assert require_medium in _deps(rota)
        nomes = {p.name for p in rota.dependant.query_params + rota.dependant.path_params}
        assert nomes <= {"mes", "metodo"}
        assert not {"medium_id", "mediun_id"} & nomes


def test_envio_do_comprovante_e_recusado_sob_impersonacao():
    rota = _rotas()[("POST", "/api/v1/medium/mensalidades/{mes}/comprovante")]
    assert require_not_impersonated in _deps(rota)
    assert require_not_impersonated in _deps(_rotas()[("POST", "/api/v1/medium/mensalidades/{mes}/cobranca")])
    for (m, _), r in _rotas().items():
        if m == "GET":
            assert require_not_impersonated not in _deps(r)
