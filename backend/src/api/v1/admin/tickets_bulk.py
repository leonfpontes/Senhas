"""T060: Admin Bulk Operations - POST/DELETE bulk mark-used, cancel"""
from collections import defaultdict
from fastapi import APIRouter, Depends, status, Path, HTTPException, Request
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List
from uuid import UUID
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus, PermissionFeature
from src.models.giras import Gira
from src.models.senha_controls import SenhaControl
from src.repositories.senha_control_repo import SenhaControlRepository
from src.repositories.senha_control_repo_extended import SenhaControlRepositoryExtended
from src.services.audit_service import AuditService
from src.services import waitlist_service
from src.api.v1.admin.tickets_list import _send_waitlist_promotion_email
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError
from src.core.limiter import limiter

router = APIRouter(prefix="/api/v1/admin", tags=["admin-bulk"])
logger = logging.getLogger(__name__)


async def _release_slots_for_cancelled_tickets(
    db: AsyncSession,
    tenant_id: UUID,
    cancelled_tickets: List[Ticket],
) -> None:
    """Free up capacity for bulk-cancelled tickets, mirroring the single-ticket
    delete flow: first offer freed slots to the waitlist, then fall back to
    SenhaControl.slots_returned for whatever nobody in the queue could take.
    """
    if not cancelled_tickets:
        return

    groups: dict[tuple[UUID, bool], List[Ticket]] = defaultdict(list)
    for ticket in cancelled_tickets:
        groups[(ticket.gira_id, ticket.is_sponsor)].append(ticket)

    waitlist_on = await waitlist_service.waitlist_enabled_for_tenant(db, tenant_id)
    senha_control_repo = SenhaControlRepository(db, SenhaControl)

    for (gira_id, is_sponsor), group_tickets in groups.items():
        unfilled_slots = len(group_tickets)

        if waitlist_on:
            gira_result = await db.execute(
                select(Gira).where(and_(Gira.id == gira_id, Gira.tenant_id == tenant_id))
            )
            gira_obj = gira_result.scalar_one_or_none()
            if gira_obj:
                promoted_tickets, unfilled_slots = await waitlist_service.reconcile_and_fill(
                    session=db,
                    tenant_id=tenant_id,
                    gira_id=gira_id,
                    is_sponsor=is_sponsor,
                    gira=gira_obj,
                    extra_slots=len(group_tickets),
                )
                for promoted in promoted_tickets:
                    await _send_waitlist_promotion_email(db, tenant_id, promoted, gira_obj)

        for _ in range(unfilled_slots):
            try:
                await senha_control_repo.increment_slots_returned(
                    session=db,
                    tenant_id=tenant_id,
                    gira_id=gira_id,
                    is_sponsor=is_sponsor,
                )
            except ValueError:
                logger.warning(
                    "SenhaControl not found for gira=%s is_sponsor=%s during bulk cancel. Slot not returned.",
                    gira_id,
                    is_sponsor,
                )


class BulkOperationRequest(BaseModel):
    """Bulk operation request."""
    ticket_ids: List[UUID]
    dry_run: bool = False


class BulkOperationResponse(BaseModel):
    """Bulk operation response."""
    modified: int
    failed: int
    errors: List[str]


@router.post("/giras/{gira_id}/tickets/bulk-mark-used", response_model=BulkOperationResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "edit"))])
@limiter.limit("20/minute")
async def bulk_mark_used(
    request: Request,
    gira_id: UUID = Path(...),
    body: BulkOperationRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkOperationResponse:
    """Mark multiple tickets as used/completed.

    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = SenhaControlRepositoryExtended(db)
    result = await repo.bulk_mark_used(
        ticket_ids=body.ticket_ids,
        tenant_id=current_user.tenant_id,
        dry_run=body.dry_run,
    )

    if not body.dry_run:
        # Log audit
        audit_service = AuditService(db)
        await audit_service.log_bulk_operation(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            operation_type="bulk_mark_used",
            resource_type="Ticket",
            count=result["modified"],
            resource_ids=body.ticket_ids,
        )
        await db.commit()

    return BulkOperationResponse(**result)


@router.post("/giras/{gira_id}/tickets/bulk-cancel", response_model=BulkOperationResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "delete"))])
@limiter.limit("20/minute")
async def bulk_cancel(
    request: Request,
    gira_id: UUID = Path(...),
    body: BulkOperationRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkOperationResponse:
    """Cancel multiple tickets.

    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = SenhaControlRepositoryExtended(db)
    result = await repo.bulk_cancel(
        ticket_ids=body.ticket_ids,
        tenant_id=current_user.tenant_id,
        dry_run=body.dry_run,
    )
    cancelled_tickets = result.pop("cancelled_tickets", [])

    if not body.dry_run:
        # Free up capacity for each cancelled slot (waitlist first, then slots_returned)
        await _release_slots_for_cancelled_tickets(db, current_user.tenant_id, cancelled_tickets)

        # Log audit
        audit_service = AuditService(db)
        await audit_service.log_bulk_operation(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            operation_type="bulk_cancel",
            resource_type="Ticket",
            count=result["modified"],
            resource_ids=body.ticket_ids,
        )
        await db.commit()

    return BulkOperationResponse(**result)
