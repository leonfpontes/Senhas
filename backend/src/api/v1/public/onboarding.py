"""Public onboarding endpoint — self-service registration for Free plan."""
import re
import unicodedata
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
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
)
from src.repositories.tenant_repo import TenantRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.security.password import hash_password
from src.security.jwt import create_access_token, create_refresh_token
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.welcome import generate_welcome_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/public", tags=["onboarding"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OnboardingRequest(BaseModel):
    terreiro_nome: str
    endereco: Optional[str] = None
    responsavel_nome: str
    email: EmailStr
    whatsapp: str
    password: str
    como_conheceu: Optional[str] = None
    aceite_termos: bool

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


async def _send_welcome_email(email: str, name: str, tenant_name: str) -> None:
    """Best-effort welcome email (Resend primary, Brevo fallback)."""
    html = generate_welcome_html(
        responsavel_nome=name,
        tenant_name=tenant_name,
        dashboard_url=f"{settings.FRONTEND_URL}/admin/dashboard",
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


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/onboarding", response_model=OnboardingResponse, status_code=201)
async def onboarding(
    body: OnboardingRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Self-service registration: creates tenant + admin user on Free plan."""

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

    # 3. Create tenant
    tenant = await tenant_repo.create(
        name=body.terreiro_nome.strip(),
        slug=slug,
        description=f"Terreiro {body.terreiro_nome.strip()}",
        is_active=True,
    )

    # 4. Create tenant config
    config = TenantConfig(
        tenant_id=tenant.id,
        endereco=body.endereco.strip() if body.endereco else None,
        custom_settings={"como_conheceu": body.como_conheceu} if body.como_conheceu else None,
    )
    db.add(config)

    # 5. Create subscription (FREE)
    sub_repo = SubscriptionRepository(db)
    await sub_repo.create_for_tenant(tenant_id=tenant.id, plan=PlanType.FREE)

    # 6. Create admin user
    user = User(
        tenant_id=tenant.id,
        email=body.email,
        username=body.email.split("@")[0],
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

    # 8. Generate tokens
    access_token = create_access_token(user.id, tenant.id, user.role.value)
    refresh_token = create_refresh_token(user.id, tenant.id, user.role.value)

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
