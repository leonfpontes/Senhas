"""Unit tests for waitlist_service — priority ordering, promotion cascade,
expiration, and plan/toggle gating for the fila de espera feature."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.tickets import Ticket, TicketStatus, PriorityCategory
from src.models.giras import Gira
from src.services import waitlist_service


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    return db


def _mock_result_scalars(items):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_ticket(numero: int, priority_category=None, promoted_at=None, confirmation_expires_at=None) -> Ticket:
    t = Ticket()
    t.id = uuid4()
    t.tenant_id = uuid4()
    t.gira_id = uuid4()
    t.consulente_id = uuid4()
    t.numero = numero
    t.status = TicketStatus.WAITLISTED
    t.is_sponsor = False
    t.priority_category = priority_category
    t.promoted_at = promoted_at
    t.confirmation_expires_at = confirmation_expires_at
    return t


def _make_gira(hours=None) -> Gira:
    g = Gira()
    g.id = uuid4()
    g.tenant_id = uuid4()
    g.nome = "Gira de Teste"
    g.waitlist_confirmation_hours = hours
    return g


class TestPriorityRank:
    def test_elderly_ranks_before_no_category(self):
        assert waitlist_service.priority_rank(PriorityCategory.ELDERLY.value) < waitlist_service.priority_rank(None)

    def test_unknown_category_ranks_last(self):
        assert waitlist_service.priority_rank("SOMETHING_UNKNOWN") == waitlist_service.priority_rank(None)

    def test_matches_priority_order_sequence(self):
        ranks = [waitlist_service.priority_rank(c) for c in waitlist_service.PRIORITY_ORDER]
        assert ranks == sorted(ranks)


class TestReconcileAndFill:
    async def test_promotes_highest_priority_over_earlier_numero(self):
        db = _mock_db()
        gira = _make_gira()
        ticket_no_priority = _make_ticket(numero=51)
        ticket_elderly = _make_ticket(numero=52, priority_category=PriorityCategory.ELDERLY.value)

        db.execute.side_effect = [
            _mock_result_scalars([]),  # expire_pending_confirmations: nothing expired
            _mock_result_scalars([ticket_no_priority, ticket_elderly]),  # candidates for the 1 new slot
        ]

        promoted, unfilled = await waitlist_service.reconcile_and_fill(
            session=db,
            tenant_id=ticket_no_priority.tenant_id,
            gira_id=ticket_no_priority.gira_id,
            is_sponsor=False,
            gira=gira,
            extra_slots=1,
        )

        assert unfilled == 0
        assert promoted == [ticket_elderly]
        assert ticket_elderly.promoted_at is not None
        assert ticket_elderly.confirmation_expires_at is not None
        # default confirmation window applied since gira.waitlist_confirmation_hours is None
        expected_delta = timedelta(hours=waitlist_service.DEFAULT_CONFIRMATION_HOURS)
        assert abs((ticket_elderly.confirmation_expires_at - ticket_elderly.promoted_at) - expected_delta) < timedelta(seconds=5)
        # the ticket that lost out was left untouched
        assert ticket_no_priority.promoted_at is None

    async def test_uses_gira_custom_confirmation_hours(self):
        db = _mock_db()
        gira = _make_gira(hours=2)
        candidate = _make_ticket(numero=10)
        db.execute.side_effect = [
            _mock_result_scalars([]),
            _mock_result_scalars([candidate]),
        ]
        promoted, unfilled = await waitlist_service.reconcile_and_fill(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, gira=gira, extra_slots=1,
        )
        assert unfilled == 0
        delta = candidate.confirmation_expires_at - candidate.promoted_at
        assert abs(delta - timedelta(hours=2)) < timedelta(seconds=5)

    async def test_cascades_expired_reservations_to_new_candidates(self):
        """Two lapsed promotions must each free a slot and pull in a replacement,
        independent of any brand-new cancellation slot (extra_slots=0)."""
        db = _mock_db()
        gira = _make_gira()
        expired_a = _make_ticket(numero=1, promoted_at=datetime.now(timezone.utc) - timedelta(hours=48))
        expired_b = _make_ticket(numero=2, promoted_at=datetime.now(timezone.utc) - timedelta(hours=30))
        replacement = _make_ticket(numero=53)

        db.execute.side_effect = [
            _mock_result_scalars([expired_a, expired_b]),  # both lapsed
            _mock_result_scalars([replacement]),           # slot 1 filled
            _mock_result_scalars([]),                       # slot 2: nobody left waiting
        ]

        promoted, unfilled = await waitlist_service.reconcile_and_fill(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, gira=gira, extra_slots=0,
        )

        assert expired_a.status == TicketStatus.WAITLIST_EXPIRED
        assert expired_b.status == TicketStatus.WAITLIST_EXPIRED
        assert promoted == [replacement]
        assert unfilled == 1  # the second vacated slot had nobody to fill it

    async def test_no_candidates_leaves_everything_unfilled(self):
        db = _mock_db()
        gira = _make_gira()
        db.execute.side_effect = [
            _mock_result_scalars([]),  # nothing expired
            _mock_result_scalars([]),  # no one waiting
        ]
        promoted, unfilled = await waitlist_service.reconcile_and_fill(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, gira=gira, extra_slots=1,
        )
        assert promoted == []
        assert unfilled == 1


class TestComputeQueuePosition:
    async def test_position_respects_priority_then_numero(self):
        db = _mock_db()
        low_numero_no_priority = _make_ticket(numero=51)
        high_numero_priority = _make_ticket(numero=55, priority_category=PriorityCategory.ELDERLY.value)
        target = _make_ticket(numero=53, priority_category=PriorityCategory.DISABILITY_OR_AUTISM.value)

        db.execute.return_value = _mock_result_scalars([low_numero_no_priority, high_numero_priority, target])

        position = await waitlist_service.compute_queue_position(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, ticket=target,
        )
        # order should be: high_numero_priority (ELDERLY, rank 0) -> target (DISABILITY, rank 1) -> low_numero_no_priority
        assert position == 2

    async def test_returns_none_when_already_promoted(self):
        db = _mock_db()
        target = _make_ticket(numero=1, promoted_at=datetime.now(timezone.utc))
        position = await waitlist_service.compute_queue_position(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, ticket=target,
        )
        assert position is None
        db.execute.assert_not_called()

    async def test_returns_none_when_not_waitlisted(self):
        db = _mock_db()
        target = _make_ticket(numero=1)
        target.status = TicketStatus.EMITTED
        position = await waitlist_service.compute_queue_position(
            session=db, tenant_id=uuid4(), gira_id=uuid4(), is_sponsor=False, ticket=target,
        )
        assert position is None


class TestWaitlistEnabledForTenant:
    async def test_false_when_toggle_off(self):
        db = _mock_db()
        tc = MagicMock(enable_waitlist=False)
        db.execute.return_value = _mock_result_scalar(tc)
        assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is False

    async def test_false_when_no_tenant_config(self):
        db = _mock_db()
        db.execute.return_value = _mock_result_scalar(None)
        assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is False

    async def test_false_when_toggle_on_but_no_subscription(self):
        db = _mock_db()
        tc = MagicMock(enable_waitlist=True)
        db.execute.return_value = _mock_result_scalar(tc)
        with patch("src.repositories.subscription_repo.SubscriptionRepository") as MockRepo:
            MockRepo.return_value.get_by_tenant = AsyncMock(return_value=None)
            assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is False

    async def test_false_on_basic_plan(self):
        from src.models.subscriptions import PlanType, SubscriptionStatus
        db = _mock_db()
        tc = MagicMock(enable_waitlist=True)
        db.execute.return_value = _mock_result_scalar(tc)
        sub = MagicMock(plan=PlanType.BASIC, status=SubscriptionStatus.ACTIVE)
        with patch("src.repositories.subscription_repo.SubscriptionRepository") as MockRepo:
            MockRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)
            assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is False

    async def test_true_on_pro_plan(self):
        from src.models.subscriptions import PlanType, SubscriptionStatus
        db = _mock_db()
        tc = MagicMock(enable_waitlist=True)
        db.execute.return_value = _mock_result_scalar(tc)
        sub = MagicMock(plan=PlanType.PRO, status=SubscriptionStatus.ACTIVE)
        with patch("src.repositories.subscription_repo.SubscriptionRepository") as MockRepo:
            MockRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)
            assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is True

    async def test_false_on_pro_plan_when_suspended(self):
        from src.models.subscriptions import PlanType, SubscriptionStatus
        db = _mock_db()
        tc = MagicMock(enable_waitlist=True)
        db.execute.return_value = _mock_result_scalar(tc)
        sub = MagicMock(plan=PlanType.PRO, status=SubscriptionStatus.SUSPENDED)
        with patch("src.repositories.subscription_repo.SubscriptionRepository") as MockRepo:
            MockRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)
            assert await waitlist_service.waitlist_enabled_for_tenant(db, uuid4()) is False
