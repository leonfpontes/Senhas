"""Permission group models for fine-grained RBAC."""
from __future__ import annotations

import enum
import uuid
from sqlalchemy import (
    Boolean,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import SoftDeleteModel, TimestampedModel


class PermissionFeature(str, enum.Enum):
    """Platform features that can be restricted via permission groups."""
    
    GIRAS = "giras"
    TICKETS = "tickets"
    MEDIUNS = "mediuns"
    ESTOQUE = "estoque"
    FINANCEIRO = "financeiro"
    ASSOCIADOS = "associados"
    USUARIOS = "usuarios"
    CONFIGURACOES = "configuracoes"
    AUDITORIA = "auditoria"
    ANALYTICS = "analytics"
    RELATORIO_GIRA = "relatorio_gira"
    CURSOS_PRESENCIAIS = "cursos_presenciais"
    PORTA = "porta"


class PermissionGroup(SoftDeleteModel):
    """A user group that bundles permissions for a tenant."""

    __tablename__ = "permission_groups"
    __table_args__ = (Index("ix_permission_groups_tenant_id", "tenant_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(
        default=1, nullable=False, server_default="1"
    )  # for optimistic locking (T3)

    tenant = relationship("Tenant", backref="permission_groups")

    def __repr__(self) -> str:
        return f"<PermissionGroup(id={self.id}, name='{self.name}', tenant_id={self.tenant_id})>"


class GroupPermission(TimestampedModel):
    """Permissions granted to a permission group on a specific feature."""

    __tablename__ = "group_permissions"
    __table_args__ = (
        UniqueConstraint("group_id", "feature", name="uq_group_permissions_group_feature"),
        Index("ix_group_permissions_group_id", "group_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("permission_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    feature: Mapped[PermissionFeature] = mapped_column(
        SQLEnum(
            PermissionFeature,
            name="permission_feature",
            create_constraint=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    can_view: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    can_insert: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    can_edit: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    can_delete: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )

    group = relationship("PermissionGroup", backref="permissions")

    def __repr__(self) -> str:
        return f"<GroupPermission(group_id={self.group_id}, feature='{self.feature.value}')>"


class UserGroupMembership(TimestampedModel):
    """User membership in a permission group (N:N relationship within a tenant)."""

    __tablename__ = "user_group_memberships"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_user_group_memberships_group_user"),
        Index("ix_user_group_memberships_group_id", "group_id"),
        Index("ix_user_group_memberships_user_id", "user_id"),
        Index("ix_user_group_memberships_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("permission_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )

    group = relationship("PermissionGroup", backref="memberships")
    user = relationship("User", backref="memberships")

    def __repr__(self) -> str:
        return f"<UserGroupMembership(group_id={self.group_id}, user_id={self.user_id})>"
