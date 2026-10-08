"""Troca e substituição na escala (AM-27) — regras e consultas.

Quem usa: `api/v1/medium/trocas.py` (Área: pedir troca, aceitar/recusar, cancelar o próprio
pedido), `api/v1/admin/atividades_trocas.py` (painel: aprovar, recusar, cancelar, escolher o
substituto quando o médium deixou "a direção escolhe"), `api/v1/medium/inicio.py` ("Para você ver
agora") e o agendador de e-mails (`medium_lembrete_scheduler`, AM-15).

Regras (card AM-27 do plano da Área do Médium):

- **O que dá para trocar** (`motivo_sem_troca`): a própria linha de participação, na escala
  (convocado, sem dispensa nem troca), numa escala de verdade — escala de gira com função (AM-18),
  faxina (AM-25) ou atividade "só escalados" —, ainda não começou, não cancelada e com a chamada
  aberta. Gira sem função não tem troca: a corrente inteira já é esperada.
- **Quem pode substituir** (`colegas_elegiveis`): médium ativo do terreiro, já na casa no dia, que
  o tipo da atividade alcança (todos · atendimento · cambones · grupos ATIVOS do tipo), que não é
  quem pede e que ainda não está nessa escala (`na_escala`).
- **D-07**: na Área, quem pede só vê o PRIMEIRO nome dos colegas que ligaram "Mostrar meu primeiro
  nome para os colegas de escala" no Perfil (`medium_preferencias.mostrar_nome_colegas`, padrão
  desligado). Se ninguém ligou, o pedido vai sem colega: "a direção escolhe" (`substituto_id`
  vazio) e aparece no painel. Quem recebe o pedido vê o primeiro nome de quem pediu (foi ele quem
  procurou); quem pediu vê o nome do substituto só se o colega aceitou aparecer (o substituto
  indicado pela direção sem opt-in vira "um colega da corrente").
- **Fluxo**: pedido → o colega aceita → `aceito` (a direção aprova no painel) ou, com a casa sem
  exigir aprovação (`tenant_configs.escala_troca_exige_aprovacao` desligado), direto `aprovado`.
  Recusa do colega ou da direção → `recusado`; quem pediu (ou a direção) cancela → `cancelado`.
  Uma troca aberta por participação (índice único parcial).
- **Aprovada** (`aplicar_troca`): a linha de quem pediu ganha `substituida_por_id` (situação
  "Substituído" — fora da conta da assiduidade) e a do substituto nasce (ou volta) com origem
  `troca`, a mesma função e o mesmo grupo e resposta "Vou" (ele aceitou ir). Tudo sob `FOR UPDATE`
  nas duas linhas; a validade é conferida de novo na hora (a casa pode ter mexido na escala).

Auditoria só com ids. Nenhuma justificativa de ausência passa por aqui.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional, Sequence

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ConflictError, NotFoundError, ValidationError
from ..core.tz import APP_TZ, utc_now
from ..models.atividades import (
    RECADO_MAX,
    STATUS_TROCA_ABERTOS,
    TROCA_ACEITO,
    TROCA_APROVADO,
    TROCA_CANCELADO,
    TROCA_PEDIDO,
    TROCA_RECUSADO,
    AtividadeParticipacao,
    FuncaoCorrente,
    ParticipacaoTroca,
)
from ..models.corrente_grupos import CorrenteGrupo
from ..models.medium_lembretes import MediumPreferencia
from ..models.mediuns import Medium
from ..models.tenant_config import TenantConfig
from .atividades import tipo_resumo
from .comunicados import limpar_corpo
from .presenca import RESPOSTA_VOU, AtividadeCtx, ctx_da_atividade, elegiveis_entre, upsert_participacao

ORIGEM_TROCA = "troca"
CONVOCACAO_SO_ESCALADOS = "so_escalados"

AGUARDANDO_COLEGA = "colega"
AGUARDANDO_DIRECAO = "direcao"

FECHADA_SOLICITANTE = "solicitante"
FECHADA_SUBSTITUTO = "substituto"
FECHADA_DIRECAO = "direcao"

MSG_FORA_DA_ESCALA = "Você não está na escala desta atividade."
MSG_SEM_ESCALA = "Esta atividade não tem escala para trocar."
MSG_GIRA_SEM_FUNCAO = "Na gira, a troca vale para quem tem uma função na escala."
MSG_CANCELADA = "Esta atividade foi cancelada pela casa."
MSG_COMECOU = "A atividade já começou: não dá mais para trocar."
MSG_ENCERRADA = "A casa já encerrou a chamada desta atividade."
MSG_JA_TEM_PEDIDO = "Você já pediu troca nesta atividade. Cancele o pedido para fazer outro."
MSG_COLEGA = "Escolha um colega da lista."
MSG_SUBSTITUTO = "Escolha um médium ativo da casa que possa ir nesta atividade e ainda não esteja na escala."
MSG_FECHADA = "Este pedido de troca já foi resolvido."
MSG_RECADO_LONGO = f"O recado vai até {RECADO_MAX} letras."


# ── Regras puras ────────────────────────────────────────────────────────────


def tem_escala(convocacao_padrao: Optional[str], funcao_id: Optional[uuid.UUID]) -> bool:
    """Escala de verdade: função na escala (gira/AM-18) ou tipo "só escalados" (faxina/AM-25)."""
    return funcao_id is not None or convocacao_padrao == CONVOCACAO_SO_ESCALADOS


def motivo_sem_troca(
    *,
    tem_linha: bool,
    convocado: bool,
    dispensado: bool,
    substituida: bool,
    convocacao_padrao: Optional[str],
    funcao_id: Optional[uuid.UUID],
    gira: bool,
    cancelada: bool,
    encerrada: bool,
    agora: datetime,
    inicio: datetime,
) -> Optional[str]:
    """Por que esta participação NÃO pode ser trocada agora (None = pode)."""
    if dispensado or substituida:
        return MSG_FORA_DA_ESCALA
    if gira and funcao_id is None:
        # Na gira a corrente toda já é esperada: só a função na escala tem troca.
        return MSG_GIRA_SEM_FUNCAO
    if not tem_linha or not convocado:
        return MSG_FORA_DA_ESCALA
    if not tem_escala(convocacao_padrao, funcao_id):
        return MSG_SEM_ESCALA
    if cancelada:
        return MSG_CANCELADA
    if encerrada:
        return MSG_ENCERRADA
    if agora >= inicio:
        return MSG_COMECOU
    return None


def esta_na_escala(p: AtividadeParticipacao, convocacao_padrao: Optional[str]) -> bool:
    """A linha conta como "já está nesta escala" (não pode ser substituto)."""
    return (
        bool(p.convocado)
        and p.dispensado_em is None
        and p.substituida_por_id is None
        and tem_escala(convocacao_padrao, p.funcao_id)
    )


def status_ao_aceitar(exige_aprovacao: bool) -> str:
    return TROCA_ACEITO if exige_aprovacao else TROCA_APROVADO


def aguardando(status: str, substituto_id: Optional[uuid.UUID]) -> Optional[str]:
    """Quem precisa agir: o colega (pedido com colega), a direção (aceito, ou pedido sem colega)."""
    if status == TROCA_PEDIDO:
        return AGUARDANDO_COLEGA if substituto_id is not None else AGUARDANDO_DIRECAO
    if status == TROCA_ACEITO:
        return AGUARDANDO_DIRECAO
    return None


def primeiro_nome(nome: Optional[str]) -> Optional[str]:
    partes = (nome or "").strip().split()
    return partes[0] if partes else None


def substituto_visivel(*, indicado_pela_direcao: bool, mostra_nome: bool) -> bool:
    """Quem pediu vê o nome do substituto? Sim se ele estava na lista (opt-in) ou ligou o opt-in."""
    return mostra_nome or not indicado_pela_direcao


def limpar_recado(texto: Optional[str]) -> Optional[str]:
    """Recado curto em texto simples (sem HTML/controle), até 200 letras. Vazio → None."""
    limpo = limpar_corpo(texto)
    if len(limpo) > RECADO_MAX:
        raise ValidationError(MSG_RECADO_LONGO)
    return limpo or None


# ── Consultas ───────────────────────────────────────────────────────────────


async def exige_aprovacao(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    valor = (
        await db.execute(
            select(TenantConfig.escala_troca_exige_aprovacao).where(TenantConfig.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    return True if valor is None else bool(valor)


async def mostram_nome(db: AsyncSession, tenant_id: uuid.UUID, medium_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    """Quais destes médiuns ligaram "Mostrar meu primeiro nome para os colegas de escala"."""
    ids = list({m for m in medium_ids if m is not None})
    if not ids:
        return set()
    rows = await db.execute(
        select(MediumPreferencia.medium_id).where(
            MediumPreferencia.tenant_id == tenant_id,
            MediumPreferencia.medium_id.in_(ids),
            MediumPreferencia.mostrar_nome_colegas.is_(True),
        )
    )
    return set(rows.scalars().all())


async def linhas_na_escala(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> set[uuid.UUID]:
    """Médiuns que já estão nesta escala (não podem ser o substituto)."""
    if ctx.atividade_id is None:
        return set()
    rows = await db.execute(
        select(AtividadeParticipacao).where(
            AtividadeParticipacao.tenant_id == tenant_id, AtividadeParticipacao.atividade_id == ctx.atividade_id
        )
    )
    convocacao = ctx.tipo.convocacao_padrao if ctx.tipo is not None else None
    return {p.medium_id for p in rows.scalars().all() if esta_na_escala(p, convocacao)}


async def colegas_elegiveis(
    db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx, solicitante_id: uuid.UUID
) -> list[Medium]:
    """Quem pode ir no lugar de `solicitante_id` nesta atividade (ordem por nome)."""
    if ctx.tipo is None:
        return []
    dia = ctx.inicio.astimezone(APP_TZ).date()
    ativos = (
        await db.execute(
            select(Medium)
            .where(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
                Medium.id != solicitante_id,
                or_(Medium.data_entrada.is_(None), Medium.data_entrada <= dia),
            )
            .order_by(Medium.nome)
        )
    ).scalars().all()
    elegiveis = await elegiveis_entre(db, tenant_id, ctx.tipo, list(ativos))
    ocupados = await linhas_na_escala(db, tenant_id, ctx)
    return [m for m in ativos if m.id in elegiveis and m.id not in ocupados]


async def colegas_visiveis(
    db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx, solicitante_id: uuid.UUID
) -> list[tuple[uuid.UUID, str]]:
    """(id, primeiro nome) dos colegas elegíveis que aceitaram aparecer (D-07), por primeiro nome."""
    colegas = await colegas_elegiveis(db, tenant_id, ctx, solicitante_id)
    mostram = await mostram_nome(db, tenant_id, [m.id for m in colegas])
    out = [(m.id, primeiro_nome(m.nome) or "Colega") for m in colegas if m.id in mostram]
    return sorted(out, key=lambda x: x[1].lower())


async def validar_substituto_do_tenant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ctx: AtividadeCtx,
    solicitante_id: uuid.UUID,
    substituto_id: uuid.UUID,
    *,
    so_visiveis: bool,
) -> Medium:
    """O substituto é médium ativo do terreiro que pode ir nesta atividade (e, na Área, que aceitou
    aparecer para os colegas); senão 422 — nada é gravado."""
    colegas = {m.id: m for m in await colegas_elegiveis(db, tenant_id, ctx, solicitante_id)}
    medium = colegas.get(substituto_id)
    if medium is None:
        raise ValidationError(MSG_COLEGA if so_visiveis else MSG_SUBSTITUTO)
    if so_visiveis and substituto_id not in await mostram_nome(db, tenant_id, [substituto_id]):
        raise ValidationError(MSG_COLEGA)
    return medium


async def participacao_travada(
    db: AsyncSession, tenant_id: uuid.UUID, participacao_id: uuid.UUID
) -> Optional[AtividadeParticipacao]:
    return (
        await db.execute(
            select(AtividadeParticipacao)
            .where(AtividadeParticipacao.id == participacao_id, AtividadeParticipacao.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def troca_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, troca_id: uuid.UUID) -> Optional[ParticipacaoTroca]:
    return (
        await db.execute(
            select(ParticipacaoTroca).where(ParticipacaoTroca.id == troca_id, ParticipacaoTroca.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def troca_travada(db: AsyncSession, tenant_id: uuid.UUID, troca_id: uuid.UUID) -> Optional[ParticipacaoTroca]:
    return (
        await db.execute(
            select(ParticipacaoTroca)
            .where(ParticipacaoTroca.id == troca_id, ParticipacaoTroca.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def troca_aberta_da_participacao(
    db: AsyncSession, tenant_id: uuid.UUID, participacao_id: uuid.UUID
) -> Optional[ParticipacaoTroca]:
    return (
        await db.execute(
            select(ParticipacaoTroca).where(
                ParticipacaoTroca.tenant_id == tenant_id,
                ParticipacaoTroca.participacao_id == participacao_id,
                ParticipacaoTroca.status.in_(STATUS_TROCA_ABERTOS),
            )
        )
    ).scalar_one_or_none()


def motivo_da_linha(ctx: AtividadeCtx, linha: Optional[AtividadeParticipacao], agora: datetime) -> Optional[str]:
    tipo = ctx.tipo
    return motivo_sem_troca(
        tem_linha=linha is not None,
        convocado=bool(linha is not None and linha.convocado),
        dispensado=linha is not None and linha.dispensado_em is not None,
        substituida=linha is not None and linha.substituida_por_id is not None,
        convocacao_padrao=tipo.convocacao_padrao if tipo is not None else None,
        funcao_id=linha.funcao_id if linha is not None else None,
        gira=ctx.origem == "gira",
        cancelada=ctx.cancelada,
        encerrada=ctx.encerrada_em is not None,
        agora=agora,
        inicio=ctx.inicio,
    )


async def pedir_troca(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ctx: AtividadeCtx,
    linha: AtividadeParticipacao,
    *,
    substituto_id: Optional[uuid.UUID],
    recado: Optional[str],
    agora: Optional[datetime] = None,
) -> ParticipacaoTroca:
    """Cria o pedido (sem commit). `linha` é a do solicitante, travada por quem chama; o
    substituto já foi conferido (`validar_substituto_do_tenant`)."""
    agora = agora or utc_now()
    motivo = motivo_da_linha(ctx, linha, agora)
    if motivo:
        raise ConflictError(motivo, details={"error_code": "SEM_TROCA"})
    if await troca_aberta_da_participacao(db, tenant_id, linha.id) is not None:
        raise ConflictError(MSG_JA_TEM_PEDIDO, details={"error_code": "TROCA_ABERTA"})
    troca = ParticipacaoTroca(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        atividade_id=linha.atividade_id,
        participacao_id=linha.id,
        solicitante_id=linha.medium_id,
        substituto_id=substituto_id,
        status=TROCA_PEDIDO,
        recado=limpar_recado(recado),
        created_at=agora,
        updated_at=agora,
    )
    db.add(troca)
    await db.flush()
    return troca


def fechar(troca: ParticipacaoTroca, status: str, por: str, agora: datetime, decidido_por: Optional[uuid.UUID] = None) -> None:
    troca.status = status
    troca.fechada_em = agora
    troca.fechada_por = por
    troca.decidido_por = decidido_por
    troca.updated_at = agora


async def conferir_vigente(
    db: AsyncSession, tenant_id: uuid.UUID, troca: ParticipacaoTroca, agora: datetime
) -> tuple[AtividadeCtx, AtividadeParticipacao]:
    """A troca ainda vale (escala de pé, atividade por vir)? Trava a linha original; senão 409."""
    if not troca.aberta:
        raise ConflictError(MSG_FECHADA, details={"error_code": "TROCA_FECHADA"})
    ctx = await ctx_da_atividade(db, tenant_id, troca.atividade_id)
    linha = await participacao_travada(db, tenant_id, troca.participacao_id)
    motivo = motivo_da_linha(ctx, linha, agora)
    if motivo == MSG_FORA_DA_ESCALA:
        motivo = "Quem pediu a troca não está mais nesta escala."
    if motivo:
        raise ConflictError(motivo, details={"error_code": "TROCA_VENCIDA"})
    assert linha is not None
    return ctx, linha


async def aplicar_troca(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    troca: ParticipacaoTroca,
    original: AtividadeParticipacao,
    substituto_id: uuid.UUID,
    *,
    por: str,
    decidido_por: Optional[uuid.UUID] = None,
    agora: Optional[datetime] = None,
) -> AtividadeParticipacao:
    """Aprova (sem commit): o substituto entra com a mesma função/grupo e a linha original fica
    "Substituído". Quem chama travou a troca e a original e conferiu o substituto no terreiro."""
    agora = agora or utc_now()
    nova = await upsert_participacao(
        db,
        tenant_id,
        original.atividade_id,
        substituto_id,
        origem=ORIGEM_TROCA,
        convocado=True,
        grupo_id=original.grupo_id,
    )
    nova.origem = ORIGEM_TROCA
    nova.convocado = True
    nova.funcao_id = original.funcao_id
    nova.grupo_id = original.grupo_id
    nova.dispensado_em = None
    nova.substituida_por_id = None
    nova.resposta = RESPOSTA_VOU
    nova.respondido_em = agora
    nova.justificativa = None
    nova.justificativa_em = None
    nova.updated_at = agora
    await db.flush()
    original.substituida_por_id = nova.id
    original.updated_at = agora
    troca.substituto_id = substituto_id
    troca.nova_participacao_id = nova.id
    fechar(troca, TROCA_APROVADO, por, agora, decidido_por)
    return nova


# ── Visão das trocas (painel e Área) ────────────────────────────────────────


@dataclass
class TrocaVisao:
    troca: ParticipacaoTroca
    ctx: AtividadeCtx
    funcao: Optional[str]
    grupo: Optional[str]
    solicitante_nome: str
    substituto_nome: Optional[str]
    substituto_mostra_nome: bool
    vigente: bool

    @property
    def aguardando(self) -> Optional[str]:
        return aguardando(self.troca.status, self.troca.substituto_id) if self.vigente else None

    def atividade_dict(self) -> dict:
        c = self.ctx
        return {
            "origem": c.origem,
            "id": str(c.ref_id),
            "atividade_id": str(c.atividade_id) if c.atividade_id else None,
            "titulo": c.titulo,
            "inicio": c.inicio,
            "tipo": tipo_resumo(c.tipo),
            "cancelada": c.cancelada,
        }


async def visoes(
    db: AsyncSession, tenant_id: uuid.UUID, trocas: Sequence[ParticipacaoTroca], agora: Optional[datetime] = None
) -> list[TrocaVisao]:
    """Monta a visão de cada troca (atividade, função/grupo da linha original, nomes)."""
    agora = agora or utc_now()
    if not trocas:
        return []
    linhas = {
        p.id: p
        for p in (
            await db.execute(
                select(AtividadeParticipacao).where(
                    AtividadeParticipacao.tenant_id == tenant_id,
                    AtividadeParticipacao.id.in_([t.participacao_id for t in trocas]),
                )
            )
        ).scalars().all()
    }
    medium_ids = {t.solicitante_id for t in trocas} | {t.substituto_id for t in trocas if t.substituto_id}
    nomes = dict(
        (await db.execute(select(Medium.id, Medium.nome).where(Medium.tenant_id == tenant_id, Medium.id.in_(medium_ids)))).all()
    )
    funcao_ids = {p.funcao_id for p in linhas.values() if p.funcao_id}
    grupo_ids = {p.grupo_id for p in linhas.values() if p.grupo_id}
    funcoes = (
        dict(
            (
                await db.execute(
                    select(FuncaoCorrente.id, FuncaoCorrente.nome).where(
                        FuncaoCorrente.tenant_id == tenant_id, FuncaoCorrente.id.in_(funcao_ids)
                    )
                )
            ).all()
        )
        if funcao_ids
        else {}
    )
    grupos = (
        dict(
            (
                await db.execute(
                    select(CorrenteGrupo.id, CorrenteGrupo.nome).where(
                        CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.id.in_(grupo_ids)
                    )
                )
            ).all()
        )
        if grupo_ids
        else {}
    )
    mostram = await mostram_nome(db, tenant_id, [t.substituto_id for t in trocas if t.substituto_id])
    ctxs: dict[uuid.UUID, Optional[AtividadeCtx]] = {}
    out: list[TrocaVisao] = []
    for t in trocas:
        if t.atividade_id not in ctxs:
            try:
                ctxs[t.atividade_id] = await ctx_da_atividade(db, tenant_id, t.atividade_id)
            except NotFoundError:  # atividade/gira excluída: some da lista
                ctxs[t.atividade_id] = None
        ctx = ctxs[t.atividade_id]
        if ctx is None:
            continue
        linha = linhas.get(t.participacao_id)
        vigente = t.aberta and motivo_da_linha(ctx, linha, agora) is None
        out.append(
            TrocaVisao(
                troca=t,
                ctx=ctx,
                funcao=funcoes.get(linha.funcao_id) if linha is not None and linha.funcao_id else None,
                grupo=grupos.get(linha.grupo_id) if linha is not None and linha.grupo_id else None,
                solicitante_nome=nomes.get(t.solicitante_id, "Médium"),
                substituto_nome=nomes.get(t.substituto_id) if t.substituto_id else None,
                substituto_mostra_nome=t.substituto_id in mostram,
                vigente=vigente,
            )
        )
    return out


async def trocas_do_terreiro(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    abertas: bool,
    atividade_id: Optional[uuid.UUID] = None,
    desde: Optional[datetime] = None,
    limite: int = 200,
) -> list[ParticipacaoTroca]:
    """Trocas do terreiro, mais novas primeiro (abertas, ou todas desde `desde`)."""
    stmt = select(ParticipacaoTroca).where(ParticipacaoTroca.tenant_id == tenant_id)
    if abertas:
        stmt = stmt.where(ParticipacaoTroca.status.in_(STATUS_TROCA_ABERTOS))
    if atividade_id is not None:
        stmt = stmt.where(ParticipacaoTroca.atividade_id == atividade_id)
    if desde is not None:
        stmt = stmt.where(ParticipacaoTroca.updated_at >= desde)
    rows = await db.execute(stmt.order_by(ParticipacaoTroca.created_at.desc()).limit(limite))
    return list(rows.scalars().all())


async def trocas_do_medium(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    medium_id: uuid.UUID,
    *,
    atividade_id: Optional[uuid.UUID] = None,
    desde: Optional[datetime] = None,
    limite: int = 50,
) -> list[ParticipacaoTroca]:
    """Trocas em que o médium pediu ou foi chamado para substituir, mais novas primeiro."""
    stmt = select(ParticipacaoTroca).where(
        ParticipacaoTroca.tenant_id == tenant_id,
        or_(ParticipacaoTroca.solicitante_id == medium_id, ParticipacaoTroca.substituto_id == medium_id),
    )
    if atividade_id is not None:
        stmt = stmt.where(ParticipacaoTroca.atividade_id == atividade_id)
    if desde is not None:
        stmt = stmt.where(or_(ParticipacaoTroca.updated_at >= desde, ParticipacaoTroca.status.in_(STATUS_TROCA_ABERTOS)))
    rows = await db.execute(stmt.order_by(ParticipacaoTroca.created_at.desc()).limit(limite))
    return list(rows.scalars().all())


async def substituicoes_da_atividade(
    db: AsyncSession, tenant_id: uuid.UUID, atividade_id: Optional[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """{medium substituído: medium substituto} das trocas aprovadas da atividade."""
    if atividade_id is None:
        return {}
    rows = await db.execute(
        select(ParticipacaoTroca.solicitante_id, ParticipacaoTroca.substituto_id).where(
            and_(
                ParticipacaoTroca.tenant_id == tenant_id,
                ParticipacaoTroca.atividade_id == atividade_id,
                ParticipacaoTroca.status == TROCA_APROVADO,
            )
        )
    )
    return {s: sub for s, sub in rows.all() if sub is not None}


TROCA_STATUS_FECHADOS = (TROCA_APROVADO, TROCA_RECUSADO, TROCA_CANCELADO)
