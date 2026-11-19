"""UsuarioConvite — convite da casa para alguém entrar no painel do terreiro (11/2026).

Quem cadastra não define mais a senha de ninguém: em "Pessoas e acessos" o admin informa
e-mail, nome, tipo de acesso e perfil, e a pessoa recebe um link por e-mail para criar a
própria senha (ou usar a que já usa no GiraHub, em outra casa ou na Área do Médium). Assim
a mesma senha confere em todas as contas do e-mail e o login mostra a escolha de terreiro
e de área (AM-04/AM-05) com tudo junto.

A conta (`users`) só nasce no aceite: convite pendente não entra no login, na contagem de
administradores nem em "quem é do terreiro". Token opaco (`secrets.token_urlsafe(32)`), só o
sha256 no banco, vale 7 dias, uso único; no máximo UM convite em aberto por e-mail no terreiro
(índice único parcial) — reenviar troca o token, convidar de novo revoga o anterior.
"""
from datetime import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UsuarioConvite(Base):
    __tablename__ = "usuario_convites"
    __table_args__ = (
        Index("ix_usuario_convites_tenant_id", "tenant_id"),
        # Um convite em aberto por e-mail no terreiro (sqlite_where espelha o predicado nos testes).
        Index(
            "uq_usuario_convites_aberto",
            "tenant_id",
            "email",
            unique=True,
            postgresql_where=text("usado_em IS NULL AND revogado_em IS NULL AND recusado_em IS NULL"),
            sqlite_where=text("usado_em IS NULL AND revogado_em IS NULL AND recusado_em IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    # E-mail convidado, em minúsculas. Não muda: errou o e-mail, cancela e convida de novo.
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    # "admin" | "operator" (UserRole.value) — nunca super_admin nem medium.
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # Perfil de acesso escolhido para o operador; aplicado no aceite. Perfil apagado no
    # meio-tempo → a pessoa entra no padrão "Acesso total" (Q-05).
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("permission_groups.id", ondelete="SET NULL"), nullable=True
    )
    # sha256 (hex) do token; o token em claro só existe no link enviado.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recusado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Conta criada (ou ligada) no aceite.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    criado_por: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<UsuarioConvite(id={self.id}, role={self.role}, expira_em={self.expira_em})>"
