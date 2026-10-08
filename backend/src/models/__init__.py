"""Database models package."""
from .base import Base, SoftDeleteModel, TimestampedModel
from .tenants import Tenant
from .users import User, UserRole
from .giras import Gira
from .consulentes import Consulente
from .tickets import Ticket, TicketStatus
from .senha_controls import SenhaControl
from .gira_time_slots import GiraTimeSlot, GiraTimeSlotTemplate
from .audit_logs import AuditLog, AuditAction
from .tenant_config import TenantConfig
from .subscriptions import Subscription, PlanType, SubscriptionStatus
from .billing import Invoice, InvoiceStatus
from .feature_flags import FeatureFlag
from .associados import Associado
from .estoque import EstoqueGrupo, EstoqueItem, EstoqueMovimentacao, EstoqueMovimentacaoTipo
from .mediuns import Medium
from .mensalidades import MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from .associado_mensalidade import AssociadoMensalidadePagamento
from .site import TenantSite, TenantSiteSection, SiteImage, SiteVersion, SiteStatus, SiteSectionType
from .cursos_presenciais import CursoPresencial, CursoParticipante, CursoParticipantePagamento
from .permission_groups import PermissionGroup, GroupPermission, UserGroupMembership, PermissionFeature
from .contas_financeiras import ContaFinanceira, CategoriaFinanceira, ContaBancaria, TipoContaFinanceira, StatusContaFinanceira, RecorrenciaConta
from .user_sessions import UserSession
from .stripe_events import StripeEventProcessed
from .trial_grants import TrialGrant
from .legal_acceptances import LegalAcceptance
from .support_chat import SupportConversation, SupportMessage, SupportConversationStatus
from .medium_convites import MediumConvite
from .comunicados import Comunicado, ComunicadoLeitura, ComunicadoPublico
from .corrente_grupos import ComunicadoGrupo, CorrenteGrupo, CorrenteGrupoMembro
from .atividades import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    AtividadeTipoGrupo,
    EscalaPlano,
    EscalaPlanoDia,
    FuncaoCorrente,
    ParticipacaoTroca,
)
from .medium_lembretes import MediumLembreteEnviado, MediumPreferencia
from .parceiro_interesse import ParceiroInteresse
from .push_inscricoes import PushInscricao

__all__ = [
    "Base",
    "SoftDeleteModel",
    "TimestampedModel",
    "Tenant",
    "User",
    "UserRole",
    "Gira",
    "Consulente",
    "Ticket",
    "TicketStatus",
    "SenhaControl",
    "GiraTimeSlot",
    "GiraTimeSlotTemplate",
    "AuditLog",
    "AuditAction",
    "TenantConfig",
    "Subscription",
    "PlanType",
    "SubscriptionStatus",
    "Invoice",
    "InvoiceStatus",
    "FeatureFlag",
    "EstoqueGrupo",
    "EstoqueItem",
    "EstoqueMovimentacao",
    "EstoqueMovimentacaoTipo",
    "Medium",
    "MediumConvite",
    "MediumLembreteEnviado",
    "MediumPreferencia",
    "PushInscricao",
    "Comunicado",
    "ComunicadoLeitura",
    "ComunicadoPublico",
    "ComunicadoGrupo",
    "CorrenteGrupo",
    "CorrenteGrupoMembro",
    "Atividade",
    "AtividadeParticipacao",
    "AtividadeTipo",
    "AtividadeTipoGrupo",
    "EscalaPlano",
    "EscalaPlanoDia",
    "FuncaoCorrente",
    "ParticipacaoTroca",
    "MensalidadeConfig",
    "MensalidadePagamento",
    "MensalidadeStatus",
    "AssociadoMensalidadePagamento",
    "TenantSite",
    "TenantSiteSection",
    "SiteImage",
    "SiteVersion",
    "SiteStatus",
    "SiteSectionType",
    "CursoPresencial",
    "CursoParticipante",
    "CursoParticipantePagamento",
    "PermissionGroup",
    "GroupPermission",
    "UserGroupMembership",
    "PermissionFeature",
    "ContaFinanceira",
    "CategoriaFinanceira",
    "ContaBancaria",
    "TipoContaFinanceira",
    "StatusContaFinanceira",
    "RecorrenciaConta",
    "UserSession",
    "StripeEventProcessed",
    "TrialGrant",
    "LegalAcceptance",
    "SupportConversation",
    "SupportMessage",
    "SupportConversationStatus",
    "ParceiroInteresse",
]
