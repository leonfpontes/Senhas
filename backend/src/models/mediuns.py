"""Medium model - registered mediums and cambones for the terreiro."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, String, ForeignKey, Boolean, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .base import SoftDeleteModel


class Medium(SoftDeleteModel):
    """Medium/Cambone model.

    Stores the registered spiritual workers per tenant.
    - ``is_atendimento=True``: médium de atendimento — pode ser selecionado
      como médium OU como cambone.
    - ``is_atendimento=False``: apenas cambone — só pode ser selecionado como cambone.
    """

    __tablename__ = "mediuns"
    __table_args__ = (
        Index("ix_mediuns_tenant_id", "tenant_id"),
        Index("ix_mediuns_is_active", "is_active"),
        # Um usuário ligado a no máximo um médium não excluído (migração 065).
        # sqlite_where espelha o predicado para os testes que compilam em SQLite.
        Index(
            "uq_mediuns_user_id_ativo",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL AND deleted_at IS NULL"),
            sqlite_where=text("user_id IS NOT NULL AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    is_atendimento: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mensalidade_isento: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Vínculo com a casa
    data_entrada: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_saida: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Dados de contato / ficha pessoal
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    data_nascimento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Endereço estruturado (via CEP)
    cep: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Área do Médium (AM-02, migração 065). O vínculo com a conta só nasce no
    # aceite do convite (AM-03, prova de posse do e-mail) — o admin nunca liga
    # uma conta a um médium diretamente. É ele, e não o papel do usuário, que dá
    # acesso a /api/v1/medium/* (require_medium).
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Consentimento LGPD (art. 11: ser médium revela convicção religiosa),
    # gravado no aceite do convite com a versão do texto aceito.
    area_consentimento_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    area_consentimento_versao: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    tenant = relationship("Tenant", backref="mediuns")

    def __repr__(self) -> str:
        return f"<Medium(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
