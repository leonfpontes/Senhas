"""TenantConfig model - organization branding and settings (T052)."""
from sqlalchemy import CheckConstraint, Column, String, ForeignKey, Boolean, Index, Integer, LargeBinary, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSON
from datetime import datetime
import uuid

from .base import TimestampedModel


class TenantConfig(TimestampedModel):
    """Tenant configuration model - branding, email settings, feature flags.
    
    Stores per-tenant configuration like:
    - Branding (logo URL, primary color, secondary color)
    - Email settings (reply-to, signature)
    - Feature flags
    - Notification preferences
    """
    
    __tablename__ = "tenant_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_tenant_configs_tenant_id"),
        Index("ix_tenant_configs_tenant_id", "tenant_id"),
        CheckConstraint(
            "presenca_modo_padrao IN ('confianca', 'app', 'qr')", name="ck_tenant_configs_presenca_modo"
        ),
        CheckConstraint(
            "presenca_prazo_justificativa_dias BETWEEN 1 AND 30", name="ck_tenant_configs_presenca_prazo"
        ),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Branding
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), default="#4f46e5", nullable=False)  # Hex color
    secondary_color: Mapped[str] = mapped_column(String(7), default="#818cf8", nullable=False)
    
    # Address
    endereco: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Email settings
    reply_to_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_signature: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    
    # Features
    enable_bulk_operations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_analytics: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_walk_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    
    # Sponsor ordering
    sponsor_priority_mode: Mapped[str] = mapped_column(String(20), default="first", server_default="first", nullable=False)
    
    # Associado validation on emit
    validate_associado_on_emit: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Estoque: log de movimentações no audit_log
    enable_estoque_log: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    # Mensalidade de associados feature toggle (Premium)
    enable_mensalidade_associado: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Fila de espera feature toggle (Premium)
    enable_waitlist: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Agendamento por horário de atendimento (habilita o seletor de horário na
    # emissão pública). Default desabilitado — cada gira ainda decide via
    # Gira.use_time_slots se usa ou não.
    enable_time_slot_scheduling: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Área do Médium (AM-10) — o que a casa mostra ao médium. A chave da plataforma
    # (`tenants.area_medium_liberada`) e o plano (`area_medium`) valem por cima.
    area_medium_ativa: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    area_medium_boas_vindas: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Só dígitos, com DDI (ex.: 5511987654321) — botão "Falar com a casa".
    area_medium_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    area_medium_agenda: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    area_medium_avisos: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    area_medium_mensalidade: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    # Presença (AM-17/AM-28, migração 079): modo padrão da casa (confianca | app | qr — cada tipo
    # de atividade pode ajustar em `atividade_tipos.presenca_modo`) e prazo, em dias depois da
    # atividade, para o médium contar o motivo de uma ausência.
    presenca_modo_padrao: Mapped[str] = mapped_column(
        String(20), default="confianca", server_default="confianca", nullable=False
    )
    presenca_prazo_justificativa_dias: Mapped[int] = mapped_column(
        Integer, default=7, server_default="7", nullable=False
    )

    # Custom metadata
    custom_settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="config", foreign_keys=[tenant_id])
    
    def __repr__(self) -> str:
        return f"<TenantConfig(tenant_id={self.tenant_id}, primary_color={self.primary_color})>"
