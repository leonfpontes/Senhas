#!/usr/bin/env python3
"""
backfill_contas_receber_mensalidades.py
=======================================
Script de execução única para popular contas_financeiras (tipo=receber) com base
nos médiuns e associados já existentes em todos os tenants.

O que faz:
  - Para cada tenant com configuração de mensalidade ativa:
      • Carrega todos os médiuns ativos não isentos
      • Para cada mês com pagamento registrado → sincroniza o status (pago/pendente)
      • Se não há nenhum pagamento → cria conta pendente para o mês corrente
      • Cria conta pendente para o mês seguinte (próximo ciclo de cobrança)
  - Repete a mesma lógica para associados (se mensalidade de associados estiver ativa)
  - Idempotente: usa external_ref para não duplicar registros

Uso:
  docker exec senhas_backend python scripts/backfill_contas_receber_mensalidades.py

Flags:
  --dry-run   Imprime o que seria feito sem gravar nada no banco
  --tenant    Restringe a execução a um tenant específico (UUID)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

# Garante que o módulo src esteja no path quando rodado de dentro do container
sys.path.insert(0, "/app")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import AsyncSessionLocal
from src.models.mediuns import Medium
from src.models.associados import Associado
from src.models.mensalidades import MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.services.mensalidade_contas_service import (
    sync_pagamento,
    criar_conta_proxima_mensalidade,
    _make_ref,
    _find_conta,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")

# ── helpers ───────────────────────────────────────────────────────────────────

def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


async def _pagamentos_mediun(
    db: AsyncSession, tenant_id: UUID, mediun_id: UUID
) -> list[MensalidadePagamento]:
    stmt = select(MensalidadePagamento).where(
        MensalidadePagamento.tenant_id == tenant_id,
        MensalidadePagamento.mediun_id == mediun_id,
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def _pagamentos_associado(
    db: AsyncSession, tenant_id: UUID, associado_id: UUID
) -> list:
    """Tenta carregar pagamentos de associados usando o modelo correto."""
    try:
        from src.models.associado_mensalidade import AssociadoMensalidadePagamento
        stmt = select(AssociadoMensalidadePagamento).where(
            AssociadoMensalidadePagamento.tenant_id == tenant_id,
            AssociadoMensalidadePagamento.associado_id == associado_id,
        )
        result = await db.execute(stmt)
        return result.scalars().all()
    except Exception:
        return []


# ── core backfill por pessoa ──────────────────────────────────────────────────

async def _backfill_pessoa(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    tipo_pessoa: str,               # "mediun" | "associado"
    pessoa_id: UUID,
    pessoa_nome: str,
    valor: Decimal,
    dia_vencimento: int,
    pagamentos: list,               # lista de registros de pagamento
    dry_run: bool,
    stats: dict,
) -> None:
    """Process a single person: sync past payments and ensure next month exists."""

    hoje = date.today()
    system_user_id = tenant_id   # usa tenant_id como proxy de "criado_por" no backfill

    # --- Sincroniza meses com pagamento registrado ---
    for pag in pagamentos:
        mes_date: date = pag.mes_referencia
        status_val: str = pag.status.value if hasattr(pag.status, "value") else str(pag.status)
        ref = _make_ref(tipo_pessoa, pessoa_id, mes_date)

        conta_existente = await _find_conta(db, tenant_id, ref)
        if conta_existente:
            stats["ja_existia"] += 1
            log.debug("  SKIP (já existe) %s — %s", ref, status_val)
            continue

        if dry_run:
            log.info("  [DRY] sync_pagamento %s status=%s", ref, status_val)
            stats["criado"] += 1
            continue

        await sync_pagamento(
            db=db,
            tenant_id=tenant_id,
            tipo_pessoa=tipo_pessoa,
            pessoa_id=pessoa_id,
            pessoa_nome=pessoa_nome,
            mes_date=mes_date,
            status_mensalidade=status_val,
            valor=valor,
            data_pagamento=pag.data_pagamento if hasattr(pag, "data_pagamento") else None,
            dia_vencimento=dia_vencimento,
            criado_por=system_user_id,
        )
        stats["criado"] += 1
        log.info("  SYNC %s — %s", ref, status_val)

    # --- Se não há nenhum pagamento, cria conta pendente para o mês atual ---
    if not pagamentos:
        mes_atual = date(hoje.year, hoje.month, 1)
        ref_atual = _make_ref(tipo_pessoa, pessoa_id, mes_atual)
        conta_atual = await _find_conta(db, tenant_id, ref_atual)
        if not conta_atual:
            if dry_run:
                log.info("  [DRY] conta pendente mês atual %s", ref_atual)
                stats["criado"] += 1
            else:
                await sync_pagamento(
                    db=db,
                    tenant_id=tenant_id,
                    tipo_pessoa=tipo_pessoa,
                    pessoa_id=pessoa_id,
                    pessoa_nome=pessoa_nome,
                    mes_date=mes_atual,
                    status_mensalidade="PENDENTE",
                    valor=valor,
                    data_pagamento=None,
                    dia_vencimento=dia_vencimento,
                    criado_por=system_user_id,
                )
                stats["criado"] += 1
                log.info("  PENDENTE mês atual %s", ref_atual)
        else:
            stats["ja_existia"] += 1

    # --- Garante conta pendente para o mês seguinte ---
    if dry_run:
        stats["criado"] += 1
        log.info("  [DRY] conta próximo mês para %s %s", tipo_pessoa, pessoa_id)
    else:
        await criar_conta_proxima_mensalidade(
            db=db,
            tenant_id=tenant_id,
            tipo_pessoa=tipo_pessoa,
            pessoa_id=pessoa_id,
            pessoa_nome=pessoa_nome,
            valor=valor,
            dia_vencimento=dia_vencimento,
            criado_por=system_user_id,
        )
        # criar_conta_proxima_mensalidade é idempotente (verifica external_ref)
        stats["proximo_mes"] += 1


# ── backfill por tenant ───────────────────────────────────────────────────────

async def _backfill_tenant(
    db: AsyncSession,
    tenant: Tenant,
    *,
    dry_run: bool,
    stats: dict,
) -> None:
    tenant_id: UUID = tenant.id
    log.info("── Tenant: %s (%s)", tenant.name, tenant_id)

    # Carrega configuração de mensalidade
    config_stmt = select(MensalidadeConfig).where(
        MensalidadeConfig.tenant_id == tenant_id
    )
    config_result = await db.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    # Carrega tenant_config para saber se associados estão habilitados
    tc_stmt = select(TenantConfig).where(TenantConfig.tenant_id == tenant_id)
    tc_result = await db.execute(tc_stmt)
    tc = tc_result.scalar_one_or_none()

    # ── Médiuns ───────────────────────────────────────────────────────────────
    if config and config.valor_mensal and config.valor_mensal > 0:
        log.info("  Mensalidade médiuns: R$ %.2f, dia %d", config.valor_mensal, config.dia_vencimento)

        mediuns_stmt = select(Medium).where(
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.mensalidade_isento.is_(False),
        )
        mediuns_result = await db.execute(mediuns_stmt)
        mediuns = mediuns_result.scalars().all()

        log.info("  %d médium(ns) não isentos encontrados", len(mediuns))

        for mediun in mediuns:
            pagamentos = await _pagamentos_mediun(db, tenant_id, mediun.id)
            await _backfill_pessoa(
                db,
                tenant_id=tenant_id,
                tipo_pessoa="mediun",
                pessoa_id=mediun.id,
                pessoa_nome=mediun.nome,
                valor=config.valor_mensal,
                dia_vencimento=config.dia_vencimento,
                pagamentos=pagamentos,
                dry_run=dry_run,
                stats=stats,
            )
    else:
        log.info("  Mensalidade médiuns: não configurada — pulando")

    # ── Associados ────────────────────────────────────────────────────────────
    assoc_ativo = tc and tc.enable_mensalidade_associado
    if assoc_ativo and config and config.valor_mensal_associado and config.valor_mensal_associado > 0:
        log.info(
            "  Mensalidade associados: R$ %.2f, dia %d",
            config.valor_mensal_associado,
            config.dia_vencimento_associado,
        )

        assoc_stmt = select(Associado).where(
            Associado.tenant_id == tenant_id,
            Associado.deleted_at.is_(None),
            Associado.mensalidade_isento.is_(False),
        )
        assoc_result = await db.execute(assoc_stmt)
        associados = assoc_result.scalars().all()

        log.info("  %d associado(s) não isentos encontrados", len(associados))

        for assoc in associados:
            pagamentos = await _pagamentos_associado(db, tenant_id, assoc.id)
            await _backfill_pessoa(
                db,
                tenant_id=tenant_id,
                tipo_pessoa="associado",
                pessoa_id=assoc.id,
                pessoa_nome=assoc.nome,
                valor=config.valor_mensal_associado,
                dia_vencimento=config.dia_vencimento_associado,
                pagamentos=pagamentos,
                dry_run=dry_run,
                stats=stats,
            )
    else:
        log.info("  Mensalidade associados: não configurada ou desabilitada — pulando")


# ── entry point ───────────────────────────────────────────────────────────────

async def main(dry_run: bool, tenant_filter: Optional[str]) -> None:
    stats: dict = {"criado": 0, "ja_existia": 0, "proximo_mes": 0, "erros": 0}

    log.info("=" * 60)
    log.info("Backfill contas a receber — mensalidades")
    log.info("dry_run=%s  tenant_filter=%s", dry_run, tenant_filter or "todos")
    log.info("=" * 60)

    async with AsyncSessionLocal() as db:
        # Carrega tenants
        stmt = select(Tenant).where(Tenant.deleted_at.is_(None))
        if tenant_filter:
            try:
                tid = UUID(tenant_filter)
            except ValueError:
                log.error("--tenant não é um UUID válido: %s", tenant_filter)
                sys.exit(1)
            stmt = stmt.where(Tenant.id == tid)

        result = await db.execute(stmt)
        tenants = result.scalars().all()

        if not tenants:
            log.warning("Nenhum tenant encontrado.")
            return

        log.info("%d tenant(s) a processar", len(tenants))

        for tenant in tenants:
            try:
                await _backfill_tenant(db, tenant, dry_run=dry_run, stats=stats)
                if not dry_run:
                    await db.commit()
                    log.info("  ✓ commit tenant %s", tenant.id)
            except Exception as exc:
                await db.rollback()
                stats["erros"] += 1
                log.error("  ✗ ERRO no tenant %s: %s", tenant.id, exc, exc_info=True)

    log.info("=" * 60)
    log.info("Resultado:")
    log.info("  Contas criadas/sincronizadas : %d", stats["criado"])
    log.info("  Próximo mês garantido        : %d", stats["proximo_mes"])
    log.info("  Já existiam (ignoradas)      : %d", stats["ja_existia"])
    log.info("  Tenants com erro             : %d", stats["erros"])
    if dry_run:
        log.info("  (dry-run: nenhuma alteração gravada)")
    log.info("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill contas a receber a partir de mensalidades")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula sem gravar nada no banco",
    )
    parser.add_argument(
        "--tenant",
        metavar="UUID",
        default=None,
        help="Restringe a execução a um tenant específico",
    )
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, tenant_filter=args.tenant))
