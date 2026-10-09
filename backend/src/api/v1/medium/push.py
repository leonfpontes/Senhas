"""Notificação no celular do médium (AM-16) — "Notificações no celular" no Perfil da Área.

    GET    /api/v1/medium/push              disponível no servidor? chave pública VAPID, quantos
                                            aparelhos ligados e o liga/desliga por tipo
    POST   /api/v1/medium/push/inscricao    liga este aparelho (inscrição do navegador; idempotente)
    DELETE /api/v1/medium/push/inscricao    desliga este aparelho (só as minhas inscrições)
    PUT    /api/v1/medium/push/preferencias muda os tipos enviados ao celular (os outros ficam)
    POST   /api/v1/medium/push/teste        manda uma notificação de teste aos meus aparelhos

Sem as chaves VAPID no servidor (`services/web_push.disponivel()`), o GET diz `disponivel: false`
(a tela esconde a seção) e ligar/testar respondem 409. Tipos: os mesmos do e-mail
(`mensalidade`, `escalas`, `confirmacao`, `faltas`, `avisos`) e o mesmo `disponiveis`
(`preferencias._disponiveis`), com liga/desliga próprio (`medium_preferencias.push_*`).

Tudo é "meu" (`ctx.medium`, `ctx.tenant_id`, `ctx.user`); escritas recusadas sob impersonação.
O `endpoint` só é aceito de serviços de push conhecidos (o servidor faz POST nele — nada de URL
interna). O mesmo navegador inscrito de novo por outra conta passa a ser dessa conta.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, literal_column, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.api.v1.medium.preferencias import PreferenciasEmail, PreferenciasUpdate, _disponiveis, _minha
from src.core.database import get_db
from src.core.errors import APIException
from src.core.limiter import limiter
from src.core.tz import utc_now
from src.models import PushInscricao, Tenant
from src.models.push_inscricoes import CHAVE_MAX, ENDPOINT_MAX, USER_AGENT_MAX
from src.services import web_push
from src.services.audit_service import AuditService
from src.services.medium_lembretes import garantir_preferencia, preferencias_push_payload
from src.services.medium_push import notificacao_teste

router = APIRouter()

# Serviços de push dos navegadores (o servidor faz POST no endpoint; nada fora daqui).
HOSTS_PUSH = (
    "fcm.googleapis.com",  # Chrome, Edge (Android), Samsung Internet, Opera
    "android.googleapis.com",
    "push.services.mozilla.com",  # Firefox
    "notify.windows.com",  # Edge no Windows
    "push.apple.com",  # Safari / iPhone com a Área na tela inicial (web.push.apple.com)
)

INDISPONIVEL = "As notificações no celular ainda não estão disponíveis."


def endpoint_aceito(endpoint: str) -> bool:
    try:
        url = urlparse(endpoint)
    except ValueError:
        return False
    host = (url.hostname or "").lower()
    if url.scheme != "https" or not host or url.username or url.password or url.port not in (None, 443):
        return False
    return any(host == h or host.endswith("." + h) for h in HOSTS_PUSH)


class PushEstado(BaseModel):
    disponivel: bool
    chave_publica: Optional[str] = None
    aparelhos: int = 0
    preferencias: PreferenciasEmail
    disponiveis: list[str]


class ChavesInscricao(BaseModel):
    model_config = ConfigDict(extra="ignore")

    p256dh: str = Field(min_length=10, max_length=CHAVE_MAX)
    auth: str = Field(min_length=4, max_length=CHAVE_MAX)


class InscricaoIn(BaseModel):
    """O `PushSubscription.toJSON()` do navegador (`expirationTime` é ignorado)."""

    model_config = ConfigDict(extra="ignore")

    endpoint: str = Field(min_length=10, max_length=ENDPOINT_MAX)
    keys: ChavesInscricao


class InscricaoOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=10, max_length=ENDPOINT_MAX)


class TesteResposta(BaseModel):
    enviadas: int


async def _aparelhos(db: AsyncSession, ctx: MediumContext) -> int:
    return (
        await db.execute(
            select(func.count(PushInscricao.id)).where(
                PushInscricao.tenant_id == ctx.tenant_id,
                PushInscricao.medium_id == ctx.medium.id,
                PushInscricao.user_id == ctx.user.id,
            )
        )
    ).scalar_one()


async def _estado(db: AsyncSession, ctx: MediumContext) -> PushEstado:
    return PushEstado(
        disponivel=web_push.disponivel(),
        chave_publica=web_push.chave_publica(),
        aparelhos=int(await _aparelhos(db, ctx)),
        preferencias=PreferenciasEmail(**preferencias_push_payload(await _minha(db, ctx))),
        disponiveis=await _disponiveis(db, ctx),
    )


def _exigir_disponivel() -> None:
    if not web_push.disponivel():
        raise APIException(INDISPONIVEL, status_code=status.HTTP_409_CONFLICT, error_code="PUSH_INDISPONIVEL")


@router.get("/push", response_model=PushEstado)
async def get_push(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PushEstado:
    return await _estado(db, ctx)


@router.post("/push/inscricao", response_model=PushEstado, dependencies=[Depends(require_not_impersonated)])
@limiter.limit("60/hour")
async def ligar_aparelho(
    request: Request,
    body: InscricaoIn,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PushEstado:
    _exigir_disponivel()
    endpoint = body.endpoint.strip()
    if not endpoint_aceito(endpoint):
        raise APIException(
            "Este navegador não pode receber notificações da Área.",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="PUSH_ENDPOINT_INVALIDO",
        )
    user_agent = (request.headers.get("user-agent") or "")[:USER_AGENT_MAX] or None
    # Inscrição já minha (mesmo endpoint): só renova as chaves. Do mesmo navegador, mas de outra
    # conta (logou outra pessoa no aparelho): passa a ser minha — quem tem o endpoint é o aparelho.
    novos = {
        "tenant_id": ctx.tenant_id,
        "user_id": ctx.user.id,
        "medium_id": ctx.medium.id,
        "p256dh": body.keys.p256dh,
        "auth": body.keys.auth,
        "user_agent": user_agent,
    }
    stmt = pg_insert(PushInscricao).values(endpoint=endpoint, failures=0, **novos)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_push_inscricoes_endpoint",
        set_={**novos, "failures": 0},
    ).returning(literal_column("xmax = 0"))  # true = linha nova (Postgres), false = atualizada
    if (await db.execute(stmt)).scalar_one():
        await AuditService(db).log_update(
            tenant_id=ctx.tenant_id,
            user_id=ctx.user.id,
            resource_type="medium_perfil",
            resource_id=ctx.medium.id,
            previous_state={},
            new_state={"acao": "médium ligou as notificações num aparelho"},
        )
    await db.commit()
    return await _estado(db, ctx)


@router.delete(
    "/push/inscricao",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("60/hour")
async def desligar_aparelho(
    request: Request,
    body: InscricaoOut,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.execute(
        delete(PushInscricao).where(
            PushInscricao.tenant_id == ctx.tenant_id,
            PushInscricao.medium_id == ctx.medium.id,
            PushInscricao.user_id == ctx.user.id,
            PushInscricao.endpoint == body.endpoint.strip(),
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/push/preferencias", response_model=PushEstado, dependencies=[Depends(require_not_impersonated)])
@limiter.limit("30/hour")
async def atualizar_preferencias_push(
    request: Request,
    body: PreferenciasUpdate,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PushEstado:
    novos = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    pref = await _minha(db, ctx)
    atuais = preferencias_push_payload(pref)
    mudou = [k for k, v in novos.items() if atuais[k] != v]
    if mudou:
        if pref is None:
            pref = await garantir_preferencia(db, ctx.tenant_id, ctx.medium.id)
        for campo in mudou:
            setattr(pref, f"push_{campo}", novos[campo])
        pref.updated_at = utc_now()
        await AuditService(db).log_update(
            tenant_id=ctx.tenant_id,
            user_id=ctx.user.id,
            resource_type="medium_perfil",
            resource_id=ctx.medium.id,
            previous_state={},
            new_state={"acao": "médium mudou as notificações no celular", "campos": sorted(mudou)},
        )
        await db.commit()
    return await _estado(db, ctx)


@router.post("/push/teste", response_model=TesteResposta, dependencies=[Depends(require_not_impersonated)])
@limiter.limit("10/hour")
async def mandar_teste(
    request: Request,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TesteResposta:
    _exigir_disponivel()
    terreiro = (await db.execute(select(Tenant.name).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none() or ""
    inscricoes = (
        await db.execute(
            select(PushInscricao).where(
                PushInscricao.tenant_id == ctx.tenant_id,
                PushInscricao.medium_id == ctx.medium.id,
                PushInscricao.user_id == ctx.user.id,
            )
        )
    ).scalars().all()
    if not inscricoes:
        raise APIException(
            "Ligue as notificações neste celular primeiro.",
            status_code=status.HTTP_409_CONFLICT,
            error_code="PUSH_SEM_APARELHO",
        )
    notificacao = notificacao_teste(terreiro)
    envios = [web_push.Envio(i.id, ctx.tenant_id, i.endpoint, i.p256dh, i.auth, notificacao) for i in inscricoes]
    await db.rollback()  # libera a conexão antes da rede
    return TesteResposta(enviadas=await web_push.enviar(envios))
