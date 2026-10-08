"""Perfil do médium na Área (AM-13): o que o médium edita, o que só a casa edita e a troca
do e-mail de login com confirmação no endereço novo.

Regras (docs/plano-area-do-medium.md, card AM-13, §6.8 e §6.9):
- **O médium edita**: telefone, endereço (CEP, logradouro, número, bairro, cidade) e data de
  nascimento do cadastro da casa (`mediuns`); foto e senha da conta (`users`, mesmas regras do
  perfil do painel); e-mail de login com confirmação no endereço novo.
- **Só a casa edita** (o médium vê, travado): nome no cadastro, data de entrada, tipo
  (atendimento/cambone) e isenção. **Nunca sai pela Área**: `observacoes`, `data_saida`,
  `registrado_por` e qualquer campo interno.
- Cada alteração vai para a auditoria do terreiro com a frase do que mudou ("médium atualizou
  o telefone") e a lista de campos — nunca o valor (telefone, endereço, e-mail).
- Troca de e-mail: token opaco `token_urlsafe(32)` guardado como sha256 (mesmo padrão do convite
  e do reset de senha), 24 h, uso único; o `users.email` só muda no clique; e-mail único por
  terreiro (`uq_users_tenant_email`, que vale também para conta excluída); o endereço antigo é
  avisado depois da troca.

Funções de banco recebem `tenant_id` e filtram por ele (auditor de isolamento, modo scoped).
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.public_links import confirmar_email_link
from ..models import Medium, Tenant, TenantConfig, User
from .medium_convite import gerar_token, hash_token, mascarar_email, primeiro_nome

EMAIL_TROCA_VALIDADE_HORAS = 24

# Campos do cadastro da casa (`mediuns`) que o médium edita pela Área.
CAMPOS_ENDERECO = ("cep", "logradouro", "numero", "bairro", "cidade")
CAMPOS_EDITAVEIS = ("telefone", "data_nascimento", *CAMPOS_ENDERECO)

# Como cada alteração aparece na auditoria do terreiro (sem o valor).
_O_QUE_MUDOU = {
    "telefone": "o telefone",
    "endereco": "o endereço",
    "data_nascimento": "a data de nascimento",
}

_SO_DIGITOS = re.compile(r"\D")


# ── Funções puras ───────────────────────────────────────────────────────────


def so_digitos(valor: Optional[str]) -> Optional[str]:
    if valor is None:
        return None
    d = _SO_DIGITOS.sub("", str(valor))
    return d or None


def normalizar_telefone(valor: Optional[str]) -> Optional[str]:
    """Telefone gravado só com dígitos, como o painel grava (10 a 13 dígitos; vazio → None)."""
    d = so_digitos(valor)
    if d is None:
        return None
    if not 10 <= len(d) <= 13:
        raise ValueError("Telefone deve ter DDD e número (10 ou 11 dígitos)")
    return d


def normalizar_cep(valor: Optional[str]) -> Optional[str]:
    """CEP gravado só com dígitos (8), como o painel grava; vazio → None."""
    d = so_digitos(valor)
    if d is None:
        return None
    if len(d) != 8:
        raise ValueError("CEP deve ter 8 dígitos")
    return d


def texto_curto(valor: Optional[str], maximo: int) -> Optional[str]:
    if valor is None:
        return None
    t = " ".join(str(valor).split())
    if not t:
        return None
    if len(t) > maximo:
        raise ValueError(f"Use no máximo {maximo} caracteres")
    return t


def validar_nascimento(valor: Optional[date], hoje: date) -> Optional[date]:
    if valor is None:
        return None
    if valor > hoje:
        raise ValueError("A data de nascimento não pode ser no futuro")
    if valor.year < 1900:
        raise ValueError("Confira o ano da data de nascimento")
    return valor


def campos_alterados(medium: Medium, novos: dict) -> list[str]:
    """Campos de `novos` cujo valor é diferente do cadastro (na ordem de `CAMPOS_EDITAVEIS`)."""
    return [c for c in CAMPOS_EDITAVEIS if c in novos and getattr(medium, c) != novos[c]]


def grupos_alterados(campos: Iterable[str]) -> list[str]:
    """telefone / endereco / data_nascimento — os campos do endereço viram um grupo só."""
    grupos: list[str] = []
    for c in campos:
        g = "endereco" if c in CAMPOS_ENDERECO else c
        if g not in grupos:
            grupos.append(g)
    return grupos


def frase_auditoria(grupos: list[str]) -> str:
    """["telefone", "endereco"] → "médium atualizou o telefone e o endereço"."""
    partes = [_O_QUE_MUDOU[g] for g in grupos]
    if not partes:
        return "médium atualizou o perfil"
    if len(partes) == 1:
        return f"médium atualizou {partes[0]}"
    return f"médium atualizou {', '.join(partes[:-1])} e {partes[-1]}"


def tipo_do_medium(medium: Medium) -> str:
    return "atendimento" if medium.is_atendimento else "cambone"


def troca_pendente_valida(user: User, agora: Optional[datetime] = None) -> bool:
    agora = agora or datetime.now(timezone.utc)
    expira = user.email_pendente_expira_em
    if not user.email_pendente or not user.email_pendente_token_hash or expira is None:
        return False
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    return expira > agora


def limpar_troca_pendente(user: User) -> None:
    user.email_pendente = None
    user.email_pendente_token_hash = None
    user.email_pendente_expira_em = None


def iniciar_troca(user: User, novo_email: str, agora: Optional[datetime] = None) -> str:
    """Grava o pedido (substitui um anterior) e devolve o token em claro para o link."""
    agora = agora or datetime.now(timezone.utc)
    token, token_hash = gerar_token()
    user.email_pendente = novo_email
    user.email_pendente_token_hash = token_hash
    user.email_pendente_expira_em = agora + timedelta(hours=EMAIL_TROCA_VALIDADE_HORAS)
    return token


def link_confirmacao(token: str) -> str:
    return confirmar_email_link(settings.FRONTEND_URL, token)


# ── Banco ───────────────────────────────────────────────────────────────────


async def email_em_uso(db: AsyncSession, tenant_id: uuid.UUID, email: str, exceto_user_id: uuid.UUID) -> bool:
    """Outra conta do terreiro já usa o e-mail? Conta excluída conta também: a unicidade
    `uq_users_tenant_email` vale para a linha inteira (o painel ressuscita a conta pelo e-mail)."""
    stmt = select(User.id).where(
        User.tenant_id == tenant_id,
        func.lower(User.email) == email.lower(),
        User.id != exceto_user_id,
    )
    return (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None


async def medium_da_conta(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Medium]:
    """Médium (não excluído) ligado à conta no terreiro — para espelhar o e-mail confirmado."""
    stmt = select(Medium).where(
        Medium.tenant_id == tenant_id,
        Medium.user_id == user_id,
        Medium.deleted_at.is_(None),
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _marca(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[Optional[Tenant], Optional[TenantConfig]]:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    config = (
        await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    return tenant, config


async def enfileirar_confirmacao_email(
    db: AsyncSession, tenant_id: uuid.UUID, nome: Optional[str], novo_email: str, link: str
) -> None:
    """Link de confirmação → endereço NOVO, pela fila (Resend primário, Brevo de reserva)."""
    from .email.base import EmailMessage
    from .email.email_queue import EmailQueueItem, email_queue
    from .email.templates.email_troca import (
        email_troca_confirmacao_subject,
        email_troca_confirmacao_text,
        render_email_troca_confirmacao,
    )

    tenant, config = await _marca(db, tenant_id)
    casa = tenant.name if tenant else "seu terreiro"
    primeiro = primeiro_nome(nome)
    email_queue.enqueue(
        EmailQueueItem(
            message=EmailMessage(
                to_email=novo_email,
                subject=email_troca_confirmacao_subject(casa),
                html_body=render_email_troca_confirmacao(
                    primeiro, casa, link, EMAIL_TROCA_VALIDADE_HORAS,
                    primary_color=config.primary_color if config else None,
                ),
                text_body=email_troca_confirmacao_text(primeiro, casa, link, EMAIL_TROCA_VALIDADE_HORAS),
                reply_to=(config.reply_to_email if config and config.reply_to_email else None),
            )
        )
    )


async def enfileirar_aviso_email_trocado(
    db: AsyncSession, tenant_id: uuid.UUID, nome: Optional[str], email_antigo: str, email_novo: str
) -> None:
    """Aviso → endereço ANTIGO depois da troca, com o novo mascarado."""
    from .email.base import EmailMessage
    from .email.email_queue import EmailQueueItem, email_queue
    from .email.templates.email_troca import (
        email_troca_aviso_subject,
        email_troca_aviso_text,
        render_email_troca_aviso,
    )

    tenant, config = await _marca(db, tenant_id)
    casa = tenant.name if tenant else "seu terreiro"
    primeiro = primeiro_nome(nome)
    mascarado = mascarar_email(email_novo)
    email_queue.enqueue(
        EmailQueueItem(
            message=EmailMessage(
                to_email=email_antigo,
                subject=email_troca_aviso_subject(casa),
                html_body=render_email_troca_aviso(
                    primeiro, casa, mascarado, primary_color=config.primary_color if config else None
                ),
                text_body=email_troca_aviso_text(primeiro, casa, mascarado),
                reply_to=(config.reply_to_email if config and config.reply_to_email else None),
            )
        )
    )
