"""Pagamento parcial da mensalidade (decisão do dono de 09/10, migração 092).

Um mês pode ter vários comprovantes (`mensalidade_comprovantes`) e várias cobranças automáticas
(`mensalidade_cobrancas`, F-02/AM-22). As contas do mês:

- **devido** = `valor_vigente` gravado no 1º registro do mês (sem registro: o valor da
  configuração) — nunca recalculado;
- **recebido** = soma do `valor_conferido` dos comprovantes **conferidos** pela casa + valor das
  cobranças automáticas **pagas** (`valor_pago`, senão `valor`). Anexo do painel é `conferido`
  sem valor (no registro manual, o `valor_pago` do mês é o total — a palavra final da direção);
- **falta** = max(0, devido − recebido); **pago a mais** = max(0, recebido − devido)
  (só informativo para a direção: não vira crédito);
- **quitado**: recebido ≥ devido (com devido > 0); sem valor definido, qualquer valor recebido
  quita. Mês PENDENTE quitado vira PAGO sozinho (`fechar_se_quitado`): `valor_pago` = recebido,
  espelho em contas a receber e auditoria — os mesmos efeitos da confirmação de sempre.

Enquanto o mês não fecha, o espelho em contas a receber continua "pendente" com o valor do mês:
o que entrou em parte aparece em contas a receber (e no "arrecadado" do resumo) quando o mês
fecha. A Área (PIX estático, cobrança automática, Início, lembretes) usa a FALTA como valor do
mês em aberto (`services/medium_inicio.situacao_mensalidade(valor_recebido=...)`).

Todas as funções com banco recebem `tenant_id` e filtram por ele (auditor de tenant, modo
"scoped"). Nenhuma lê o arquivo (`arquivo_data`) — só o download do painel.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.tz import APP_TZ, utc_now
from src.models.mensalidade_gateway import MensalidadeCobranca
from src.models.mensalidades import (
    COMPROVANTE_CONFERIDO,
    COMPROVANTE_EM_CONFERENCIA,
    COMPROVANTE_NAO_CONFIRMADO,
    MensalidadeComprovante,
    MensalidadePagamento,
    MensalidadeStatus,
)

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")
CENTAVO = Decimal("0.01")


def _dec(valor: Any) -> Decimal:
    if valor is None:
        return ZERO
    return Decimal(str(valor)).quantize(CENTAVO)


# ── Contas do mês (puro) ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class SaldoMes:
    devido: Decimal
    recebido: Decimal

    @property
    def falta(self) -> Decimal:
        return max(ZERO, self.devido - self.recebido)

    @property
    def pago_a_mais(self) -> Decimal:
        if self.devido <= 0:
            return ZERO
        return max(ZERO, self.recebido - self.devido)

    @property
    def quitado(self) -> bool:
        if self.devido <= 0:
            return self.recebido > 0
        return self.recebido >= self.devido

    @property
    def parcial(self) -> bool:
        return self.recebido > 0 and not self.quitado


def saldo_do_mes(
    devido: Optional[Decimal | float],
    conferidos: Iterable[Optional[Decimal | float]] = (),
    pagos_gateway: Iterable[Optional[Decimal | float]] = (),
) -> SaldoMes:
    """Devido × recebido (valores conferidos + cobranças automáticas pagas; None conta zero)."""
    recebido = sum((_dec(v) for v in conferidos), ZERO) + sum((_dec(v) for v in pagos_gateway), ZERO)
    return SaldoMes(devido=_dec(devido), recebido=recebido)


# ── Comprovantes de um mês (puro) ─────────────────────────────────────────────


@dataclass(frozen=True)
class ComprovanteInfo:
    """Um comprovante sem o arquivo (o que as telas e as contas precisam)."""

    id: uuid.UUID
    pagamento_id: uuid.UUID
    mediun_id: uuid.UUID
    origem: str
    enviado_em: datetime
    arquivo_filename: str
    arquivo_mime: str
    arquivo_tamanho: int
    valor_informado: Optional[Decimal]
    status: str
    valor_conferido: Optional[Decimal]
    conferido_em: Optional[datetime]
    motivo: Optional[str]


@dataclass(frozen=True)
class ResumoComprovantes:
    """Comprovantes de um mês, do mais antigo para o mais novo."""

    comprovantes: tuple[ComprovanteInfo, ...] = field(default_factory=tuple)

    @property
    def em_conferencia(self) -> list[ComprovanteInfo]:
        return [c for c in self.comprovantes if c.status == COMPROVANTE_EM_CONFERENCIA]

    @property
    def conferidos(self) -> list[ComprovanteInfo]:
        return [c for c in self.comprovantes if c.status == COMPROVANTE_CONFERIDO]

    @property
    def recebido(self) -> Decimal:
        return sum((_dec(c.valor_conferido) for c in self.conferidos), ZERO)

    @property
    def ultimo(self) -> Optional[ComprovanteInfo]:
        return self.comprovantes[-1] if self.comprovantes else None

    def para_situacao(self) -> dict[str, Any]:
        """Os campos de comprovante que `situacao_mensalidade` espera (o modelo do slot único).

        Algum em conferência → "em conferência" (o envio mais recente); o mais recente não
        confirmado (sem nenhum em conferência) → "não confirmada" com o motivo; senão nada.
        """
        em = self.em_conferencia
        if em:
            return {
                "comprovante_enviado_em": max(c.enviado_em for c in em),
                "comprovante_presente": True,
                "recusado_em": None,
                "recusa_motivo": None,
            }
        ult = self.ultimo
        if ult is not None and ult.status == COMPROVANTE_NAO_CONFIRMADO:
            return {
                "comprovante_enviado_em": ult.enviado_em,
                "comprovante_presente": False,
                "recusado_em": ult.conferido_em or ult.enviado_em,
                "recusa_motivo": ult.motivo,
            }
        return {
            "comprovante_enviado_em": None,
            "comprovante_presente": False,
            "recusado_em": None,
            "recusa_motivo": None,
        }


def resumir(comprovantes: Iterable[ComprovanteInfo]) -> ResumoComprovantes:
    return ResumoComprovantes(tuple(sorted(comprovantes, key=lambda c: (c.enviado_em, str(c.id)))))


RESUMO_VAZIO = ResumoComprovantes()


# ── Banco ─────────────────────────────────────────────────────────────────────

_COLUNAS = (
    MensalidadeComprovante.id,
    MensalidadeComprovante.pagamento_id,
    MensalidadeComprovante.mediun_id,
    MensalidadeComprovante.origem,
    MensalidadeComprovante.enviado_em,
    MensalidadeComprovante.arquivo_filename,
    MensalidadeComprovante.arquivo_mime,
    MensalidadeComprovante.arquivo_tamanho,
    MensalidadeComprovante.valor_informado,
    MensalidadeComprovante.status,
    MensalidadeComprovante.valor_conferido,
    MensalidadeComprovante.conferido_em,
    MensalidadeComprovante.motivo,
)


def _info(row) -> ComprovanteInfo:
    return ComprovanteInfo(*row)


async def comprovantes_por_pagamento(
    db: AsyncSession, tenant_id: uuid.UUID, pagamento_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, ResumoComprovantes]:
    """Comprovantes (sem arquivo) de cada registro de mês, agrupados por `pagamento_id`."""
    ids = list({i for i in pagamento_ids if i is not None})
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(*_COLUNAS).where(
                MensalidadeComprovante.tenant_id == tenant_id,
                MensalidadeComprovante.pagamento_id.in_(ids),
            )
        )
    ).all()
    por: dict[uuid.UUID, list[ComprovanteInfo]] = {}
    for r in rows:
        info = _info(r)
        por.setdefault(info.pagamento_id, []).append(info)
    return {pid: resumir(lista) for pid, lista in por.items()}


async def comprovantes_do_medium(
    db: AsyncSession, tenant_id: uuid.UUID, mediun_id: uuid.UUID
) -> dict[uuid.UUID, ResumoComprovantes]:
    """Todos os comprovantes de UM médium (a Área), agrupados por `pagamento_id`."""
    rows = (
        await db.execute(
            select(*_COLUNAS).where(
                MensalidadeComprovante.tenant_id == tenant_id,
                MensalidadeComprovante.mediun_id == mediun_id,
            )
        )
    ).all()
    por: dict[uuid.UUID, list[ComprovanteInfo]] = {}
    for r in rows:
        info = _info(r)
        por.setdefault(info.pagamento_id, []).append(info)
    return {pid: resumir(lista) for pid, lista in por.items()}


async def gateway_pago_por_mes(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    meses: Iterable[date],
    mediun_ids: Optional[Iterable[uuid.UUID]] = None,
) -> dict[tuple[uuid.UUID, date], Decimal]:
    """Soma das cobranças automáticas PAGAS por (médium, mês). Estornada não conta."""
    meses = list(set(meses))
    if not meses:
        return {}
    stmt = (
        select(
            MensalidadeCobranca.mediun_id,
            MensalidadeCobranca.mes_referencia,
            func.sum(func.coalesce(MensalidadeCobranca.valor_pago, MensalidadeCobranca.valor)),
        )
        .where(
            MensalidadeCobranca.tenant_id == tenant_id,
            MensalidadeCobranca.status == "paga",
            MensalidadeCobranca.mes_referencia.in_(meses),
        )
        .group_by(MensalidadeCobranca.mediun_id, MensalidadeCobranca.mes_referencia)
    )
    if mediun_ids is not None:
        stmt = stmt.where(MensalidadeCobranca.mediun_id.in_(list(set(mediun_ids))))
    return {(m, mes): _dec(total) for m, mes, total in (await db.execute(stmt)).all()}


async def saldo_do_pagamento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    pagamento: MensalidadePagamento,
    valor_config: Optional[Decimal] = None,
) -> SaldoMes:
    """Saldo de UM registro de mês (lê comprovantes e cobranças pagas do banco)."""
    resumo = (await comprovantes_por_pagamento(db, tenant_id, [pagamento.id])).get(pagamento.id, RESUMO_VAZIO)
    gateway = await gateway_pago_por_mes(db, tenant_id, [pagamento.mes_referencia], [pagamento.mediun_id])
    devido = pagamento.valor_vigente if pagamento.valor_vigente is not None else valor_config
    return saldo_do_mes(
        devido,
        [c.valor_conferido for c in resumo.conferidos],
        [gateway.get((pagamento.mediun_id, pagamento.mes_referencia))],
    )


async def _espelhar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagamento: MensalidadePagamento,
    dia_vencimento: int,
    criado_por: Optional[uuid.UUID],
) -> None:
    """Espelho em contas a receber do mês PAGO (falha não derruba a baixa — fica no log)."""
    from src.models import Medium
    from src.services.mensalidade_contas_service import sync_pagamento

    nome = (
        await db.execute(select(Medium.nome).where(Medium.tenant_id == tenant_id, Medium.id == pagamento.mediun_id))
    ).scalar_one_or_none() or ""
    data = pagamento.data_pagamento
    try:
        async with db.begin_nested():
            await sync_pagamento(
                db=db,
                tenant_id=tenant_id,
                tipo_pessoa="mediun",
                pessoa_id=pagamento.mediun_id,
                pessoa_nome=nome,
                mes_date=pagamento.mes_referencia,
                status_mensalidade="PAGO",
                valor=pagamento.valor_vigente,
                valor_pago=pagamento.valor_pago,
                data_pagamento=data.astimezone(APP_TZ) if data is not None else None,
                dia_vencimento=dia_vencimento,
                criado_por=criado_por,
            )
    except Exception:
        logger.exception("Falha ao espelhar a mensalidade em contas a receber (médium %s)", pagamento.mediun_id)


async def fechar_se_quitado(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagamento: MensalidadePagamento,
    origem: str,
    user_id: Optional[uuid.UUID],
    data_pagamento: datetime,
    valor_config: Optional[Decimal] = None,
    dia_vencimento: int = 10,
) -> tuple[SaldoMes, bool]:
    """Mês PENDENTE com recebido ≥ devido vira PAGO (valor_pago = recebido) + espelho.

    Devolve (saldo, fechou_agora). Mês já PAGO/ISENTO não muda aqui. Quem chama faz a
    auditoria do evento (conferência ou baixa automática) e o commit.
    """
    if pagamento.tenant_id != tenant_id:  # defesa extra
        raise ValueError("registro de outro tenant")
    saldo = await saldo_do_pagamento(db, tenant_id, pagamento, valor_config)
    if pagamento.status != MensalidadeStatus.PENDENTE or not saldo.quitado:
        return saldo, False
    if pagamento.valor_vigente is None and valor_config is not None:
        pagamento.valor_vigente = valor_config
    pagamento.status = MensalidadeStatus.PAGO
    pagamento.valor_pago = saldo.recebido
    pagamento.data_pagamento = data_pagamento
    pagamento.origem = origem
    pagamento.registrado_por = user_id
    pagamento.updated_at = utc_now()
    await db.flush()
    await _espelhar(db, tenant_id=tenant_id, pagamento=pagamento, dia_vencimento=dia_vencimento, criado_por=user_id)
    return saldo, True


async def somar_ao_mes_pago(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagamento: MensalidadePagamento,
    valor: Decimal,
    user_id: Optional[uuid.UUID],
    dia_vencimento: int = 10,
) -> None:
    """Comprovante conferido num mês que já estava PAGO: o valor entra no total (pago a mais)."""
    if pagamento.tenant_id != tenant_id or pagamento.status != MensalidadeStatus.PAGO:
        return
    pagamento.valor_pago = _dec(pagamento.valor_pago) + _dec(valor)
    pagamento.updated_at = utc_now()
    await db.flush()
    await _espelhar(db, tenant_id=tenant_id, pagamento=pagamento, dia_vencimento=dia_vencimento, criado_por=user_id)
