"""Tests for time-slot capacity release on ticket cancellation (single delete
and bulk cancel), mirroring the existing SenhaControl.slots_returned release
flow fixed in commit 89beba2."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.tickets import TicketStatus
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _admin_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.is_admin = True
    return u


def _mock_ticket(status=TicketStatus.EMITTED, time_slot_id=None, is_sponsor=False):
    t = MagicMock()
    t.id = uuid4()
    t.tenant_id = TENANT_ID
    t.gira_id = GIRA_ID
    t.status = status
    t.time_slot_id = time_slot_id
    t.is_sponsor = is_sponsor
    t.consulente = MagicMock(email="c@t.com")
    return t


class TestDeleteTicketReleasesTimeSlot:
    @patch("src.api.v1.admin.tickets_list.AuditService")
    @patch("src.api.v1.admin.tickets_list.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.tickets_list.SenhaControlRepository")
    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    async def test_releases_time_slot_when_set(self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit):
        from src.api.v1.admin.tickets_list import delete_ticket

        db = _mock_db()
        slot_id = uuid4()
        ticket = _mock_ticket(time_slot_id=slot_id)
        db.execute.return_value = _mock_result_scalar(ticket)
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockSlotRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await delete_ticket(GIRA_ID, ticket.id, _admin_user(), db)

        MockSlotRepo.return_value.increment_slots_returned.assert_awaited_once_with(db, TENANT_ID, slot_id)
        assert ticket.status == TicketStatus.CANCELLED
        db.commit.assert_awaited_once()

    @patch("src.api.v1.admin.tickets_list.AuditService")
    @patch("src.api.v1.admin.tickets_list.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.tickets_list.SenhaControlRepository")
    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    async def test_skips_time_slot_release_when_not_set(self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit):
        from src.api.v1.admin.tickets_list import delete_ticket

        db = _mock_db()
        ticket = _mock_ticket(time_slot_id=None)
        db.execute.return_value = _mock_result_scalar(ticket)
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await delete_ticket(GIRA_ID, ticket.id, _admin_user(), db)

        MockSlotRepo.return_value.increment_slots_returned.assert_not_called()

    @patch("src.api.v1.admin.tickets_list.AuditService")
    @patch("src.api.v1.admin.tickets_list.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.tickets_list.SenhaControlRepository")
    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    async def test_missing_slot_logs_warning_but_does_not_raise(self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit):
        from src.api.v1.admin.tickets_list import delete_ticket

        db = _mock_db()
        slot_id = uuid4()
        ticket = _mock_ticket(time_slot_id=slot_id)
        db.execute.return_value = _mock_result_scalar(ticket)
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockSlotRepo.return_value.increment_slots_returned = AsyncMock(side_effect=ValueError("not found"))
        MockAudit.return_value.log_delete = AsyncMock()

        await delete_ticket(GIRA_ID, ticket.id, _admin_user(), db)

        db.commit.assert_awaited_once()


class TestBulkCancelReleasesTimeSlots:
    @patch("src.api.v1.admin.tickets_bulk.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.tickets_bulk.SenhaControlRepository")
    @patch("src.api.v1.admin.tickets_bulk.waitlist_service")
    async def test_releases_slot_for_each_cancelled_ticket_with_time_slot(self, mock_waitlist, MockSenhaRepo, MockSlotRepo):
        from src.api.v1.admin.tickets_bulk import _release_slots_for_cancelled_tickets

        db = _mock_db()
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockSlotRepo.return_value.increment_slots_returned = AsyncMock()

        slot_id_1, slot_id_2 = uuid4(), uuid4()
        tickets = [
            _mock_ticket(time_slot_id=slot_id_1),
            _mock_ticket(time_slot_id=slot_id_2),
            _mock_ticket(time_slot_id=None),
        ]

        await _release_slots_for_cancelled_tickets(db, TENANT_ID, tickets)

        assert MockSlotRepo.return_value.increment_slots_returned.await_count == 2
        called_slot_ids = {
            call.args[2] for call in MockSlotRepo.return_value.increment_slots_returned.await_args_list
        }
        assert called_slot_ids == {slot_id_1, slot_id_2}

    @patch("src.api.v1.admin.tickets_bulk.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.tickets_bulk.SenhaControlRepository")
    @patch("src.api.v1.admin.tickets_bulk.waitlist_service")
    async def test_no_tickets_is_noop(self, mock_waitlist, MockSenhaRepo, MockSlotRepo):
        from src.api.v1.admin.tickets_bulk import _release_slots_for_cancelled_tickets

        db = _mock_db()
        await _release_slots_for_cancelled_tickets(db, TENANT_ID, [])
        MockSlotRepo.return_value.increment_slots_returned.assert_not_called()
