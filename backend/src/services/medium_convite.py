"""Convite da casa para a Área do Médium (AM-03).

Regras (docs/plano-area-do-medium.md §6.2, §6.3, §6.8 e card AM-03):
- O vínculo `mediuns.user_id` só nasce no aceite do convite: quem abre o link prova que
  recebe o e-mail do cadastro. O admin nunca liga uma conta a um médium diretamente.
- Token opaco `secrets.token_urlsafe(32)`, guardado como sha256 (mesmo padrão do reset de
  senha); vale 7 dias, uso único; um convite em aberto por médium — criar outro revoga o
  anterior (`uq_medium_convites_aberto` segura a regra no banco).
- Texto discreto (LGPD art. 11): e-mail e mensagem de WhatsApp não usam termo religioso além
  do nome do terreiro.
- Consentimento: o aceite grava `mediuns.area_consentimento_em` + `_versao`
  (`CONSENTIMENTO_AREA_VERSAO`, espelhada em `frontend/src/constants/areaMedium.ts`).

Funções de banco recebem `tenant_id` e filtram por ele (auditor de isolamento, modo scoped).
A busca do convite pelo token (sem tenant: o token É a chave) fica na rota pública
`api/v1/public/convite.py`.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.public_links import medium_convite_link, public_tenant_logo_url
from ..models import Medium, MediumConvite, Tenant, TenantConfig, User, UserRole
from . import session_service
from .medium_area import unlink_user

CONVITE_VALIDADE_DIAS = 7
# Versão do texto de consentimento mostrado no aceite ("Autorizo a casa a usar meu nome,
# contato e mensalidades..."). Mudou o texto → suba aqui E em frontend/src/constants/areaMedium.ts
# (tests/unit/test_medium_convite.py confere o espelho).
# v2 (AM-14/AM-20, 08/10/2026): o médium encerra o próprio acesso e baixa os dados no Perfil; os outros
# médiuns só veem o aniversário de quem escolher mostrar. Quem aceitou a v1 segue com a v1 gravada.
CONSENTIMENTO_AREA_VERSAO = "2"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Funções puras ───────────────────────────────────────────────────────────


def normalizar_email(valor: Optional[str]) -> Optional[str]:
    """E-mail do cadastro em minúsculas, ou None se vazio/inválido (sem convite possível)."""
    if not valor:
        return None
    email = valor.strip().lower()
    return email if _EMAIL_RE.match(email) and len(email) <= 255 else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def gerar_token() -> tuple[str, str]:
    """(token em claro para o link, sha256 para o banco)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def mascarar_email(email: str) -> str:
    """'ana.paula@gmail.com' → 'an•••••••@gmail.com' (o admin confere sem expor o e-mail inteiro)."""
    local, _, dominio = email.partition("@")
    visivel = local[:2] if len(local) > 3 else local[:1]
    return f"{visivel}{'•' * max(len(local) - len(visivel), 3)}@{dominio}"


def primeiro_nome(nome: Optional[str]) -> str:
    partes = (nome or "").split()
    return partes[0] if partes else ""


def mensagem_whatsapp(primeiro: str, terreiro: str, link: str) -> str:
    """Texto pronto que o dirigente manda pelo WhatsApp, do jeito que se fala na casa.

    Decisão do dono (07/10): no WhatsApp, que a própria casa envia, vale o vocabulário do
    terreiro ("Área do Médium", gira, Axé) num tom simpático. O e-mail do convite segue
    discreto (§6.8). "A nossa casa, <nome>," evita errar o artigo (do/da) do nome da casa.
    """
    saudacao = f"Oi, {primeiro}! Tudo bem?" if primeiro else "Oi! Tudo bem?"
    return (
        f"{saudacao}\n\n"
        f"A nossa casa, {terreiro}, agora tem a Área do Médium no GiraHub: a agenda das giras, os avisos "
        f"da casa e a sua mensalidade, tudo no seu celular.\n\n"
        f"Toque no link para ativar o seu acesso (vale por {CONVITE_VALIDADE_DIAS} dias):\n{link}\n\n"
        f"Qualquer dúvida, é só responder esta mensagem. Axé!"
    )


def whatsapp_url(telefone: Optional[str], texto: str) -> str:
    """`wa.me` com o telefone do médium (DDI 55 quando faltar); sem telefone, o WhatsApp
    abre para o dirigente escolher o contato. Sem API: só monta o link."""
    from urllib.parse import quote

    digitos = re.sub(r"\D", "", telefone or "")
    if len(digitos) in (10, 11):
        digitos = "55" + digitos
    elif not (len(digitos) in (12, 13) and digitos.startswith("55")):
        digitos = ""
    return f"https://wa.me/{digitos}?text={quote(texto)}"


def convite_em_aberto(convite: MediumConvite, agora: Optional[datetime] = None) -> bool:
    agora = agora or datetime.now(timezone.utc)
    expira = convite.expira_em if convite.expira_em.tzinfo else convite.expira_em.replace(tzinfo=timezone.utc)
    return convite.usado_em is None and convite.revogado_em is None and expira > agora


def status_acesso(medium: Medium, convite: Optional[MediumConvite]) -> dict:
    """Situação do médium na Área: `ativo` (+desde), `convite_enviado` (+datas) ou `sem_acesso`."""
    if medium.user_id is not None:
        return {"status": "ativo", "desde": medium.area_consentimento_em}
    if convite is not None and convite_em_aberto(convite):
        return {
            "status": "convite_enviado",
            "convite_enviado_em": convite.created_at,
            "convite_expira_em": convite.expira_em,
        }
    return {"status": "sem_acesso"}


# ── Banco (sempre escopado no tenant) ───────────────────────────────────────


async def revogar_convites_pendentes(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> int:
    """Revoga todo convite não usado do médium (inclusive vencido). Sem commit."""
    result = await db.execute(
        update(MediumConvite)
        .where(
            MediumConvite.tenant_id == tenant_id,
            MediumConvite.medium_id == medium_id,
            MediumConvite.usado_em.is_(None),
            MediumConvite.revogado_em.is_(None),
        )
        .values(revogado_em=datetime.now(timezone.utc))
    )
    return result.rowcount or 0


async def criar_convite(
    db: AsyncSession, tenant_id: uuid.UUID, medium: Medium, email: str, criado_por: Optional[uuid.UUID]
) -> tuple[MediumConvite, str]:
    """Revoga o convite anterior e cria um novo (sem commit). Devolve (convite, token em claro)."""
    if medium.tenant_id != tenant_id:  # defesa extra: o chamador já buscou o médium no tenant
        raise ValueError("Médium de outro terreiro")
    await revogar_convites_pendentes(db, tenant_id, medium.id)
    await db.flush()
    token, token_hash = gerar_token()
    convite = MediumConvite(
        tenant_id=tenant_id,
        medium_id=medium.id,
        email=email,
        token_hash=token_hash,
        expira_em=datetime.now(timezone.utc) + timedelta(days=CONVITE_VALIDADE_DIAS),
        criado_por=criado_por,
        created_at=datetime.now(timezone.utc),
    )
    db.add(convite)
    await db.flush()
    return convite, token


async def convites_em_aberto(
    db: AsyncSession, tenant_id: uuid.UUID, medium_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, MediumConvite]:
    """{medium_id: convite em aberto e dentro da validade} dos médiuns pedidos."""
    ids = list(medium_ids)
    if not ids:
        return {}
    result = await db.execute(
        select(MediumConvite).where(
            MediumConvite.tenant_id == tenant_id,
            MediumConvite.medium_id.in_(ids),
            MediumConvite.usado_em.is_(None),
            MediumConvite.revogado_em.is_(None),
            MediumConvite.expira_em > datetime.now(timezone.utc),
        )
    )
    return {c.medium_id: c for c in result.scalars().all()}


async def tirar_acesso(db: AsyncSession, tenant_id: uuid.UUID, medium: Medium) -> Optional[User]:
    """Corta a Área do médium na hora (sem commit): revoga o convite em aberto e desfaz o
    vínculo. Conta `medium` pura é desativada e perde as sessões (mesma regra do D-08 em
    `medium_area.sync_pure_medium_user`); operador/admin ligado só perde a Área. Devolve o
    usuário que estava ligado (ou None)."""
    await revogar_convites_pendentes(db, tenant_id, medium.id)
    if medium.user_id is None:
        return None
    user = (
        await db.execute(select(User).where(User.id == medium.user_id, User.tenant_id == tenant_id))
    ).scalar_one_or_none()
    await unlink_user(db, tenant_id, medium.user_id)
    medium.user_id = None
    if user is not None and user.role == UserRole.MEDIUM and user.is_active:
        user.is_active = False
        user.sessions_revoked_at = datetime.now(timezone.utc)
        await session_service.end_all_sessions(db, user.id)
        db.add(user)
    await db.flush()
    return user


async def marca_do_terreiro(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[Optional[Tenant], Optional[TenantConfig]]:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    config = (
        await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    return tenant, config


def enfileirar_email_convite(
    tenant: Tenant, config: Optional[TenantConfig], medium: Medium, email: str, link: str
) -> None:
    """E-mail do convite pela fila (Resend primário, Brevo de reserva). Não bloqueia."""
    from .email.base import EmailMessage
    from .email.email_queue import EmailQueueItem, email_queue
    from .email.templates.medium_convite import (
        medium_convite_subject,
        medium_convite_text,
        render_medium_convite_email,
    )

    primeiro = primeiro_nome(medium.nome)
    email_queue.enqueue(
        EmailQueueItem(
            message=EmailMessage(
                to_email=email,
                subject=medium_convite_subject(tenant.name),
                html_body=render_medium_convite_email(
                    primeiro,
                    tenant.name,
                    link,
                    CONVITE_VALIDADE_DIAS,
                    primary_color=config.primary_color if config else None,
                    logo_url=public_tenant_logo_url(settings.FRONTEND_URL, config),
                ),
                text_body=medium_convite_text(primeiro, tenant.name, link, CONVITE_VALIDADE_DIAS),
                reply_to=(config.reply_to_email if config and config.reply_to_email else None),
            )
        )
    )


def link_do_convite(token: str) -> str:
    return medium_convite_link(settings.FRONTEND_URL, token)
