"""Refresh-token session bookkeeping: rotation, reuse detection, absolute cap.

Complements src/security/jwt.py (token *encoding*) with the server-side state
needed to make refresh tokens safely rotatable:

- Each login creates one UserSession row (`session_id` stable for the life of
  that login; `current_jti` is the only refresh token allowed to redeem it).
- Each successful refresh rotates `current_jti` and keeps the superseded jti
  valid for a short grace window, so two tabs/devices racing to refresh at
  nearly the same instant don't get spuriously treated as token theft.
- A jti presented outside that grace window (i.e. a genuinely stale/stolen
  token) revokes the whole session — the standard OAuth2 refresh-token
  rotation reuse-detection pattern.
- `expires_at` is set once at login (now + MAX_SESSION_DAYS) and never
  extended on rotation, giving an absolute session lifetime regardless of
  activity.

State lives in Postgres (not Redis): the production Redis instance runs with
`maxmemory-policy allkeys-lru`, so a rarely-touched session key could be
evicted under memory pressure — which would silently force a real,
legitimate session to re-login. That failure mode is exactly the bug this
whole feature exists to prevent, so durability here matters more than the
sub-millisecond speed difference from Redis.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.logging import log_security_event
from ..models import User
from ..models.user_sessions import UserSession


@dataclass
class RotationResult:
    """Outcome of attempting to redeem a refresh token."""

    new_jti: Optional[uuid.UUID]
    revoked: bool = False
    reason: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.new_jti is not None


def serialize_verified(verified: dict[uuid.UUID, datetime]) -> dict[str, str]:
    """Mapa de contas conferidas → JSON da coluna `verified_accounts` (ISO UTC)."""
    out: dict[str, str] = {}
    for account_id, at in verified.items():
        at_utc = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
        out[str(account_id)] = at_utc.astimezone(timezone.utc).isoformat()
    return out


def verified_map(row: Optional[UserSession]) -> dict[uuid.UUID, datetime]:
    """Contas do mesmo e-mail cuja senha foi conferida no login desta sessão, e quando.

    Lido só do servidor (linha da sessão), nunca do cliente. Entrada malformada é
    ignorada (vale como "não conferida": a troca pede a senha)."""
    raw = getattr(row, "verified_accounts", None) if row is not None else None
    if not isinstance(raw, dict):
        return {}
    out: dict[uuid.UUID, datetime] = {}
    for key, value in raw.items():
        try:
            at = datetime.fromisoformat(str(value))
            out[uuid.UUID(str(key))] = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
    return out


async def start_session(
    db: AsyncSession,
    user: User,
    user_agent: Optional[str] = None,
    verified_accounts: Optional[dict[uuid.UUID, datetime]] = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Create a new UserSession row for a fresh login.

    `verified_accounts` (trocar de terreiro): contas do mesmo e-mail cuja senha foi
    conferida neste login e quando — o login com várias contas passa as que a senha
    abriu; a troca passa o mapa herdado da sessão anterior. A própria conta sempre
    entra (conferida agora, se não vier no mapa).

    Returns (session_id, jti) to embed in the refresh token that's about to
    be issued. Does not commit — caller controls the transaction boundary.
    """
    now = datetime.now(timezone.utc)
    session_id = uuid.uuid4()
    jti = uuid.uuid4()
    verified = dict(verified_accounts or {})
    verified.setdefault(user.id, now)

    row = UserSession(
        id=session_id,
        user_id=user.id,
        tenant_id=user.tenant_id,
        current_jti=str(jti),
        previous_jti=None,
        previous_jti_valid_until=None,
        orig_iat=now,
        expires_at=now + timedelta(days=settings.MAX_SESSION_DAYS),
        last_used_at=now,
        user_agent=(user_agent or "")[:255] or None,
        verified_accounts=serialize_verified(verified),
    )
    db.add(row)
    return session_id, jti


async def get_active_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    presented_jti: Optional[uuid.UUID],
) -> Optional[UserSession]:
    """Sessão do refresh token apresentado, se ainda vale (trocar de terreiro).

    Mesmo escopo do rotate_session (id + user_id do JWT de refresh validado), sem
    rotacionar: a linha precisa existir, não ter passado do teto absoluto e o jti
    ser o atual ou o anterior (refresh concorrente). Não commita nem apaga nada.
    """
    stmt = select(UserSession).where(
        (UserSession.id == session_id) & (UserSession.user_id == user_id)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None or datetime.now(timezone.utc) >= row.expires_at:
        return None
    presented = str(presented_jti) if presented_jti is not None else None
    if presented is None or presented not in {row.current_jti, row.previous_jti}:
        return None
    return row


async def rotate_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    presented_jti: uuid.UUID,
) -> RotationResult:
    """Validate and rotate a refresh token's jti for an existing session.

    Does not commit — caller controls the transaction boundary.
    """
    stmt = select(UserSession).where(
        (UserSession.id == session_id) & (UserSession.user_id == user_id)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    if row is None:
        return RotationResult(new_jti=None, reason="session_not_found")

    now = datetime.now(timezone.utc)

    if now >= row.expires_at:
        await db.delete(row)
        return RotationResult(new_jti=None, reason="max_session_age_exceeded")

    presented = str(presented_jti)

    if presented == row.current_jti:
        new_jti = uuid.uuid4()
        row.previous_jti = row.current_jti
        row.previous_jti_valid_until = now + timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        row.current_jti = str(new_jti)
        row.last_used_at = now
        db.add(row)
        return RotationResult(new_jti=new_jti)

    grace_active = (
        row.previous_jti is not None
        and row.previous_jti_valid_until is not None
        and now <= row.previous_jti_valid_until
    )
    if presented == row.previous_jti and grace_active:
        # Benign race: another tab/device already rotated moments ago. Re-issue
        # the *current* jti instead of rotating again, so this tab converges to
        # the same generation rather than spawning a third one.
        row.last_used_at = now
        db.add(row)
        return RotationResult(new_jti=uuid.UUID(row.current_jti))

    # Neither the current nor the recently-superseded jti: this refresh token
    # is stale well past any benign race window — treat as a reuse/theft
    # signal and revoke the whole session (all devices sharing this login).
    log_security_event(
        "refresh_token_reuse_detected",
        user_id=user_id,
        tenant_id=row.tenant_id,
        success=False,
        details={"session_id": str(session_id)},
    )
    await db.delete(row)
    return RotationResult(new_jti=None, revoked=True, reason="reuse_detected")


async def end_session(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
    """Delete a single session row (normal logout — this device only)."""
    await db.execute(
        delete(UserSession).where(
            (UserSession.id == session_id) & (UserSession.user_id == user_id)
        )
    )


async def end_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete every session row for a user (password change / logout-all-devices).

    Does not commit — caller controls the transaction boundary.
    """
    await db.execute(delete(UserSession).where(UserSession.user_id == user_id))
