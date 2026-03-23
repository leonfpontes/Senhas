"""Estoque models — inventory management for terreiros (Plano Pro+)."""
import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import SoftDeleteModel, TimestampedModel


class EstoqueMovimentacaoTipo(str, enum.Enum):
    ENTRADA = "entrada"
    SAIDA = "saida"


class EstoqueGrupo(SoftDeleteModel):
    """Grupo/família de materiais do estoque (ex.: Velas, Sementes, Tecidos)."""

    __tablename__ = "estoque_grupos"
    __table_args__ = (
        Index("ix_estoque_grupos_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    itens: Mapped[list["EstoqueItem"]] = relationship(
        "EstoqueItem", back_populates="grupo", foreign_keys="EstoqueItem.grupo_id"
    )

    def __repr__(self) -> str:
        return f"<EstoqueGrupo(id={self.id}, nome='{self.nome}')>"


class EstoqueItem(SoftDeleteModel):
    """Item de estoque do terreiro."""

    __tablename__ = "estoque_itens"
    __table_args__ = (
        Index("ix_estoque_itens_tenant_id", "tenant_id"),
        Index("ix_estoque_itens_grupo_id", "grupo_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    grupo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estoque_grupos.id", ondelete="SET NULL"), nullable=True
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    unidade_medida: Mapped[str] = mapped_column(String(10), default="UN", nullable=False)
    estoque_minimo: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    custo_unitario: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Foto do item (armazenada como BYTEA — padrão do logo do tenant)
    foto_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    foto_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Relationships
    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    grupo: Mapped["EstoqueGrupo | None"] = relationship(
        "EstoqueGrupo", back_populates="itens", foreign_keys=[grupo_id]
    )
    movimentacoes: Mapped[list["EstoqueMovimentacao"]] = relationship(
        "EstoqueMovimentacao", back_populates="item", foreign_keys="EstoqueMovimentacao.item_id"
    )

    def __repr__(self) -> str:
        return f"<EstoqueItem(id={self.id}, nome='{self.nome}')>"


class EstoqueMovimentacao(TimestampedModel):
    """Registro de entrada ou saída de material do estoque.

    Imutável: não possui soft-delete; movimentações são permanentes
    para integridade do histórico.
    """

    __tablename__ = "estoque_movimentacoes"
    __table_args__ = (
        Index("ix_estoque_mov_tenant_id", "tenant_id"),
        Index("ix_estoque_mov_item_id", "item_id"),
        Index("ix_estoque_mov_data", "data_movimentacao"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estoque_itens.id", ondelete="CASCADE"), nullable=False
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    tipo: Mapped[EstoqueMovimentacaoTipo] = mapped_column(
        Enum(EstoqueMovimentacaoTipo, name="estoque_movimentacao_tipo"), nullable=False
    )
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_movimentacao: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    requisitante: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    item: Mapped["EstoqueItem"] = relationship(
        "EstoqueItem", back_populates="movimentacoes", foreign_keys=[item_id]
    )
    usuario = relationship("User", foreign_keys=[usuario_id])

    def __repr__(self) -> str:
        return f"<EstoqueMovimentacao(id={self.id}, tipo={self.tipo}, quantidade={self.quantidade})>"
