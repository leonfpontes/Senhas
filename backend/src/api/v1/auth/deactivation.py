"""Self-service tenant deactivation/reactivation — soft, reversible.

Distinct from `DELETE /api/v1/auth/account` (profile.py), which is a
permanent LGPD Art. 18 VI hard delete. This flow lets a tenant owner "close"
their terreiro without losing data: the tenant and the caller's own user row
are marked inactive (never deleted), and can be restored later via
/reactivate-account with the same email + password.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.config import DUMMY_BCRYPT_HASH, settings
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError, UnauthorizedError
from src.core.limiter import limiter
from src.models import SubscriptionStatus, Tenant, User, UserRole
from src.models.audit_logs import AuditLog, AuditAction
from src.repositories.subscription_repo import SubscriptionRepository
from src.security.password import verify_password
from src.services import session_service, stripe_service
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.account_deactivated import render_account_deactivated_email
from src.services.email.templates.account_reactivated import render_account_reactivated_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth-deactivation"])


class DeactivateAccountRequest(BaseModel):
    """Payload for self-service deactivation — password confirms identity."""

    password: str


class ReactivateAccountRequest(BaseModel):
    """Payload for self-service reactivation."""

    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Email helpers (best-effort, fire-and-forget — same Resend-primary/Brevo-
# fallback pattern used across the codebase)
# ---------------------------------------------------------------------------

async def _send_account_deactivated_email(email: str, user_name: str, reactivation_url: str) -> None:
    html = render_account_deactivated_email(user_name, reactivation_url)
    msg = EmailMessage(
        to_email=email,
        subject="Conta e terreiro desativados — GiraHub",
        html_body=html,
        text_body=(
            f"Olá, {user_name}.\n\nConfirmamos a desativação da sua conta e do seu terreiro. "
            f"Seus dados foram preservados. Para reativar, acesse: {reactivation_url}"
        ),
    )
    try:
        sent = await ResendEmailService().send_async(msg)
        if not sent:
            raise RuntimeError("Resend returned False")
    except Exception:
        try:
            await BrevoEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Account-deactivated notification email failed for %s: %s", email, exc)


async def _send_account_reactivated_email(email: str, user_name: str, login_url: str) -> None:
    html = render_account_reactivated_email(user_name, login_url)
    msg = EmailMessage(
        to_email=email,
        subject="Sua conta no GiraHub foi reativada",
        html_body=html,
        text_body=(
            f"Olá, {user_name}.\n\nSua conta e seu terreiro foram reativados. "
            f"Faça login em: {login_url}"
        ),
    )
    try:
        sent = await ResendEmailService().send_async(msg)
        if not sent:
            raise RuntimeError("Resend returned False")
    except Exception:
        try:
            await BrevoEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Account-reactivated notification email failed for %s: %s", email, exc)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/deactivate-account", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def deactivate_account(
    request: Request,
    response: Response,
    payload: DeactivateAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate the caller's tenant + own account — reversible, keeps data.

    Guards:
    - SUPER_ADMIN accounts cannot use this endpoint.
    - Impersonated sessions are blocked.
    - Password confirmation required.
    - Caller must be the only active user of the tenant (otherwise other
      collaborators would be silently locked out — remove/transfer them first).
    - No-op guard: already-deactivated tenant returns 409.

    On success: Stripe subscription (if any) is cancelled immediately,
    subscription resets to FREE, tenant + user are marked inactive (not
    deleted), all sessions are revoked, and a best-effort notification email
    is sent with the reactivation link.
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        raise InsufficientPermissionsError(
            "Contas de plataforma não podem ser desativadas por aqui."
        )

    # Desativar o terreiro inteiro é uma ação de administração — mesmo sendo
    # o único usuário ativo, um OPERATOR não deve poder derrubar o tenant
    # sozinho (mesmo nível de exigência já usado em billing_stripe.py).
    if current_user.role != UserRole.ADMIN:
        raise InsufficientPermissionsError(
            "Apenas administradores podem desativar o terreiro."
        )

    token_data = getattr(request.state, "token", None)
    impersonated_by = getattr(token_data, "impersonated_by", None) if token_data else None
    if impersonated_by:
        raise InsufficientPermissionsError("Operação não permitida durante impersonação.")

    if not verify_password(payload.password, current_user.password_hash):
        raise UnauthorizedError("Senha incorreta. Confirme sua senha para continuar.")

    tenant_id = current_user.tenant_id
    if tenant_id is None:
        raise HTTPException(status_code=400, detail="Conta não pertence a um terreiro.")

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise NotFoundError("Terreiro não encontrado")

    if tenant.self_deactivated_at is not None:
        raise HTTPException(status_code=409, detail="Este terreiro já está desativado.")

    other_active = await db.scalar(
        select(func.count()).where(
            and_(
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.id != current_user.id,
            )
        )
    )
    if other_active:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Existem outros {other_active} usuário(s) ativo(s) neste terreiro. "
                "Remova ou transfira os demais colaboradores antes de desativar a conta."
            ),
        )

    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(tenant_id)
    previous_plan = sub.plan.value if sub else None

    # Cancel Stripe immediately (best-effort) — the tenant stops being
    # accessible entirely, so continuing to bill for it would be unfair to
    # the customer even though it's "technically" allowed until period end.
    if sub and sub.stripe_subscription_id:
        try:
            await stripe_service.cancel_subscription_immediately(sub.stripe_subscription_id)
        except Exception as exc:
            logger.warning(
                "Failed to cancel Stripe subscription %s for tenant %s on deactivation: %s",
                sub.stripe_subscription_id, tenant_id, exc,
            )

    try:
        tenant.soft_delete()
        tenant.is_active = False
        tenant.self_deactivated_at = datetime.now(timezone.utc)
        current_user.is_active = False
        current_user.sessions_revoked_at = datetime.now(timezone.utc)

        if sub:
            await sub_repo.reset_to_free(tenant_id)

        await session_service.end_all_sessions(db, current_user.id)

        db.add(AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.id,
            action=AuditAction.TENANT_DEACTIVATED,
            resource_type="Tenant",
            resource_id=tenant_id,
            details={"reason": "self-service deactivation", "previous_plan": previous_plan},
        ))

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="strict")

    reactivation_url = f"{settings.FRONTEND_URL}/reactivate-account"
    asyncio.create_task(
        _send_account_deactivated_email(
            current_user.email, current_user.full_name or current_user.username, reactivation_url
        )
    )

    return {"message": "Conta e terreiro desativados. Seus dados foram preservados — reative quando quiser."}


@router.post("/reactivate-account", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def reactivate_account(
    request: Request,
    payload: ReactivateAccountRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a tenant + account previously deactivated via /deactivate-account.

    Public endpoint (the account can't log in to authenticate normally).
    Always returns the same generic message regardless of why it didn't
    reactivate (user not found, wrong password, or tenant not actually
    deactivated) — same anti-enumeration approach as /forgot-password.

    On success: subscription resets to FREE (never auto-restores a
    previous paid plan), tenant + user are reactivated. Does not log the
    user in — they complete a normal /login afterward.
    """
    generic_response = {
        "message": "Se as credenciais estiverem corretas e a conta puder ser reativada, ela será reativada."
    }

    stmt = (
        select(User)
        .where((User.email == payload.email) & (User.deleted_at.is_(None)))
        .order_by(User.created_at.asc())
        .limit(1)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        verify_password(payload.password, DUMMY_BCRYPT_HASH)
        return generic_response

    if not verify_password(payload.password, user.password_hash):
        return generic_response

    if user.tenant_id is None:
        return generic_response

    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant or tenant.self_deactivated_at is None:
        # Not in the "self-deactivated" state — nothing to reactivate.
        # (Deliberately does not check is_active/deleted_at alone: those are
        # also touched by unrelated tenant states, e.g. platform suspension.)
        return generic_response

    tenant.is_active = True
    tenant.deleted_at = None
    tenant.self_deactivated_at = None
    user.is_active = True

    await SubscriptionRepository(db).reset_to_free(tenant.id, status=SubscriptionStatus.ACTIVE)

    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action=AuditAction.TENANT_REACTIVATED,
        resource_type="Tenant",
        resource_id=tenant.id,
        details={"reason": "self-service reactivation"},
    ))

    await db.commit()

    login_url = f"{settings.FRONTEND_URL}/login"
    asyncio.create_task(
        _send_account_reactivated_email(user.email, user.full_name or user.username, login_url)
    )

    return generic_response
