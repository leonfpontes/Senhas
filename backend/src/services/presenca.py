"""Presença (AM-17/AM-28) — convocação, resposta, check-in, chamada e QR do dia.

Quem usa: `api/v1/medium/presencas.py` (Área: vou/não vou, "Cheguei", "Conte o motivo",
minhas presenças), `api/v1/medium/agenda.py`/`inicio.py` (minha participação),
`api/v1/admin/atividades_presenca.py` (confirmações, convocar, chamada, QR) e o agendador
`services/presenca_scheduler.py` (encerramento automático em 48 h).

Regras (§8.4 a §8.6 do plano da Área do Médium):

- **Convocação**: tipo com `convocacao_padrao = 'todos_elegiveis'` (gira, ritual coletivo,
  reunião) convoca de forma VIRTUAL todo médium ativo que o tipo alcança — a linha em
  `atividade_participacoes` só nasce quando ele responde, faz check-in, é escalado ou quando a
  chamada é encerrada (`encerrar_chamada` materializa todos os elegíveis, para o relatório ter
  denominador). Tipo "só escalados": só quem tem linha com `convocado = true` (escala ou
  "Convocar" manual). Quem veio sem estar convocado entra na chamada como `avulso`.
- **Situação** (`situacao`): derivada de resposta, presença, justificativa e dispensa — nada
  disso é gravado como "situação".
- **Modo de presença** (`modo_efetivo`, D-11): o do tipo (`atividade_tipos.presenca_modo`) ou o
  padrão da casa (`tenant_configs.presenca_modo_padrao`). Confiança: "vou" conta como presente
  ao fim, salvo ausência marcada (não há "Cheguei"). App: "Cheguei" na janela do tipo. QR: o
  "Cheguei" exige o código do dia (`codigo_qr`), que muda a cada 60 s.
- **Prazos**: resposta até o início; justificativa até N dias depois da atividade (padrão 7,
  `tenant_configs.presenca_prazo_justificativa_dias`); chamada sem encerrar fecha sozinha 48 h
  depois do fim só se houve presença registrada (no modo confiança, um "vou" conta).
- **Concorrência**: `upsert_participacao` faz `INSERT ... ON CONFLICT DO NOTHING` + `SELECT
  ... FOR UPDATE` — "Cheguei" e chamada ao mesmo tempo nunca duplicam a linha (único
  `atividade_id` + `medium_id`).
- **Justificativa** (§6.8): pode ter dado de saúde. Nunca vai para auditoria, e-mail, push ou
  exportação; no painel só com `ESCALAS:view`.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import AbstractSet, Optional, Sequence
from urllib.parse import parse_qs, urlparse

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.errors import NotFoundError, ValidationError
from ..core.tz import APP_TZ, utc_now
from ..models.atividades import (
    JUSTIFICATIVA_MAX,
    MODOS_PRESENCA,
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    AtividadeTipoGrupo,
)
from ..models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from ..models.giras import Gira
from ..models.mediuns import Medium
from ..models.tenant_config import TenantConfig
from .atividades import atividade_da_gira, ensure_default_atividade_tipos, medium_elegivel, tipo_da_gira
from .comunicados import limpar_corpo

MODO_CONFIANCA = "confianca"
MODO_APP = "app"
MODO_QR = "qr"
MODO_PADRAO = MODO_CONFIANCA
PRAZO_JUSTIFICATIVA_PADRAO = 7
PRAZO_JUSTIFICATIVA_MIN = 1
PRAZO_JUSTIFICATIVA_MAX = 30

RESPOSTA_SEM = "sem_resposta"
RESPOSTA_VOU = "vou"
RESPOSTA_NAO_VOU = "nao_vou"
PRESENCA_NAO_REGISTRADA = "nao_registrada"
PRESENCA_PRESENTE = "presente"
PRESENCA_AUSENTE = "ausente"

# Situações derivadas (§8.5) — os rótulos da tela ficam no front (`constants/presenca.ts`).
SITUACAO_CONVOCADO = "convocado"
SITUACAO_CONFIRMADO = "confirmado"
SITUACAO_AUSENCIA_AVISADA = "ausencia_avisada"
SITUACAO_PRESENTE = "presente"
SITUACAO_AUSENTE_JUSTIFICADO = "ausente_justificado"
SITUACAO_AUSENTE = "ausente"
SITUACAO_DISPENSADO = "dispensado"
SITUACAO_SUBSTITUIDO = "substituido"
SITUACOES = (
    SITUACAO_CONVOCADO,
    SITUACAO_CONFIRMADO,
    SITUACAO_AUSENCIA_AVISADA,
    SITUACAO_PRESENTE,
    SITUACAO_AUSENTE_JUSTIFICADO,
    SITUACAO_AUSENTE,
    SITUACAO_DISPENSADO,
    SITUACAO_SUBSTITUIDO,
)

# Atividade sem fim nem duração: vale como 3 h (o mesmo da agenda do celular).
DURACAO_PADRAO = timedelta(hours=3)
# Encerramento automático da chamada (D-12).
AUTO_ENCERRAR_DEPOIS = timedelta(hours=48)

# QR do dia (AM-28): código curto, sem letras/números que se confundem (0/O, 1/I/L).
QR_ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
QR_TAMANHO = 6
QR_INTERVALO_S = 60
# Aceita o código da janela atual e o da anterior (quem escaneou no fim do minuto).
QR_TOLERANCIA_JANELAS = 1

MSG_JUSTIFICATIVA = f"Conte o motivo (até {JUSTIFICATIVA_MAX} letras)."
MSG_JUSTIFICATIVA_LONGA = f"O motivo vai até {JUSTIFICATIVA_MAX} letras."


# ── Regras puras ────────────────────────────────────────────────────────────


def validar_modo(valor: Optional[str], *, permite_nulo: bool = False) -> Optional[str]:
    if valor is None or valor == "":
        if permite_nulo:
            return None
        raise ValidationError("Escolha um dos modos de presença.")
    if valor not in MODOS_PRESENCA:
        raise ValidationError("Escolha um dos modos de presença.")
    return valor


def validar_prazo(dias: int) -> int:
    if not PRAZO_JUSTIFICATIVA_MIN <= dias <= PRAZO_JUSTIFICATIVA_MAX:
        raise ValidationError(
            f"O prazo para contar o motivo vai de {PRAZO_JUSTIFICATIVA_MIN} a {PRAZO_JUSTIFICATIVA_MAX} dias."
        )
    return dias


def modo_efetivo(modo_tipo: Optional[str], modo_casa: Optional[str]) -> str:
    """Modo do tipo, ou o padrão da casa, ou confiança."""
    if modo_tipo in MODOS_PRESENCA:
        return modo_tipo
    if modo_casa in MODOS_PRESENCA:
        return modo_casa
    return MODO_PADRAO


def fim_efetivo(inicio: datetime, fim: Optional[datetime], duracao_min: Optional[int] = None) -> datetime:
    """Fim informado; senão início + duração do tipo; senão início + 3 h."""
    if fim is not None and fim > inicio:
        return fim
    if duracao_min:
        return inicio + timedelta(minutes=duracao_min)
    return inicio + DURACAO_PADRAO


def janela_checkin(inicio: datetime, antes_min: int, depois_min: int) -> tuple[datetime, datetime]:
    """(abre, fecha) do "Cheguei": de `antes_min` antes a `depois_min` depois do início."""
    return inicio - timedelta(minutes=antes_min), inicio + timedelta(minutes=depois_min)


def dentro_da_janela(agora: datetime, abre: datetime, fecha: datetime) -> bool:
    return abre <= agora <= fecha


def situacao(
    *,
    convocado: bool,
    resposta: str = RESPOSTA_SEM,
    presenca: str = PRESENCA_NAO_REGISTRADA,
    justificativa: Optional[str] = None,
    dispensado: bool = False,
    substituido: bool = False,
    cancelada: bool = False,
    confianca_terminou: bool = False,
) -> str:
    """Situação na tela (§8.5). Ordem: substituído → dispensado (ou atividade cancelada) →
    presente (vale mesmo com "não vou") → ausente com/sem justificativa → ausência avisada →
    confirmado → convocado.

    `confianca_terminou`: modo confiança e a atividade já acabou — "vou" sem ausência marcada já
    conta como presente (o encerramento grava isso).
    """
    if substituido:
        return SITUACAO_SUBSTITUIDO
    if dispensado or cancelada:
        return SITUACAO_DISPENSADO
    if presenca == PRESENCA_PRESENTE:
        return SITUACAO_PRESENTE
    if presenca == PRESENCA_AUSENTE:
        return SITUACAO_AUSENTE_JUSTIFICADO if (justificativa or "").strip() else SITUACAO_AUSENTE
    if resposta == RESPOSTA_NAO_VOU:
        return SITUACAO_AUSENCIA_AVISADA
    if resposta == RESPOSTA_VOU:
        return SITUACAO_PRESENTE if confianca_terminou else SITUACAO_CONFIRMADO
    return SITUACAO_CONVOCADO


def prazo_justificativa(fim: datetime, dias: int) -> date:
    """Último dia (Brasília) para contar o motivo: dia do fim da atividade + `dias`."""
    return fim.astimezone(APP_TZ).date() + timedelta(days=dias)


def dentro_do_prazo(hoje: date, prazo: date) -> bool:
    return hoje <= prazo


def limpar_justificativa(texto: Optional[str], *, obrigatoria: bool) -> Optional[str]:
    """Texto simples (sem HTML/controle), até 500 letras. Obrigatória → vazio dá 422."""
    limpo = limpar_corpo(texto)
    if len(limpo) > JUSTIFICATIVA_MAX:
        raise ValidationError(MSG_JUSTIFICATIVA_LONGA)
    if obrigatoria and not limpo:
        raise ValidationError(MSG_JUSTIFICATIVA)
    return limpo or None


def resolver_encerramento(
    *, convocado: bool, resposta: str, presenca: str, dispensado: bool, modo: str
) -> Optional[tuple[str, str]]:
    """O que o encerramento grava numa linha: (presença, origem) ou None (não mexe).

    Presença já registrada (check-in, chamada) e dispensado não mudam. No modo confiança, "vou"
    vira presente (`confianca`); o resto dos convocados vira ausente (`encerramento`).
    """
    if dispensado or presenca != PRESENCA_NAO_REGISTRADA:
        return None
    if modo == MODO_CONFIANCA and resposta == RESPOSTA_VOU:
        return PRESENCA_PRESENTE, "confianca"
    if convocado:
        return PRESENCA_AUSENTE, "encerramento"
    return None


def percentual(presentes: int, total: int) -> Optional[int]:
    """Presentes ÷ convocações com chamada encerrada (sem dispensados), arredondado."""
    if total <= 0:
        return None
    return round(presentes * 100 / total)


# ── QR do dia (AM-28) ───────────────────────────────────────────────────────


def _chave_qr(segredo: Optional[str] = None) -> bytes:
    base = (segredo if segredo is not None else settings.SECRET_KEY).encode("utf-8")
    # Subchave própria: o código do QR nunca usa a SECRET_KEY "crua" (que assina os JWT).
    return hmac.new(base, b"girahub:presenca-qr:v1", hashlib.sha256).digest()


def janela_qr(agora: datetime, intervalo_s: int = QR_INTERVALO_S) -> int:
    return int(agora.timestamp()) // intervalo_s


def codigo_qr(
    tenant_id: uuid.UUID, origem: str, ref_id: uuid.UUID, janela: int, *, segredo: Optional[str] = None
) -> str:
    """Código curto da atividade na janela (HMAC-SHA256 → 6 letras do alfabeto sem ambiguidade).

    `origem`/`ref_id`: ("gira", id da gira) ou ("atividade", id da atividade) — o mesmo par das
    rotas da Área, então o QR da gira não precisa da âncora. Sem dado pessoal.
    """
    msg = f"{tenant_id}|{origem}|{ref_id}|{janela}".encode("utf-8")
    digest = hmac.new(_chave_qr(segredo), msg, hashlib.sha256).digest()
    numero = int.from_bytes(digest[:8], "big")
    letras = []
    for _ in range(QR_TAMANHO):
        numero, resto = divmod(numero, len(QR_ALFABETO))
        letras.append(QR_ALFABETO[resto])
    return "".join(letras)


def normalizar_codigo(texto: Optional[str]) -> str:
    """Aceita o código digitado ("k7p 2qx") ou o conteúdo do QR (URL com `?cheguei=`)."""
    bruto = (texto or "").strip()
    if "://" in bruto or bruto.startswith("/"):
        try:
            valores = parse_qs(urlparse(bruto).query).get("cheguei") or []
        except ValueError:
            valores = []
        bruto = valores[0] if valores else ""
    return re.sub(r"[^0-9A-Za-z]", "", bruto).upper()[: QR_TAMANHO * 2]


def codigo_qr_valido(
    tenant_id: uuid.UUID,
    origem: str,
    ref_id: uuid.UUID,
    codigo: Optional[str],
    agora: datetime,
    *,
    segredo: Optional[str] = None,
) -> bool:
    """Confere o código da janela atual ou da anterior (comparação em tempo constante)."""
    informado = normalizar_codigo(codigo)
    if len(informado) != QR_TAMANHO:
        return False
    atual = janela_qr(agora)
    ok = False
    for janela in range(atual - QR_TOLERANCIA_JANELAS, atual + 1):
        esperado = codigo_qr(tenant_id, origem, ref_id, janela, segredo=segredo)
        ok = hmac.compare_digest(esperado, informado) or ok
    return ok


def conteudo_qr(frontend_url: str, origem: str, ref_id: uuid.UUID, codigo: str) -> str:
    """O que vai no QR: o link do detalhe na Área com `?cheguei=` (a câmera do celular abre a
    Área e o "Cheguei" já vem preenchido). Só ids e o código — nada pessoal."""
    return f"{frontend_url.rstrip('/')}/medium/agenda/{origem}/{ref_id}?cheguei={codigo}"


# ── Contexto da atividade ───────────────────────────────────────────────────


@dataclass
class AtividadeCtx:
    """Uma atividade interna ou uma gira (com ou sem âncora) vista pela camada de presença."""

    origem: str  # "gira" | "atividade"
    ref_id: uuid.UUID  # id da gira ou da atividade (o mesmo das rotas da Área)
    tipo: Optional[AtividadeTipo]  # None: terreiro ainda sem o tipo Gira
    titulo: str
    inicio: datetime
    fim: Optional[datetime]
    local: Optional[str]
    cancelada: bool
    atividade: Optional[Atividade] = None  # None: gira ainda sem âncora
    gira: Optional[Gira] = None

    @property
    def atividade_id(self) -> Optional[uuid.UUID]:
        return self.atividade.id if self.atividade is not None else None

    @property
    def fim_efetivo(self) -> datetime:
        duracao = self.tipo.duracao_min if self.tipo is not None and self.gira is None else None
        return fim_efetivo(self.inicio, self.fim, duracao)

    @property
    def encerrada_em(self) -> Optional[datetime]:
        return self.atividade.chamada_encerrada_em if self.atividade is not None else None


def ctx_de(atividade: Optional[Atividade], tipo: Optional[AtividadeTipo], gira: Optional[Gira]) -> AtividadeCtx:
    if gira is not None:
        return AtividadeCtx(
            origem="gira",
            ref_id=gira.id,
            tipo=tipo,
            titulo=gira.nome,
            inicio=gira.data_inicio,
            fim=gira.data_fim,
            local=gira.local or None,
            cancelada=not gira.is_active,
            atividade=atividade,
            gira=gira,
        )
    assert atividade is not None
    return AtividadeCtx(
        origem="atividade",
        ref_id=atividade.id,
        tipo=tipo,
        titulo=atividade.titulo or tipo.nome,
        inicio=atividade.inicio,
        fim=atividade.fim,
        local=atividade.local,
        cancelada=atividade.cancelada_em is not None,
        atividade=atividade,
    )


async def config_presenca(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[str, int]:
    """(modo padrão da casa, prazo da justificativa em dias)."""
    row = (
        await db.execute(
            select(TenantConfig.presenca_modo_padrao, TenantConfig.presenca_prazo_justificativa_dias).where(
                TenantConfig.tenant_id == tenant_id
            )
        )
    ).first()
    if row is None:
        return MODO_PADRAO, PRAZO_JUSTIFICATIVA_PADRAO
    return modo_efetivo(None, row[0]), int(row[1] or PRAZO_JUSTIFICATIVA_PADRAO)


async def _tipo_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, tipo_id: uuid.UUID) -> AtividadeTipo:
    tipo = (
        await db.execute(
            select(AtividadeTipo).where(AtividadeTipo.id == tipo_id, AtividadeTipo.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tipo is None:  # pragma: no cover — FK garante
        raise NotFoundError("Tipo de atividade")
    return tipo


async def ctx_da_atividade(db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID) -> AtividadeCtx:
    """Atividade do terreiro (interna ou âncora de gira), não excluída; senão 404."""
    atividade = (
        await db.execute(
            select(Atividade).where(
                Atividade.id == atividade_id, Atividade.tenant_id == tenant_id, Atividade.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if atividade is None:
        raise NotFoundError("Atividade")
    gira = None
    if atividade.gira_id is not None:
        gira = (
            await db.execute(
                select(Gira).where(
                    Gira.id == atividade.gira_id, Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
        if gira is None:
            raise NotFoundError("Atividade")
    tipo = await _tipo_do_tenant(db, tenant_id, atividade.tipo_id)
    return ctx_de(atividade, tipo, gira)


async def ctx_da_gira(
    db: AsyncSession, tenant_id: uuid.UUID, gira_id: uuid.UUID, *, criar_ancora: bool, so_ativa: bool = True
) -> AtividadeCtx:
    """Gira do terreiro (não excluída; `so_ativa` exige `is_active`) com a âncora — criada, se
    `criar_ancora`, na mesma transação (`atividade_da_gira`); senão a que existir (ou nenhuma)."""
    stmt = select(Gira).where(Gira.id == gira_id, Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None))
    if so_ativa:
        stmt = stmt.where(Gira.is_active.is_(True))
    gira = (await db.execute(stmt)).scalar_one_or_none()
    if gira is None:
        raise NotFoundError("Gira")
    if criar_ancora:
        ancora = await atividade_da_gira(db, tenant_id, gira.id)
    else:
        ancora = (
            await db.execute(
                select(Atividade).where(Atividade.tenant_id == tenant_id, Atividade.gira_id == gira.id)
            )
        ).scalar_one_or_none()
    if ancora is not None:
        tipo = await _tipo_do_tenant(db, tenant_id, ancora.tipo_id)
    else:
        tipo = await tipo_da_gira(db, tenant_id)
        if tipo is None:
            await ensure_default_atividade_tipos(db, tenant_id)
            tipo = await tipo_da_gira(db, tenant_id)
    if tipo is None:  # pragma: no cover
        raise NotFoundError("Tipo Gira")
    return ctx_de(ancora, tipo, gira)


async def modo_da_atividade(db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo) -> str:
    modo_casa, _ = await config_presenca(db, tenant_id)
    return modo_efetivo(tipo.presenca_modo, modo_casa)


# ── Elegibilidade ───────────────────────────────────────────────────────────


async def grupos_elegiveis_do_tipo(db: AsyncSession, tenant_id: uuid.UUID, tipo_id: uuid.UUID) -> set[uuid.UUID]:
    """Grupos ATIVOS escolhidos no tipo (`elegiveis = 'grupos'`)."""
    rows = await db.execute(
        select(AtividadeTipoGrupo.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == AtividadeTipoGrupo.grupo_id)
        .where(
            AtividadeTipoGrupo.tenant_id == tenant_id,
            AtividadeTipoGrupo.tipo_id == tipo_id,
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    return set(rows.scalars().all())


async def grupos_ativos_do_medium(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> dict[uuid.UUID, str]:
    """{grupo_id: nome} dos grupos ATIVOS em que o médium está."""
    rows = await db.execute(
        select(CorrenteGrupo.id, CorrenteGrupo.nome)
        .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == CorrenteGrupo.id)
        .where(
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupoMembro.medium_id == medium_id,
        )
    )
    return {gid: nome for gid, nome in rows.all()}


def medium_esperado(
    tipo: AtividadeTipo,
    *,
    is_atendimento: bool,
    data_entrada: Optional[date],
    dia: date,
    grupos_do_medium: AbstractSet[uuid.UUID],
    grupos_do_tipo: AbstractSet[uuid.UUID],
) -> bool:
    """Convocação virtual: tipo "todos os elegíveis" e o médium é elegível e já estava na casa."""
    if tipo.convocacao_padrao != "todos_elegiveis":
        return False
    if data_entrada is not None and data_entrada > dia:
        return False
    return medium_elegivel(tipo.elegiveis, is_atendimento, grupos_do_medium, grupos_do_tipo)


async def mediuns_esperados(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> list[Medium]:
    """Médiuns ativos que a convocação virtual alcança no dia da atividade (ordem por nome)."""
    tipo = ctx.tipo
    if tipo.convocacao_padrao != "todos_elegiveis":
        return []
    dia = ctx.inicio.astimezone(APP_TZ).date()
    stmt = select(Medium).where(
        Medium.tenant_id == tenant_id,
        Medium.deleted_at.is_(None),
        Medium.is_active.is_(True),
        or_(Medium.data_entrada.is_(None), Medium.data_entrada <= dia),
    )
    if tipo.elegiveis == "atendimento":
        stmt = stmt.where(Medium.is_atendimento.is_(True))
    elif tipo.elegiveis == "cambones":
        stmt = stmt.where(Medium.is_atendimento.is_(False))
    elif tipo.elegiveis == "grupos":
        grupos = await grupos_elegiveis_do_tipo(db, tenant_id, tipo.id)
        if not grupos:
            return []
        stmt = stmt.where(
            exists(
                select(CorrenteGrupoMembro.medium_id).where(
                    CorrenteGrupoMembro.tenant_id == tenant_id,
                    CorrenteGrupoMembro.medium_id == Medium.id,
                    CorrenteGrupoMembro.grupo_id.in_(grupos),
                )
            )
        )
    elif tipo.elegiveis != "todos":
        return []
    return list((await db.execute(stmt.order_by(func.lower(Medium.nome)))).scalars().all())


# ── Convocar grupos inteiros (AM-29) ────────────────────────────────────────


@dataclass
class PlanoConvocacao:
    """O que o "Pôr na escala" faz com médiuns pedidos um a um e com os membros dos grupos.

    - `manuais`: os pedidos um a um (todos recebem a linha, como sempre — quem estava
      dispensado volta);
    - `do_grupo`: (medium_id, grupo_id) dos membros elegíveis que ainda não estão na escala;
    - `novos`/`ja_estavam`: contagem por médium (sem repetir quem veio por dois caminhos);
    - `fora_da_elegibilidade`: membros que o tipo da atividade não alcança (ficam de fora).
    """

    manuais: list[uuid.UUID]
    do_grupo: list[tuple[uuid.UUID, uuid.UUID]]
    novos: int
    ja_estavam: int
    fora_da_elegibilidade: list[uuid.UUID]


def planejar_convocacao(
    *,
    pedidos: Sequence[uuid.UUID],
    membros: Sequence[tuple[uuid.UUID, uuid.UUID]],
    elegiveis: AbstractSet[uuid.UUID],
    na_escala: AbstractSet[uuid.UUID],
) -> PlanoConvocacao:
    """Regra pura do "Pôr na escala" com grupos.

    `membros` = (medium_id, grupo_id) dos membros ATIVOS na ordem dos grupos pedidos (o primeiro
    grupo de quem está em dois fica gravado); `elegiveis` = quais desses membros o tipo alcança;
    `na_escala` = médiuns que já estão na escala (linha convocada e não dispensada, ou a
    convocação virtual dos elegíveis). Quem foi pedido um a um ganha do grupo (vira "manual") e
    não passa pela elegibilidade — a casa escolheu a pessoa.
    """
    manuais = list(dict.fromkeys(pedidos))
    vistos = set(manuais)
    do_grupo: list[tuple[uuid.UUID, uuid.UUID]] = []
    fora: list[uuid.UUID] = []
    ja = sum(1 for m in manuais if m in na_escala)
    for medium_id, grupo_id in membros:
        if medium_id in vistos:
            continue
        vistos.add(medium_id)
        if medium_id not in elegiveis:
            fora.append(medium_id)
        elif medium_id in na_escala:
            ja += 1
        else:
            do_grupo.append((medium_id, grupo_id))
    novos = sum(1 for m in manuais if m not in na_escala) + len(do_grupo)
    return PlanoConvocacao(
        manuais=manuais, do_grupo=do_grupo, novos=novos, ja_estavam=ja, fora_da_elegibilidade=fora
    )


async def membros_ativos_dos_grupos(
    db: AsyncSession, tenant_id: uuid.UUID, grupo_ids: Sequence[uuid.UUID]
) -> list[tuple[Medium, uuid.UUID]]:
    """(médium, grupo_id) dos membros ATIVOS e não excluídos, na ordem dos grupos pedidos.

    Os grupos já foram conferidos no terreiro e não arquivados por quem chama; o filtro de
    tenant fica nas duas tabelas de novo (barato) para não depender disso.
    """
    ids = list(dict.fromkeys(grupo_ids))
    if not ids:
        return []
    rows = (
        await db.execute(
            select(Medium, CorrenteGrupoMembro.grupo_id)
            .join(CorrenteGrupoMembro, CorrenteGrupoMembro.medium_id == Medium.id)
            .where(
                CorrenteGrupoMembro.tenant_id == tenant_id,
                CorrenteGrupoMembro.grupo_id.in_(ids),
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
            )
        )
    ).all()
    ordem = {gid: i for i, gid in enumerate(ids)}
    return sorted(((m, gid) for m, gid in rows), key=lambda x: (ordem[x[1]], x[0].nome.lower()))


async def elegiveis_entre(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo, mediuns: Sequence[Medium]
) -> set[uuid.UUID]:
    """Quais destes médiuns o tipo alcança (todos · atendimento · cambones · grupos ATIVOS do tipo)."""
    if not mediuns:
        return set()
    grupos_do_tipo: set[uuid.UUID] = set()
    grupos_por_medium: dict[uuid.UUID, set[uuid.UUID]] = {}
    if tipo.elegiveis == "grupos":
        grupos_do_tipo = await grupos_elegiveis_do_tipo(db, tenant_id, tipo.id)
        if grupos_do_tipo:
            rows = await db.execute(
                select(CorrenteGrupoMembro.medium_id, CorrenteGrupoMembro.grupo_id).where(
                    CorrenteGrupoMembro.tenant_id == tenant_id,
                    CorrenteGrupoMembro.medium_id.in_([m.id for m in mediuns]),
                    CorrenteGrupoMembro.grupo_id.in_(grupos_do_tipo),
                )
            )
            for medium_id, grupo_id in rows.all():
                grupos_por_medium.setdefault(medium_id, set()).add(grupo_id)
    return {
        m.id
        for m in mediuns
        if medium_elegivel(
            tipo.elegiveis, bool(m.is_atendimento), grupos_por_medium.get(m.id, set()), grupos_do_tipo
        )
    }


# ── Participações ───────────────────────────────────────────────────────────


async def upsert_participacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atividade_id: uuid.UUID,
    medium_id: uuid.UUID,
    *,
    origem: str,
    convocado: bool,
    grupo_id: Optional[uuid.UUID] = None,
) -> AtividadeParticipacao:
    """Linha do médium na atividade, criada se faltar, e travada (`FOR UPDATE`) até o commit.

    Quem chama já conferiu atividade, médium (e o grupo, quando vem) no terreiro. `origem` e
    `grupo_id` só valem para a linha NOVA: a que já existia fica como estava. O `INSERT ... ON CONFLICT DO NOTHING`
    + `SELECT ... FOR UPDATE` deixa o "Cheguei" e a chamada simultâneos seguros: a segunda
    transação espera a primeira e trabalha sobre a mesma linha.
    """
    agora = utc_now()
    await db.execute(
        pg_insert(AtividadeParticipacao)
        .values(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            atividade_id=atividade_id,
            medium_id=medium_id,
            convocado=convocado,
            origem=origem,
            grupo_id=grupo_id,
            resposta=RESPOSTA_SEM,
            presenca=PRESENCA_NAO_REGISTRADA,
            created_at=agora,
            updated_at=agora,
        )
        .on_conflict_do_nothing(index_elements=["atividade_id", "medium_id"])
    )
    return (
        await db.execute(
            select(AtividadeParticipacao)
            .where(
                AtividadeParticipacao.tenant_id == tenant_id,
                AtividadeParticipacao.atividade_id == atividade_id,
                AtividadeParticipacao.medium_id == medium_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def participacoes_da_atividade(
    db: AsyncSession, tenant_id: uuid.UUID, atividade_id: Optional[uuid.UUID], *, travar: bool = False
) -> list[AtividadeParticipacao]:
    if atividade_id is None:
        return []
    stmt = select(AtividadeParticipacao).where(
        AtividadeParticipacao.tenant_id == tenant_id, AtividadeParticipacao.atividade_id == atividade_id
    )
    if travar:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return list((await db.execute(stmt)).scalars().all())


def registrar_presenca(
    p: AtividadeParticipacao, presenca: str, origem: Optional[str], por: Optional[uuid.UUID], agora: datetime
) -> None:
    """Grava a presença na linha (sem commit). `nao_registrada` limpa origem/quem/quando."""
    p.presenca = presenca
    if presenca == PRESENCA_NAO_REGISTRADA:
        p.presenca_origem = None
        p.presenca_registrada_em = None
        p.presenca_registrada_por = None
    else:
        p.presenca_origem = origem
        p.presenca_registrada_em = agora
        p.presenca_registrada_por = por
    p.updated_at = agora


async def materializar_esperados(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> int:
    """Cria a linha (convocado, origem `elegivel`) de cada esperado que ainda não tem. Sem commit."""
    if ctx.atividade is None:
        return 0
    esperados = await mediuns_esperados(db, tenant_id, ctx)
    if not esperados:
        return 0
    agora = utc_now()
    result = await db.execute(
        pg_insert(AtividadeParticipacao)
        .values(
            [
                {
                    "id": uuid.uuid4(),
                    "tenant_id": tenant_id,
                    "atividade_id": ctx.atividade.id,
                    "medium_id": m.id,
                    "convocado": True,
                    "origem": "elegivel",
                    "resposta": RESPOSTA_SEM,
                    "presenca": PRESENCA_NAO_REGISTRADA,
                    "created_at": agora,
                    "updated_at": agora,
                }
                for m in esperados
            ]
        )
        .on_conflict_do_nothing(index_elements=["atividade_id", "medium_id"])
    )
    return result.rowcount or 0


@dataclass
class ResultadoEncerramento:
    encerrada_agora: bool
    presentes: int = 0
    ausentes: int = 0


async def encerrar_chamada(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ctx: AtividadeCtx,
    *,
    por: Optional[uuid.UUID],
    modo: str,
    agora: Optional[datetime] = None,
) -> ResultadoEncerramento:
    """Encerra a chamada (sem commit; idempotente — já encerrada não muda nada).

    Trava a atividade (`FOR UPDATE`), materializa os esperados ("todos os elegíveis") e, em cada
    linha sem presença: modo confiança + "vou" → presente (`confianca`); convocado → ausente
    (`encerramento`). Presenças já registradas e dispensados ficam como estão.
    """
    agora = agora or utc_now()
    if ctx.atividade is None:
        raise NotFoundError("Atividade")
    atividade = (
        await db.execute(
            select(Atividade)
            .where(Atividade.id == ctx.atividade.id, Atividade.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    ctx.atividade = atividade
    if atividade.chamada_encerrada_em is not None:
        return ResultadoEncerramento(encerrada_agora=False)
    await materializar_esperados(db, tenant_id, ctx)
    resultado = ResultadoEncerramento(encerrada_agora=True)
    for p in await participacoes_da_atividade(db, tenant_id, atividade.id, travar=True):
        decisao = resolver_encerramento(
            convocado=p.convocado,
            resposta=p.resposta,
            presenca=p.presenca,
            dispensado=p.dispensado_em is not None or p.substituida_por_id is not None,
            modo=modo,
        )
        if decisao is None:
            continue
        presenca, origem = decisao
        registrar_presenca(p, presenca, origem, por, agora)
        if presenca == PRESENCA_PRESENTE:
            resultado.presentes += 1
        else:
            resultado.ausentes += 1
    atividade.chamada_encerrada_em = agora
    atividade.chamada_encerrada_por = por
    atividade.updated_at = agora
    return resultado


async def dispensar_por_cancelamento(
    db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID, quando: datetime
) -> int:
    """Atividade cancelada: todo mundo ainda não dispensado fica dispensado (`dispensado_em` =
    o momento do cancelamento, para o "Desfazer cancelamento" saber quem voltar). Sem commit."""
    linhas = [
        p
        for p in await participacoes_da_atividade(db, tenant_id, atividade_id, travar=True)
        if p.dispensado_em is None
    ]
    for p in linhas:
        p.dispensado_em = quando
        p.updated_at = utc_now()
    # TODO(AM-15): avisar os convocados do cancelamento.
    return len(linhas)


async def desfazer_dispensa_do_cancelamento(
    db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID, cancelada_em: datetime
) -> int:
    """Reativar a atividade devolve à escala quem foi dispensado PELO cancelamento. Sem commit."""
    voltaram = 0
    for p in await participacoes_da_atividade(db, tenant_id, atividade_id, travar=True):
        if p.dispensado_em is not None and p.dispensado_em == cancelada_em:
            p.dispensado_em = None
            p.updated_at = utc_now()
            voltaram += 1
    return voltaram


# ── Encerramento automático (agendador) ─────────────────────────────────────


@dataclass
class CandidatoEncerramento:
    tenant_id: uuid.UUID
    atividade_id: uuid.UUID
    registradas: int
    confirmadas: int
    tipo_modo: Optional[str] = None


async def candidatos_ao_encerramento(db: AsyncSession, agora: datetime) -> list[CandidatoEncerramento]:
    """Atividades (de TODOS os terreiros — agendador) com chamada aberta, tipo que controla
    presença, não canceladas/excluídas, que terminaram há 48 h ou mais e têm alguma presença
    registrada ou "vou". Quem decide se o "vou" basta (modo confiança) é o agendador."""
    limite = agora - AUTO_ENCERRAR_DEPOIS
    registradas = func.count(AtividadeParticipacao.id).filter(
        AtividadeParticipacao.presenca != PRESENCA_NAO_REGISTRADA
    )
    confirmadas = func.count(AtividadeParticipacao.id).filter(
        and_(AtividadeParticipacao.resposta == RESPOSTA_VOU, AtividadeParticipacao.dispensado_em.is_(None))
    )
    fim = func.coalesce(Atividade.fim, Gira.data_fim, Atividade.inicio, Gira.data_inicio)
    stmt = (
        select(Atividade.tenant_id, Atividade.id, AtividadeTipo.presenca_modo, registradas, confirmadas)
        .join(AtividadeTipo, and_(AtividadeTipo.id == Atividade.tipo_id, AtividadeTipo.tenant_id == Atividade.tenant_id))
        .outerjoin(Gira, and_(Gira.id == Atividade.gira_id, Gira.tenant_id == Atividade.tenant_id))
        .join(
            AtividadeParticipacao,
            and_(
                AtividadeParticipacao.atividade_id == Atividade.id,
                AtividadeParticipacao.tenant_id == Atividade.tenant_id,
            ),
        )
        .where(
            Atividade.deleted_at.is_(None),
            Atividade.cancelada_em.is_(None),
            Atividade.chamada_encerrada_em.is_(None),
            AtividadeTipo.controla_presenca.is_(True),
            or_(Atividade.gira_id.is_(None), and_(Gira.id.is_not(None), Gira.deleted_at.is_(None))),
            fim <= limite,
        )
        .group_by(Atividade.tenant_id, Atividade.id, AtividadeTipo.presenca_modo)
    )
    out = []
    for tenant_id, atividade_id, tipo_modo, n_reg, n_conf in (await db.execute(stmt)).all():
        if (n_reg or 0) == 0 and (n_conf or 0) == 0:
            continue
        out.append(CandidatoEncerramento(tenant_id, atividade_id, int(n_reg or 0), int(n_conf or 0), tipo_modo))
    return out


def deve_encerrar_sozinha(registradas: int, confirmadas: int, modo: str) -> bool:
    """Sinal de que a chamada aconteceu (D-12): presença registrada; no modo confiança, a
    confirmação "vou" é a presença."""
    return registradas > 0 or (modo == MODO_CONFIANCA and confirmadas > 0)


# ── "Minha participação" (Área do Médium) ───────────────────────────────────


def minha_participacao(
    *,
    ctx: AtividadeCtx,
    linha: Optional[AtividadeParticipacao],
    esperado: bool,
    modo: str,
    prazo_dias: int,
    agora: datetime,
    grupo: Optional[str] = None,
    funcao: Optional[str] = None,
) -> Optional[dict]:
    """O que a Área mostra e deixa fazer numa atividade (None: o médium não está nela).

    `esperado`: convocação virtual ("todos os elegíveis", `medium_esperado`). Só a própria linha
    do médium entra aqui — nunca a de outro (D-07). A justificativa é a dele mesmo.
    """
    tipo = ctx.tipo
    convocado = bool(linha is not None and linha.convocado) or esperado
    if tipo is None or (not convocado and linha is None):
        return None
    resposta = linha.resposta if linha is not None else RESPOSTA_SEM
    presenca = linha.presenca if linha is not None else PRESENCA_NAO_REGISTRADA
    justificativa = linha.justificativa if linha is not None else None
    dispensado = linha is not None and linha.dispensado_em is not None
    substituido = linha is not None and linha.substituida_por_id is not None
    encerrada = ctx.encerrada_em is not None
    fim = ctx.fim_efetivo
    terminou = agora > fim
    controla = bool(tipo.controla_presenca)
    ativa = not ctx.cancelada and not dispensado and not substituido

    sit = situacao(
        convocado=convocado,
        resposta=resposta,
        presenca=presenca,
        justificativa=justificativa,
        dispensado=dispensado,
        substituido=substituido,
        cancelada=ctx.cancelada,
        confianca_terminou=controla and modo == MODO_CONFIANCA and terminou,
    )
    pode_responder = ativa and convocado and bool(tipo.pede_confirmacao) and agora < ctx.inicio and not encerrada

    checkin_no_modo = controla and modo in (MODO_APP, MODO_QR)
    abre, fecha = janela_checkin(ctx.inicio, tipo.checkin_antes_min, tipo.checkin_depois_min)
    pode_checkin = (
        ativa
        and convocado
        and checkin_no_modo
        and not encerrada
        and presenca == PRESENCA_NAO_REGISTRADA
        and dentro_da_janela(agora, abre, fecha)
    )

    prazo = prazo_justificativa(fim, prazo_dias)
    pode_justificar = (
        controla
        and presenca == PRESENCA_AUSENTE
        and not dispensado
        and dentro_do_prazo(agora.astimezone(APP_TZ).date(), prazo)
    )
    return {
        "convocado": convocado,
        "situacao": sit,
        "resposta": resposta,
        "presenca": presenca,
        "presenca_em": (
            linha.presenca_registrada_em if linha is not None and presenca != PRESENCA_NAO_REGISTRADA else None
        ),
        "justificativa": justificativa,
        "grupo": grupo,
        # AM-18: "Você é Cambone" — só enquanto está na escala (dispensado não mostra a função).
        "funcao": funcao if not (dispensado or substituido) else None,
        "pede_confirmacao": bool(tipo.pede_confirmacao),
        "exige_justificativa": bool(tipo.exige_justificativa),
        "controla_presenca": controla,
        "modo_presenca": modo,
        "pode_responder": pode_responder,
        "responder_ate": ctx.inicio,
        "pode_checkin": pode_checkin,
        "checkin_abre_em": abre if checkin_no_modo else None,
        "checkin_fecha_em": fecha if checkin_no_modo else None,
        "pode_justificar": pode_justificar,
        "justificar_ate": prazo if controla and presenca == PRESENCA_AUSENTE else None,
        "chamada_encerrada": encerrada,
    }
