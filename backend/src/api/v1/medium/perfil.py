"""Perfil do médium na Área (AM-13) — "Meus dados".

    GET    /api/v1/medium/perfil          meus dados (os da casa travados) + e-mail de login
    PATCH  /api/v1/medium/perfil          telefone, endereço e data de nascimento
    POST   /api/v1/medium/perfil/foto     foto da conta (multipart `file`, regras do perfil do painel)
    DELETE /api/v1/medium/perfil/foto     tirar a foto (volta o avatar de iniciais; AM-29)
    POST   /api/v1/medium/perfil/senha    trocar a senha (regras do perfil do painel: derruba as sessões)
    POST   /api/v1/medium/perfil/email    pedir a troca do e-mail de login (link no endereço novo)
    DELETE /api/v1/medium/perfil/email    desistir da troca pendente

A confirmação do e-mail novo é pública (quem abre o link prova que recebe nele):
`POST /api/v1/public/email/confirmar` (`api/v1/public/email_confirmacao.py`).

Tudo é "meu": tenant de `ctx.tenant_id`, médium de `ctx.medium` e conta de `ctx.user` (nunca da
requisição). Toda escrita é recusada sob impersonação (§6.9) e vai para a auditoria do terreiro
(`resource_type = "medium_perfil"`) com a frase do que mudou e os campos — nunca os valores.
Campos que só a casa edita (nome, data de entrada, tipo, isenção) e qualquer campo desconhecido
no PATCH → 422 (`extra="forbid"`). Campos internos (`observacoes`, `data_saida`,
`registrado_por`) nunca saem: o schema da resposta é uma lista fechada (teste trava).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.api.v1.auth.login import normalize_login_email
from src.api.v1.auth.profile import (
    _build_photo_url,
    apply_password_change,
    clear_profile_photo,
    has_profile_photo,
    read_profile_photo,
    set_profile_photo,
)
from src.core.auth_cookies import clear_auth_cookies
from src.core.database import get_db
from src.core.errors import APIException, UnauthorizedError, ValidationError
from src.core.limiter import limiter
from src.core.tz import today_local, utc_now
from src.security import verify_password
from src.services.audit_service import AuditService
from src.services.medium_perfil import (
    CAMPOS_EDITAVEIS,
    campos_alterados,
    email_em_uso,
    enfileirar_confirmacao_email,
    frase_auditoria,
    grupos_alterados,
    iniciar_troca,
    limpar_troca_pendente,
    link_confirmacao,
    normalizar_cep,
    normalizar_telefone,
    texto_curto,
    tipo_do_medium,
    troca_pendente_valida,
    validar_nascimento,
)

router = APIRouter()

RESOURCE_TYPE = "medium_perfil"

SENHA_INCORRETA = "A senha atual não confere."
EMAIL_EM_USO = "Este e-mail já é usado por outra conta da casa. Use outro e-mail ou fale com a direção."


# ── Schemas ─────────────────────────────────────────────────────────────────


class DadosDaCasa(BaseModel):
    """Só a casa edita: o médium vê, travado."""

    nome: str
    data_entrada: Optional[date] = None
    tipo: str  # "atendimento" | "cambone"
    isento_mensalidade: bool


class MediumPerfilResponse(BaseModel):
    """Lista fechada do que sai pela Área — nada interno (`observacoes`, `data_saida`...)."""

    casa: DadosDaCasa
    telefone: Optional[str] = None
    data_nascimento: Optional[date] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    foto_url: Optional[str] = None
    email: str
    email_pendente: Optional[str] = None
    email_pendente_expira_em: Optional[datetime] = None


class MediumPerfilUpdate(BaseModel):
    """O que o médium edita. Campo da casa ou desconhecido → 422 (`extra="forbid"`)."""

    model_config = ConfigDict(extra="forbid")

    telefone: Optional[str] = Field(default=None, max_length=30)
    data_nascimento: Optional[date] = None
    cep: Optional[str] = Field(default=None, max_length=12)
    logradouro: Optional[str] = Field(default=None, max_length=300)
    numero: Optional[str] = Field(default=None, max_length=40)
    bairro: Optional[str] = Field(default=None, max_length=150)
    cidade: Optional[str] = Field(default=None, max_length=150)


class TrocarSenhaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    senha_atual: str = Field(..., min_length=1, max_length=128)
    nova_senha: str = Field(..., min_length=1, max_length=128)


class TrocarEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    novo_email: EmailStr
    senha_atual: str = Field(..., min_length=1, max_length=128)


class TrocarEmailResponse(BaseModel):
    message: str
    email_pendente: str
    email_pendente_expira_em: datetime


class FotoResponse(BaseModel):
    message: str
    foto_url: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────────────


def _perfil(request: Request, ctx: MediumContext) -> MediumPerfilResponse:
    m, u = ctx.medium, ctx.user
    pendente = troca_pendente_valida(u)
    return MediumPerfilResponse(
        casa=DadosDaCasa(
            nome=m.nome,
            data_entrada=m.data_entrada,
            tipo=tipo_do_medium(m),
            isento_mensalidade=bool(m.mensalidade_isento),
        ),
        telefone=m.telefone,
        data_nascimento=m.data_nascimento,
        cep=m.cep,
        logradouro=m.logradouro,
        numero=m.numero,
        bairro=m.bairro,
        cidade=m.cidade,
        foto_url=_build_photo_url(request, u),
        email=u.email,
        email_pendente=u.email_pendente if pendente else None,
        email_pendente_expira_em=u.email_pendente_expira_em if pendente else None,
    )


def _normalizar(dados: dict) -> dict:
    """Mesmo formato do painel (telefone e CEP só com dígitos); mensagem clara por campo."""
    normalizadores = {
        "telefone": normalizar_telefone,
        "cep": normalizar_cep,
        "logradouro": lambda v: texto_curto(v, 255),
        "numero": lambda v: texto_curto(v, 20),
        "bairro": lambda v: texto_curto(v, 100),
        "cidade": lambda v: texto_curto(v, 100),
        "data_nascimento": lambda v: validar_nascimento(v, today_local()),
    }
    saida = {}
    for campo, valor in dados.items():
        try:
            saida[campo] = normalizadores[campo](valor)
        except ValueError as exc:
            raise ValidationError(str(exc), details={"campo": campo})
    return saida


async def _auditar(db: AsyncSession, ctx: MediumContext, acao: str, campos: list[str]) -> None:
    """Auditoria do terreiro: o que mudou, nunca o valor (§6.8)."""
    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user.id,
        resource_type=RESOURCE_TYPE,
        resource_id=ctx.medium.id,
        previous_state={},
        new_state={"acao": acao, "campos": campos},
    )


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("/perfil", response_model=MediumPerfilResponse)
async def get_perfil(
    request: Request,
    ctx: MediumContext = Depends(require_medium),
) -> MediumPerfilResponse:
    return _perfil(request, ctx)


@router.patch(
    "/perfil",
    response_model=MediumPerfilResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("30/hour")
async def atualizar_perfil(
    request: Request,
    body: MediumPerfilUpdate,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumPerfilResponse:
    """Telefone, endereço e data de nascimento do cadastro da casa. Sem mudança → sem auditoria."""
    novos = _normalizar({k: v for k, v in body.model_dump(exclude_unset=True).items() if k in CAMPOS_EDITAVEIS})
    campos = campos_alterados(ctx.medium, novos)
    if campos:
        for campo in campos:
            setattr(ctx.medium, campo, novos[campo])
        ctx.medium.updated_at = utc_now()
        db.add(ctx.medium)
        await _auditar(db, ctx, frase_auditoria(grupos_alterados(campos)), campos)
        await db.commit()
        await db.refresh(ctx.medium)
    return _perfil(request, ctx)


@router.post(
    "/perfil/foto",
    response_model=FotoResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("20/hour")
async def enviar_foto(
    request: Request,
    file: UploadFile = File(...),
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> FotoResponse:
    """Foto da conta (a mesma do perfil do painel): JPG/PNG/WEBP até 5 MB."""
    contents, content_type = await read_profile_photo(file)
    set_profile_photo(ctx.user, contents, content_type)
    db.add(ctx.user)
    await _auditar(db, ctx, "médium atualizou a foto", ["foto"])
    await db.commit()
    await db.refresh(ctx.user)
    return FotoResponse(message="Foto atualizada.", foto_url=_build_photo_url(request, ctx.user))


@router.delete(
    "/perfil/foto",
    response_model=FotoResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("20/hour")
async def remover_foto(
    request: Request,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> FotoResponse:
    """Tira a foto da conta (a mesma do perfil do painel). Sem foto → nada muda, sem auditoria."""
    if has_profile_photo(ctx.user):
        clear_profile_photo(ctx.user)
        db.add(ctx.user)
        await _auditar(db, ctx, "médium removeu a foto", ["foto"])
        await db.commit()
    return FotoResponse(message="Foto removida.", foto_url=None)


@router.post("/perfil/senha", dependencies=[Depends(require_not_impersonated)])
@limiter.limit("10/hour")
async def trocar_senha(
    request: Request,
    response: Response,
    body: TrocarSenhaRequest,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """As mesmas regras de `POST /auth/change-password`: confere a senha atual, aplica a política
    e derruba TODAS as sessões (esta inclusive; os cookies saem) — o médium entra de novo.
    Senha atual errada → 400 `SENHA_INCORRETA` (nunca 401, que derrubaria a sessão no front)."""
    try:
        await apply_password_change(db, ctx.user, body.senha_atual, body.nova_senha)
    except UnauthorizedError:
        raise APIException(SENHA_INCORRETA, status_code=status.HTTP_400_BAD_REQUEST, error_code="SENHA_INCORRETA")
    await _auditar(db, ctx, "médium trocou a senha", ["senha"])
    await db.commit()
    clear_auth_cookies(response)
    return {"message": "Senha alterada. Entre de novo com a nova senha."}


@router.post(
    "/perfil/email",
    response_model=TrocarEmailResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("5/hour")
async def pedir_troca_email(
    request: Request,
    body: TrocarEmailRequest,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocarEmailResponse:
    """Grava o pedido e manda o link (24 h, uso único) para o endereço NOVO. O e-mail de login
    só muda no clique. Pede a senha atual: sessão esquecida aberta não troca o e-mail da conta."""
    novo = normalize_login_email(str(body.novo_email))
    if len(novo) > 255:
        raise ValidationError("E-mail muito longo.", details={"campo": "novo_email"})
    if not verify_password(body.senha_atual, ctx.user.password_hash):
        raise APIException(SENHA_INCORRETA, status_code=status.HTTP_400_BAD_REQUEST, error_code="SENHA_INCORRETA")
    if novo == normalize_login_email(ctx.user.email):
        raise APIException(
            "Este já é o seu e-mail de acesso.", status_code=status.HTTP_400_BAD_REQUEST, error_code="MESMO_EMAIL"
        )
    if await email_em_uso(db, ctx.tenant_id, novo, ctx.user.id):
        raise APIException(EMAIL_EM_USO, status_code=status.HTTP_409_CONFLICT, error_code="EMAIL_EM_USO")

    token = iniciar_troca(ctx.user, novo)
    db.add(ctx.user)
    await _auditar(db, ctx, "médium pediu a troca do e-mail de login", ["email"])
    await db.commit()
    await enfileirar_confirmacao_email(db, ctx.tenant_id, ctx.medium.nome, novo, link_confirmacao(token))
    return TrocarEmailResponse(
        message="Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar.",
        email_pendente=novo,
        email_pendente_expira_em=ctx.user.email_pendente_expira_em,
    )


@router.delete(
    "/perfil/email",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_not_impersonated)],
)
async def cancelar_troca_email(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Desiste da troca pendente: o link enviado deixa de valer."""
    if ctx.user.email_pendente_token_hash:
        limpar_troca_pendente(ctx.user)
        db.add(ctx.user)
        await _auditar(db, ctx, "médium cancelou a troca do e-mail de login", ["email"])
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
