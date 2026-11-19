"""Ordem de atendimento da fila da Porta escolhida pelo terreiro (queue_order_mode).

``numero``: pelo número da senha (o de sempre). ``chegada``: quem fez check-in
primeiro, na ordem da chegada; quem ainda não chegou fica depois, pelo número.
As faixas de prioridade e a regra dos associados valem nos dois modos.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.api.v1.admin.door_control import QueueItemResponse, _ordenar_fila

T0 = datetime(2026, 11, 19, 19, 0, tzinfo=timezone.utc)


def _item(numero, chegou_min=None, *, prioridade=None, associado=False):
    return QueueItemResponse(
        id=uuid4(),
        numero=numero,
        numero_formatado=f"{numero:04d}",
        status="emitted",
        is_sponsor=associado,
        preferencial=prioridade is not None,
        priority_category=prioridade,
        checkin_em=None if chegou_min is None else T0 + timedelta(minutes=chegou_min),
        is_walk_in=False,
        is_acompanhante=False,
    )


def _numeros(fila):
    return [i.numero for i in fila]


def _por_numero(*items):
    return sorted(items, key=lambda i: i.numero)


def test_modo_numero_mantem_ordem_da_senha():
    fila = _ordenar_fila(_por_numero(_item(1), _item(2, chegou_min=10), _item(3, chegou_min=1)), "first", "numero")
    assert _numeros(fila) == [1, 2, 3]


def test_padrao_e_numero():
    fila = _ordenar_fila(_por_numero(_item(1), _item(2, chegou_min=10), _item(3, chegou_min=1)), "first")
    assert _numeros(fila) == [1, 2, 3]


def test_modo_chegada_quem_chegou_primeiro_vem_primeiro():
    fila = _ordenar_fila(
        _por_numero(_item(1), _item(2, chegou_min=10), _item(3, chegou_min=1), _item(4)),
        "first",
        "chegada",
    )
    # 3 chegou às 19h01, 2 às 19h10; 1 e 4 ainda não chegaram e ficam pelo número.
    assert _numeros(fila) == [3, 2, 1, 4]


def test_modo_chegada_empate_desempata_pelo_numero():
    fila = _ordenar_fila(_por_numero(_item(7, chegou_min=5), _item(2, chegou_min=5)), "first", "chegada")
    assert _numeros(fila) == [2, 7]


def test_modo_chegada_preserva_prioridade_legal():
    # Preferencial (idoso) que chegou depois ainda passa na frente de quem não é preferencial.
    fila = _ordenar_fila(
        _por_numero(_item(1, chegou_min=1), _item(5, chegou_min=20, prioridade="ELDERLY")),
        "first",
        "chegada",
    )
    assert _numeros(fila) == [5, 1]


def test_modo_chegada_com_associados_intercalados():
    fila = _ordenar_fila(
        _por_numero(
            _item(1, chegou_min=9),
            _item(2, chegou_min=3),
            _item(10, chegou_min=8, associado=True),
            _item(11, chegou_min=2, associado=True),
        ),
        "interleave",
        "chegada",
    )
    # Associados na ordem de chegada (11, 10) intercalados com os demais na ordem de chegada (2, 1).
    assert _numeros(fila) == [11, 2, 10, 1]


def test_update_aceita_so_os_dois_modos():
    from src.api.v1.admin.config import TenantConfigUpdate

    assert TenantConfigUpdate(queue_order_mode="chegada").queue_order_mode == "chegada"
    assert TenantConfigUpdate(queue_order_mode="numero").queue_order_mode == "numero"
    with pytest.raises(ValidationError):
        TenantConfigUpdate(queue_order_mode="aleatorio")
