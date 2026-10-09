"""Lembretes e avisos por e-mail da Área do Médium (AM-15, migração 081).

- `medium_preferencias`: o que o médium quer receber por e-mail, um liga/desliga por tipo de aviso
  (padrão: tudo ligado — a linha só nasce quando o médium mexe ou quando o primeiro e-mail sai) e o
  token do link "Não quero mais receber" do rodapé (`token_descadastro`). O token só desliga
  avisos por e-mail; por isso fica em claro (precisa ir em todo e-mail) e é único no banco.
- (AM-16, 082) `push_<tipo>`: o mesmo liga/desliga para a notificação no celular. O link do rodapé
  do e-mail só mexe nos `email_*`.
- `medium_lembretes_enviados`: a marca "já mandei" de cada lembrete, por (terreiro, tipo,
  referência, médium). A marca é gravada ANTES do envio com `INSERT ... ON CONFLICT DO NOTHING
  RETURNING`: com 2 workers (ou duas rodadas ao mesmo tempo) só um insere a linha e só ele envia —
  o outro espera o commit no índice único e recebe nada. Para o resumo diário dos administradores
  (`resumo_admin`) não há médium: o índice parcial `uq_medium_lembretes_enviados_terreiro` garante um
  por terreiro por dia.

Colunas "enum" são texto com CHECK, minúsculas (crescem sem `ALTER TYPE`).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

# ── Tipos de lembrete (marca de envio) ──────────────────────────────────────
TIPO_MENSALIDADE_ANTES = "mensalidade_antes"  # D-29: 3 dias antes do vencimento
TIPO_MENSALIDADE_DEPOIS = "mensalidade_depois"  # D-29: 3 dias depois, sem comprovante
TIPO_PIX_ALTERADO = "pix_alterado"  # a casa trocou a chave PIX da mensalidade
TIPO_ESCALA_NOVA = "escala_nova"  # o médium entrou na escala de uma atividade/gira
TIPO_VESPERA = "vespera"  # véspera, às 18 h
TIPO_CONFIRMACAO = "confirmacao"  # D-2: "Vou / Não vou" ainda sem resposta
TIPO_FALTA = "falta"  # marcado ausente: convite para contar o motivo (sem o texto)
TIPO_AVISO = "aviso"  # aviso da casa com "Avisar por e-mail também"
TIPO_CANCELADA = "cancelada"  # atividade cancelada: avisa quem estava na escala
TIPO_RESUMO_ADMIN = "resumo_admin"  # resumo diário aos administradores (sem médium)
# Troca de escala (AM-27): pedido ao colega, resposta a quem pediu e troca aprovada (os dois).
TIPO_TROCA_PEDIDA = "troca_pedida"
TIPO_TROCA_RESPOSTA = "troca_resposta"
TIPO_TROCA_APROVADA = "troca_aprovada"

TIPOS_LEMBRETE = (
    TIPO_MENSALIDADE_ANTES,
    TIPO_MENSALIDADE_DEPOIS,
    TIPO_PIX_ALTERADO,
    TIPO_ESCALA_NOVA,
    TIPO_VESPERA,
    TIPO_CONFIRMACAO,
    TIPO_FALTA,
    TIPO_AVISO,
    TIPO_CANCELADA,
    TIPO_RESUMO_ADMIN,
    TIPO_TROCA_PEDIDA,
    TIPO_TROCA_RESPOSTA,
    TIPO_TROCA_APROVADA,
)

# ── Preferências do médium (um liga/desliga por grupo de lembretes) ─────────
PREF_MENSALIDADE = "mensalidade"
PREF_ESCALAS = "escalas"
PREF_CONFIRMACAO = "confirmacao"
PREF_FALTAS = "faltas"
PREF_AVISOS = "avisos"
PREFERENCIAS = (PREF_MENSALIDADE, PREF_ESCALAS, PREF_CONFIRMACAO, PREF_FALTAS, PREF_AVISOS)

# Tipo de lembrete → preferência que o desliga. O resumo do admin não tem preferência do médium.
PREFERENCIA_DO_TIPO = {
    TIPO_MENSALIDADE_ANTES: PREF_MENSALIDADE,
    TIPO_MENSALIDADE_DEPOIS: PREF_MENSALIDADE,
    TIPO_PIX_ALTERADO: PREF_MENSALIDADE,
    TIPO_ESCALA_NOVA: PREF_ESCALAS,
    TIPO_VESPERA: PREF_ESCALAS,
    TIPO_CANCELADA: PREF_ESCALAS,
    TIPO_CONFIRMACAO: PREF_CONFIRMACAO,
    TIPO_FALTA: PREF_FALTAS,
    TIPO_AVISO: PREF_AVISOS,
    TIPO_TROCA_PEDIDA: PREF_ESCALAS,
    TIPO_TROCA_RESPOSTA: PREF_ESCALAS,
    TIPO_TROCA_APROVADA: PREF_ESCALAS,
}

REFERENCIA_MAX = 80
TOKEN_MAX = 64


def _in(coluna: str, valores: tuple[str, ...]) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class MediumPreferencia(Base):
    __tablename__ = "medium_preferencias"
    __table_args__ = (
        UniqueConstraint("medium_id", name="uq_medium_preferencias_medium"),
        UniqueConstraint("token_descadastro", name="uq_medium_preferencias_token"),
        Index("ix_medium_preferencias_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    email_mensalidade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    email_escalas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    email_confirmacao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    email_faltas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    email_avisos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    # Notificação no celular (AM-16, migração 082): o mesmo liga/desliga por tipo, separado do e-mail.
    # Só vale para quem ligou as notificações num aparelho (`push_inscricoes`).
    push_mensalidade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    push_escalas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    push_confirmacao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    push_faltas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    push_avisos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    # D-07 (AM-27, migração 086): mostrar o primeiro nome aos colegas de escala na hora de pedir
    # troca. Padrão desligado — sem isso, ninguém vê o nome dele.
    mostrar_nome_colegas: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    token_descadastro: Mapped[str] = mapped_column(String(TOKEN_MAX), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def ligado(self, preferencia: str) -> bool:
        return bool(getattr(self, f"email_{preferencia}"))

    def ligado_push(self, preferencia: str) -> bool:
        return bool(getattr(self, f"push_{preferencia}"))

    def __repr__(self) -> str:
        return f"<MediumPreferencia(medium_id={self.medium_id})>"


class MediumLembreteEnviado(Base):
    __tablename__ = "medium_lembretes_enviados"
    __table_args__ = (
        Index(
            "uq_medium_lembretes_enviados_medium",
            "tenant_id",
            "tipo",
            "referencia",
            "medium_id",
            unique=True,
            postgresql_where=text("medium_id IS NOT NULL"),
            sqlite_where=text("medium_id IS NOT NULL"),
        ),
        Index(
            "uq_medium_lembretes_enviados_terreiro",
            "tenant_id",
            "tipo",
            "referencia",
            unique=True,
            postgresql_where=text("medium_id IS NULL"),
            sqlite_where=text("medium_id IS NULL"),
        ),
        Index("ix_medium_lembretes_enviados_medium_id", "medium_id"),
        CheckConstraint(_in("tipo", TIPOS_LEMBRETE), name="ck_medium_lembretes_enviados_tipo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    # O que o lembrete cobre: "2026-10" (mês), id da atividade/aviso, data do resumo, instante da troca do PIX.
    referencia: Mapped[str] = mapped_column(String(REFERENCIA_MAX), nullable=False)
    enviado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<MediumLembreteEnviado(tipo={self.tipo}, referencia={self.referencia}, medium_id={self.medium_id})>"
