"""Meus dados e privacidade na Área do Médium (AM-14, LGPD art. 18).

    GET  /api/v1/medium/meus-dados/exportar   tudo o que a casa guarda sobre mim (JSON)
    POST /api/v1/medium/meus-dados/encerrar   encerrar meu acesso (confirma com a senha)

**Exportar**: cadastro do médium (sem os campos internos da casa — `observacoes`, `data_saida`,
`registrado_por`, observação do pagamento — que nunca saem pela Área, AM-13), conta de acesso,
consentimento (aceite e revogação, com as versões), grupos, avisos por e-mail, mensalidades
(com os metadados do comprovante — nunca o arquivo), avisos lidos e participações (escala,
resposta, motivo que EU contei, presença). Só `ctx.tenant_id` + `ctx.medium.id`. A tela monta o
arquivo JSON e o PDF legível no navegador (`lib/pdf/meusDadosPdf.ts`).

**Encerrar**: confere a senha atual (errada → 400 `SENHA_INCORRETA`, nunca 401 — que derrubaria a
sessão no front), registra a revogação do consentimento da Área (`area_consentimento_revogado_em`
+ `_versao`), desliga o opt-in do aniversário (AM-20), revoga convite em aberto e desfaz o vínculo
`mediuns.user_id` (`medium_convite.tirar_acesso`, a mesma regra do D-08): conta `medium` pura é
desativada e perde TODAS as sessões (os cookies saem nesta resposta); operador/admin que também é
médium só perde a Área e segue no painel. O cadastro do médium e os dados da casa ficam com o
terreiro (controlador). Auditoria só com ids/versões e e-mail aos administradores ativos. A casa
pode convidar de novo depois (AM-03): o aceite reativa a conta `medium` com a senha nova.

As duas rotas são recusadas sob impersonação (são da própria pessoa: o suporte não exporta nem
encerra em nome dela).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.core.auth_cookies import clear_auth_cookies
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import APIException
from src.core.limiter import limiter
from src.core.logging import log_security_event
from src.core.tz import APP_TZ, utc_now
from src.models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    Comunicado,
    ComunicadoLeitura,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    FuncaoCorrente,
    Gira,
    MediumPreferencia,
    MensalidadePagamento,
    Tenant,
    UserRole,
)
from src.security import verify_password
from src.services.audit_service import AuditService
from src.services.medium_convite import tirar_acesso
from src.services.medium_lembretes import emails_dos_admins, preferencias_payload
from src.services.medium_perfil import tipo_do_medium

router = APIRouter()

FORMATO_VERSAO = 1
SENHA_INCORRETA = "A senha não confere."


class EncerrarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    senha: str = Field(..., min_length=1, max_length=128)


class EncerrarResponse(BaseModel):
    message: str
    # Conta só da Área (papel `medium`): desativada e sem sessão → a tela vai para o login.
    conta_desativada: bool
    redirect: str


def _iso(valor) -> Optional[str]:
    return valor.isoformat() if valor is not None else None


def _num(valor) -> Optional[float]:
    return float(valor) if valor is not None else None


# ── Consultas (sempre ctx.tenant_id + ctx.medium.id) ────────────────────────


async def _terreiro(db: AsyncSession, ctx: MediumContext) -> str:
    return (await db.execute(select(Tenant.name).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none() or ""


async def _grupos(db: AsyncSession, ctx: MediumContext) -> list[dict]:
    rows = await db.execute(
        select(CorrenteGrupo.nome, CorrenteGrupoMembro.desde)
        .join(CorrenteGrupo, CorrenteGrupo.id == CorrenteGrupoMembro.grupo_id)
        .where(
            CorrenteGrupoMembro.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.medium_id == ctx.medium.id,
            CorrenteGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
        .order_by(CorrenteGrupo.nome)
    )
    return [{"nome": r[0], "desde": _iso(r[1])} for r in rows.all()]


async def _preferencias(db: AsyncSession, ctx: MediumContext) -> dict:
    pref = (
        await db.execute(
            select(MediumPreferencia).where(
                MediumPreferencia.tenant_id == ctx.tenant_id,
                MediumPreferencia.medium_id == ctx.medium.id,
            )
        )
    ).scalar_one_or_none()
    return preferencias_payload(pref)


async def _mensalidades(db: AsyncSession, ctx: MediumContext) -> list[dict]:
    # Colunas explícitas: o arquivo do comprovante (bytes) nunca é lido aqui.
    rows = await db.execute(
        select(
            MensalidadePagamento.mes_referencia,
            MensalidadePagamento.status,
            MensalidadePagamento.valor_vigente,
            MensalidadePagamento.valor_pago,
            MensalidadePagamento.data_pagamento,
            MensalidadePagamento.comprovante_filename,
            MensalidadePagamento.comprovante_mime,
            MensalidadePagamento.comprovante_enviado_em,
            MensalidadePagamento.recusa_motivo,
            MensalidadePagamento.recusado_em,
        )
        .where(
            MensalidadePagamento.tenant_id == ctx.tenant_id,
            MensalidadePagamento.mediun_id == ctx.medium.id,
        )
        .order_by(MensalidadePagamento.mes_referencia.desc())
    )
    saida = []
    for r in rows.all():
        status_ = r[1].value if hasattr(r[1], "value") else r[1]
        saida.append(
            {
                "mes": r[0].strftime("%Y-%m"),
                "situacao": status_,
                "valor": _num(r[2]),
                "valor_pago": _num(r[3]),
                "pago_em": _iso(r[4]),
                "comprovante": (
                    {"arquivo": r[5], "tipo": r[6], "enviado_pela_area_em": _iso(r[7])} if r[5] else None
                ),
                "motivo_nao_confirmado": r[8],
                "nao_confirmado_em": _iso(r[9]),
            }
        )
    return saida


async def _avisos_lidos(db: AsyncSession, ctx: MediumContext) -> list[dict]:
    rows = await db.execute(
        select(Comunicado.titulo, Comunicado.deleted_at, ComunicadoLeitura.lido_em)
        .join(Comunicado, Comunicado.id == ComunicadoLeitura.comunicado_id)
        .where(
            ComunicadoLeitura.tenant_id == ctx.tenant_id,
            ComunicadoLeitura.medium_id == ctx.medium.id,
            Comunicado.tenant_id == ctx.tenant_id,
        )
        .order_by(ComunicadoLeitura.lido_em.desc())
    )
    return [
        {"aviso": r[0] if r[1] is None else "Aviso retirado pela casa", "lido_em": _iso(r[2])} for r in rows.all()
    ]


async def _participacoes(db: AsyncSession, ctx: MediumContext) -> list[dict]:
    rows = await db.execute(
        select(
            AtividadeParticipacao,
            Atividade.titulo,
            Atividade.inicio,
            Atividade.cancelada_em,
            AtividadeTipo.nome,
            Gira.nome,
            Gira.data_inicio,
            FuncaoCorrente.nome,
        )
        .join(Atividade, Atividade.id == AtividadeParticipacao.atividade_id)
        .join(AtividadeTipo, AtividadeTipo.id == Atividade.tipo_id)
        .outerjoin(Gira, Gira.id == Atividade.gira_id)
        .outerjoin(FuncaoCorrente, FuncaoCorrente.id == AtividadeParticipacao.funcao_id)
        .where(
            AtividadeParticipacao.tenant_id == ctx.tenant_id,
            AtividadeParticipacao.medium_id == ctx.medium.id,
            Atividade.tenant_id == ctx.tenant_id,
            Atividade.deleted_at.is_(None),
        )
    )
    saida = []
    for p, titulo, inicio, cancelada_em, tipo, gira_nome, gira_inicio, funcao in rows.all():
        quando = inicio or gira_inicio
        saida.append(
            {
                "atividade": titulo or gira_nome or tipo,
                "tipo": tipo,
                "quando": _iso(quando),
                "cancelada": cancelada_em is not None,
                "na_escala": bool(p.convocado),
                "funcao": funcao,
                "resposta": p.resposta,
                "respondido_em": _iso(p.respondido_em),
                # O motivo que o PRÓPRIO médium contou (dado dele; nunca vai para e-mail/auditoria).
                "motivo_contado": p.justificativa,
                "motivo_contado_em": _iso(p.justificativa_em),
                "presenca": p.presenca,
                "presenca_registrada_em": _iso(p.presenca_registrada_em),
                "saiu_da_escala_em": _iso(p.dispensado_em),
            }
        )
    saida.sort(key=lambda x: x["quando"] or "", reverse=True)
    return saida


def _cadastro(ctx: MediumContext) -> dict:
    m = ctx.medium
    return {
        "nome": m.nome,
        "na_corrente": tipo_do_medium(m),
        "data_entrada": _iso(m.data_entrada),
        "telefone": m.telefone,
        "email_do_cadastro": m.email,
        "data_nascimento": _iso(m.data_nascimento),
        "endereco": {
            "cep": m.cep,
            "logradouro": m.logradouro,
            "numero": m.numero,
            "bairro": m.bairro,
            "cidade": m.cidade,
        },
        "isento_de_mensalidade": bool(m.mensalidade_isento),
        "mostrar_aniversario_para_a_corrente": bool(m.aniversario_visivel),
    }


def _conta(ctx: MediumContext) -> dict:
    u = ctx.user
    return {
        "email_de_acesso": u.email,
        "nome": u.full_name,
        "tem_foto": bool(u.profile_photo_data or u.profile_photo_url),
        "tambem_acessa_o_painel": u.role in (UserRole.ADMIN, UserRole.OPERATOR),
        "criada_em": _iso(getattr(u, "created_at", None)),
    }


def _consentimento(ctx: MediumContext) -> dict:
    m = ctx.medium
    return {
        "aceito_em": _iso(m.area_consentimento_em),
        "versao_aceita": m.area_consentimento_versao,
        "revogado_em": _iso(m.area_consentimento_revogado_em),
        "versao_revogada": m.area_consentimento_revogado_versao,
    }


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("/meus-dados/exportar", dependencies=[Depends(require_not_impersonated)])
@limiter.limit("20/hour")
async def exportar_meus_dados(
    request: Request,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> dict:
    terreiro = await _terreiro(db, ctx)
    log_security_event("medium_meus_dados_exportar", user_id=ctx.user.id, tenant_id=ctx.tenant_id, success=True)
    return {
        "formato": FORMATO_VERSAO,
        "gerado_em": utc_now().isoformat(),
        "terreiro": terreiro,
        "sobre": (
            f"Estes são os dados que {terreiro or 'a casa'} guarda sobre você no GiraHub. A casa decide "
            "como os dados são usados; o GiraHub guarda e processa para ela. Para corrigir algo, fale "
            "com a direção da casa ou use Meus dados na Área do Médium."
        ),
        "cadastro": _cadastro(ctx),
        "conta": _conta(ctx),
        "consentimento": _consentimento(ctx),
        "grupos": await _grupos(db, ctx),
        "avisos_por_email": await _preferencias(db, ctx),
        "mensalidades": await _mensalidades(db, ctx),
        "avisos_lidos": await _avisos_lidos(db, ctx),
        "participacoes": await _participacoes(db, ctx),
    }


async def _avisar_admins(db: AsyncSession, ctx: MediumContext, terreiro: str, primeiro: str) -> int:
    """E-mail aos administradores ativos (fila: Resend primário, Brevo de reserva)."""
    from src.services.email.base import EmailMessage
    from src.services.email.email_queue import EmailQueueItem, email_queue
    from src.services.email.templates.medium_acesso_encerrado import (
        medium_acesso_encerrado_subject,
        medium_acesso_encerrado_text,
        render_medium_acesso_encerrado_email,
    )

    quando = utc_now().astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M")
    painel_url = f"{settings.FRONTEND_URL.rstrip('/')}/admin/mediuns"
    admins = await emails_dos_admins(db, ctx.tenant_id)
    for email in admins:
        email_queue.enqueue(
            EmailQueueItem(
                message=EmailMessage(
                    to_email=email,
                    subject=medium_acesso_encerrado_subject(primeiro),
                    html_body=render_medium_acesso_encerrado_email(primeiro, terreiro, quando, painel_url),
                    text_body=medium_acesso_encerrado_text(primeiro, terreiro, quando, painel_url),
                )
            )
        )
    return len(admins)


@router.post(
    "/meus-dados/encerrar",
    response_model=EncerrarResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("5/hour")
async def encerrar_meu_acesso(
    request: Request,
    response: Response,
    body: EncerrarRequest,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> EncerrarResponse:
    if not verify_password(body.senha, ctx.user.password_hash):
        log_security_event(
            "medium_encerrar_acesso", success=False, user_id=ctx.user.id, details={"reason": "invalid_password"}
        )
        raise APIException(SENHA_INCORRETA, status_code=status.HTTP_400_BAD_REQUEST, error_code="SENHA_INCORRETA")

    medium, user = ctx.medium, ctx.user
    terreiro = await _terreiro(db, ctx)
    primeiro = (medium.nome or "").split()[0] if (medium.nome or "").strip() else ""
    versao = medium.area_consentimento_versao
    pura = user.role == UserRole.MEDIUM

    medium.area_consentimento_revogado_em = utc_now()
    medium.area_consentimento_revogado_versao = versao
    medium.aniversario_visivel = False
    medium.updated_at = utc_now()
    db.add(medium)
    await tirar_acesso(db, ctx.tenant_id, medium)

    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=user.id,
        resource_type="Medium",
        resource_id=medium.id,
        previous_state={"acesso_area": "ativo"},
        new_state={
            "acesso_area": "encerrado_pelo_medium",
            "consentimento_revogado_versao": versao,
            "conta_desativada": pura,
        },
    )
    await db.commit()
    log_security_event("medium_encerrar_acesso", user_id=user.id, tenant_id=ctx.tenant_id, success=True)
    await _avisar_admins(db, ctx, terreiro, primeiro)

    if pura:
        clear_auth_cookies(response)
        return EncerrarResponse(
            message="Seu acesso à Área do Médium foi encerrado.",
            conta_desativada=True,
            redirect="/login?acesso_encerrado=1",
        )
    return EncerrarResponse(
        message="Seu acesso à Área do Médium foi encerrado. O painel do terreiro continua como estava.",
        conta_desativada=False,
        redirect="/admin/dashboard",
    )
