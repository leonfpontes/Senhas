"""Duplas da noite (Porta): quem trabalha na gira e qual cambone auxilia cada médium.

O porteiro monta as duplas na Porta, de acordo com a organização da gira naquele dia. Ao chamar
uma senha, escolher o médium da noite já preenche o cambone (`AttendModal`). A senha continua
gravando `medium_nome`/`cambone_nome` em texto: trocar uma dupla no meio da gira não mexe nas
senhas já chamadas.

- Uma linha por médium trabalhando na gira (`uq_gira_duplas_gira_medium`).
- Um cambone auxilia um médium por vez: no máximo uma dupla por gira
  (`uq_gira_duplas_gira_cambone`, parcial onde há cambone). O serviço
  (`services/duplas_gira.validar_duplas`) também recusa quem é médium e cambone na mesma noite.
- Excluir a gira ou o médium apaga a dupla; excluir o cambone deixa o médium sem cambone.

Fica fora da `atividade_participacoes` de propósito: a Porta é de todos os planos e a escala/
presença (AM-17/AM-18) não. As duplas só LEEM as confirmações da Área quando elas existem.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base


class GiraDupla(Base):
    __tablename__ = "gira_duplas"
    __table_args__ = (
        UniqueConstraint("gira_id", "medium_id", name="uq_gira_duplas_gira_medium"),
        Index(
            "uq_gira_duplas_gira_cambone",
            "gira_id",
            "cambone_id",
            unique=True,
            postgresql_where=text("cambone_id IS NOT NULL"),
            sqlite_where=text("cambone_id IS NOT NULL"),
        ),
        Index("ix_gira_duplas_tenant_id", "tenant_id"),
        CheckConstraint("cambone_id IS NULL OR cambone_id <> medium_id", name="ck_gira_duplas_cambone_diferente"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    gira_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("giras.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    cambone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="SET NULL"), nullable=True
    )
    # Ordem em que o porteiro montou (a mesma dos cartões do "Chamar").
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<GiraDupla(gira_id={self.gira_id}, medium_id={self.medium_id}, cambone_id={self.cambone_id})>"
