"""Atividades da casa (AM-08) — regras, sugestões e consultas compartilhadas.

Quem usa: `api/v1/admin/atividades.py` (painel), `api/v1/medium/agenda.py` (Agenda da Área),
`api/v1/public/onboarding.py` e `services/tenant_service.py` (terreiro novo nasce com os tipos).

- **Sugestões** (`TIPOS_SUGERIDOS`, `FUNCOES_SUGERIDAS`, `ensure_default_atividade_tipos`): os 8
  tipos do §8.2 do plano ("Gira" é o de sistema) e as funções da corrente. A migração 078 tem
  uma cópia congelada da mesma lista (teste confere).
- **Elegibilidade** (`medium_elegivel`): quem o tipo alcança — todos, só atendimento, só
  cambones ou os grupos da corrente escolhidos (AM-23).
- **Âncora da gira** (`atividade_da_gira`): `INSERT ... ON CONFLICT (gira_id) DO NOTHING` na
  transação de quem precisou dela (escala/presença, AM-17/AM-18); lê nome/data/local da gira.
- Limpeza e validação dos campos (texto simples, listas fechadas, minutos, horário).
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta
from typing import AbstractSet, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import NotFoundError, ValidationError
from ..core.tz import utc_now
from ..models.atividades import (
    CHECKIN_MAX_MIN,
    CONVOCACOES,
    CORES_TIPO,
    DESCRICAO_FUNCAO_MAX,
    DURACAO_MAX_MIN,
    DURACAO_MIN_MIN,
    ELEGIVEIS,
    ICONES_ATIVIDADE,
    LOCAL_MAX,
    MODOS_ESCALA,
    MOTIVO_MAX,
    NATUREZA_ATIVIDADE,
    NATUREZA_GIRA,
    NOME_MAX,
    TITULO_MAX,
    VISIBILIDADES,
    Atividade,
    AtividadeTipo,
    AtividadeTipoGrupo,
    FuncaoCorrente,
)
from ..models.corrente_grupos import CorrenteGrupo
from ..models.giras import Gira
from .comunicados import limpar_corpo, limpar_titulo

# (nome, natureza, icone, cor, controla_presenca, pede_confirmacao, exige_justificativa,
#  elegiveis, convocacao_padrao, modo_escala, hora_padrao, duracao_min, visibilidade_padrao,
#  is_sistema, ordem) — §8.2 do plano. Copiado (congelado) na migração 078.
TIPOS_SUGERIDOS: tuple[tuple, ...] = (
    ("Gira", "gira", "gira", None, True, True, True, "todos", "todos_elegiveis", "funcoes", None, None, "corrente", True, 0),
    ("Faxina", "atividade", "faxina", "petroleo", True, True, True, "todos", "so_escalados", "grupos_por_dia", "09:00", 180, "corrente", False, 1),
    ("Ritual coletivo", "atividade", "vela", "violeta", True, True, True, "todos", "todos_elegiveis", "nenhuma", "20:00", 120, "corrente", False, 2),
    ("Ritual individual", "atividade", "flor", "vinho", True, True, False, "todos", "so_escalados", "nenhuma", None, 60, "convocados", False, 3),
    ("Organização interna", "atividade", "organizacao", "grafite", True, True, False, "todos", "so_escalados", "nenhuma", None, 120, "corrente", False, 4),
    ("Preparação de curso", "atividade", "curso", "azul", False, True, False, "todos", "so_escalados", "nenhuma", None, 120, "corrente", False, 5),
    ("Desenvolvimento", "atividade", "desenvolvimento", "verde", True, True, True, "atendimento", "todos_elegiveis", "nenhuma", "20:00", 120, "corrente", False, 6),
    ("Reunião", "atividade", "reuniao", "ambar", True, True, False, "todos", "todos_elegiveis", "nenhuma", "19:30", 90, "corrente", False, 7),
)
FUNCOES_SUGERIDAS: tuple[str, ...] = ("Cambone", "Porteiro", "Ogã/Atabaque", "Cozinha", "Limpeza pós-gira")

# Tipo da gira quando o terreiro (ainda) não tem o tipo de sistema — mesmo formato do AM-07.
TIPO_GIRA_PADRAO = {"nome": "Gira", "icone": "gira", "cor": None}

MSG_NOME_TIPO = f"Dê um nome ao tipo (até {NOME_MAX} letras)."
MSG_NOME_FUNCAO = f"Dê um nome à função (até {NOME_MAX} letras)."
MSG_ICONE = "Escolha um dos ícones da lista."
MSG_COR = "Escolha uma das cores da lista."
MSG_OPCAO = "Escolha uma das opções da lista."
MSG_TITULO = f"Dê um título à atividade (até {TITULO_MAX} letras)."
MSG_MOTIVO = f"Conte o motivo do cancelamento (até {MOTIVO_MAX} letras)."


# ── Limpeza e validação (puras) ─────────────────────────────────────────────


def limpar_nome(valor: Optional[str], mensagem: str = MSG_NOME_TIPO) -> str:
    nome = limpar_titulo(valor)
    if not nome or len(nome) > NOME_MAX:
        raise ValidationError(mensagem)
    return nome


def limpar_titulo_atividade(valor: Optional[str]) -> str:
    titulo = limpar_titulo(valor)
    if not titulo or len(titulo) > TITULO_MAX:
        raise ValidationError(MSG_TITULO)
    return titulo


def limpar_local(valor: Optional[str]) -> Optional[str]:
    local = limpar_titulo(valor)
    if len(local) > LOCAL_MAX:
        raise ValidationError(f"O local vai até {LOCAL_MAX} letras.")
    return local or None


def limpar_texto(valor: Optional[str], limite: int = 5000, campo: str = "O texto") -> Optional[str]:
    texto = limpar_corpo(valor)
    if len(texto) > limite:
        raise ValidationError(f"{campo} vai até {limite} letras.")
    return texto or None


def limpar_descricao_funcao(valor: Optional[str]) -> Optional[str]:
    return limpar_texto(valor, DESCRICAO_FUNCAO_MAX, "A descrição")


def limpar_motivo(valor: Optional[str]) -> str:
    motivo = limpar_corpo(valor)
    if not motivo or len(motivo) > MOTIVO_MAX:
        raise ValidationError(MSG_MOTIVO)
    return motivo


def validar_icone(valor: str) -> str:
    if valor not in ICONES_ATIVIDADE:
        raise ValidationError(MSG_ICONE)
    return valor


def validar_cor_tipo(valor: Optional[str]) -> Optional[str]:
    """Cor da paleta fechada; None = cor do terreiro."""
    if valor is None or valor == "":
        return None
    if valor not in CORES_TIPO:
        raise ValidationError(MSG_COR)
    return valor


def validar_opcao(valor: str, permitidos: tuple[str, ...]) -> str:
    if valor not in permitidos:
        raise ValidationError(MSG_OPCAO)
    return valor


def validar_elegiveis(valor: str) -> str:
    return validar_opcao(valor, ELEGIVEIS)


def validar_convocacao(valor: str) -> str:
    return validar_opcao(valor, CONVOCACOES)


def validar_modo_escala(valor: str) -> str:
    return validar_opcao(valor, MODOS_ESCALA)


def validar_visibilidade(valor: str) -> str:
    return validar_opcao(valor, VISIBILIDADES)


def validar_minutos_checkin(valor: int) -> int:
    if not 0 <= valor <= CHECKIN_MAX_MIN:
        raise ValidationError("A janela do “Cheguei” vai de 0 a 24 horas.")
    return valor


def validar_duracao(valor: Optional[int]) -> Optional[int]:
    if valor is None:
        return None
    if not DURACAO_MIN_MIN <= valor <= DURACAO_MAX_MIN:
        raise ValidationError("A duração vai de 15 minutos a 24 horas.")
    return valor


def hora_de_texto(valor: Optional[str]) -> Optional[time]:
    """'HH:MM' → time; vazio → None."""
    if valor is None or not str(valor).strip():
        return None
    try:
        h, m = str(valor).strip().split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError):
        raise ValidationError("Informe o horário no formato HH:MM.")


def fim_padrao(inicio: datetime, fim: Optional[datetime], duracao_min: Optional[int]) -> Optional[datetime]:
    """Fim informado, ou início + duração padrão do tipo (quando houver)."""
    if fim is not None:
        if fim <= inicio:
            raise ValidationError("O fim precisa ser depois do início.")
        return fim
    if duracao_min:
        return inicio + timedelta(minutes=duracao_min)
    return None


def medium_elegivel(
    elegiveis: str,
    is_atendimento: bool,
    grupos_do_medium: AbstractSet = frozenset(),
    grupos_do_tipo: AbstractSet = frozenset(),
) -> bool:
    """O tipo alcança o médium? (todos · só atendimento · só cambones · grupos escolhidos)."""
    if elegiveis == "todos":
        return True
    if elegiveis == "atendimento":
        return bool(is_atendimento)
    if elegiveis == "cambones":
        return not is_atendimento
    if elegiveis == "grupos":
        return bool(set(grupos_do_medium) & set(grupos_do_tipo))
    return False


def elegiveis_fixos_do_medium(is_atendimento: bool) -> tuple[str, ...]:
    """Valores de `elegiveis` que alcançam o médium sem olhar grupos (o SQL da Agenda usa)."""
    return ("todos", "atendimento" if is_atendimento else "cambones")


def tipo_resumo(tipo: Optional[AtividadeTipo]) -> dict:
    """Tipo no formato da agenda: {nome, icone, cor} (cor null = cor do terreiro)."""
    if tipo is None:
        return dict(TIPO_GIRA_PADRAO)
    return {"nome": tipo.nome, "icone": tipo.icone, "cor": tipo.cor}


# ── Consultas ───────────────────────────────────────────────────────────────


def _hora(valor: Optional[str]) -> Optional[time]:
    return hora_de_texto(valor) if valor else None


async def ensure_default_atividade_tipos(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Garante os tipos e as funções sugeridos do terreiro (sem commit). Devolve quantos criou.

    Terreiro sem nenhum tipo (nem arquivado) ganha os 8 tipos sugeridos; com tipos, só garante o
    tipo de sistema "Gira". Sem nenhuma função (nem arquivada), ganha as funções sugeridas. O
    índice único parcial segura duas chamadas ao mesmo tempo (`ON CONFLICT DO NOTHING`).
    """
    criados = 0
    total_tipos = (
        await db.execute(select(func.count()).select_from(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant_id))
    ).scalar()
    tem_gira = (
        await db.execute(
            select(AtividadeTipo.id).where(
                AtividadeTipo.tenant_id == tenant_id, AtividadeTipo.natureza == NATUREZA_GIRA
            )
        )
    ).scalar_one_or_none()
    for (
        nome, natureza, icone, cor, presenca, confirmacao, justificativa, elegiveis,
        convocacao, modo, hora, duracao, visibilidade, sistema, ordem,
    ) in TIPOS_SUGERIDOS:
        if total_tipos and not (natureza == NATUREZA_GIRA and tem_gira is None):
            continue
        result = await db.execute(
            pg_insert(AtividadeTipo)
            .values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                nome=nome,
                natureza=natureza,
                icone=icone,
                cor=cor,
                controla_presenca=presenca,
                pede_confirmacao=confirmacao,
                exige_justificativa=justificativa,
                checkin_pelo_medium=False,
                checkin_antes_min=60,
                checkin_depois_min=180,
                elegiveis=elegiveis,
                convocacao_padrao=convocacao,
                modo_escala=modo,
                hora_padrao=_hora(hora),
                duracao_min=duracao,
                visibilidade_padrao=visibilidade,
                is_sistema=sistema,
                ordem=ordem,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            .on_conflict_do_nothing()
        )
        criados += result.rowcount or 0

    total_funcoes = (
        await db.execute(select(func.count()).select_from(FuncaoCorrente).where(FuncaoCorrente.tenant_id == tenant_id))
    ).scalar()
    if not total_funcoes:
        for ordem, nome in enumerate(FUNCOES_SUGERIDAS):
            result = await db.execute(
                pg_insert(FuncaoCorrente)
                .values(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    nome=nome,
                    ordem=ordem,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                .on_conflict_do_nothing()
            )
            criados += result.rowcount or 0
    if criados:
        await db.flush()
    return criados


async def tipo_da_gira(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[AtividadeTipo]:
    """O tipo de sistema "Gira" do terreiro (nome/ícone/cor que a casa escolheu), ou None."""
    return (
        await db.execute(
            select(AtividadeTipo).where(
                AtividadeTipo.tenant_id == tenant_id, AtividadeTipo.natureza == NATUREZA_GIRA
            )
        )
    ).scalar_one_or_none()


async def atividade_da_gira(db: AsyncSession, tenant_id: uuid.UUID, gira_id: uuid.UUID) -> Atividade:
    """Âncora da gira na camada de atividades (§8.3): cria se não existe, sem commit.

    A gira tem que ser do terreiro e não estar excluída (senão 404). A âncora só guarda o
    vínculo (`gira_id`, tipo de sistema "Gira", `origem = 'gira'`): nome, data e local vêm da gira.
    `ON CONFLICT (gira_id) DO NOTHING` deixa duas chamadas ao mesmo tempo seguras.
    """
    gira = (
        await db.execute(
            select(Gira.id).where(Gira.id == gira_id, Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if gira is None:
        raise NotFoundError("Gira")
    tipo = await tipo_da_gira(db, tenant_id)
    if tipo is None:
        await ensure_default_atividade_tipos(db, tenant_id)
        tipo = await tipo_da_gira(db, tenant_id)
    if tipo is None:  # pragma: no cover — ensure acabou de criar
        raise NotFoundError("Tipo Gira")
    agora = utc_now()
    await db.execute(
        pg_insert(Atividade)
        .values(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            tipo_id=tipo.id,
            gira_id=gira_id,
            visibilidade="corrente",
            origem="gira",
            created_at=agora,
            updated_at=agora,
        )
        .on_conflict_do_nothing(index_elements=["gira_id"], index_where=Atividade.gira_id.is_not(None))
    )
    return (
        await db.execute(
            select(Atividade).where(Atividade.tenant_id == tenant_id, Atividade.gira_id == gira_id)
        )
    ).scalar_one()


async def validar_tipo_ativo_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, tipo_id: uuid.UUID, *, so_atividade: bool = True
) -> AtividadeTipo:
    """Tipo não arquivado do terreiro (senão 422). `so_atividade`: recusa o tipo de sistema Gira."""
    tipo = (
        await db.execute(
            select(AtividadeTipo).where(
                AtividadeTipo.id == tipo_id,
                AtividadeTipo.tenant_id == tenant_id,
                AtividadeTipo.arquivado_em.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tipo is None:
        raise ValidationError("Escolha um tipo de atividade ativo da casa.")
    if so_atividade and tipo.natureza != NATUREZA_ATIVIDADE:
        raise ValidationError("Gira se marca na tela de Giras. Escolha outro tipo de atividade.")
    return tipo


async def grupos_dos_tipos(
    db: AsyncSession, tenant_id: uuid.UUID, tipo_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[CorrenteGrupo]]:
    """{tipo_id: grupos NÃO arquivados elegíveis} — para a tela de tipos e para a agenda."""
    if not tipo_ids:
        return {}
    rows = await db.execute(
        select(AtividadeTipoGrupo.tipo_id, CorrenteGrupo)
        .join(CorrenteGrupo, CorrenteGrupo.id == AtividadeTipoGrupo.grupo_id)
        .where(
            AtividadeTipoGrupo.tenant_id == tenant_id,
            AtividadeTipoGrupo.tipo_id.in_(tipo_ids),
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
        .order_by(func.lower(CorrenteGrupo.nome))
    )
    out: dict[uuid.UUID, list[CorrenteGrupo]] = {}
    for tipo_id, grupo in rows.all():
        out.setdefault(tipo_id, []).append(grupo)
    return out
