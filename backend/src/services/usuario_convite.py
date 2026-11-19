"""Convite por e-mail para entrar no painel do terreiro (11/2026).

Regras (AGENTS.md §11.18, "Convite por e-mail"):
- Quem cadastra não define senha: informa e-mail, nome, tipo de acesso e perfil; a pessoa
  cria a própria senha no link (ou usa a que já usa no GiraHub, para o login juntar as contas
  na escolha de terreiro/área — AM-04/AM-05). A conta só nasce no aceite.
- Token opaco `secrets.token_urlsafe(32)`, guardado como sha256; vale 7 dias, uso único; um
  convite em aberto por e-mail no terreiro (`uq_usuario_convites_aberto`). Reenviar troca o
  token (o link anterior para de valer); convidar de novo um e-mail com convite vencido
  revoga o vencido.
- Sem "copiar link": se quem convida pudesse abrir o link, ele mesmo criaria a senha.

Funções de banco recebem `tenant_id` e filtram por ele (auditor de isolamento, modo scoped).
A busca pelo token (sem tenant: o token É a chave) fica na rota pública
`api/v1/public/convite_equipe.py`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.public_links import public_tenant_logo_url, usuario_convite_link
from ..models import Tenant, TenantConfig, User, UserRole, UsuarioConvite
from .medium_convite import gerar_token, hash_token, mascarar_email, normalizar_email, primeiro_nome

CONVITE_VALIDADE_DIAS = 7
# Intervalo mínimo entre dois envios do mesmo convite (anti e-mail bombing).
REENVIO_INTERVALO = timedelta(seconds=60)
PAPEIS_CONVIDAVEIS = (UserRole.ADMIN.value, UserRole.OPERATOR.value)

__all__ = [
    "CONVITE_VALIDADE_DIAS",
    "REENVIO_INTERVALO",
    "PAPEIS_CONVIDAVEIS",
    "gerar_token",
    "hash_token",
    "mascarar_email",
    "normalizar_email",
    "primeiro_nome",
]


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def em_aberto(convite: UsuarioConvite) -> bool:
    """Não usado, não cancelado e não recusado (pode estar vencido)."""
    return convite.usado_em is None and convite.revogado_em is None and convite.recusado_em is None


def valido(convite: UsuarioConvite, agora: Optional[datetime] = None) -> bool:
    """Em aberto e dentro da validade: o link ainda funciona."""
    agora = agora or datetime.now(timezone.utc)
    return em_aberto(convite) and _aware(convite.expira_em) > agora


def situacao(convite: UsuarioConvite, agora: Optional[datetime] = None) -> str:
    """`enviado` | `vencido` | `recusado` | `cancelado` | `aceito` (o que a lista mostra)."""
    if convite.usado_em is not None:
        return "aceito"
    if convite.recusado_em is not None:
        return "recusado"
    if convite.revogado_em is not None:
        return "cancelado"
    return "enviado" if valido(convite, agora) else "vencido"


def pode_reenviar_agora(convite: UsuarioConvite, agora: Optional[datetime] = None) -> bool:
    agora = agora or datetime.now(timezone.utc)
    return agora - _aware(convite.enviado_em) >= REENVIO_INTERVALO


def renovar_token(convite: UsuarioConvite, agora: Optional[datetime] = None) -> str:
    """Troca o token e a validade (o link anterior deixa de valer). Devolve o token em claro."""
    agora = agora or datetime.now(timezone.utc)
    token, token_hash = gerar_token()
    convite.token_hash = token_hash
    convite.enviado_em = agora
    convite.expira_em = agora + timedelta(days=CONVITE_VALIDADE_DIAS)
    return token


# ── Banco (sempre escopado no tenant) ───────────────────────────────────────


async def convite_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, convite_id: uuid.UUID) -> Optional[UsuarioConvite]:
    return (
        await db.execute(
            select(UsuarioConvite).where(
                UsuarioConvite.id == convite_id,
                UsuarioConvite.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()


async def convite_em_aberto_do_email(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> Optional[UsuarioConvite]:
    return (
        await db.execute(
            select(UsuarioConvite).where(
                UsuarioConvite.tenant_id == tenant_id,
                UsuarioConvite.email == email,
                UsuarioConvite.usado_em.is_(None),
                UsuarioConvite.revogado_em.is_(None),
                UsuarioConvite.recusado_em.is_(None),
            )
        )
    ).scalar_one_or_none()


async def convites_pendentes(db: AsyncSession, tenant_id: uuid.UUID) -> list[UsuarioConvite]:
    """Convites que a lista de Pessoas e acessos mostra: em aberto (enviados ou vencidos) e
    recusados nos últimos 30 dias (para a casa saber que a pessoa disse não)."""
    corte = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(UsuarioConvite)
        .where(
            UsuarioConvite.tenant_id == tenant_id,
            UsuarioConvite.usado_em.is_(None),
            UsuarioConvite.revogado_em.is_(None),
            (UsuarioConvite.recusado_em.is_(None)) | (UsuarioConvite.recusado_em > corte),
        )
        .order_by(UsuarioConvite.created_at.desc())
    )
    return list(result.scalars().all())


async def conta_do_email_no_tenant(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> Optional[User]:
    """Conta do terreiro com o e-mail (não excluída primeiro; senão a excluída mais antiga)."""
    return (
        await db.execute(
            select(User)
            .where(User.tenant_id == tenant_id, func.lower(User.email) == email)
            .order_by(User.deleted_at.is_not(None), User.created_at.asc())
            .limit(1)
        )
    ).scalars().first()


async def nomes_de_quem_convidou(db: AsyncSession, tenant_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    result = await db.execute(
        select(User.id, User.full_name, User.username).where(User.tenant_id == tenant_id, User.id.in_(ids))
    )
    return {uid: (full or user or "") for uid, full, user in result.all()}


async def revogar_em_aberto_do_email(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> int:
    """Cancela convites em aberto (inclusive vencidos) do e-mail. Sem commit."""
    result = await db.execute(
        update(UsuarioConvite)
        .where(
            UsuarioConvite.tenant_id == tenant_id,
            UsuarioConvite.email == email,
            UsuarioConvite.usado_em.is_(None),
            UsuarioConvite.revogado_em.is_(None),
            UsuarioConvite.recusado_em.is_(None),
        )
        .values(revogado_em=datetime.now(timezone.utc))
    )
    return result.rowcount or 0


async def marca_do_terreiro(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[Optional[Tenant], Optional[TenantConfig]]:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    config = (
        await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    return tenant, config


def link_do_convite(token: str) -> str:
    return usuario_convite_link(settings.FRONTEND_URL, token)


def enfileirar_email_convite(
    tenant: Tenant, config: Optional[TenantConfig], convite: UsuarioConvite, convidou: Optional[str], token: str
) -> None:
    """E-mail do convite pela fila (Resend primário, Brevo de reserva). Não bloqueia."""
    from .email.base import EmailMessage
    from .email.email_queue import EmailQueueItem, email_queue
    from .email.templates.usuario_convite import (
        render_usuario_convite_email,
        usuario_convite_subject,
        usuario_convite_text,
    )

    link = link_do_convite(token)
    primeiro = primeiro_nome(convite.nome)
    email_queue.enqueue(
        EmailQueueItem(
            message=EmailMessage(
                to_email=convite.email,
                subject=usuario_convite_subject(tenant.name),
                html_body=render_usuario_convite_email(
                    primeiro,
                    tenant.name,
                    convidou,
                    convite.role,
                    link,
                    CONVITE_VALIDADE_DIAS,
                    primary_color=config.primary_color if config else None,
                    logo_url=public_tenant_logo_url(settings.FRONTEND_URL, config),
                ),
                text_body=usuario_convite_text(
                    primeiro, tenant.name, convidou, convite.role, link, CONVITE_VALIDADE_DIAS
                ),
                reply_to=(config.reply_to_email if config and config.reply_to_email else None),
            )
        )
    )
