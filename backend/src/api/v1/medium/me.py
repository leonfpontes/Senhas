"""GET /api/v1/medium/me — quem sou eu na Área do Médium (AM-02).

Devolve só o que o próprio médium pode ver: nome, foto da conta, terreiro,
marca (o mesmo subconjunto público de `GET /admin/tenant/branding`, que já é
servido sem autenticação nas páginas de senha), áreas, módulos ligados e a
configuração da Área (boas-vindas e WhatsApp da casa, AM-10), quantos avisos ainda não foram
lidos (selo da aba Avisos, AM-09) e os grupos da corrente em que o médium está (AM-23: só nome e
cor dos PRÓPRIOS grupos — nunca quem mais está neles, D-07).
Campos internos do cadastro (`observacoes`, contatos, mensalidade) ficam fora.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium
from src.api.v1.medium.avisos import avisos_do_medium
from src.api.v1.auth.profile import _build_photo_url
from src.core.database import get_db
from src.models import CorrenteGrupo, CorrenteGrupoMembro, Tenant, TenantConfig
from src.services.medium_area import areas_payload, get_area_medium_config, modulos_visiveis
from src.services.plan_features import get_effective_plan_features
from src.repositories.subscription_repo import SubscriptionRepository

router = APIRouter()

# Mesmos defaults de GET /admin/tenant/branding (config.py) para terreiro sem config.
_DEFAULT_PRIMARY = "#6366f1"
_DEFAULT_SECONDARY = "#ec4899"


class TerreiroInfo(BaseModel):
    id: str
    nome: str
    slug: str


class MarcaInfo(BaseModel):
    logo_url: Optional[str] = None
    primary_color: str
    secondary_color: str
    font_color: Optional[str] = None


class MeuGrupo(BaseModel):
    id: str
    nome: str
    cor: str


class MediumMeResponse(BaseModel):
    nome: str
    foto_url: Optional[str] = None
    terreiro: TerreiroInfo
    marca: MarcaInfo
    areas: dict
    # Módulos da Área ligados no terreiro, na ordem da barra: "agenda", "avisos",
    # "mensalidade" (AM-10; mensalidade só com `mensalidade_mediun` no plano).
    modulos: List[str] = []
    # Configuração da Área (AM-10): mensagem de boas-vindas e WhatsApp da casa
    # (só dígitos com DDI, para o botão "Falar com a casa").
    boas_vindas: Optional[str] = None
    whatsapp_casa: Optional[str] = None
    # Avisos que o médium ainda não leu (selo da aba Avisos, AM-09); 0 com o módulo desligado.
    avisos_nao_lidos: int = 0
    # Grupos da corrente em que o médium está (AM-23), por nome. Sem os outros membros (D-07).
    grupos: List[MeuGrupo] = []
    # Ficha espiritual na Área (AM-19): o plano da casa tem `ficha_espiritual` (Pro). Sem ele o
    # Perfil não mostra "Minha caminhada".
    ficha: bool = False


async def meus_grupos(db: AsyncSession, ctx: MediumContext) -> List[MeuGrupo]:
    rows = await db.execute(
        select(CorrenteGrupo.id, CorrenteGrupo.nome, CorrenteGrupo.cor)
        .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == CorrenteGrupo.id)
        .where(
            CorrenteGrupoMembro.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.medium_id == ctx.medium.id,
            CorrenteGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
        .order_by(CorrenteGrupo.nome)
    )
    return [MeuGrupo(id=str(r[0]), nome=r[1], cor=r[2]) for r in rows.all()]


@router.get("/me", response_model=MediumMeResponse)
async def get_medium_me(
    request: Request,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumMeResponse:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    config = (
        await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()

    area = await get_area_medium_config(db, ctx.tenant_id)
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)

    logo_url = None
    font_color = None
    if config is not None:
        if config.logo_data:
            logo_url = f"{str(request.base_url).rstrip('/')}/api/v1/public/tenant/{ctx.tenant_id}/logo"
        else:
            logo_url = config.logo_url
        if isinstance(config.custom_settings, dict):
            fc = config.custom_settings.get("font_color")
            font_color = fc if isinstance(fc, str) else None

    features = get_effective_plan_features(sub)
    modulos = modulos_visiveis(area, features.mensalidade_mediun)
    avisos_nao_lidos = 0
    if "avisos" in modulos:
        avisos_nao_lidos = sum(1 for _, lido_em in await avisos_do_medium(db, ctx) if lido_em is None)

    return MediumMeResponse(
        nome=ctx.medium.nome,
        foto_url=_build_photo_url(request, ctx.user),
        terreiro=TerreiroInfo(id=str(tenant.id), nome=tenant.name, slug=tenant.slug),
        marca=MarcaInfo(
            logo_url=logo_url,
            primary_color=(config.primary_color if config and config.primary_color else _DEFAULT_PRIMARY),
            secondary_color=(config.secondary_color if config and config.secondary_color else _DEFAULT_SECONDARY),
            font_color=font_color,
        ),
        areas=areas_payload(ctx.user, ctx.medium),
        modulos=modulos,
        boas_vindas=area.boas_vindas,
        whatsapp_casa=area.whatsapp,
        avisos_nao_lidos=avisos_nao_lidos,
        grupos=await meus_grupos(db, ctx),
        ficha=features.ficha_espiritual,
    )
