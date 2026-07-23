"""Public onboarding endpoint — self-service registration.

New tenants are eligible for a 1-month Premium trial (no credit card
required) unless their CPF/CNPJ or e-mail already claimed one before — see
_check_trial_eligibility / TrialGrant.
"""
import hashlib
import re
import unicodedata
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.config import settings
from src.models import (
    Tenant,
    TenantConfig,
    User,
    UserRole,
    Subscription,
    PlanType,
    SubscriptionStatus,
    TrialGrant,
)
from src.repositories.tenant_repo import TenantRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.security.password import hash_password
from src.security.jwt import create_access_token, create_refresh_token
from src.services import session_service
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.welcome import generate_welcome_html

logger = logging.getLogger(__name__)

TRIAL_DAYS = 30

router = APIRouter(prefix="/api/v1/public", tags=["onboarding"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

def _validar_cpf(cpf: str) -> bool:
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        value = sum(int(cpf[num]) * ((i + 1) - num) for num in range(i))
        digit = ((value * 10) % 11) % 10
        if digit != int(cpf[i]):
            return False
    return True


def _validar_cnpj(cnpj: str) -> bool:
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    for weights, check_idx in ((weights1, 12), (weights2, 13)):
        value = sum(int(cnpj[i]) * weights[i] for i in range(len(weights)))
        digit = 11 - (value % 11)
        digit = digit if digit < 10 else 0
        if digit != int(cnpj[check_idx]):
            return False
    return True


class OnboardingRequest(BaseModel):
    terreiro_nome: str
    endereco: Optional[str] = None
    responsavel_nome: str
    email: EmailStr
    whatsapp: str
    documento: str
    password: str
    como_conheceu: Optional[str] = None
    aceite_termos: bool

    @field_validator("documento")
    @classmethod
    def documento_valido(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 11:
            if not _validar_cpf(digits):
                raise ValueError("CPF inválido")
        elif len(digits) == 14:
            if not _validar_cnpj(digits):
                raise ValueError("CNPJ inválido")
        else:
            raise ValueError("Documento deve ser um CPF ou CNPJ válido")
        return digits

    @field_validator("terreiro_nome")
    @classmethod
    def terreiro_nome_len(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 255:
            raise ValueError("Nome do terreiro deve ter entre 3 e 255 caracteres")
        return v

    @field_validator("responsavel_nome")
    @classmethod
    def responsavel_nome_len(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 255:
            raise ValueError("Nome do responsável deve ter entre 2 e 255 caracteres")
        return v

    @field_validator("whatsapp")
    @classmethod
    def whatsapp_format(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10 or len(digits) > 13:
            raise ValueError("WhatsApp deve conter entre 10 e 13 dígitos")
        return digits

    @field_validator("password")
    @classmethod
    def password_min(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter no mínimo 8 caracteres")
        return v

    @field_validator("como_conheceu")
    @classmethod
    def como_conheceu_enum(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("google", "instagram", "indicacao", "outro"):
            raise ValueError("Valor inválido para 'como nos conheceu'")
        return v

    @field_validator("aceite_termos")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("É necessário aceitar os termos de uso")
        return v


class OnboardingUserOut(BaseModel):
    id: str
    email: str
    username: str
    role: str
    tenant_id: str


class OnboardingTenantOut(BaseModel):
    id: str
    name: str
    slug: str


class OnboardingResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    user: OnboardingUserOut
    tenant: OnboardingTenantOut


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[-\s]+", "-", text).strip("-")
    return text or "terreiro"


async def _unique_slug(slug: str, tenant_repo: TenantRepository) -> str:
    """Ensure slug is unique by appending a numeric suffix if needed."""
    base = slug
    counter = 1
    while await tenant_repo.get_by_slug(slug):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


async def _unique_username(base: str, db: AsyncSession) -> str:
    """Ensure username is unique by appending a numeric suffix if needed."""
    username = base
    counter = 1
    while True:
        stmt = select(User).where(User.username == username, User.deleted_at.is_(None))
        result = await db.execute(stmt)
        if not result.scalar_one_or_none():
            return username
        username = f"{base}{counter}"
        counter += 1


async def _send_welcome_email(email: str, name: str, tenant_name: str, is_trial: bool = False) -> None:
    """Best-effort welcome email (Resend primary, Brevo fallback)."""
    html = generate_welcome_html(
        responsavel_nome=name,
        tenant_name=tenant_name,
        dashboard_url=f"{settings.FRONTEND_URL}/admin/dashboard",
        is_trial=is_trial,
        trial_days=TRIAL_DAYS,
    )
    msg = EmailMessage(
        to_email=email,
        subject=f"Bem-vindo ao GiraHub, {name}!",
        html_body=html,
    )
    try:
        provider = ResendEmailService()
        sent = await provider.send_async(msg)
        if not sent:
            raise Exception("Resend failed")
    except Exception:
        try:
            fallback = BrevoEmailService()
            await fallback.send_async(msg)
        except Exception as exc:
            logger.warning("Welcome email failed for %s: %s", email, exc)


def _hash_documento(documento_digits: str) -> str:
    return hashlib.sha256(documento_digits.encode("ascii")).hexdigest()


async def _check_trial_eligibility(db: AsyncSession, documento: str, email: str) -> bool:
    """A CPF/CNPJ or e-mail that already claimed a trial can't claim another —
    even if the original tenant was later hard-deleted (TrialGrant has no FK
    to tenants for exactly that reason)."""
    documento_hash = _hash_documento(documento)
    stmt = select(TrialGrant.id).where(
        or_(TrialGrant.documento_hash == documento_hash, TrialGrant.email == email.lower())
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/onboarding", response_model=OnboardingResponse, status_code=201)
async def onboarding(
    body: OnboardingRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Self-service registration: creates tenant + admin user.

    New tenants get a 1-month Premium trial (no card required) unless their
    CPF/CNPJ or e-mail already claimed one before.
    """

    # 1. Check email uniqueness
    stmt = select(User).where(User.email == body.email, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este email já está cadastrado",
        )

    # 2. Generate unique slug
    tenant_repo = TenantRepository(db)
    slug = await _unique_slug(_slugify(body.terreiro_nome), tenant_repo)

    trial_eligible = await _check_trial_eligibility(db, body.documento, body.email)

    try:
        # 3. Create tenant
        tenant = await tenant_repo.create(
            name=body.terreiro_nome.strip(),
            slug=slug,
            description=f"Terreiro {body.terreiro_nome.strip()}",
            is_active=True,
            documento=body.documento,
        )

        # 4. Create tenant config
        config = TenantConfig(
            tenant_id=tenant.id,
            endereco=body.endereco.strip() if body.endereco else None,
            custom_settings={"como_conheceu": body.como_conheceu} if body.como_conheceu else None,
        )
        db.add(config)

        # 5. Create subscription — PREMIUM trial if eligible, FREE otherwise
        sub_repo = SubscriptionRepository(db)
        if trial_eligible:
            trial_ends_at = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)
            await sub_repo.create_for_tenant(
                tenant_id=tenant.id,
                plan=PlanType.PREMIUM,
                is_trial=True,
                trial_ends_at=trial_ends_at,
            )
            db.add(TrialGrant(
                documento_hash=_hash_documento(body.documento),
                email=body.email.lower(),
                tenant_id=tenant.id,
            ))
        else:
            await sub_repo.create_for_tenant(tenant_id=tenant.id, plan=PlanType.FREE)

        # 6. Create admin user
        base_username = body.email.split("@")[0]
        username = await _unique_username(base_username, db)
        user = User(
            tenant_id=tenant.id,
            email=body.email,
            username=username,
            full_name=body.responsavel_nome.strip(),
            phone=body.whatsapp,
            password_hash=hash_password(body.password),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        # 7. Commit transaction
        await db.commit()

    except IntegrityError as exc:
        await db.rollback()
        logger.warning("Onboarding IntegrityError for email=%s: %s", body.email, exc)
        # Re-check email conflict (most likely cause)
        stmt2 = select(User).where(User.email == body.email, User.deleted_at.is_(None))
        result2 = await db.execute(stmt2)
        if result2.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este email já está cadastrado",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma conta com esse nome de terreiro. Tente um nome diferente.",
        )

    # 8. Generate tokens
    session_id, jti = await session_service.start_session(db, user)
    await db.commit()
    access_token = create_access_token(user.id, tenant.id, user.role.value)
    refresh_token = create_refresh_token(user.id, tenant.id, user.role.value, session_id, jti)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=30 * 24 * 60 * 60,
    )

    # 9. Send welcome email (best-effort, don't block response)
    try:
        await _send_welcome_email(
            email=body.email,
            name=body.responsavel_nome.strip(),
            tenant_name=body.terreiro_nome.strip(),
            is_trial=trial_eligible,
        )
    except Exception as exc:
        logger.warning("Welcome email fire-and-forget failed: %s", exc)

    return OnboardingResponse(
        access_token=access_token,
        expires_in=86400,
        user=OnboardingUserOut(
            id=str(user.id),
            email=user.email,
            username=user.username,
            role=user.role.value,
            tenant_id=str(tenant.id),
        ),
        tenant=OnboardingTenantOut(
            id=str(tenant.id),
            name=tenant.name,
            slug=tenant.slug,
        ),
    )
