"""Tests for horario_desejado exposed on the Porta queue item (agendamento por horário)."""
from datetime import datetime, time, timezone
from unittest.mock import MagicMock
from uuid import uuid4

from src.models.tickets import TicketStatus


def _mock_ticket(time_slot=None, **overrides):
    t = MagicMock()
    t.id = uuid4()
    t.numero = 1
    t.status = TicketStatus.EMITTED
    t.is_sponsor = False
    t.is_walk_in = False
    t.priority_category = None
    t.observacoes = None
    t.checkin_em = None
    t.atendido_em = None
    t.chamado_em = None
    t.finalizado_em = None
    t.medium_nome = None
    t.cambone_nome = None
    t.atendimento_descricao = None
    t.consulente = None
    t.time_slot = time_slot
    for k, v in overrides.items():
        setattr(t, k, v)
    return t


class TestTicketToQueueItemTimeSlot:
    def test_includes_horario_desejado_when_time_slot_set(self):
        from src.api.v1.admin.door_control import _ticket_to_queue_item

        slot = MagicMock()
        slot.horario = time(20, 30)
        ticket = _mock_ticket(time_slot=slot)

        result = _ticket_to_queue_item(ticket)

        assert result.horario_desejado == "20:30"

    def test_none_when_no_time_slot(self):
        from src.api.v1.admin.door_control import _ticket_to_queue_item

        ticket = _mock_ticket(time_slot=None)

        result = _ticket_to_queue_item(ticket)

        assert result.horario_desejado is None
