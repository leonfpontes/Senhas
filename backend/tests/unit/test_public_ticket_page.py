"""GET /api/v1/public/{tenant_slug}/ticket/{ticket_id} — o bilhete do consulente.

Destino do link "Para resgatar sua senha" dos e-mails (emissão, reenvio e
promoção da fila de espera), que até então dava 404.
"""
from datetime import datetime, time, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models.tickets import TicketStatus
from tests.conftest import GIRA_ID, TENANT_ID


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    import src.api.v1.public.cancel_ticket as mod

    original = mod.limiter.enabled
    mod.limiter.enabled = False
    yield
    mod.limiter.enabled = original


def _result(value=None, many=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    r.scalars.return_value.all.return_value = many if many is not None else []
    return r


def _db(*results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    return db


def _ticket(status=TicketStatus.EMITTED, numero=42, is_sponsor=False, time_slot_id=None):
    t = MagicMock()
    t.id = uuid4()
    t.tenant_id = TENANT_ID
    t.gira_id = GIRA_ID
    t.status = status
    t.numero = numero
    t.is_sponsor = is_sponsor
    t.is_acompanhante = False
    t.time_slot_id = time_slot_id
    t.consulente = MagicMock()
    t.consulente.nome = "Maria da Silva"
    return t


def _gira(starts_in_hours=48.0):
    g = MagicMock()
    g.id = GIRA_ID
    g.tenant_id = TENANT_ID
    g.nome = "Gira de Pretos-Velhos"
    g.data_inicio = datetime(2099, 10, 8, 22, 0, tzinfo=timezone.utc)  # data fixa no futuro (antes 2026 virou bomba-relógio)
    if starts_in_hours < 0:
        g.data_inicio = datetime.now(timezone.utc) + timedelta(hours=starts_in_hours)
    g.local = "Salão principal"
    g.recados = "  Traga uma vela branca.  "
    return g


def _tenant():
    t = MagicMock()
    t.id = TENANT_ID
    t.slug = "tenda-pai-joaquim"
    t.name = "Tenda Pai Joaquim"
    return t


def _config(endereco="Rua das Flores, 123 - São Paulo", logo_url=None, logo_data=None):
    c = MagicMock()
    c.endereco = endereco
    c.logo_url = logo_url
    c.logo_data = logo_data
    c.primary_color = "#4f46e5"
    c.secondary_color = "#818cf8"
    return c


async def test_bilhete_completo():
    from src.api.v1.public.cancel_ticket import get_public_ticket

    ticket = _ticket()
    db = _db(_result(ticket), _result(_gira()), _result(_tenant()), _result(_config()), _result(many=[]))

    resp = await get_public_ticket(MagicMock(), "tenda-pai-joaquim", str(ticket.id), db)

    assert resp.ticket_number == "0042"
    assert resp.status == "emitted" and resp.status_label == "Confirmada"
    assert resp.cancellable is True and resp.cancel_reason is None
    assert resp.gira_name == "Gira de Pretos-Velhos"
    assert resp.gira_date == "08/10/2099 às 19:00"  # 22:00 UTC em Brasília
    assert resp.gira_date_iso.startswith("2099-10-08T22:00:00")
    assert resp.gira_local == "Salão principal"
    assert resp.recados == "Traga uma vela branca."
    assert resp.tenant_address == "Rua das Flores, 123 - São Paulo"
    assert resp.maps_url.startswith("https://www.google.com/maps/dir/?api=1&destination=Rua%20das%20Flores")
    assert resp.tenant_logo_url is None
    assert resp.consulente_name == "Maria da Silva"
    assert resp.acompanhantes == []


async def test_slug_errado_e_404_e_filtra_no_banco():
    from src.api.v1.public.cancel_ticket import get_public_ticket

    ticket = _ticket()
    db = _db(_result(ticket), _result(_gira()), _result(None))

    with pytest.raises(HTTPException) as exc:
        await get_public_ticket(MagicMock(), "outro-terreiro", str(ticket.id), db)

    assert exc.value.status_code == 404
    tenant_query = str(db.execute.call_args_list[2].args[0])
    assert "tenants.slug" in tenant_query


async def test_uuid_invalido_e_404():
    from src.api.v1.public.cancel_ticket import get_public_ticket

    with pytest.raises(HTTPException) as exc:
        await get_public_ticket(MagicMock(), "tenda", "nao-e-uuid", _db())
    assert exc.value.status_code == 404


async def test_cancelada_nao_e_cancelavel_e_tem_rotulo():
    from src.api.v1.public.cancel_ticket import get_public_ticket

    ticket = _ticket(status=TicketStatus.CANCELLED, is_sponsor=True)
    db = _db(_result(ticket), _result(_gira()), _result(_tenant()), _result(_config(endereco="")), _result(many=[]))

    resp = await get_public_ticket(MagicMock(), "tenda-pai-joaquim", str(ticket.id), db)

    assert resp.ticket_number == "P042"
    assert resp.status_label == "Cancelada"
    assert resp.cancellable is False and "já foi cancelada" in resp.cancel_reason
    assert resp.tenant_address is None and resp.maps_url is None


async def test_horario_do_slot_e_logo_servido_pela_api():
    from src.api.v1.public.cancel_ticket import get_public_ticket

    slot_id = uuid4()
    ticket = _ticket(time_slot_id=slot_id)
    slot = MagicMock()
    slot.horario = time(20, 30)
    db = _db(
        _result(ticket), _result(_gira()), _result(_tenant()),
        _result(_config(logo_data=b"png")), _result(slot), _result(many=[]),
    )

    resp = await get_public_ticket(MagicMock(), "tenda-pai-joaquim", str(ticket.id), db)

    assert resp.horario == "20:30"
    assert resp.tenant_logo_url.endswith(f"/api/v1/public/tenant/{TENANT_ID}/logo")
    slot_query = str(db.execute.call_args_list[4].args[0])
    assert "gira_time_slots.tenant_id" in slot_query
