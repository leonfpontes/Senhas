"""Chave PIX da mensalidade (AM-10, docs/plano-area-do-medium.md §7.3, decisão D-05).

    GET /api/v1/admin/financeiro/config/pix  — FINANCEIRO:view + plano `mensalidade_mediun`
    PUT /api/v1/admin/financeiro/config/pix  — FINANCEIRO:edit + plano `mensalidade_mediun`
                                               + senha de quem altera + sem impersonação

Para onde vai o dinheiro do médium. Trocar a chave é o ponto sensível (alguém com
FINANCEIRO:edit põe a própria chave), então a proteção específica que o CLAUDE.md
pede — no lugar de empilhar `is_admin` sobre o grupo — é:
1. a senha de quem altera no corpo (`senha`); errada → 401 SEM derrubar a sessão
   (o front chama com `skipAutoLogout`);
2. auditoria com a chave antiga e a nova MASCARADAS (nunca a senha nem a chave inteira);
3. e-mail discreto a TODOS os administradores ativos do terreiro (fila de e-mail);
4. recusa sob impersonação (o suporte não troca chave em nome do terreiro);
5. limite de 10 tentativas por hora por IP (a senha não pode ser adivinhada por aqui);
6. `pix_alterado_em`, que a Área mostra ao médium por 30 dias ("Chave alterada em
   dd/mm", AM-11). Aviso ativo ao médium por e-mail: TODO(AM-15).

Quem vê a chave inteira: só quem tem FINANCEIRO:edit (admin faz bypass). Quem só tem
FINANCEIRO:view recebe a chave mascarada e sem a prévia do QR — CPF é dado pessoal do
titular, e quem pode editar já poderia trocar a chave de qualquer jeito (ver a
inteira não aumenta o risco; é preciso para preencher o formulário e conferir o QR).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    require_group_permission,
    require_not_impersonated,
    require_plan_feature,
)
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import UnauthorizedError, ValidationError
from src.core.limiter import limiter
from src.core.tz import APP_TZ, utc_now
from src.models import PermissionFeature, User, UserRole
from src.models.mensalidades import MensalidadeConfig
from src.models.tenants import Tenant
from src.repositories.mensalidade_repo import MensalidadeRepository
from src.security.password import verify_password
from src.services.audit_service import AuditService
from src.services.permission_service import PermissionService
from src.services.pix_brcode import build_static_brcode
from src.services.pix_chave import (
    CIDADE_MAX,
    NOME_RECEBEDOR_MAX,
    PIX_TIPO_LABELS,
    ChavePixInvalida,
    mascarar_chave,
    normalizar_chave,
    texto_ascii,
)

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])
logger = logging.getLogger(__name__)

_GATE = Depends(require_plan_feature("mensalidade_mediun"))
INSTRUCOES_MAX = 500
# Valor da prévia quando a mensalidade ainda não tem valor configurado.
VALOR_PREVIA_PADRAO = Decimal("1.00")

PixTipo = Literal["cpf", "cnpj", "email", "telefone", "aleatoria"]


class PixConfigResponse(BaseModel):
    configurada: bool
    tipo: Optional[PixTipo] = None
    chave_mascarada: Optional[str] = None
    # Só para FINANCEIRO:edit (null para quem só vê).
    chave: Optional[str] = None
    nome_recebedor: Optional[str] = None
    cidade: Optional[str] = None
    instrucoes: Optional[str] = None
    alterado_em: Optional[datetime] = None
    # Prévia do "PIX copia e cola" com a chave salva e o valor da mensalidade
    # (ou R$ 1,00), só para FINANCEIRO:edit.
    brcode_previa: Optional[str] = None
    valor_previa: Optional[float] = None


class PixConfigUpdate(BaseModel):
    tipo: PixTipo
    chave: str = Field(..., min_length=1, max_length=120)
    nome_recebedor: str = Field(..., min_length=1, max_length=NOME_RECEBEDOR_MAX)
    cidade: str = Field(..., min_length=1, max_length=CIDADE_MAX)
    instrucoes: Optional[str] = Field(None, max_length=INSTRUCOES_MAX)
    # Senha de quem está alterando (confirmação, D-05). Nunca é gravada nem auditada.
    senha: str = Field(..., min_length=1, max_length=256)


async def _pode_editar(request: Request, user: User, db: AsyncSession) -> bool:
    return await PermissionService(db).check_permission(
        user=user,
        feature=PermissionFeature.FINANCEIRO,
        action="edit",
        token_data=getattr(request.state, "token", None),
    )


def _response(config: Optional[MensalidadeConfig], ver_chave: bool) -> PixConfigResponse:
    if config is None or not config.pix_chave:
        return PixConfigResponse(configurada=False)
    resp = PixConfigResponse(
        configurada=True,
        tipo=config.pix_tipo,
        chave_mascarada=mascarar_chave(config.pix_tipo, config.pix_chave),
        nome_recebedor=config.pix_nome_recebedor,
        cidade=config.pix_cidade,
        instrucoes=config.pix_instrucoes,
        alterado_em=config.pix_alterado_em,
    )
    if ver_chave:
        valor = config.valor_mensal if config.valor_mensal and config.valor_mensal > 0 else VALOR_PREVIA_PADRAO
        resp.chave = config.pix_chave
        resp.valor_previa = float(valor)
        try:
            resp.brcode_previa = build_static_brcode(
                chave=config.pix_chave,
                nome_recebedor=config.pix_nome_recebedor or "",
                cidade=config.pix_cidade or "",
                valor=valor,
                txid="PREVIA" + utc_now().astimezone(APP_TZ).strftime("%Y%m"),
            )
        except ValueError:  # dado antigo inconsistente: mostra a config, sem prévia
            logger.warning("Prévia do BR Code falhou para o tenant %s", config.tenant_id)
    return resp


def _estado_auditavel(config: Optional[MensalidadeConfig]) -> dict:
    if config is None or not config.pix_chave:
        return {}
    return {
        "tipo": config.pix_tipo,
        "chave": mascarar_chave(config.pix_tipo, config.pix_chave),
        "nome_recebedor": config.pix_nome_recebedor,
        "cidade": config.pix_cidade,
    }


async def _avisar_admins(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    alterado_por: User,
    tipo: str,
    chave_mascarada: str,
    anterior_mascarada: Optional[str],
) -> int:
    """Enfileira o aviso para todos os admins ativos do terreiro. Devolve quantos."""
    from src.services.email.base import EmailMessage
    from src.services.email.email_queue import EmailQueueItem, email_queue
    from src.services.email.templates.pix_chave_alterada import (
        pix_chave_alterada_subject,
        render_pix_chave_alterada_email,
    )

    tenant_name = (
        await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or "Terreiro"
    admins = (
        await db.execute(
            select(User).where(
                and_(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                )
            )
        )
    ).scalars().all()

    html = render_pix_chave_alterada_email(
        tenant_name=tenant_name,
        alterado_por=alterado_por.full_name or alterado_por.username or alterado_por.email,
        quando=utc_now().astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M"),
        tipo_label=PIX_TIPO_LABELS.get(tipo, tipo),
        chave_mascarada=chave_mascarada,
        chave_anterior_mascarada=anterior_mascarada,
        painel_url=f"{settings.FRONTEND_URL.rstrip('/')}/admin/financeiro/config",
    )
    enviados = 0
    for admin in admins:
        if admin.email:
            email_queue.enqueue(
                EmailQueueItem(
                    message=EmailMessage(
                        to_email=admin.email,
                        subject=pix_chave_alterada_subject(tenant_name),
                        html_body=html,
                    )
                )
            )
            enviados += 1
    return enviados


@router.get(
    "/config/pix",
    response_model=PixConfigResponse,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def get_pix_config(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PixConfigResponse:
    config = await MensalidadeRepository(db).get_config(current_user.tenant_id)
    return _response(config, await _pode_editar(request, current_user, db))


@router.put(
    "/config/pix",
    response_model=PixConfigResponse,
    dependencies=[
        _GATE,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit")),
        Depends(require_not_impersonated),
    ],
)
@limiter.limit("10/hour")
async def update_pix_config(
    request: Request,
    body: PixConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PixConfigResponse:
    """Grava a chave PIX (exige a senha de quem altera; avisa todos os admins se a chave mudou)."""
    if not verify_password(body.senha, current_user.password_hash):
        raise UnauthorizedError(
            "Senha incorreta. Confirme sua senha para alterar a chave PIX.",
            details={"error_code": "INVALID_PASSWORD"},
        )

    try:
        chave = normalizar_chave(body.tipo, body.chave)
    except ChavePixInvalida as exc:
        raise ValidationError(str(exc), details={"field": "chave"})
    nome = " ".join(body.nome_recebedor.split())
    cidade = " ".join(body.cidade.split())
    if not texto_ascii(nome):
        raise ValidationError("Informe o nome de quem recebe.", details={"field": "nome_recebedor"})
    if not texto_ascii(cidade):
        raise ValidationError("Informe a cidade de quem recebe.", details={"field": "cidade"})
    instrucoes = (body.instrucoes or "").strip() or None

    repo = MensalidadeRepository(db)
    config = await repo.get_config(current_user.tenant_id)
    if config is None:
        config = MensalidadeConfig(
            id=uuid.uuid4(),
            tenant_id=current_user.tenant_id,
            valor_mensal=Decimal("0.00"),
            dia_vencimento=10,
        )
        db.add(config)
        await db.flush()

    antes = _estado_auditavel(config)
    anterior_mascarada = antes.get("chave")
    chave_mudou = config.pix_chave != chave or config.pix_tipo != body.tipo

    config.pix_tipo = body.tipo
    config.pix_chave = chave
    config.pix_nome_recebedor = nome
    config.pix_cidade = cidade
    config.pix_instrucoes = instrucoes
    if chave_mudou:
        config.pix_alterado_em = utc_now()
    config.updated_at = utc_now()
    await db.flush()

    depois = _estado_auditavel(config)
    await AuditService(db).log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_pix",
        resource_id=config.id,
        previous_state=antes,
        new_state={**depois, "chave_alterada": chave_mudou},
    )
    await db.commit()
    await db.refresh(config)

    if chave_mudou:
        try:
            await _avisar_admins(
                db,
                current_user.tenant_id,
                current_user,
                body.tipo,
                depois["chave"],
                anterior_mascarada,
            )
        except Exception:  # o aviso não desfaz a troca já gravada e auditada
            logger.exception("Falha ao enfileirar o aviso de troca da chave PIX (tenant %s)", current_user.tenant_id)
        # TODO(AM-15): avisar também os médiuns (e-mail/aviso na Área) da troca de chave.

    return _response(config, True)
