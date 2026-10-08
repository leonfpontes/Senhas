"""Lembretes e avisos por e-mail da Área do Médium (AM-15) — regras e consultas.

O agendador (`services/medium_lembrete_scheduler.py`) roda a cada 15 min e, para cada terreiro do
piloto, junta o que precisa sair agora. Aqui ficam:

- **regras puras** (testadas sem banco): janelas de horário em Brasília por tipo, dia do lembrete
  da mensalidade (D-29: 3 dias antes e 3 dias depois do vencimento), o que é "escala" (plano
  `escalas`) e o que é presença comum (plano `atividades_corrente`), formato de data em português;
- **consultas por terreiro** (recebem `tenant_id` e filtram por ele): quem recebe (médium ativo
  com acesso à Área e conta ativa com e-mail), preferências, mensalidades a lembrar, participações
  da escala, avisos com "Avisar por e-mail também" e as contagens do resumo do admin;
- **a marca de envio** (`reservar`): `INSERT ... ON CONFLICT DO NOTHING RETURNING` em
  `medium_lembretes_enviados`, gravada antes do envio. Duas rodadas ao mesmo tempo (2 workers)
  nunca mandam o mesmo lembrete duas vezes: a segunda espera o commit da primeira no índice único
  e não recebe a linha.

Nunca lê o texto do motivo de uma ausência (`atividade_participacoes.justificativa`): só se ele
existe (`IS NOT NULL`). O texto não pode ir para e-mail (§6.8 do plano).
"""
from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ..core.tz import APP_TZ
from ..models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    Comunicado,
    ComunicadoGrupo,
    CorrenteGrupo,
    FuncaoCorrente,
    Gira,
    Medium,
    MediumLembreteEnviado,
    MediumPreferencia,
    MensalidadeConfig,
    MensalidadePagamento,
    Tenant,
    TenantConfig,
    User,
    UserRole,
)
from ..models.medium_lembretes import (
    PREFERENCIA_DO_TIPO,
    PREFERENCIAS,
    TIPO_AVISO,
    TIPO_CANCELADA,
    TIPO_CONFIRMACAO,
    TIPO_ESCALA_NOVA,
    TIPO_FALTA,
    TIPO_MENSALIDADE_ANTES,
    TIPO_MENSALIDADE_DEPOIS,
    TIPO_PIX_ALTERADO,
    TIPO_RESUMO_ADMIN,
    TIPO_TROCA_APROVADA,
    TIPO_TROCA_PEDIDA,
    TIPO_TROCA_RESPOSTA,
    TIPO_VESPERA,
)
from ..models.mensalidades import MensalidadeStatus
from .medium_inicio import STATUS_ATRASADA, STATUS_PENDENTE, situacao_mensalidade, vencimento_do_mes

# ── Janelas (horário de Brasília, [início, fim) em horas) ───────────────────
# Lembrete com dia certo (véspera, D-2, D±3) só sai dentro da janela daquele dia; se o servidor
# ficou fora do ar a janela inteira, o lembrete do dia não sai depois (não faz sentido lembrar
# de ontem). Avisos de evento (aviso novo, cancelamento, PIX, escala nova) saem na rodada seguinte
# ao evento, mas nunca de madrugada.
JANELAS: dict[str, tuple[int, int]] = {
    TIPO_RESUMO_ADMIN: (8, 12),
    TIPO_MENSALIDADE_ANTES: (9, 20),
    TIPO_MENSALIDADE_DEPOIS: (9, 20),
    TIPO_CONFIRMACAO: (10, 20),
    TIPO_VESPERA: (18, 22),
    TIPO_FALTA: (9, 21),
    TIPO_AVISO: (7, 22),
    TIPO_CANCELADA: (7, 22),
    TIPO_PIX_ALTERADO: (7, 22),
    TIPO_ESCALA_NOVA: (7, 22),
    TIPO_TROCA_PEDIDA: (7, 22),
    TIPO_TROCA_RESPOSTA: (7, 22),
    TIPO_TROCA_APROVADA: (7, 22),
}

DIAS_MENSALIDADE = 3  # D-29: 3 dias antes e 3 dias depois do vencimento
DIAS_CONFIRMACAO = 2  # D-2: "Vou / Não vou" ainda sem resposta
# Eventos (aviso, cancelamento, troca do PIX, escala nova) só valem por este tempo depois de
# acontecerem: evita mandar e-mail de algo antigo quando a casa liga a Área ou o terreiro volta ao
# plano.
JANELA_EVENTO = timedelta(days=2)
JANELA_AVISO = timedelta(days=3)
# Escala nova: a participação nasceu há pouco e a atividade é depois de amanhã ou mais tarde (para
# amanhã, o lembrete da véspera já cobre).
DIAS_MIN_ESCALA_NOVA = 2
# D-2 não repete o e-mail de "você está na escala" do mesmo dia.
CONFIRMACAO_IDADE_MIN = timedelta(hours=24)
HORIZONTE_FALTA = timedelta(days=31)

# Origens da participação que vêm da escala (AM-18/AM-25; `troca` do AM-27) — exigem o plano `escalas`.
ORIGENS_ESCALA = frozenset({"funcao", "rodizio", "troca"})
ORIGEM_ATIVIDADE_ESCALA = "plano_escala"

DIAS_DA_SEMANA = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")
MESES = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)

ROTULO_PREFERENCIA = {
    "mensalidade": "lembretes da mensalidade",
    "escalas": "avisos de escala e atividades",
    "confirmacao": "pedidos de resposta (Vou / Não vou)",
    "faltas": "convites para contar o motivo de uma ausência",
    "avisos": "avisos da casa",
}


# ── Regras puras ────────────────────────────────────────────────────────────


def local(agora: datetime) -> datetime:
    return agora.astimezone(APP_TZ)


def janela_aberta(tipo: str, agora: datetime) -> bool:
    """O tipo pode sair agora (hora de Brasília dentro da janela do tipo)?"""
    inicio, fim = JANELAS[tipo]
    return inicio <= local(agora).hour < fim


def tipo_lembrete_mensalidade(hoje: date, vencimento: date) -> Optional[str]:
    """D-29: `mensalidade_antes` 3 dias antes, `mensalidade_depois` 3 dias depois; senão None."""
    if hoje == vencimento - timedelta(days=DIAS_MENSALIDADE):
        return TIPO_MENSALIDADE_ANTES
    if hoje == vencimento + timedelta(days=DIAS_MENSALIDADE):
        return TIPO_MENSALIDADE_DEPOIS
    return None


def meses_candidatos(hoje: date) -> list[date]:
    """Meses cujo vencimento pode cair a 3 dias de hoje (o anterior, o atual e o seguinte)."""
    atual = hoje.replace(day=1)
    anterior = (atual - timedelta(days=1)).replace(day=1)
    seguinte = (atual + timedelta(days=32)).replace(day=1)
    return [anterior, atual, seguinte]


def mensalidade_pede_lembrete(status: Optional[str]) -> bool:
    """Só em aberto sem comprovante: pendente (antes) ou atrasada (depois). Comprovante em
    conferência, não confirmado (o médium já vê o motivo), paga e isento não recebem."""
    return status in (STATUS_PENDENTE, STATUS_ATRASADA)


def eh_escala(origem_participacao: Optional[str], funcao_id: Optional[uuid.UUID], origem_atividade: Optional[str]) -> bool:
    """Escala de gira por função/rodízio (AM-18) ou da faxina planejada (AM-25) → plano `escalas`."""
    return (
        funcao_id is not None
        or (origem_participacao or "") in ORIGENS_ESCALA
        or origem_atividade == ORIGEM_ATIVIDADE_ESCALA
    )


def plano_permite(escala: bool, escalas: bool, atividades_corrente: bool) -> bool:
    """Lembrete de escala só com `escalas` (Pro); os demais de atividade com `atividades_corrente`."""
    return escalas if escala else atividades_corrente


def preferencia_ligada(preferencia: Optional[MediumPreferencia], tipo: str) -> bool:
    """Sem linha de preferência = tudo ligado (padrão)."""
    if preferencia is None:
        return True
    return preferencia.ligado(PREFERENCIA_DO_TIPO[tipo])


def quando_legivel(inicio: datetime) -> str:
    """"sábado, 12/10, às 9h" (ou "às 9h30") no horário de Brasília."""
    d = local(inicio)
    hora = f"{d.hour}h" if d.minute == 0 else f"{d.hour}h{d.minute:02d}"
    return f"{DIAS_DA_SEMANA[d.weekday()]}, {d.day:02d}/{d.month:02d}, às {hora}"


def data_legivel(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}"


def mes_legivel(mes: date) -> str:
    return f"{MESES[mes.month - 1]} de {mes.year}"


def valor_legivel(valor: Optional[float | Decimal]) -> Optional[str]:
    if valor is None or valor <= 0:
        return None
    inteiro, centavos = f"{Decimal(str(valor)):.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro},{centavos}"


def novo_token() -> str:
    return secrets.token_urlsafe(32)


# ── Terreiros e destinatários ───────────────────────────────────────────────


async def terreiros_do_piloto(db: AsyncSession) -> list[uuid.UUID]:
    """Terreiros ativos com a chave do piloto (`area_medium_liberada`). Cross-tenant por design: o
    agendador varre todos e cada terreiro é processado com o próprio `tenant_id` em seguida."""
    rows = await db.execute(
        select(Tenant.id).where(
            Tenant.area_medium_liberada.is_(True),
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    return [r[0] for r in rows.all()]


@dataclass(frozen=True)
class Destinatario:
    medium_id: uuid.UUID
    nome: str
    email: str
    is_atendimento: bool
    isento: bool
    data_entrada: Optional[date]


async def destinatarios(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, Destinatario]:
    """Médiuns ativos do terreiro com acesso à Área: vínculo com conta ativa e com e-mail."""
    rows = await db.execute(
        select(
            Medium.id,
            Medium.nome,
            User.email,
            Medium.is_atendimento,
            Medium.mensalidade_isento,
            Medium.data_entrada,
        )
        .join(User, User.id == Medium.user_id)
        .where(
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
            User.email.is_not(None),
        )
    )
    return {
        r[0]: Destinatario(
            medium_id=r[0],
            nome=r[1],
            email=r[2],
            is_atendimento=bool(r[3]),
            isento=bool(r[4]),
            data_entrada=r[5],
        )
        for r in rows.all()
        if (r[2] or "").strip()
    }


async def emails_dos_admins(db: AsyncSession, tenant_id: uuid.UUID) -> list[str]:
    rows = await db.execute(
        select(User.email).where(
            User.tenant_id == tenant_id,
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
            User.email.is_not(None),
        )
    )
    return sorted({r[0] for r in rows.all() if (r[0] or "").strip()})


async def lembrete_mensalidade_ligado(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """A casa deixou os lembretes da mensalidade ligados (padrão sim)."""
    valor = (
        await db.execute(
            select(TenantConfig.area_medium_lembrete_mensalidade).where(TenantConfig.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    return True if valor is None else bool(valor)


# ── Preferências e marca de envio ───────────────────────────────────────────


async def preferencias_do_terreiro(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, MediumPreferencia]:
    rows = await db.execute(select(MediumPreferencia).where(MediumPreferencia.tenant_id == tenant_id))
    return {p.medium_id: p for p in rows.scalars().all()}


async def garantir_preferencia(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> MediumPreferencia:
    """A linha de preferências do médium (cria com tudo ligado e um token novo). Sem commit."""
    await db.execute(
        pg_insert(MediumPreferencia)
        .values(id=uuid.uuid4(), tenant_id=tenant_id, medium_id=medium_id, token_descadastro=novo_token())
        .on_conflict_do_nothing(index_elements=["medium_id"])
    )
    return (
        await db.execute(
            select(MediumPreferencia).where(
                MediumPreferencia.tenant_id == tenant_id, MediumPreferencia.medium_id == medium_id
            )
        )
    ).scalar_one()


async def reservar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tipo: str,
    referencia: str,
    medium_id: Optional[uuid.UUID] = None,
) -> bool:
    """Grava a marca "já mandei" e devolve True só para quem gravou. Sem commit — quem chama faz
    o commit ANTES de enviar. Uma segunda transação com a mesma chave espera esta no índice único
    e recebe False."""
    stmt = (
        pg_insert(MediumLembreteEnviado)
        .values(id=uuid.uuid4(), tenant_id=tenant_id, tipo=tipo, referencia=referencia[:80], medium_id=medium_id)
        .on_conflict_do_nothing()
        .returning(MediumLembreteEnviado.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


# ── Mensalidade ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class MensalidadeALembrar:
    medium_id: uuid.UUID
    tipo: str
    mes: date
    vencimento: date
    valor: Optional[float]


async def mensalidades_a_lembrar(
    db: AsyncSession, tenant_id: uuid.UUID, hoje: date, dest: dict[uuid.UUID, Destinatario]
) -> list[MensalidadeALembrar]:
    """D-29: hoje é 3 dias antes ou 3 dias depois do vencimento, o mês está em aberto e sem
    comprovante (a mesma regra do Início, `situacao_mensalidade`). Isento não recebe."""
    config = (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if config is None or not config.ativo:
        return []
    meses = [(m, tipo_lembrete_mensalidade(hoje, vencimento_do_mes(m, config.dia_vencimento))) for m in meses_candidatos(hoje)]
    meses = [(m, t) for m, t in meses if t is not None]
    if not meses or not dest:
        return []
    pagamentos = {
        (p.mediun_id, p.mes_referencia): p
        for p in (
            await db.execute(
                select(MensalidadePagamento).where(
                    MensalidadePagamento.tenant_id == tenant_id,
                    MensalidadePagamento.mes_referencia.in_([m for m, _ in meses]),
                    MensalidadePagamento.mediun_id.in_(list(dest)),
                )
            )
        ).scalars().all()
    }
    out: list[MensalidadeALembrar] = []
    for medium_id, d in dest.items():
        if d.isento:
            continue
        for mes, tipo in meses:
            p = pagamentos.get((medium_id, mes))
            situacao = situacao_mensalidade(
                hoje=hoje,
                mes=mes,
                data_entrada=d.data_entrada,
                isento_permanente=d.isento,
                valor_config=config.valor_mensal,
                dia_vencimento=config.dia_vencimento,
                pagamento_status=p.status if p else None,
                pagamento_valor_vigente=p.valor_vigente if p else None,
                pagamento_valor_pago=p.valor_pago if p else None,
                pagamento_data=p.data_pagamento if p else None,
                comprovante_enviado_em=p.comprovante_enviado_em if p else None,
                comprovante_presente=bool(p and p.comprovante_filename),
                recusado_em=p.recusado_em if p else None,
            )
            if situacao is None or not mensalidade_pede_lembrete(situacao.status):
                continue
            out.append(
                MensalidadeALembrar(
                    medium_id=medium_id,
                    tipo=tipo,
                    mes=mes,
                    vencimento=situacao.vencimento or vencimento_do_mes(mes, config.dia_vencimento),
                    valor=situacao.valor,
                )
            )
    return out


async def troca_do_pix(db: AsyncSession, tenant_id: uuid.UUID, agora: datetime) -> Optional[datetime]:
    """Quando a casa trocou a chave PIX, se foi há menos de 2 dias e a mensalidade está ativa."""
    row = (
        await db.execute(
            select(MensalidadeConfig.pix_alterado_em, MensalidadeConfig.pix_chave, MensalidadeConfig.ativo).where(
                MensalidadeConfig.tenant_id == tenant_id
            )
        )
    ).first()
    if row is None or row[0] is None or not (row[1] or "").strip() or not row[2]:
        return None
    if row[0] < agora - JANELA_EVENTO or row[0] > agora:
        return None
    return row[0]


# ── Atividades e escalas ────────────────────────────────────────────────────


@dataclass
class ParticipacaoLembrete:
    medium_id: uuid.UUID
    atividade_id: uuid.UUID
    origem: str  # "gira" | "atividade" (rota da Área: /medium/agenda/{origem}/{ref_id})
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    fim: datetime
    local: Optional[str]
    grupo: Optional[str]
    funcao: Optional[str]
    escala: bool
    convocado: bool
    resposta: str
    presenca: str
    tem_justificativa: bool
    dispensado_em: Optional[datetime]
    substituida: bool
    cancelada_em: Optional[datetime]
    cancelamento_motivo: Optional[str]
    pede_confirmacao: bool
    controla_presenca: bool
    criada_em: datetime
    presenca_registrada_em: Optional[datetime]
    extras: dict = field(default_factory=dict)

    @property
    def ativa_na_escala(self) -> bool:
        """Está esperado: convocado ou disse "vou", sem dispensa nem troca, não disse "não vou"."""
        return (
            (self.convocado or self.resposta == "vou")
            and self.resposta != "nao_vou"
            and self.dispensado_em is None
            and not self.substituida
            and self.cancelada_em is None
        )


async def participacoes(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    inicio_de: datetime,
    inicio_ate: datetime,
    canceladas_desde: Optional[datetime] = None,
) -> list[ParticipacaoLembrete]:
    """Participações do terreiro em atividades/giras que começam no intervalo. A âncora de gira lê
    nome, data e local da gira (gira excluída ou desativada some). O texto do motivo nunca é lido."""
    tipo = aliased(AtividadeTipo)
    inicio = func.coalesce(Atividade.inicio, Gira.data_inicio)
    fim = func.coalesce(Atividade.fim, Gira.data_fim)
    stmt = (
        select(
            AtividadeParticipacao.medium_id,
            Atividade.id,
            Atividade.gira_id,
            func.coalesce(Gira.nome, Atividade.titulo, tipo.nome),
            inicio,
            fim,
            func.coalesce(Atividade.local, Gira.local),
            CorrenteGrupo.nome,
            FuncaoCorrente.nome,
            AtividadeParticipacao.origem,
            AtividadeParticipacao.funcao_id,
            Atividade.origem,
            AtividadeParticipacao.convocado,
            AtividadeParticipacao.resposta,
            AtividadeParticipacao.presenca,
            AtividadeParticipacao.justificativa.is_not(None),
            AtividadeParticipacao.dispensado_em,
            AtividadeParticipacao.substituida_por_id.is_not(None),
            Atividade.cancelada_em,
            Atividade.cancelamento_motivo,
            tipo.pede_confirmacao,
            tipo.controla_presenca,
            AtividadeParticipacao.created_at,
            AtividadeParticipacao.presenca_registrada_em,
            tipo.duracao_min,
        )
        .join(Atividade, Atividade.id == AtividadeParticipacao.atividade_id)
        .join(tipo, tipo.id == Atividade.tipo_id)
        .outerjoin(Gira, and_(Gira.id == Atividade.gira_id, Gira.tenant_id == tenant_id))
        .outerjoin(
            CorrenteGrupo,
            and_(CorrenteGrupo.id == AtividadeParticipacao.grupo_id, CorrenteGrupo.tenant_id == tenant_id),
        )
        .outerjoin(
            FuncaoCorrente,
            and_(FuncaoCorrente.id == AtividadeParticipacao.funcao_id, FuncaoCorrente.tenant_id == tenant_id),
        )
        .where(
            AtividadeParticipacao.tenant_id == tenant_id,
            Atividade.tenant_id == tenant_id,
            tipo.tenant_id == tenant_id,
            Atividade.deleted_at.is_(None),
            or_(Atividade.gira_id.is_(None), and_(Gira.deleted_at.is_(None), Gira.is_active.is_(True))),
            inicio >= inicio_de,
            inicio < inicio_ate,
        )
    )
    if canceladas_desde is not None:
        stmt = stmt.where(Atividade.cancelada_em.is_not(None), Atividade.cancelada_em >= canceladas_desde)
    from .presenca import fim_efetivo

    out: list[ParticipacaoLembrete] = []
    for r in (await db.execute(stmt)).all():
        gira_id = r[2]
        out.append(
            ParticipacaoLembrete(
                medium_id=r[0],
                atividade_id=r[1],
                origem="gira" if gira_id else "atividade",
                ref_id=gira_id or r[1],
                titulo=r[3] or "Atividade da casa",
                inicio=r[4],
                fim=fim_efetivo(r[4], r[5], r[24]),
                local=r[6],
                grupo=r[7],
                funcao=r[8],
                escala=eh_escala(r[9], r[10], r[11]),
                convocado=bool(r[12]),
                resposta=r[13],
                presenca=r[14],
                tem_justificativa=bool(r[15]),
                dispensado_em=r[16],
                substituida=bool(r[17]),
                cancelada_em=r[18],
                cancelamento_motivo=r[19],
                pede_confirmacao=bool(r[20]),
                controla_presenca=bool(r[21]),
                criada_em=r[22],
                presenca_registrada_em=r[23],
            )
        )
    out.sort(key=lambda p: (p.inicio, str(p.atividade_id), str(p.medium_id)))
    return out


def inicio_do_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, tzinfo=APP_TZ)


def para_vespera(p: ParticipacaoLembrete, amanha: date) -> bool:
    return local(p.inicio).date() == amanha and p.ativa_na_escala


def para_confirmacao(p: ParticipacaoLembrete, dia: date, agora: datetime) -> bool:
    """D-2: na escala (convocado), sem resposta, tipo que pede "Vou / Não vou"."""
    return (
        local(p.inicio).date() == dia
        and p.convocado
        and p.resposta == "sem_resposta"
        and p.pede_confirmacao
        and p.dispensado_em is None
        and not p.substituida
        and p.cancelada_em is None
        and p.criada_em <= agora - CONFIRMACAO_IDADE_MIN
    )


def para_escala_nova(p: ParticipacaoLembrete, hoje: date, agora: datetime) -> bool:
    return (
        p.convocado
        and p.resposta == "sem_resposta"
        and p.criada_em >= agora - JANELA_EVENTO
        and local(p.inicio).date() >= hoje + timedelta(days=DIAS_MIN_ESCALA_NOVA)
        and p.dispensado_em is None
        and not p.substituida
        and p.cancelada_em is None
    )


def para_falta(p: ParticipacaoLembrete, hoje: date, agora: datetime, prazo_dias: int) -> Optional[date]:
    """Marcado ausente, sem motivo contado e ainda no prazo da casa → o prazo; senão None."""
    from .presenca import dentro_do_prazo, prazo_justificativa

    if p.presenca != "ausente" or p.tem_justificativa or p.dispensado_em is not None or p.substituida:
        return None
    if not p.controla_presenca or p.cancelada_em is not None:
        return None
    if p.presenca_registrada_em is None or p.presenca_registrada_em < agora - HORIZONTE_FALTA:
        return None
    prazo = prazo_justificativa(p.fim, prazo_dias)
    return prazo if dentro_do_prazo(hoje, prazo) else None


def para_cancelada(p: ParticipacaoLembrete, agora: datetime) -> bool:
    """Cancelada há pouco, ainda no futuro, e a pessoa estava na escala quando cancelaram."""
    return (
        p.cancelada_em is not None
        and agora - JANELA_EVENTO <= p.cancelada_em <= agora
        and p.inicio > agora
        and (p.convocado or p.resposta == "vou")
        and p.resposta != "nao_vou"
        and p.dispensado_em is not None
        and p.dispensado_em == p.cancelada_em
        and not p.substituida
    )


# ── Trocas de escala (AM-27) ────────────────────────────────────────────────


async def trocas_para_email(db: AsyncSession, tenant_id: uuid.UUID, agora: datetime) -> list:
    """Trocas do terreiro que mudaram há pouco (`JANELA_EVENTO`) de atividades que ainda não
    começaram — o agendador decide quem recebe o quê pelo status (`services/trocas_escala.visoes`)."""
    from .trocas_escala import trocas_do_terreiro, visoes

    trocas = await trocas_do_terreiro(db, tenant_id, abertas=False, desde=agora - JANELA_EVENTO)
    return [v for v in await visoes(db, tenant_id, trocas, agora) if v.ctx.inicio > agora and not v.ctx.cancelada]


def eventos_da_troca(status: str, fechada_por: Optional[str], tem_substituto: bool, vigente: bool) -> list[tuple[str, str, str]]:
    """[(tipo, destino, sufixo da referência)] de uma troca (regra pura). `destino`: `substituto` ou
    `solicitante`; a referência é `<id da troca>` + sufixo (um e-mail por mudança)."""
    if status == "pedido":
        return [(TIPO_TROCA_PEDIDA, "substituto", "")] if tem_substituto and vigente else []
    if status == "aceito":
        return [(TIPO_TROCA_RESPOSTA, "solicitante", ":aceito")]
    if status == "recusado":
        quem = "recusado_direcao" if fechada_por == "direcao" else "recusado_colega"
        return [(TIPO_TROCA_RESPOSTA, "solicitante", f":{quem}")]
    if status == "cancelado" and fechada_por == "direcao":
        return [(TIPO_TROCA_RESPOSTA, "solicitante", ":cancelado_direcao")]
    if status == "aprovado":
        return [(TIPO_TROCA_APROVADA, "solicitante", ""), (TIPO_TROCA_APROVADA, "substituto", "")]
    return []


# ── Avisos com "Avisar por e-mail também" ───────────────────────────────────


@dataclass(frozen=True)
class AvisoPorEmail:
    id: uuid.UUID
    titulo: str
    corpo: str
    publico: str
    grupos: frozenset


async def avisos_para_email(db: AsyncSession, tenant_id: uuid.UUID, agora: datetime) -> list[AvisoPorEmail]:
    """Publicados, no ar e com a opção ligada; só nos 3 dias depois da publicação (ou de ligar a opção)."""
    marco = func.greatest(Comunicado.publicar_em, func.coalesce(Comunicado.avisar_email_em, Comunicado.publicar_em))
    comunicados = (
        await db.execute(
            select(Comunicado).where(
                Comunicado.tenant_id == tenant_id,
                Comunicado.deleted_at.is_(None),
                Comunicado.avisar_email.is_(True),
                Comunicado.publicar_em <= agora,
                or_(Comunicado.expira_em.is_(None), Comunicado.expira_em > agora),
                marco >= agora - JANELA_AVISO,
            )
        )
    ).scalars().all()
    if not comunicados:
        return []
    grupos: dict[uuid.UUID, set[uuid.UUID]] = {}
    rows = await db.execute(
        select(ComunicadoGrupo.comunicado_id, ComunicadoGrupo.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == ComunicadoGrupo.grupo_id)
        .where(
            ComunicadoGrupo.tenant_id == tenant_id,
            ComunicadoGrupo.comunicado_id.in_([c.id for c in comunicados]),
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    for comunicado_id, grupo_id in rows.all():
        grupos.setdefault(comunicado_id, set()).add(grupo_id)
    return [
        AvisoPorEmail(
            id=c.id, titulo=c.titulo, corpo=c.corpo, publico=c.publico, grupos=frozenset(grupos.get(c.id, set()))
        )
        for c in sorted(comunicados, key=lambda c: c.publicar_em)
    ]


# ── Resumo diário do admin ──────────────────────────────────────────────────


@dataclass(frozen=True)
class ResumoAdmin:
    comprovantes: int = 0
    ausencias: int = 0
    motivos: int = 0

    @property
    def vazio(self) -> bool:
        return not (self.comprovantes or self.ausencias or self.motivos)


async def resumo_admin(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agora: datetime,
    *,
    com_mensalidade: bool,
    com_presenca: bool,
) -> ResumoAdmin:
    """Contagens (nada de nome nem texto): comprovantes esperando conferência (a mesma fila do
    painel), "Não vou" das últimas 24 h e motivos contados depois de uma ausência nas últimas 24 h."""
    desde = agora - timedelta(hours=24)
    comprovantes = 0
    if com_mensalidade:
        comprovantes = (
            await db.execute(
                select(func.count(MensalidadePagamento.id))
                .join(Medium, and_(Medium.id == MensalidadePagamento.mediun_id, Medium.tenant_id == tenant_id))
                .where(
                    MensalidadePagamento.tenant_id == tenant_id,
                    MensalidadePagamento.status == MensalidadeStatus.PENDENTE,
                    MensalidadePagamento.comprovante_enviado_em.is_not(None),
                    MensalidadePagamento.comprovante_filename.is_not(None),
                    or_(
                        MensalidadePagamento.recusado_em.is_(None),
                        MensalidadePagamento.recusado_em < MensalidadePagamento.comprovante_enviado_em,
                    ),
                    Medium.deleted_at.is_(None),
                )
            )
        ).scalar_one()
    ausencias = motivos = 0
    if com_presenca:
        ausencias = (
            await db.execute(
                select(func.count(AtividadeParticipacao.id)).where(
                    AtividadeParticipacao.tenant_id == tenant_id,
                    AtividadeParticipacao.resposta == "nao_vou",
                    AtividadeParticipacao.respondido_em >= desde,
                    AtividadeParticipacao.respondido_em <= agora,
                    AtividadeParticipacao.dispensado_em.is_(None),
                )
            )
        ).scalar_one()
        motivos = (
            await db.execute(
                select(func.count(AtividadeParticipacao.id)).where(
                    AtividadeParticipacao.tenant_id == tenant_id,
                    AtividadeParticipacao.presenca == "ausente",
                    AtividadeParticipacao.justificativa_em >= desde,
                    AtividadeParticipacao.justificativa_em <= agora,
                )
            )
        ).scalar_one()
    return ResumoAdmin(comprovantes=int(comprovantes or 0), ausencias=int(ausencias or 0), motivos=int(motivos or 0))


def preferencias_payload(preferencia: Optional[MediumPreferencia]) -> dict[str, bool]:
    return {p: (True if preferencia is None else preferencia.ligado(p)) for p in PREFERENCIAS}
