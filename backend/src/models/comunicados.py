"""Avisos da casa para a corrente (AM-09). Na tela é **"Avisos"** (D-16); tabelas e API admin
seguem `comunicados`.

- `comunicados`: texto simples (`corpo` sem HTML — as quebras de linha ficam, os links viram
  clicáveis só na tela, nunca no banco), `publico` (quem recebe), `fixado` (primeiro da lista),
  `publicar_em` (agora ou agendado) e `expira_em` (opcional). Soft delete.
- `comunicado_leituras`: quem leu e quando (`lido_em`), um registro por aviso + médium
  (`uq_comunicado_leituras_comunicado_medium`). O dirigente vê quem leu e quem não leu (D-28).

`publico` é texto com CHECK (não ENUM do Postgres) para crescer sem `ALTER TYPE`:
`todos | atendimento | cambones | grupos`. Com `grupos` (AM-23, migração 075) os grupos escolhidos
ficam em `comunicado_grupos` (`models/corrente_grupos.py`).
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, SoftDeleteModel


class ComunicadoPublico(str, enum.Enum):
    """Quem recebe o aviso. `atendimento` = médiuns de atendimento (`is_atendimento`);
    `cambones` = quem é só cambone (`is_atendimento` falso); `grupos` = quem está em algum dos
    grupos da corrente escolhidos (`comunicado_grupos`, AM-23)."""

    TODOS = "todos"
    ATENDIMENTO = "atendimento"
    CAMBONES = "cambones"
    GRUPOS = "grupos"


PUBLICOS = tuple(p.value for p in ComunicadoPublico)
TITULO_MAX = 120
CORPO_MAX = 5000


class Comunicado(SoftDeleteModel):
    __tablename__ = "comunicados"
    __table_args__ = (
        Index("ix_comunicados_tenant_id", "tenant_id"),
        Index("ix_comunicados_tenant_publicar_em", "tenant_id", "publicar_em"),
        CheckConstraint(
            "publico IN ('todos', 'atendimento', 'cambones', 'grupos')", name="ck_comunicados_publico"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(TITULO_MAX), nullable=False)
    corpo: Mapped[str] = mapped_column(Text, nullable=False)
    publico: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ComunicadoPublico.TODOS.value, server_default="todos"
    )
    fixado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    publicar_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # "Avisar por e-mail também" (AM-15, migração 081): o agendador manda o aviso por e-mail a
    # quem tem acesso à Área quando ele é publicado (uma vez por médium). `avisar_email_em` =
    # quando a opção foi ligada (o envio só vale nos 3 dias seguintes à publicação ou a esse momento).
    avisar_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    avisar_email_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Comunicado(id={self.id}, titulo={self.titulo!r})>"


class ComunicadoLeitura(Base):
    __tablename__ = "comunicado_leituras"
    __table_args__ = (
        UniqueConstraint("comunicado_id", "medium_id", name="uq_comunicado_leituras_comunicado_medium"),
        Index("ix_comunicado_leituras_tenant_id", "tenant_id"),
        Index("ix_comunicado_leituras_medium_id", "medium_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    comunicado_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comunicados.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    lido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<ComunicadoLeitura(comunicado_id={self.comunicado_id}, medium_id={self.medium_id})>"
