"""Ficha espiritual do médium (F-05) e caminhada na Área (AM-19) — regras e consultas compartilhadas.

Quem usa: `api/v1/admin/ficha_espiritual.py` (painel, `FICHA_ESPIRITUAL` + plano
`ficha_espiritual`) e `api/v1/medium/ficha.py` (Área, só o próprio médium).

Regras (docs/plano-benchmark-2026-10.md §F-05, docs/plano-area-do-medium.md AM-19 e §6.8):
- **Consentimento explícito antes de gravar** (LGPD art. 11, I; precedente: `aceita_uso_dados_saude`
  dos cursos, "nunca é inferido"). A direção registra que o médium autorizou (caixa com o texto
  abaixo, quem e quando, versão `CONSENTIMENTO_FICHA_VERSAO`) ou o próprio médium autoriza na Área.
  Sem consentimento → 409 `FICHA_SEM_CONSENTIMENTO` em toda gravação de valor, marco ou sugestão.
- **Revogar = parar de tratar**: `_em/_por/_versao` são limpos e `_revogado_em` marca o pedido.
  Os valores, marcos e sugestões ficam INACESSÍVEIS (não saem nem no painel nem na Área) e a
  direção é avisada (e-mail discreto + aviso no painel) para apagá-los ("Apagar dados da ficha",
  `apagar_dados_da_ficha`). Não apagamos sozinhos: a casa pode ter obrigação de guardar algo, e o
  apagar é um ato consciente da direção (FICHA_ESPIRITUAL:delete). Um novo consentimento devolve
  o acesso ao que ainda não foi apagado.
- Valor por tipo: texto (até 500, sem HTML), data (ISO), lista (uma das opções do campo) e
  sim/não ("sim"/"nao"). Valor vazio apaga.
- Nada da ficha vai para auditoria (só ids e contagens), exportação, CSV ou e-mail.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import date
from typing import Any, Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import APIException, ConflictError, NotFoundError, ValidationError
from ..core.tz import utc_now
from ..models.ficha_espiritual import (
    CHAVE_MAX,
    MARCO_OBSERVACAO_MAX,
    MARCO_TITULO_MAX,
    OPCAO_MAX,
    OPCOES_MAX,
    ROTULO_MAX,
    TIPO_DATA,
    TIPO_LISTA,
    TIPO_SIM_NAO,
    TIPOS_CAMPO,
    TIPOS_MARCO,
    TRADICOES,
    VALOR_MAX,
    FichaCampo,
    FichaSugestao,
    FichaValor,
    MediumMarco,
)
from ..models.mediuns import Medium
from .comunicados import limpar_corpo, limpar_titulo

# Versão do texto de consentimento. Espelho em `frontend/src/constants/fichaEspiritual.ts`
# (`FICHA_CONSENTIMENTO_VERSAO`; o teste `tests/unit/test_f05_ficha.py` confere). Mudou o texto →
# suba nos dois lugares.
CONSENTIMENTO_FICHA_VERSAO = "1"

MSG_SEM_CONSENTIMENTO = (
    "Para guardar a ficha espiritual, a casa precisa da autorização do médium. "
    "Registre a autorização antes de preencher."
)
MSG_VERSAO = "O texto da autorização mudou. Recarregue a página e leia de novo."
MSG_CAMPO = "Escolha campos ativos da ficha da casa."

ROTULOS_TIPO_MARCO = {
    "entrada": "Entrada na casa",
    "batismo": "Batismo",
    "obrigacao": "Obrigação",
    "coroacao": "Coroação",
    "outro": "Outro marco",
}

# Modelos iniciais (aplicados pela tela; quem já tem o campo — mesma chave — não ganha cópia).
# Conservador por padrão: só o orixá de cabeça aparece para o médium; o resto a casa libera se
# quiser. Nenhum campo nasce com "o médium pode sugerir".
# (chave, rótulo, tipo, visível ao médium)
MODELOS: dict[str, dict[str, Any]] = {
    "umbanda": {
        "nome": "Umbanda",
        "campos": (
            ("umb_orixa_de_cabeca", "Orixá de cabeça", "texto", True),
            ("umb_guia_de_frente", "Guia de frente", "texto", False),
            ("umb_linhas", "Linhas em que trabalha", "texto", False),
            ("umb_data_batismo", "Data do batismo", "data", False),
            ("umb_data_coroacao", "Data da coroação", "data", False),
        ),
    },
    "candomble": {
        "nome": "Candomblé",
        "campos": (
            ("cdb_orixa_de_cabeca", "Orixá de cabeça", "texto", True),
            ("cdb_junto", "Juntó (opcional)", "texto", False),
            ("cdb_odu", "Odu (opcional)", "texto", False),
            ("cdb_dijina", "Dijina", "texto", False),
            ("cdb_data_iniciacao", "Data da iniciação", "data", False),
            ("cdb_obrigacao_1_ano", "Obrigação de 1 ano", "data", False),
            ("cdb_obrigacao_3_anos", "Obrigação de 3 anos", "data", False),
            ("cdb_obrigacao_7_anos", "Obrigação de 7 anos", "data", False),
        ),
    },
}


class FichaSemConsentimentoError(APIException):
    """409 — gravar dado religioso sem o consentimento do médium."""

    def __init__(self) -> None:
        super().__init__(
            MSG_SEM_CONSENTIMENTO,
            status_code=409,
            error_code="FICHA_SEM_CONSENTIMENTO",
            details={"error_code": "FICHA_SEM_CONSENTIMENTO"},
        )


# ── Consentimento ────────────────────────────────────────────────────────────


def tem_consentimento(medium: Medium) -> bool:
    return medium.consentimento_dado_religioso_em is not None


def exigir_consentimento(medium: Medium) -> None:
    if not tem_consentimento(medium):
        raise FichaSemConsentimentoError()


def conferir_versao(versao: str) -> None:
    if versao != CONSENTIMENTO_FICHA_VERSAO:
        raise ValidationError(MSG_VERSAO)


def registrar_consentimento(medium: Medium, user_id: uuid.UUID) -> None:
    medium.consentimento_dado_religioso_em = utc_now()
    medium.consentimento_dado_religioso_por = user_id
    medium.consentimento_dado_religioso_versao = CONSENTIMENTO_FICHA_VERSAO
    medium.consentimento_dado_religioso_revogado_em = None


def revogar_consentimento(medium: Medium) -> bool:
    """Retira a autorização. Devolve False se não havia autorização em vigor."""
    if not tem_consentimento(medium):
        return False
    medium.consentimento_dado_religioso_em = None
    medium.consentimento_dado_religioso_por = None
    medium.consentimento_dado_religioso_versao = None
    medium.consentimento_dado_religioso_revogado_em = utc_now()
    return True


def consentimento_payload(medium: Medium) -> dict:
    return {
        "dado": tem_consentimento(medium),
        "em": medium.consentimento_dado_religioso_em,
        "versao": medium.consentimento_dado_religioso_versao,
        "versao_atual": CONSENTIMENTO_FICHA_VERSAO,
        "revogado_em": medium.consentimento_dado_religioso_revogado_em,
    }


# ── Campos ───────────────────────────────────────────────────────────────────


def chave_de(rotulo: str) -> str:
    """"Orixá de cabeça" → "orixa_de_cabeca" (só a-z, 0-9 e _)."""
    texto = unicodedata.normalize("NFKD", rotulo).encode("ascii", "ignore").decode("ascii").lower()
    texto = re.sub(r"[^a-z0-9]+", "_", texto).strip("_")
    return (texto or "campo")[: CHAVE_MAX - 4]


def limpar_rotulo(valor: Optional[str]) -> str:
    rotulo = limpar_titulo(valor)
    if not rotulo or len(rotulo) > ROTULO_MAX:
        raise ValidationError(f"Dê um nome ao campo (até {ROTULO_MAX} letras).")
    return rotulo


def validar_tipo(tipo: str) -> str:
    if tipo not in TIPOS_CAMPO:
        raise ValidationError("Escolha um tipo de campo da lista.")
    return tipo


def validar_tradicao(tradicao: str) -> str:
    if tradicao not in TRADICOES:
        raise ValidationError("Escolha Umbanda, Candomblé ou Outra.")
    return tradicao


def limpar_opcoes(tipo: str, opcoes: Optional[Sequence[str]]) -> Optional[list[str]]:
    """Lista: 1 a 30 opções sem repetir (até 60 letras cada). Outros tipos: sem opções."""
    if tipo != TIPO_LISTA:
        return None
    limpas: list[str] = []
    for bruto in opcoes or []:
        op = limpar_titulo(bruto)
        if not op:
            continue
        if len(op) > OPCAO_MAX:
            raise ValidationError(f"Cada opção vai até {OPCAO_MAX} letras.")
        if op.lower() not in {o.lower() for o in limpas}:
            limpas.append(op)
    if not limpas or len(limpas) > OPCOES_MAX:
        raise ValidationError(f"Campo de lista precisa de 1 a {OPCOES_MAX} opções.")
    return limpas


async def chave_livre(db: AsyncSession, tenant_id: uuid.UUID, base: str) -> str:
    """Chave única no terreiro: base, base_2, base_3..."""
    existentes = set(
        (
            await db.execute(
                select(FichaCampo.chave).where(FichaCampo.tenant_id == tenant_id, FichaCampo.chave.like(f"{base}%"))
            )
        ).scalars().all()
    )
    if base not in existentes:
        return base
    n = 2
    while f"{base}_{n}" in existentes:
        n += 1
    return f"{base}_{n}"


async def proxima_ordem(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    atual = (
        await db.execute(select(func.max(FichaCampo.ordem)).where(FichaCampo.tenant_id == tenant_id))
    ).scalar_one_or_none()
    return (atual or 0) + 1


async def aplicar_modelo(db: AsyncSession, tenant_id: uuid.UUID, tradicao: str) -> list[FichaCampo]:
    """Cria os campos do modelo que o terreiro ainda não tem (mesma chave = já tem). Sem commit."""
    modelo = MODELOS.get(tradicao)
    if modelo is None:
        raise NotFoundError("Modelo")
    existentes = set(
        (await db.execute(select(FichaCampo.chave).where(FichaCampo.tenant_id == tenant_id))).scalars().all()
    )
    ordem = await proxima_ordem(db, tenant_id)
    criados: list[FichaCampo] = []
    for chave, rotulo, tipo, visivel in modelo["campos"]:
        if chave in existentes:
            continue
        campo = FichaCampo(
            tenant_id=tenant_id,
            chave=chave,
            rotulo=rotulo,
            tipo=tipo,
            tradicao=tradicao,
            ordem=ordem,
            visivel_ao_medium=visivel,
            medium_pode_sugerir=False,
        )
        db.add(campo)
        criados.append(campo)
        ordem += 1
    await db.flush()
    return criados


async def campos_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, *, incluir_arquivados: bool = False, so_visiveis: bool = False
) -> list[FichaCampo]:
    stmt = select(FichaCampo).where(FichaCampo.tenant_id == tenant_id)
    if not incluir_arquivados:
        stmt = stmt.where(FichaCampo.arquivado_em.is_(None))
    if so_visiveis:
        stmt = stmt.where(FichaCampo.visivel_ao_medium.is_(True))
    return list((await db.execute(stmt.order_by(FichaCampo.ordem, FichaCampo.rotulo))).scalars().all())


async def campo_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, campo_id: uuid.UUID, *, incluir_arquivado: bool = False
) -> FichaCampo:
    stmt = select(FichaCampo).where(FichaCampo.id == campo_id, FichaCampo.tenant_id == tenant_id)
    if not incluir_arquivado:
        stmt = stmt.where(FichaCampo.arquivado_em.is_(None))
    campo = (await db.execute(stmt)).scalar_one_or_none()
    if campo is None:
        raise NotFoundError("Campo")
    return campo


async def validar_campos_ativos_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, campo_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, FichaCampo]:
    """Todos os ids são campos ativos do terreiro (senão 422). Devolve {id: campo}."""
    ids = list(dict.fromkeys(campo_ids))
    if not ids:
        return {}
    campos = (
        await db.execute(
            select(FichaCampo).where(
                FichaCampo.tenant_id == tenant_id,
                FichaCampo.id.in_(ids),
                FichaCampo.arquivado_em.is_(None),
            )
        )
    ).scalars().all()
    if len(campos) != len(ids):
        raise ValidationError(MSG_CAMPO)
    return {c.id: c for c in campos}


def normalizar_valor(campo: FichaCampo, valor: Optional[str]) -> Optional[str]:
    """Valor gravado conforme o tipo do campo; None = apagar."""
    if valor is None:
        return None
    if campo.tipo == TIPO_DATA:
        bruto = valor.strip()
        if not bruto:
            return None
        try:
            return date.fromisoformat(bruto).isoformat()
        except ValueError as exc:
            raise ValidationError(f"Data inválida em \"{campo.rotulo}\".") from exc
    if campo.tipo == TIPO_SIM_NAO:
        bruto = valor.strip().lower()
        if not bruto:
            return None
        if bruto not in ("sim", "nao"):
            raise ValidationError(f"Responda sim ou não em \"{campo.rotulo}\".")
        return bruto
    if campo.tipo == TIPO_LISTA:
        bruto = limpar_titulo(valor)
        if not bruto:
            return None
        opcoes = {str(o).lower(): str(o) for o in (campo.opcoes or [])}
        if bruto.lower() not in opcoes:
            raise ValidationError(f"Escolha uma das opções de \"{campo.rotulo}\".")
        return opcoes[bruto.lower()]
    texto = limpar_corpo(valor)
    if not texto:
        return None
    if len(texto) > VALOR_MAX:
        raise ValidationError(f"\"{campo.rotulo}\" vai até {VALOR_MAX} letras.")
    return texto


# ── Médium, valores e marcos ─────────────────────────────────────────────────


async def medium_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> Medium:
    """Médium não excluído do terreiro (ativo ou não), senão 404."""
    medium = (
        await db.execute(
            select(Medium).where(Medium.id == medium_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if medium is None:
        raise NotFoundError("Médium")
    return medium


async def valores_do_medium(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> dict[uuid.UUID, FichaValor]:
    rows = await db.execute(
        select(FichaValor).where(FichaValor.tenant_id == tenant_id, FichaValor.medium_id == medium_id)
    )
    return {v.campo_id: v for v in rows.scalars().all()}


async def gravar_valor(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    medium_id: uuid.UUID,
    campo: FichaCampo,
    valor: Optional[str],
    user_id: uuid.UUID,
    atuais: dict[uuid.UUID, FichaValor],
) -> bool:
    """Grava (ou apaga, com None) o valor de um campo já conferido no terreiro. Devolve se mudou."""
    if campo.tenant_id != tenant_id:  # defesa em profundidade: o chamador já conferiu
        raise ValidationError(MSG_CAMPO)
    atual = atuais.get(campo.id)
    if valor is None:
        if atual is None:
            return False
        await db.delete(atual)
        atuais.pop(campo.id, None)
        return True
    if atual is not None:
        if atual.valor == valor:
            return False
        atual.valor = valor
        atual.atualizado_por = user_id
        atual.updated_at = utc_now()
        return True
    novo = FichaValor(tenant_id=tenant_id, medium_id=medium_id, campo_id=campo.id, valor=valor, atualizado_por=user_id)
    db.add(novo)
    atuais[campo.id] = novo
    return True


def limpar_marco(tipo: str, titulo: Optional[str], observacao: Optional[str]) -> tuple[str, str, Optional[str]]:
    if tipo not in TIPOS_MARCO:
        raise ValidationError("Escolha o tipo do marco da lista.")
    t = limpar_titulo(titulo) or ROTULOS_TIPO_MARCO[tipo]
    if len(t) > MARCO_TITULO_MAX:
        raise ValidationError(f"O título vai até {MARCO_TITULO_MAX} letras.")
    obs = limpar_corpo(observacao)
    if len(obs) > MARCO_OBSERVACAO_MAX:
        raise ValidationError(f"A observação vai até {MARCO_OBSERVACAO_MAX} letras.")
    return tipo, t, obs or None


async def marcos_do_medium(
    db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID, *, so_visiveis: bool = False
) -> list[MediumMarco]:
    stmt = select(MediumMarco).where(MediumMarco.tenant_id == tenant_id, MediumMarco.medium_id == medium_id)
    if so_visiveis:
        stmt = stmt.where(MediumMarco.visivel_ao_medium.is_(True))
    return list((await db.execute(stmt.order_by(MediumMarco.data, MediumMarco.created_at))).scalars().all())


async def marco_do_medium(
    db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID, marco_id: uuid.UUID
) -> MediumMarco:
    marco = (
        await db.execute(
            select(MediumMarco).where(
                MediumMarco.id == marco_id,
                MediumMarco.tenant_id == tenant_id,
                MediumMarco.medium_id == medium_id,
            )
        )
    ).scalar_one_or_none()
    if marco is None:
        raise NotFoundError("Marco")
    return marco


async def contar_dados(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> int:
    """Quantos registros da ficha (valores + marcos + sugestões) o médium tem guardados."""
    total = 0
    for modelo in (FichaValor, MediumMarco, FichaSugestao):
        total += (
            await db.execute(
                select(func.count()).select_from(modelo).where(modelo.tenant_id == tenant_id, modelo.medium_id == medium_id)
            )
        ).scalar_one()
    return total


async def apagar_dados_da_ficha(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> int:
    """Apaga valores, marcos e sugestões do médium (LGPD: eliminação). Sem commit. Devolve quantos."""
    total = 0
    for modelo in (FichaValor, MediumMarco, FichaSugestao):
        res = await db.execute(delete(modelo).where(modelo.tenant_id == tenant_id, modelo.medium_id == medium_id))
        total += res.rowcount or 0
    return total


# ── Sugestões ────────────────────────────────────────────────────────────────


async def sugestao_pendente_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, sugestao_id: uuid.UUID) -> FichaSugestao:
    sugestao = (
        await db.execute(
            select(FichaSugestao).where(
                FichaSugestao.id == sugestao_id,
                FichaSugestao.tenant_id == tenant_id,
                FichaSugestao.status == "pendente",
            )
        )
    ).scalar_one_or_none()
    if sugestao is None:
        raise NotFoundError("Sugestão")
    return sugestao


def conflito_sugestao() -> ConflictError:
    return ConflictError("Esta sugestão já foi respondida.")


# ── Aviso à direção ──────────────────────────────────────────────────────────


async def avisar_admins_revogacao(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """E-mail discreto (sem nome do médium nem dado da ficha) a todos os admins ativos. Devolve quantos."""
    from ..core.config import settings
    from ..models.tenants import Tenant
    from ..models.users import User, UserRole
    from .email.base import EmailMessage
    from .email.email_queue import EmailQueueItem, email_queue
    from .email.templates.ficha_autorizacao_retirada import (
        ficha_autorizacao_retirada_subject,
        render_ficha_autorizacao_retirada_email,
    )

    tenant_name = (
        await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or "Terreiro"
    emails = (
        await db.execute(
            select(User.email).where(
                User.tenant_id == tenant_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    html = render_ficha_autorizacao_retirada_email(
        tenant_name=tenant_name,
        painel_url=f"{settings.FRONTEND_URL.rstrip('/')}/admin/mediuns/ficha",
    )
    enviados = 0
    for email in emails:
        if email:
            email_queue.enqueue(
                EmailQueueItem(
                    message=EmailMessage(
                        to_email=email,
                        subject=ficha_autorizacao_retirada_subject(tenant_name),
                        html_body=html,
                    )
                )
            )
            enviados += 1
    return enviados
