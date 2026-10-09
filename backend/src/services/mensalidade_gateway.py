"""Mensalidade com baixa automática (F-02/AM-22) — regras comuns aos provedores.

Cada casa escolhe onde recebe (decisão do dono de 09/10): **Stripe** (Stripe Connect,
`services/stripe_connect.py`) ou **Mercado Pago** (OAuth). Este módulo é o que não depende do
provedor:

- quais provedores aparecem (credenciais da plataforma configuradas; sem elas a opção some);
- o gateway da casa (`mensalidade_gateways`) e quando ele pode cobrar (plano com
  `mensalidade_automatica` + gateway ativo + PIX liberado no provedor);
- criar ou reaproveitar a cobrança do mês (`mensalidade_cobrancas`), uma pendente por médium +
  mês + método, reaproveitada enquanto vale;
- **dar baixa**: cobrança paga → o mês vira PAGO no MESMO registro que a confirmação da direção
  usa (`mensalidade_pagamentos`, AM-12), com `origem = 'gateway'`, espelho em contas a receber e
  auditoria. Idempotente: aviso repetido não paga duas vezes nem sobrescreve o que a direção já
  registrou;
- processar os eventos do webhook do Connect: o tenant vem SEMPRE da nossa cobrança (pelo id do
  PaymentIntent) e a conta do evento precisa ser a conta gravada na cobrança — nunca de campo do
  corpo (metadata) sozinho.

Funções sem parâmetro de tenant (`cobranca_por_external_id`, `gateway_por_conta_stripe`) são a
busca raiz do webhook — cross-tenant por design, listadas em `EXEMPT_SCOPED_QUERIES` do
`scripts/audit_tenant_isolation.py`.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.tz import APP_TZ, utc_now
from src.models import Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus, User, UserRole
from src.models.mensalidade_gateway import MensalidadeCobranca, MensalidadeGateway
from src.models.tenants import Tenant
from src.repositories.subscription_repo import SubscriptionRepository
from src.services import stripe_connect
from src.services.audit_service import AuditService
from src.services.plan_features import get_effective_plan_features

logger = logging.getLogger(__name__)

PROVEDOR_LABEL = {"stripe": "Stripe", "mercadopago": "Mercado Pago"}
ORIGEM_GATEWAY = "gateway"
ORIGEM_DIRECAO = "direcao"
# Cobrança pendente é reaproveitada só se ainda vale por pelo menos este tempo.
MARGEM_REUSO = timedelta(minutes=10)


# ── Provedores e gateway da casa ─────────────────────────────────────────────


def provedores_disponiveis() -> list[str]:
    """Provedores que a plataforma configurou (sem credencial a opção não aparece)."""
    disponiveis = []
    if stripe_connect.disponivel():
        disponiveis.append("stripe")
    return disponiveis


def provedor_configurado(provedor: str) -> bool:
    return provedor in provedores_disponiveis()


async def get_gateway(db: AsyncSession, tenant_id: uuid.UUID, *, for_update: bool = False) -> Optional[MensalidadeGateway]:
    stmt = select(MensalidadeGateway).where(MensalidadeGateway.tenant_id == tenant_id)
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def plano_inclui(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    sub = await SubscriptionRepository(db).get_by_tenant(tenant_id)
    return get_effective_plan_features(sub).mensalidade_automatica


def gateway_pode_cobrar(gw: Optional[MensalidadeGateway]) -> bool:
    """Gateway ativo, cadastro liberado no provedor e provedor ainda configurado na plataforma."""
    return bool(
        gw is not None
        and gw.status == "ativo"
        and gw.recebimentos_ativos
        and (gw.pix_disponivel or gw.boleto_disponivel)
        and provedor_configurado(gw.provedor)
    )


async def gateway_para_cobrar(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[MensalidadeGateway]:
    """O gateway que a Área usa no "Pagar com PIX", ou None (fluxo da chave estática + comprovante)."""
    gw = await get_gateway(db, tenant_id)
    if not gateway_pode_cobrar(gw):
        return None
    if not await plano_inclui(db, tenant_id):
        return None
    return gw


def aplicar_estado_stripe(gw: MensalidadeGateway, estado: stripe_connect.EstadoConta) -> None:
    """Grava as capacidades da conta conectada e recalcula o status (desconectado fica)."""
    gw.cadastro_completo = estado.cadastro_completo
    gw.recebimentos_ativos = estado.recebimentos_ativos
    gw.pix_disponivel = estado.pix_disponivel
    gw.boleto_disponivel = estado.boleto_disponivel
    if gw.status != "desconectado":
        gw.status = "ativo" if (estado.cadastro_completo and estado.recebimentos_ativos) else "pendente"
    gw.updated_at = utc_now()


# ── Aviso aos administradores (conectar/desconectar) ─────────────────────────


async def avisar_admins(db: AsyncSession, tenant_id: uuid.UUID, feito_por: User, provedor: str, acao: str) -> int:
    """Enfileira o aviso para todos os admins ativos do terreiro (mesmo padrão da troca da chave PIX)."""
    from src.services.email.base import EmailMessage
    from src.services.email.email_queue import EmailQueueItem, email_queue
    from src.services.email.templates.mensalidade_gateway_alterado import (
        mensalidade_gateway_subject,
        render_mensalidade_gateway_email,
    )

    tenant_name = (
        await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or "Terreiro"
    admins = (
        await db.execute(
            select(User).where(
                and_(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                )
            )
        )
    ).scalars().all()
    html = render_mensalidade_gateway_email(
        tenant_name=tenant_name,
        feito_por=feito_por.full_name or feito_por.username or feito_por.email,
        quando=utc_now().astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M"),
        provedor_label=PROVEDOR_LABEL.get(provedor, provedor),
        acao=acao,
        painel_url=f"{settings.FRONTEND_URL.rstrip('/')}/admin/financeiro/config?tab=mensalidade",
    )
    enviados = 0
    for admin in admins:
        if admin.email:
            email_queue.enqueue(
                EmailQueueItem(
                    message=EmailMessage(
                        to_email=admin.email,
                        subject=mensalidade_gateway_subject(tenant_name, acao),
                        html_body=html,
                    )
                )
            )
            enviados += 1
    return enviados


# ── Cobranças ────────────────────────────────────────────────────────────────


class CobrancaRecusada(Exception):
    """A cobrança não pode ser criada (mensagem para o médium + código)."""

    def __init__(self, mensagem: str, codigo: str):
        super().__init__(mensagem)
        self.codigo = codigo


@dataclass(frozen=True)
class DadosPagador:
    nome: str
    email: Optional[str] = None
    cpf: Optional[str] = None
    endereco: Optional[dict[str, str]] = None


def descricao_cobranca(mes: date) -> str:
    return f"Mensalidade {mes.strftime('%m/%Y')}"


async def _travar_mes(db: AsyncSession, mediun_id: uuid.UUID, mes: date, metodo: str) -> None:
    """Serializa a criação da cobrança do mesmo médium + mês + método (duplo toque, duas abas)."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
            {"k": f"mensalidade_cobranca:{mediun_id}:{mes.isoformat()}:{metodo}"},
        )


async def cobranca_pendente(
    db: AsyncSession, tenant_id: uuid.UUID, mediun_id: uuid.UUID, mes: date, metodo: str
) -> Optional[MensalidadeCobranca]:
    return (
        await db.execute(
            select(MensalidadeCobranca).where(
                MensalidadeCobranca.tenant_id == tenant_id,
                MensalidadeCobranca.mediun_id == mediun_id,
                MensalidadeCobranca.mes_referencia == mes,
                MensalidadeCobranca.metodo == metodo,
                MensalidadeCobranca.status == "pendente",
            )
        )
    ).scalar_one_or_none()


def _conta_do_gateway(gw: MensalidadeGateway) -> Optional[str]:
    if gw.provedor == "stripe":
        return gw.stripe_account_id
    return gw.mp_user_id


def _reaproveitavel(cob: MensalidadeCobranca, gw: MensalidadeGateway, valor: Decimal, agora: datetime) -> bool:
    return (
        cob.provedor == gw.provedor
        and cob.conta_externa == _conta_do_gateway(gw)
        and Decimal(cob.valor) == Decimal(valor)
        and (cob.expira_em is None or cob.expira_em > agora + MARGEM_REUSO)
    )


async def criar_ou_reusar_cobranca(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    gw: MensalidadeGateway,
    medium: Medium,
    user_id: Optional[uuid.UUID],
    mes: date,
    valor: Decimal,
    metodo: str,
    pagador: DadosPagador,
) -> tuple[MensalidadeCobranca, bool]:
    """Cobrança pendente que ainda vale (mesmo provedor/conta/valor) ou uma nova na conta da casa.

    Devolve (cobrança, criada_agora). A pendente que não serve mais (vencida, valor mudou, casa
    trocou de conta) vira expirada/cancelada aqui; se o médium pagar por ela mesmo assim, o
    webhook ainda dá a baixa (a busca é pela cobrança, não pelo status).
    """
    if metodo == "pix" and not gw.pix_disponivel:
        raise CobrancaRecusada("O PIX automático ainda não está liberado para a casa.", "PIX_INDISPONIVEL")
    if metodo == "boleto" and not gw.boleto_disponivel:
        raise CobrancaRecusada("O boleto não está liberado para a casa.", "BOLETO_INDISPONIVEL")
    if metodo == "pix" and not (stripe_connect.PIX_MIN <= Decimal(valor) <= stripe_connect.PIX_MAX):
        raise CobrancaRecusada("O valor desta mensalidade não pode ser pago por PIX automático.", "VALOR_FORA_DO_LIMITE")
    conta = _conta_do_gateway(gw)
    if not conta:
        raise CobrancaRecusada("A conta da casa não está pronta para receber.", "GATEWAY_INDISPONIVEL")

    await _travar_mes(db, medium.id, mes, metodo)
    agora = utc_now()
    atual = await cobranca_pendente(db, tenant_id, medium.id, mes, metodo)
    if atual is not None:
        if _reaproveitavel(atual, gw, valor, agora):
            return atual, False
        vencida = atual.expira_em is not None and atual.expira_em <= agora + MARGEM_REUSO
        atual.status = "expirada" if vencida else "cancelada"
        atual.updated_at = agora
        await db.flush()

    cobranca_id = uuid.uuid4()
    if gw.provedor != "stripe":  # o Mercado Pago entra no PR seguinte
        raise CobrancaRecusada("Provedor indisponível.", "GATEWAY_INDISPONIVEL")
    try:
        criada = await stripe_connect.criar_cobranca(
            account_id=conta,
            metodo=metodo,
            valor=Decimal(valor),
            descricao=descricao_cobranca(mes),
            metadata={
                "tenant_id": str(tenant_id),
                "mediun_id": str(medium.id),
                "mes": mes.strftime("%Y-%m"),
                "cobranca_id": str(cobranca_id),
            },
            idempotency_key=f"girahub-mensalidade-{cobranca_id}",
            nome=pagador.nome,
            email=pagador.email,
            cpf=pagador.cpf,
            endereco=pagador.endereco,
        )
    except stripe_connect.StripeConnectErro as exc:
        if exc.param and "tax_id" in exc.param:
            raise CobrancaRecusada("Informe o seu CPF para gerar a cobrança.", "CPF_NECESSARIO") from exc
        raise CobrancaRecusada(str(exc), "GATEWAY_ERRO") from exc
    if metodo == "pix" and not criada.copia_e_cola:
        logger.warning("PaymentIntent PIX sem QR (status %s)", criada.status_externo)
        raise CobrancaRecusada("Não conseguimos gerar o PIX agora. Tente de novo.", "GATEWAY_ERRO")

    cob = MensalidadeCobranca(
        id=cobranca_id,
        tenant_id=tenant_id,
        mediun_id=medium.id,
        mes_referencia=mes,
        valor=Decimal(valor),
        provedor=gw.provedor,
        conta_externa=conta,
        external_id=criada.external_id,
        metodo=metodo,
        status="pendente",
        copia_e_cola=criada.copia_e_cola,
        boleto_url=criada.boleto_url,
        boleto_linha_digitavel=criada.boleto_linha_digitavel,
        expira_em=criada.expira_em,
        criado_por=user_id,
        raw={"status_externo": criada.status_externo},
    )
    db.add(cob)
    await db.flush()
    return cob, True


# ── Baixa ────────────────────────────────────────────────────────────────────


async def registrar_pagamento_gateway(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cobranca: MensalidadeCobranca,
    pago_em: datetime,
    valor_pago: Optional[Decimal],
    evento: Optional[str] = None,
) -> bool:
    """Marca a cobrança paga e o mês do médium PAGO (origem gateway). Idempotente.

    Devolve True quando a baixa aconteceu agora; False se a cobrança já estava paga. Se a direção
    já tinha registrado o mês (PAGO ou ISENTO), o registro dela fica como está — a cobrança é
    marcada paga e a duplicidade vai para a auditoria (a casa devolve, se for o caso).
    """
    if cobranca.tenant_id != tenant_id:  # defesa extra: nunca dá baixa fora do tenant
        raise ValueError("cobrança de outro tenant")
    if cobranca.status == "paga":
        return False
    anterior = cobranca.status
    cobranca.status = "paga"
    cobranca.pago_em = pago_em
    cobranca.valor_pago = valor_pago
    cobranca.raw = {**(cobranca.raw or {}), "status_externo": "succeeded", **({"evento": evento} if evento else {})}
    cobranca.updated_at = utc_now()

    pagamento = (
        await db.execute(
            select(MensalidadePagamento)
            .where(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mediun_id == cobranca.mediun_id,
                MensalidadePagamento.mes_referencia == cobranca.mes_referencia,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    config = (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()

    duplicidade = pagamento is not None and pagamento.status != MensalidadeStatus.PENDENTE
    if pagamento is None:
        pagamento = MensalidadePagamento(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            mediun_id=cobranca.mediun_id,
            mes_referencia=cobranca.mes_referencia,
            status=MensalidadeStatus.PENDENTE,
            valor_vigente=config.valor_mensal if config is not None else cobranca.valor,
        )
        db.add(pagamento)
    if not duplicidade:
        pagamento.status = MensalidadeStatus.PAGO
        pagamento.data_pagamento = pago_em
        pagamento.valor_pago = valor_pago if valor_pago is not None else cobranca.valor
        pagamento.origem = ORIGEM_GATEWAY
        pagamento.registrado_por = None
        pagamento.recusa_motivo = None
        pagamento.recusado_em = None
        pagamento.updated_at = utc_now()
    await db.flush()

    if not duplicidade:
        from src.services.mensalidade_contas_service import sync_pagamento

        nome = (
            await db.execute(
                select(Medium.nome).where(Medium.tenant_id == tenant_id, Medium.id == cobranca.mediun_id)
            )
        ).scalar_one_or_none() or ""
        try:
            async with db.begin_nested():
                await sync_pagamento(
                    db=db,
                    tenant_id=tenant_id,
                    tipo_pessoa="mediun",
                    pessoa_id=cobranca.mediun_id,
                    pessoa_nome=nome,
                    mes_date=cobranca.mes_referencia,
                    status_mensalidade="PAGO",
                    valor=pagamento.valor_vigente,
                    valor_pago=pagamento.valor_pago,
                    data_pagamento=pago_em.astimezone(APP_TZ),
                    dia_vencimento=config.dia_vencimento if config else 10,
                    criado_por=None,
                )
        except Exception:
            logger.exception("Falha ao espelhar a baixa automática em contas a receber (médium %s)", cobranca.mediun_id)

    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=None,
        resource_type="mensalidade_gateway_baixa",
        resource_id=cobranca.id,
        previous_state={"cobranca": anterior},
        new_state={
            "mes": cobranca.mes_referencia.strftime("%Y-%m"),
            "mediun_id": str(cobranca.mediun_id),
            "provedor": cobranca.provedor,
            "metodo": cobranca.metodo,
            "valor_pago": str(valor_pago) if valor_pago is not None else None,
            "mes_ja_resolvido_pela_direcao": duplicidade,
        },
    )
    return True


# ── Webhook do Stripe Connect ────────────────────────────────────────────────


async def cobranca_por_external_id(db: AsyncSession, provedor: str, external_id: str) -> Optional[MensalidadeCobranca]:
    """Busca raiz do webhook: a cobrança pelo id do provedor (único por provedor), com lock."""
    return (
        await db.execute(
            select(MensalidadeCobranca)
            .where(MensalidadeCobranca.provedor == provedor, MensalidadeCobranca.external_id == external_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def gateway_por_conta_stripe(db: AsyncSession, account_id: str) -> Optional[MensalidadeGateway]:
    """Busca raiz do `account.updated`: o gateway pelo id da conta conectada (único)."""
    return (
        await db.execute(
            select(MensalidadeGateway).where(MensalidadeGateway.stripe_account_id == account_id).with_for_update()
        )
    ).scalar_one_or_none()


def _valor_do_pi(pi: dict) -> Optional[Decimal]:
    cents = pi.get("amount_received") or pi.get("amount")
    return (Decimal(int(cents)) / 100).quantize(Decimal("0.01")) if cents else None


async def processar_evento_stripe_connect(db: AsyncSession, evento: dict) -> str:
    """Aplica um evento (já com assinatura conferida). Devolve um rótulo curto para log/teste.

    Não faz commit (quem chama faz, junto com a marca de idempotência do evento).
    """
    tipo = evento.get("type") or ""
    conta = evento.get("account")
    obj = ((evento.get("data") or {}).get("object")) or {}
    if not conta:
        return "sem_conta"

    if tipo == "account.updated":
        gw = await gateway_por_conta_stripe(db, conta)
        if gw is None or obj.get("id") != conta:
            return "conta_desconhecida"
        aplicar_estado_stripe(gw, stripe_connect.estado_da_conta(obj))
        return "conta_atualizada"

    if not tipo.startswith("payment_intent."):
        return "ignorado"
    pi_id = obj.get("id")
    if not pi_id:
        return "ignorado"
    cob = await cobranca_por_external_id(db, "stripe", pi_id)
    if cob is None:
        return "cobranca_desconhecida"
    if cob.conta_externa != conta:
        # Evento assinado, mas de outra conta conectada: nunca dá baixa em cobrança alheia.
        logger.warning("Evento %s de conta diferente da cobrança %s — ignorado", evento.get("id"), cob.id)
        return "conta_divergente"

    if tipo == "payment_intent.succeeded":
        criado = evento.get("created")
        pago_em = datetime.fromtimestamp(int(criado), tz=timezone.utc) if isinstance(criado, (int, float)) else utc_now()
        feito = await registrar_pagamento_gateway(
            db,
            tenant_id=cob.tenant_id,
            cobranca=cob,
            pago_em=pago_em,
            valor_pago=_valor_do_pi(obj),
            evento=evento.get("id"),
        )
        return "paga" if feito else "ja_paga"
    if tipo == "payment_intent.payment_failed":
        if cob.status == "pendente":
            cob.status = "expirada"
            cob.raw = {**(cob.raw or {}), "status_externo": obj.get("status") or "payment_failed"}
            cob.updated_at = utc_now()
        return "expirada"
    if tipo == "payment_intent.canceled":
        if cob.status == "pendente":
            cob.status = "cancelada"
            cob.raw = {**(cob.raw or {}), "status_externo": "canceled"}
            cob.updated_at = utc_now()
        return "cancelada"
    return "ignorado"
