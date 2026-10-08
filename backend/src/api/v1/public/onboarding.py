"""Public onboarding endpoint — self-service registration.

New tenants are eligible for a 1-month Premium trial (no credit card
required) unless their CPF/CNPJ or e-mail already claimed one before — see
_check_trial_eligibility / TrialGrant.

E-mail que já tem conta ATIVA em outro terreiro (decisão do dono, 2026-10-08):
a casa nova é permitida, confirmando a senha dessa conta (`conta_existente`).
O admin novo nasce com o MESMO hash de senha — uma senha só para a pessoa, e o
login passa a perguntar "Em qual terreiro você quer entrar?" (AM-05). Limite de
MAX_LOGIN_ACCOUNTS (5) contas ativas por e-mail, o mesmo teto do login.
"""
import hashlib
import re
import unicodedata
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator

from src.core.onboarding import COMO_CONHECEU_VALUES, PRINCIPAL_DOR_VALUES
from src.core.reserved_slugs import is_reserved_slug
from src.core.legal_versions import DOCUMENTOS_DO_CADASTRO, LEGAL_VERSIONS
from src.core.limiter import get_client_ip, limiter
from src.core.logging import log_security_event
from sqlalchemy import func, select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.config import settings
from src.models import (
    LegalAcceptance,
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
from src.core.errors import ValidationError as AppValidationError
from src.security.password import hash_password, validate_password_policy
from src.api.v1.auth.login import (
    MAX_LOGIN_ACCOUNTS,
    active_login_accounts_stmt,
    issue_session,
    matching_accounts,
    normalize_login_email,
)
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.welcome import generate_welcome_html

logger = logging.getLogger(__name__)

TRIAL_DAYS = 30

# Recusas do e-mail que já tem conta ativa em outro terreiro. Nunca 401: no front,
# 401 dispara o "sessão expirada" (mesma regra do aceite do convite, SENHA_INCORRETA).
EMAIL_JA_TEM_CONTA = {
    "message": "Você já tem conta no GiraHub com este e-mail. Digite a senha dessa conta para criar a casa nova.",
    "error_code": "EMAIL_JA_TEM_CONTA",
}
SENHA_CONTA_INCORRETA = {
    "message": "Senha incorreta. Use a senha com que você já entra no GiraHub.",
    "error_code": "SENHA_CONTA_INCORRETA",
}
LIMITE_CONTAS_EMAIL = {
    "message": (
        f"Este e-mail já está em {MAX_LOGIN_ACCOUNTS} terreiros, o máximo do GiraHub. "
        "Use outro e-mail para a casa nova."
    ),
    "error_code": "LIMITE_CONTAS_EMAIL",
}
EMAIL_JA_CADASTRADO = "Este email já está cadastrado"

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


def _validar_senha_nova(v: str) -> str:
    """Mesma política do resto do sistema (troca/redefinição de senha) e do
    formulário de cadastro — antes o backend aceitava qualquer senha de 8 caracteres."""
    try:
        validate_password_policy(v)
    except AppValidationError as exc:
        motivos = (exc.details or {}).get("errors") or []
        raise ValueError(f"{exc.message}: {', '.join(motivos)}" if motivos else exc.message) from exc
    return v


class OnboardingRequest(BaseModel):
    terreiro_nome: str
    endereco: Optional[str] = None
    responsavel_nome: str
    email: EmailStr
    whatsapp: str
    documento: str
    # True = a pessoa já tem conta no GiraHub com este e-mail (o front liga depois do 409
    # EMAIL_JA_TEM_CONTA) e `password` é a senha DESSA conta — sem a regra de senha nova.
    # Declarado antes de `password`: o validador da senha lê este valor.
    conta_existente: bool = False
    password: str
    # Obrigatórias desde 2026-10-07 (decisão do dono): "Ainda estou conhecendo" (`outro`) e "Outro"
    # continuam valendo. `validate_default` faz a ausência passar pelo validador e sair como 422
    # com mensagem clara (o "Field required" do pydantic não diz o que falta).
    como_conheceu: Optional[str] = Field(default=None, validate_default=True)
    # Maior dor que quer resolver — define a trilha do tour de boas-vindas e do checklist.
    principal_dor: Optional[str] = Field(default=None, validate_default=True)
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

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        # E-mail de login é gravado em minúsculas (ver login.normalize_login_email).
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_policy(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("conta_existente"):
            # Senha de uma conta que já existe: pode ser anterior à regra atual. Só o
            # teto do bcrypt (72 bytes) — senha maior nunca foi gravada.
            if not v:
                raise ValueError("Digite a senha da sua conta GiraHub")
            if len(v.encode("utf-8")) > 72:
                raise ValueError("Senha muito longa")
            return v
        return _validar_senha_nova(v)

    @field_validator("como_conheceu")
    @classmethod
    def como_conheceu_enum(cls, v: Optional[str]) -> str:
        if not v:
            raise ValueError("Conte como você conheceu o GiraHub")
        if v not in COMO_CONHECEU_VALUES:
            raise ValueError("Valor inválido para 'como nos conheceu'")
        return v

    @field_validator("principal_dor")
    @classmethod
    def principal_dor_enum(cls, v: Optional[str]) -> str:
        if not v:
            raise ValueError("Conte o que você mais precisa resolver")
        if v not in PRINCIPAL_DOR_VALUES:
            raise ValueError("Valor inválido para 'o que você mais precisa resolver'")
        return v

    @field_validator("aceite_termos")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("É necessário aceitar os termos de uso")
        return v


def _build_custom_settings(body: "OnboardingRequest") -> Optional[dict]:
    """Respostas opcionais do cadastro gravadas em tenant_configs.custom_settings."""
    settings: dict = {}
    if body.como_conheceu:
        settings["como_conheceu"] = body.como_conheceu
    if body.principal_dor:
        settings["principal_dor"] = body.principal_dor
    return settings or None


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
    """Ensure slug is unique by appending a numeric suffix if needed.

    Slugs reservados (rotas do site, ver ``core/reserved_slugs.py``) também ganham sufixo:
    um terreiro chamado "Planos" vira ``planos-1``, senão a página /planos encobriria o site dele.
    """
    base = slug
    counter = 1
    while is_reserved_slug(slug) or await tenant_repo.get_by_slug(slug):
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


async def _contas_ativas_do_email(db: AsyncSession, email: str) -> list[User]:
    """Contas ATIVAS com o e-mail, na mesma noção do login (AM-05): usuário ativo e
    não excluído num terreiro não desativado/excluído — inclusive papel `medium`.
    No máximo MAX_LOGIN_ACCOUNTS (mais antigas primeiro): o mesmo teto de bcrypt do login."""
    return list((await db.execute(active_login_accounts_stmt(email))).scalars().all())


async def _email_em_conta_nao_excluida(db: AsyncSession, email: str) -> bool:
    """Regra de antes de 2026-10-08, que segue valendo quando NÃO há conta ativa:
    conta inativa ou de terreiro desativado (que o login oferece reativar) barra o
    cadastro com 409 "Este email já está cadastrado". Conta excluída não barra."""
    stmt = select(User.id).where(
        func.lower(User.email) == normalize_login_email(email), User.deleted_at.is_(None)
    ).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none() is not None


def _erro_senha(mensagem: str) -> RequestValidationError:
    """422 no mesmo formato do validador do pydantic (`loc` no campo `password`)."""
    return RequestValidationError(
        [{"type": "value_error", "loc": ("body", "password"), "msg": f"Value error, {mensagem}", "input": None}]
    )


async def _senha_do_cadastro(db: AsyncSession, body: "OnboardingRequest") -> tuple[str, bool]:
    """(hash de senha do admin novo, se é o de uma conta existente) — ou a recusa do e-mail.

    - E-mail com conta ativa (qualquer papel, inclusive médium):
      sem `conta_existente` → 409 EMAIL_JA_TEM_CONTA; com ele, confere a senha em cada
      conta (`matching_accounts`, a mesma do login: todas, sem parar na primeira) →
      nenhuma confere: 400 SENHA_CONTA_INCORRETA; confere, mas o e-mail já está em
      MAX_LOGIN_ACCOUNTS terreiros: 409 LIMITE_CONTAS_EMAIL (só depois da senha certa,
      para não contar a quem não tem a senha quantas contas o e-mail tem); senão, o hash
      da conta conferida (uma senha só para a pessoa).
    - Sem conta ativa, mas com conta inativa/terreiro desativado → 409 de sempre.
    - E-mail novo → hash da senha digitada. Com `conta_existente` (a pessoa trocou o
      e-mail depois do aviso, ou a conta foi desativada no meio), vira cadastro comum:
      a senha passa pela regra de senha nova (422 no campo, como no validador).
    """
    contas = await _contas_ativas_do_email(db, body.email)
    if contas:
        if not body.conta_existente:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_JA_TEM_CONTA)
        conferidas = matching_accounts(body.password, contas)
        if not conferidas:
            log_security_event(
                "onboarding_conta_existente",
                success=False,
                user_id=contas[0].id if len(contas) == 1 else None,
                details={"reason": "invalid_password", "accounts": len(contas)},
            )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=SENHA_CONTA_INCORRETA)
        if len(contas) >= MAX_LOGIN_ACCOUNTS:
            log_security_event("onboarding_conta_existente", success=False, details={"reason": "account_limit"})
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=LIMITE_CONTAS_EMAIL)
        return conferidas[0].password_hash, True

    if await _email_em_conta_nao_excluida(db, body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_JA_CADASTRADO)
    if body.conta_existente:
        try:
            _validar_senha_nova(body.password)
        except ValueError as exc:
            raise _erro_senha(str(exc)) from exc
    return hash_password(body.password), False


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/onboarding", response_model=OnboardingResponse, status_code=201)
@limiter.limit("10/minute")
async def onboarding(
    body: OnboardingRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Self-service registration: creates tenant + admin user.

    New tenants get a 1-month Premium trial (no card required) unless their
    CPF/CNPJ or e-mail already claimed one before.

    Rate limit por IP igual ao do login (10/min aqui e a zona `login_limit` no nginx):
    com `conta_existente` a rota confere senha e não pode virar oráculo de senha.
    """

    # 1. E-mail (sem diferença de maiúsculas): novo, ou conta ativa em outro
    # terreiro confirmada pela senha dela — ver _senha_do_cadastro.
    password_hash, conta_reaproveitada = await _senha_do_cadastro(db, body)

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
            custom_settings=_build_custom_settings(body),
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
            password_hash=password_hash,
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        # Prova do aceite (LGPD, art. 8º, §2º): documento, versão vigente, data, IP e navegador.
        user_agent = (request.headers.get("user-agent") or "")[:255] or None
        for documento in DOCUMENTOS_DO_CADASTRO:
            db.add(LegalAcceptance(
                tenant_id=tenant.id,
                user_id=user.id,
                document=documento,
                version=LEGAL_VERSIONS[documento],
                ip_address=get_client_ip(request)[:45] or None,
                user_agent=user_agent,
            ))

        # Grupo padrão "Acesso total" (Q-05): operadores criados depois entram nele.
        from src.repositories.permission_group_repo import PermissionGroupRepository

        await PermissionGroupRepository(db).ensure_default_group(tenant.id)

        # Tipos de atividade e funções da corrente sugeridos (AM-08): "Gira", "Faxina", "Reunião"...
        from src.services.atividades import ensure_default_atividade_tipos

        await ensure_default_atividade_tipos(db, tenant.id)

        # 7. Commit transaction
        await db.commit()

    except IntegrityError as exc:
        await db.rollback()
        logger.warning("Onboarding IntegrityError for email=%s: %s", body.email, exc)
        # E-mail novo que outra requisição cadastrou no meio do caminho. Com conta
        # existente confirmada o e-mail não é a causa (é único por terreiro, e o
        # terreiro é novo) — sobra o slug.
        if not conta_reaproveitada and await _email_em_conta_nao_excluida(db, body.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=EMAIL_JA_CADASTRADO,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma conta com esse nome de terreiro. Tente um nome diferente.",
        )

    # 8. Abre a sessão com os mesmos 3 cookies do login (access_token,
    # refresh_token e auth_state; secure=not DEBUG). Antes só o refresh_token
    # era setado — a primeira tela pós-cadastro rodava sem access_token.
    access_token = await issue_session(db, user, request, response)
    if conta_reaproveitada:
        log_security_event("onboarding_conta_existente", success=True, user_id=user.id, tenant_id=tenant.id)

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
