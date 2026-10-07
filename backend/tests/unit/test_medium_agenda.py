"""AM-07 — regras da Agenda da Área do Médium (sem banco).

O comportamento HTTP com Postgres real está em tests/integration_pg/test_am07_agenda.py.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.routing import APIRoute, iter_route_contexts

from src.api.dependencies import require_medium
from src.api.v1.medium.agenda import require_agenda_ligada
from src.main import create_app
from src.services.medium_agenda import (
    PeriodoInvalido,
    descricao_do_evento,
    google_agenda_url,
    ics_da_gira,
    item_da_gira,
    link_publico_da_gira,
    mapa_url,
    nome_arquivo_ics,
    periodo_da_agenda,
    situacao_senhas,
    somar_meses,
)

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)


# ── Período ──────────────────────────────────────────────────────────────────


def test_periodo_padrao_e_o_mes_corrente_mais_dois():
    assert periodo_da_agenda(date(2026, 10, 7), None, None) == (date(2026, 10, 1), date(2026, 12, 31))
    # Virada de ano.
    assert periodo_da_agenda(date(2026, 12, 20), None, None) == (date(2026, 12, 1), date(2027, 2, 28))


def test_periodo_informado_e_inclusivo_e_vale_ate_6_meses():
    assert periodo_da_agenda(date(2026, 10, 7), date(2026, 11, 1), date(2026, 11, 30)) == (
        date(2026, 11, 1),
        date(2026, 11, 30),
    )
    # Só o início: 3 meses a partir dele.
    assert periodo_da_agenda(date(2026, 10, 7), date(2026, 9, 15), None) == (date(2026, 9, 15), date(2026, 12, 14))
    # 6 meses menos um dia passa; 6 meses cheios não.
    assert periodo_da_agenda(date(2026, 10, 7), date(2026, 10, 1), date(2027, 3, 31))[1] == date(2027, 3, 31)
    with pytest.raises(PeriodoInvalido, match="6 meses"):
        periodo_da_agenda(date(2026, 10, 7), date(2026, 10, 1), date(2027, 4, 1))
    with pytest.raises(PeriodoInvalido, match="depois"):
        periodo_da_agenda(date(2026, 10, 7), date(2026, 10, 10), date(2026, 10, 9))


def test_somar_meses_ajusta_o_fim_do_mes():
    assert somar_meses(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert somar_meses(date(2026, 11, 15), 3) == date(2027, 2, 15)


# ── Item unificado ───────────────────────────────────────────────────────────


def _gira(**kw):
    base = dict(
        id=uuid.uuid4(),
        nome="Gira de Caboclos",
        data_inicio=datetime(2026, 10, 9, 23, 30, tzinfo=timezone.utc),
        data_fim=None,
        local="",
        recados="Investimento R$ 20",
        orientacoes_corrente="Roupa branca",
        max_tickets=50,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_item_da_gira_tem_o_formato_unificado_e_nada_alem():
    g = _gira()
    item = item_da_gira(g)
    assert item == {
        "origem": "gira",
        "id": str(g.id),
        "tipo": {"nome": "Gira", "icone": "gira", "cor": None},
        "titulo": "Gira de Caboclos",
        "inicio": g.data_inicio,
        "fim": None,
        "local": None,
        "minha_participacao": None,
    }
    # Cada item tem o seu `tipo` (o AM-08 muda nome/cor por tipo sem afetar os outros).
    item["tipo"]["nome"] = "x"
    assert item_da_gira(g)["tipo"]["nome"] == "Gira"


# ── Senhas para o público ────────────────────────────────────────────────────


def _senhas(**kw):
    base = dict(
        agora=AGORA,
        max_tickets=10,
        release_start_at=AGORA - timedelta(hours=1),
        release_end_at=AGORA + timedelta(days=1),
        emitidas=3,
    )
    base.update(kw)
    return situacao_senhas(**base)


def test_situacao_das_senhas():
    assert _senhas().situacao == "abertas"
    assert _senhas(emitidas=10).situacao == "esgotadas"
    futura = AGORA + timedelta(days=2)
    s = _senhas(release_start_at=futura, release_end_at=futura + timedelta(days=1))
    assert (s.situacao, s.abrem_em) == ("abrem_em", futura)
    assert _senhas(release_end_at=AGORA - timedelta(minutes=1)).situacao == "encerradas"
    assert _senhas(max_tickets=None).situacao == "sem_senhas"
    assert _senhas(max_tickets=0).situacao == "sem_senhas"
    assert _senhas(release_start_at=None).situacao == "sem_senhas"


# ── Links ────────────────────────────────────────────────────────────────────


def test_link_publico_e_mapa():
    gid = uuid.uuid4()
    assert link_publico_da_gira("https://girahub.com.br/", gid, "luz-da-mata", True) == (
        f"https://girahub.com.br/public/gira/{gid}"
    )
    assert link_publico_da_gira("https://girahub.com.br", gid, "luz-da-mata", False) == "https://girahub.com.br/luz-da-mata"
    assert mapa_url(None) is None and mapa_url("  ") is None
    assert mapa_url("Rua das Palmeiras, 120") == (
        "https://www.google.com/maps/search/?api=1&query=Rua%20das%20Palmeiras%2C%20120"
    )


def test_google_agenda_url():
    url = google_agenda_url(
        titulo="Gira de Caboclos",
        terreiro="Tenda Luz da Mata",
        inicio=datetime(2026, 10, 9, 23, 30, tzinfo=timezone.utc),
        fim=None,
        local="Rua das Palmeiras, 120",
        descricao="Orientações para a corrente:\nRoupa branca",
    )
    parsed = urlparse(url)
    assert parsed.netloc == "calendar.google.com"
    q = parse_qs(parsed.query)
    assert q["action"] == ["TEMPLATE"]
    assert q["text"] == ["Gira de Caboclos · Tenda Luz da Mata"]
    # Sem fim: 3 horas de duração.
    assert q["dates"] == ["20261009T233000Z/20261010T023000Z"]
    assert q["location"] == ["Rua das Palmeiras, 120"]
    assert q["details"] == ["Orientações para a corrente:\nRoupa branca"]
    assert q["ctz"] == ["America/Sao_Paulo"]


# ── .ics ─────────────────────────────────────────────────────────────────────


def test_ics_do_evento_segue_a_rfc():
    gid = uuid.uuid4()
    ics = ics_da_gira(
        gira_id=gid,
        titulo="Gira de Caboclos",
        terreiro="Tenda Luz da Mata",
        inicio=datetime(2026, 10, 9, 23, 30, tzinfo=timezone.utc),
        fim=datetime(2026, 10, 10, 2, 0, tzinfo=timezone.utc),
        local="Salão principal · Rua das Palmeiras, 120",
        descricao=descricao_do_evento("Roupa branca; guias, vela", "https://girahub.com.br/medium/agenda/gira/x"),
        url="https://girahub.com.br/medium/agenda/gira/x",
        agora=AGORA,
    )
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "\n" not in ics.replace("\r\n", "")  # só CRLF
    desdobrado = ics.replace("\r\n ", "")
    assert f"UID:gira-{gid}@girahub" in desdobrado
    assert "DTSTART:20261009T233000Z" in desdobrado
    assert "DTEND:20261010T020000Z" in desdobrado
    assert "SUMMARY:Gira de Caboclos · Tenda Luz da Mata" in desdobrado
    assert "LOCATION:Salão principal · Rua das Palmeiras\\, 120" in desdobrado
    assert "Roupa branca\\; guias\\, vela" in desdobrado
    assert "METHOD:PUBLISH" in desdobrado
    # Linhas de no máximo 75 octetos.
    assert all(len(linha.encode("utf-8")) <= 75 for linha in ics.split("\r\n"))


def test_ics_sem_fim_usa_tres_horas_e_sem_orientacoes_nao_tem_descricao_vazia():
    ics = ics_da_gira(
        gira_id="g",
        titulo="Gira",
        terreiro="Casa",
        inicio=datetime(2026, 10, 9, 23, 0, tzinfo=timezone.utc),
        fim=None,
        local=None,
        descricao=descricao_do_evento(None, None),
        url=None,
        agora=AGORA,
    )
    assert "DTEND:20261010T020000Z" in ics
    assert "DESCRIPTION" not in ics and "LOCATION" not in ics and "URL:" not in ics


def test_nome_do_arquivo_ics_so_ascii():
    assert nome_arquivo_ics("Gira de Exu & Pombagira", date(2026, 10, 30)) == "gira-de-exu-pombagira-2026-10-30.ics"
    assert nome_arquivo_ics("Ação", date(2026, 1, 2)) == "acao-2026-01-02.ics"
    assert nome_arquivo_ics("★", date(2026, 1, 2)) == "gira-2026-01-02.ics"


# ── Rotas ────────────────────────────────────────────────────────────────────


def _rotas():
    return {
        ctx.path: ctx.original_route
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/medium/agenda")
    }


def test_rotas_da_agenda_estao_na_area_do_medium_e_nunca_recebem_medium_id():
    rotas = _rotas()
    assert set(rotas) == {
        "/api/v1/medium/agenda",
        "/api/v1/medium/agenda/gira/{gira_id}",
        "/api/v1/medium/agenda/gira/{gira_id}/ics",
    }
    for rota in rotas.values():
        assert rota.methods == {"GET"}
        nomes = {p.name for p in rota.dependant.query_params + rota.dependant.path_params}
        assert nomes <= {"inicio", "fim", "gira_id"}
        assert rota.dependant.body_params == []
        # require_medium (do medium_router e por dentro do gate do módulo) e o módulo ligado.
        chamadas = set(_todas_as_dependencias(rota.dependant))
        assert require_medium in chamadas
        assert require_agenda_ligada in chamadas


def _todas_as_dependencias(dependant):
    for d in dependant.dependencies:
        yield d.call
        yield from _todas_as_dependencias(d)
