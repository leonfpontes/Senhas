"""Filtro de datas da auditoria consolidada (item 3 das jornadas da plataforma).

A tela manda "YYYY-MM-DD" (data local). O fim do período tem de cobrir o dia
inteiro em Brasília, senão o último dia (normalmente hoje) nunca aparece.
"""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from src.api.v1.platform.consolidated_audit import _parse_datetime


def test_inicio_data_simples_e_meia_noite_de_brasilia():
    start = _parse_datetime("2026-10-06")
    # 00:00 em São Paulo (UTC-3) = 03:00Z
    assert start.astimezone(timezone.utc) == datetime(2026, 10, 6, 3, 0, tzinfo=timezone.utc)


def test_fim_data_simples_inclui_o_dia_inteiro_local():
    end = _parse_datetime("2026-10-06", end_of_day=True)
    # Um log às 23:30 locais (02:30Z do dia seguinte) entra no filtro `<= end`
    log_noite = datetime(2026, 10, 7, 2, 30, tzinfo=timezone.utc)
    assert log_noite <= end
    # E o primeiro instante do dia seguinte local (03:00Z) fica de fora
    assert datetime(2026, 10, 7, 3, 0, tzinfo=timezone.utc) > end


def test_mesmo_dia_nao_e_intervalo_invertido():
    assert _parse_datetime("2026-10-06") < _parse_datetime("2026-10-06", end_of_day=True)


def test_data_com_hora_e_respeitada():
    end = _parse_datetime("2026-10-06T12:00:00Z", end_of_day=True)
    assert end == datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


def test_data_invalida_400():
    with pytest.raises(HTTPException) as exc:
        _parse_datetime("06/10/2026")
    assert exc.value.status_code == 400
