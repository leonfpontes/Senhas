"""Public API — Inscrição pública em cursos presenciais.

Endpoints:
    GET  /api/v1/public/cursos/{curso_id}              → dados públicos do curso (sem auth)
    POST /api/v1/public/cursos/{curso_id}/inscricao    → registrar participante (sem auth)
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status, Form, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
import logging

from src.core.database import get_db
from src.core.limiter import limiter
from src.core.config import settings
from src.models import CursoPresencial, CursoParticipante
from src.models.tenants import Tenant
from src.models.tenant_config import TenantConfig
from src.repositories.curso_presencial_repo import (
    CursoPresencialRepository,
    CursoParticipanteRepository,
)

router = APIRouter(prefix="/api/v1/public", tags=["public-cursos"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CursoPublicoResponse(BaseModel):
    """Dados públicos de um curso (sem info sensível de participantes)."""
    id: UUID
    titulo: str
    ementa: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    max_participantes: Optional[int] = None
    vagas_restantes: Optional[int] = None
    valor_mensalidade_padrao: Optional[Decimal] = None
    gerar_mensalidade: bool
    is_active: bool
    tipo_formulario: str = "simples"
    chave_pix: Optional[str] = None
    observacoes: Optional[str] = None

    @field_validator("tipo_formulario", mode="before")
    @classmethod
    def validate_tipo_formulario(cls, v):
        return v if v is not None else "simples"

    # Branding do tenant
    tenant_nome: str
    tenant_primary_color: str
    tenant_secondary_color: str
    tenant_logo_url: Optional[str] = None
    tenant_endereco: Optional[str] = None


class InscricaoPublicaRequest(BaseModel):
    """Payload para inscrição pública em curso."""
    nome: str = Field(..., min_length=3, max_length=255)
    email: EmailStr
    celular: Optional[str] = Field(None, max_length=20)
    data_nascimento: Optional[date] = None
    observacoes: Optional[str] = Field(None, max_length=1000)
    aceita_uso_dados: bool = Field(..., description="Aceite LGPD: uso de dados pessoais")
    aceita_uso_imagem: bool = Field(..., description="Aceite: uso de imagem e gravações")
    genero: Optional[str] = Field(None, max_length=50)
    emergencia_contato: Optional[str] = Field(None, max_length=255)
    emergencia_fone: Optional[str] = Field(None, max_length=20)
    cep: Optional[str] = Field(None, max_length=9)
    logradouro: Optional[str] = Field(None, max_length=255)
    numero: Optional[str] = Field(None, max_length=20)
    complemento: Optional[str] = Field(None, max_length=100)
    bairro: Optional[str] = Field(None, max_length=100)
    cidade: Optional[str] = Field(None, max_length=100)
    estado: Optional[str] = Field(None, max_length=2)
    tem_plano_saude: Optional[bool] = None
    plano_saude_nome: Optional[str] = Field(None, max_length=100)
    toma_medicamento: Optional[bool] = None
    medicamentos_nome: Optional[str] = None
    tem_doenca_tratamento: Optional[bool] = None
    doenca_tratamento_nome: Optional[str] = None
    tem_diabetes: Optional[bool] = None
    outras_doencas: Optional[str] = None
    aceita_uso_dados_saude: bool = Field(False, description="Aceite LGPD: uso de dados médicos/sensíveis")
    cpf: Optional[str] = Field(None, max_length=14)
    rg: Optional[str] = Field(None, max_length=20)
    estado_civil: Optional[str] = Field(None, max_length=50)
    profissao: Optional[str] = Field(None, max_length=100)
    experiencia_umbanda: Optional[str] = Field(None, max_length=100)
    contato_contexto_espiritual: Optional[str] = Field(None, max_length=100)
    motivo_busca_desenvolvimento: Optional[str] = None
    interesse_aprendizado: Optional[str] = None
    ja_conhece_terreiro: Optional[bool] = None
    como_conheceu_terreiro: Optional[str] = Field(None, max_length=255)
    tratamento_psiquiatrico: Optional[bool] = None
    tratamento_psiquiatrico_detalhes: Optional[str] = None
    restricoes_saude: Optional[str] = None


class InscricaoPublicaResponse(BaseModel):
    """Resposta após inscrição bem-sucedida."""
    id: UUID
    nome: str
    email: str
    curso_titulo: str
    data_inicio: datetime
    valor_mensalidade: Optional[Decimal] = None
    mensagem: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_curso_e_tenant(
    curso_id: UUID,
    db: AsyncSession,
) -> tuple[CursoPresencial, Tenant, TenantConfig | None]:
    """Busca o curso, tenant e config de branding. Lança 404 se não encontrar."""
    repo = CursoPresencialRepository(db)
    # Busca direta sem filtro de tenant (pois é público, mas com check de curso ativo)
    stmt = select(CursoPresencial).where(
        and_(
            CursoPresencial.id == curso_id,
            CursoPresencial.deleted_at.is_(None),
            CursoPresencial.is_active.is_(True),
        )
    )
    result = await db.execute(stmt)
    curso = result.scalar_one_or_none()
    if not curso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso não encontrado ou inativo.")

    tenant_stmt = select(Tenant).where(Tenant.id == curso.tenant_id)
    tenant_result = await db.execute(tenant_stmt)
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurso não encontrado.")

    config_stmt = select(TenantConfig).where(TenantConfig.tenant_id == curso.tenant_id)
    config_result = await db.execute(config_stmt)
    tenant_config = config_result.scalar_one_or_none()

    return curso, tenant, tenant_config


async def _count_participantes(curso_id: UUID, tenant_id: UUID, db: AsyncSession) -> int:
    stmt = select(func.count(CursoParticipante.id)).where(
        and_(
            CursoParticipante.curso_id == curso_id,
            CursoParticipante.tenant_id == tenant_id,
            CursoParticipante.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one() or 0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/cursos/{curso_id}", response_model=CursoPublicoResponse)
async def get_curso_publico(
    curso_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CursoPublicoResponse:
    """Retorna dados públicos de um curso para exibição na página de inscrição."""
    curso, tenant, cfg = await _get_curso_e_tenant(curso_id, db)

    # Contagem de participantes para calcular vagas
    total_inscritos = await _count_participantes(curso_id, curso.tenant_id, db)
    vagas_restantes: Optional[int] = None
    if curso.max_participantes is not None:
        vagas_restantes = max(0, curso.max_participantes - total_inscritos)

    # Branding
    primary_color = cfg.primary_color if cfg else "#4f46e5"
    secondary_color = cfg.secondary_color if cfg else "#818cf8"
    endereco = cfg.endereco if cfg else None

    # Logo URL
    logo_url: Optional[str] = None
    if cfg and cfg.logo_data:
        logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
    elif cfg and cfg.logo_url:
        logo_url = cfg.logo_url

    return CursoPublicoResponse(
        id=curso.id,
        titulo=curso.titulo,
        ementa=curso.ementa,
        data_inicio=curso.data_inicio,
        data_fim=curso.data_fim,
        local=curso.local,
        max_participantes=curso.max_participantes,
        vagas_restantes=vagas_restantes,
        valor_mensalidade_padrao=curso.valor_mensalidade_padrao,
        gerar_mensalidade=curso.gerar_mensalidade,
        is_active=curso.is_active,
        observacoes=curso.observacoes,
        tipo_formulario=curso.tipo_formulario,
        chave_pix=curso.chave_pix,
        tenant_nome=tenant.name,
        tenant_primary_color=primary_color,
        tenant_secondary_color=secondary_color,
        tenant_logo_url=logo_url,
        tenant_endereco=endereco,
    )


@router.post(
    "/cursos/{curso_id}/inscricao",
    response_model=InscricaoPublicaResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def inscricao_publica(
    request: Request,
    curso_id: UUID,
    data: str = Form(...),
    comprovante: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
) -> InscricaoPublicaResponse:
    """Inscrição pública em um curso presencial — sem autenticação.

    Valida consentimentos LGPD, verifica vagas disponíveis, e impede duplicata
    pelo mesmo e-mail no mesmo curso.
    """
    # === Parse JSON data ===
    try:
        body = InscricaoPublicaRequest.model_validate_json(data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dados de inscrição inválidos: {str(e)}",
        )

    # === Validar consentimentos obrigatórios ===
    if not body.aceita_uso_dados:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="É obrigatório aceitar o uso dos dados pessoais (LGPD).",
        )
    if not body.aceita_uso_imagem:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="É obrigatório aceitar o uso de imagem e gravações.",
        )

    # === Buscar curso e tenant ===
    curso, tenant, cfg = await _get_curso_e_tenant(curso_id, db)

    # Validar consentimento de saúde para formulários completos
    if curso.tipo_formulario == "completo" and not body.aceita_uso_dados_saude:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="É obrigatório aceitar o processamento de dados de saúde para formulários completos.",
        )

    # === Validar campos obrigatórios para formulário completo ===
    if curso.tipo_formulario == "completo":
        missing_fields = []
        if not body.celular or not body.celular.strip():
            missing_fields.append("WhatsApp/Celular")
        if not body.data_nascimento:
            missing_fields.append("Data de Nascimento")
        if not body.genero or not body.genero.strip():
            missing_fields.append("Sexo/Gênero")
        if not body.cpf or not body.cpf.strip():
            missing_fields.append("CPF")
        if not body.rg or not body.rg.strip():
            missing_fields.append("RG")
        if not body.estado_civil or not body.estado_civil.strip():
            missing_fields.append("Estado Civil")
        if not body.profissao or not body.profissao.strip():
            missing_fields.append("Profissão")
            
        # Endereço
        if not body.cep or not body.cep.strip():
            missing_fields.append("CEP")
        if not body.logradouro or not body.logradouro.strip():
            missing_fields.append("Logradouro")
        if not body.numero or not body.numero.strip():
            missing_fields.append("Número do endereço")
        if not body.bairro or not body.bairro.strip():
            missing_fields.append("Bairro")
        if not body.cidade or not body.cidade.strip():
            missing_fields.append("Cidade")
        if not body.estado or not body.estado.strip():
            missing_fields.append("Estado")
            
        # Contatos de emergência
        if not body.emergencia_contato or not body.emergencia_contato.strip():
            missing_fields.append("Nome do contato de emergência")
        if not body.emergencia_fone or not body.emergencia_fone.strip():
            missing_fields.append("Telefone de emergência")
            
        # Perguntas espirituais
        if not body.experiencia_umbanda or not body.experiencia_umbanda.strip():
            missing_fields.append("Experiência com a religião de Umbanda")
        if not body.contato_contexto_espiritual or not body.contato_contexto_espiritual.strip():
            missing_fields.append("Filho de algum contexto espiritual")
        if not body.motivo_busca_desenvolvimento or not body.motivo_busca_desenvolvimento.strip():
            missing_fields.append("O que te fez buscar o desenvolvimento mediúnico?")
        if not body.interesse_aprendizado or not body.interesse_aprendizado.strip():
            missing_fields.append("Tem interesse em algum aprendizado específico?")
        if body.ja_conhece_terreiro is None:
            missing_fields.append("Já conhece o Terreiro")
        if not body.como_conheceu_terreiro or not body.como_conheceu_terreiro.strip():
            missing_fields.append("Como conheceu o terreiro")
            
        # Ficha Médica / Saúde
        if body.tem_plano_saude is None:
            missing_fields.append("Se possui plano de saúde")
        elif body.tem_plano_saude is True and (not body.plano_saude_nome or not body.plano_saude_nome.strip()):
            missing_fields.append("Nome do seu plano de saúde")
            
        if body.toma_medicamento is None:
            missing_fields.append("Se toma medicamentos controlados")
        elif body.toma_medicamento is True and (not body.medicamentos_nome or not body.medicamentos_nome.strip()):
            missing_fields.append("Nome dos medicamentos controlados")
            
        if body.tem_doenca_tratamento is None:
            missing_fields.append("Se faz algum tratamento de saúde")
        elif body.tem_doenca_tratamento is True and (not body.doenca_tratamento_nome or not body.doenca_tratamento_nome.strip()):
            missing_fields.append("Especificação do tratamento de saúde")
            
        if body.tem_diabetes is None:
            missing_fields.append("Se possui diabetes")
            
        if body.tratamento_psiquiatrico is None:
            missing_fields.append("Se faz acompanhamento psiquiátrico")
        elif body.tratamento_psiquiatrico is True and (not body.tratamento_psiquiatrico_detalhes or not body.tratamento_psiquiatrico_detalhes.strip()):
            missing_fields.append("Especificação do acompanhamento psiquiátrico")
            
        if not body.restricoes_saude or not body.restricoes_saude.strip():
            missing_fields.append("Restrições de saúde")

        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Os seguintes campos são obrigatórios: {', '.join(missing_fields)}.",
            )

    # === Validar e processar comprovante de matrícula se a chave PIX estiver configurada ===
    comp_data: Optional[bytes] = None
    comp_filename: Optional[str] = None
    comp_mime: Optional[str] = None

    if comprovante and comprovante.filename:
        from src.api.v1.admin.cursos_presenciais import ALLOWED_COMPROVANTE_TYPES, MAX_COMPROVANTE_BYTES
        content_type = comprovante.content_type or ""
        if content_type not in ALLOWED_COMPROVANTE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Tipo de arquivo não permitido para comprovante: {content_type}. Use JPEG, PNG, WebP ou PDF.",
            )
        comp_data = await comprovante.read()
        if len(comp_data) > MAX_COMPROVANTE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Comprovante muito grande (máx. {MAX_COMPROVANTE_BYTES // (1024*1024)}MB).",
            )
        comp_filename = comprovante.filename
        comp_mime = content_type

    if curso.chave_pix and not comp_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O comprovante de pagamento da matrícula via PIX é obrigatório.",
        )

    # === Verificar vagas ===
    total_inscritos = await _count_participantes(curso_id, curso.tenant_id, db)
    if curso.max_participantes is not None and total_inscritos >= curso.max_participantes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não há vagas disponíveis para este curso.",
        )

    # === Verificar duplicata por e-mail ===
    dup_stmt = select(CursoParticipante).where(
        and_(
            CursoParticipante.curso_id == curso_id,
            CursoParticipante.tenant_id == curso.tenant_id,
            CursoParticipante.email == body.email.lower().strip(),
            CursoParticipante.deleted_at.is_(None),
        )
    )
    dup_result = await db.execute(dup_stmt)
    if dup_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já está inscrito neste curso.",
        )

    # === Criar participante ===
    part_data = body.model_dump()
    if part_data.get("cep"):
        part_data["cep"] = part_data["cep"].replace("-", "")
    part_data["valor_mensalidade"] = curso.valor_mensalidade_padrao
    part_data["pago"] = False
    part_data["valor_pago"] = None
    part_data["data_pagamento"] = None
    part_data["comprovante_inscricao_data"] = comp_data
    part_data["comprovante_inscricao_filename"] = comp_filename
    part_data["comprovante_inscricao_mime"] = comp_mime

    part_repo = CursoParticipanteRepository(db)
    participante = await part_repo.create(
        tenant_id=curso.tenant_id,
        curso_id=curso_id,
        **part_data,
    )

    await db.commit()

    logger.info(
        f"Inscrição pública: {body.email} → curso '{curso.titulo}' (tenant={tenant.slug})"
    )

    return InscricaoPublicaResponse(
        id=participante.id,
        nome=participante.nome,
        email=participante.email,
        curso_titulo=curso.titulo,
        data_inicio=curso.data_inicio,
        valor_mensalidade=participante.valor_mensalidade,
        mensagem=(
            f"Inscrição realizada com sucesso! Bem-vindo(a) ao curso '{curso.titulo}'. "
            "Em breve você receberá informações por e-mail."
        ),
    )
