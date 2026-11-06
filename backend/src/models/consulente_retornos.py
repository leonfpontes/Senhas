"""Retorno do consulente (beta "Retorno do consulente na porta", pedido da Mãe Rai em 06/11/2026).

Na chamada de uma gira, quem registra o atendimento marca que o consulente precisa **voltar**: com
o mesmo médium, ou na próxima gira em que uma entidade trabalha. Nas giras seguintes, quando esse
consulente aparece na fila da Porta, a senha mostra um ícone com o recado até alguém marcar como
resolvido. Assim a porta não depende da memória de quem estava lá, e o consulente não passa por
mentiroso quando diz que tem retorno.

- Um retorno por senha de origem (`uq_consulente_retornos_ticket`): editar o atendimento troca o
  recado em vez de criar outro; desfazer o atendimento apaga o retorno que ainda está aberto.
- O retorno é do consulente (`consulente_id`), mas a Porta também o encontra pelas outras chaves do
  cadastro (mesmo e-mail normalizado ou mesmo telefone normalizado, no mesmo terreiro). Quem chega
  "sem senha" numa gira ganha um cadastro novo; pelo e-mail ou telefone ele é a mesma pessoa.
- `resolvido_em`/`resolvido_por_id`/`resolvido_na_gira_id`: marcado como resolvido, o ícone some.
  Dá para desfazer (volta a aparecer). Nada é apagado ao resolver.
- Excluir o consulente ou o terreiro apaga o retorno; excluir a gira ou a senha de origem só tira a
  referência (o recado continua valendo).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

RETORNO_NOME_MAX = 255
RETORNO_RECADO_MAX = 1000


class ConsulenteRetorno(Base):
    __tablename__ = "consulente_retornos"
    __table_args__ = (
        Index("ix_consulente_retornos_tenant_id", "tenant_id"),
        Index("ix_consulente_retornos_consulente_id", "consulente_id"),
        Index(
            "ix_consulente_retornos_abertos",
            "tenant_id",
            "consulente_id",
            postgresql_where=text("resolvido_em IS NULL"),
            sqlite_where=text("resolvido_em IS NULL"),
        ),
        Index(
            "uq_consulente_retornos_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("ticket_id IS NOT NULL"),
            sqlite_where=text("ticket_id IS NOT NULL"),
        ),
        CheckConstraint(
            "medium_nome IS NOT NULL OR entidade IS NOT NULL OR recado IS NOT NULL",
            name="ck_consulente_retornos_algum_dado",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    consulente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("consulentes.id", ondelete="CASCADE"), nullable=False
    )
    # De onde veio: a senha e a gira em que o retorno foi pedido.
    ticket_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True
    )
    gira_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("giras.id", ondelete="SET NULL"), nullable=True
    )
    # Com quem volta: o médium (texto, como `tickets.medium_nome`) e/ou a entidade.
    medium_nome: Mapped[Optional[str]] = mapped_column(String(RETORNO_NOME_MAX), nullable=True)
    entidade: Mapped[Optional[str]] = mapped_column(String(RETORNO_NOME_MAX), nullable=True)
    recado: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolvido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolvido_na_gira_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("giras.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<ConsulenteRetorno(id={self.id}, consulente_id={self.consulente_id}, resolvido={self.resolvido_em is not None})>"
