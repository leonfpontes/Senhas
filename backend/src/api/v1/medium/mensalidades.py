"""Mensalidade na Área do Médium — "Pague sua mensalidade aqui" (AM-11) e comprovante (AM-12).

    GET  /api/v1/medium/mensalidades                      meus meses (o corrente primeiro)
    GET  /api/v1/medium/mensalidades/{AAAA-MM}/pix        PIX copia e cola do mês em aberto
    POST /api/v1/medium/mensalidades/{AAAA-MM}/comprovante  envio do comprovante (multipart)
    POST /api/v1/medium/mensalidades/{AAAA-MM}/cobranca     PIX/boleto automático (F-02/AM-22)
    GET  /api/v1/medium/mensalidades/{AAAA-MM}/cobranca     situação da cobrança automática do mês

Tudo é "meu": tenant de `ctx.tenant_id`, médium de `ctx.medium` (nunca da requisição; o mês é
o único parâmetro). Gate além do `require_medium` do router: módulo "mensalidade" visível
(`medium_area.area_medium_modulos` — a casa ligou o módulo E o plano efetivo tem
`mensalidade_mediun`), senão 403 neutro (`MEDIUM_MODULO_INDISPONIVEL`).

- O médium **nunca** marca o mês como pago: cada comprovante é uma linha nova de
  `mensalidade_comprovantes` (pagamento parcial, migração 092 — nada é substituído), "em
  conferência" até a casa conferir QUANTO entrou ou não confirmar com motivo
  (`admin/mensalidade_comprovantes.py`, FINANCEIRO:edit). O mês vira pago quando o recebido
  (conferidos + cobranças automáticas pagas) alcança o valor do mês; até lá o mês mostra o que
  FALTA (`valor`) e o PIX/cobrança é do valor que falta. O médium pode dizer quanto pagou
  (`valor_informado`, opcional) e vê a lista dos comprovantes enviados com o status.
- Status por mês: `services/medium_inicio.situacao_mensalidade` (a mesma regra do Início);
  quais meses aparecem: `services/medium_mensalidade.meses_da_area`.
- O BR Code é montado no servidor (`services/pix_brcode`), com o valor que falta no mês e o txid
  `MENS` + AAAAMM + 10 hex do id do médium (identifica médium e mês no extrato da casa).
- Envio do comprovante: JPEG/PNG/WebP/PDF até 2 MB, conferido pelos bytes; recusado sob
  impersonação (o suporte vê, não envia em nome do médium); 20 envios/hora por IP; auditoria
  sem o conteúdo do arquivo.
- **Baixa automática (AM-22)**: com o gateway da casa ativo (Stripe ou Mercado Pago, plano com
  `mensalidade_automatica` — `services/mensalidade_gateway.gateway_para_cobrar`), "Pagar com PIX"
  cria (ou reaproveita enquanto vale) uma cobrança dinâmica NA CONTA DA CASA e devolve o
  copia-e-cola; o webhook do provedor dá a baixa e o mês vira "paga" sozinho (`pago_automatico`).
  Sem gateway, tudo acima continua igual (chave estática + comprovante). Criar cobrança é escrita:
  recusada sob impersonação, 20/hora por IP. CPF/endereço do boleto vão direto ao provedor e não
  são gravados.
- Nada interno sai daqui: `observacao`, `registrado_por` e o arquivo em si (o médium não baixa
  de volta o comprovante pela API).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.core.database import get_db
from src.core.errors import APIException, ConflictError, ForbiddenError, ValidationError
from src.core.limiter import limiter
from src.core.tz import APP_TZ, today_local, utc_now
from src.models import MensalidadeComprovante, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.mensalidade_gateway import MensalidadeCobranca
from src.services import mensalidade_parcial as parcial
from src.services import mensalidade_gateway as gateway_service
from src.services.pix_chave import ChavePixInvalida, normalizar_chave
from src.services.audit_service import AuditService
from src.services.medium_area import area_medium_modulos
from src.services.medium_inicio import (
    STATUS_EM_ABERTO,
    STATUS_EM_CONFERENCIA,
    STATUS_ISENTO,
    STATUS_NAO_CONFIRMADA,
    STATUS_PAGA,
    MensalidadeDoMes,
    situacao_mensalidade,
)
from src.services.medium_mensalidade import (
    MAX_COMPROVANTE_MEDIUM_BYTES,
    ComprovanteInvalido,
    chave_alterada_recente,
    descricao_pix,
    meses_da_area,
    parse_mes,
    validar_comprovante,
)
from src.services.pix_brcode import build_static_brcode, txid_mensalidade

router = APIRouter()

MODULO_INDISPONIVEL = "A mensalidade não está disponível na Área do Médium. Fale com a direção da casa."


async def require_modulo_mensalidade(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumContext:
    """Módulo "mensalidade" ligado pela casa e incluído no plano (senão 403 neutro, sem oferta)."""
    if "mensalidade" not in await area_medium_modulos(db, ctx.tenant_id):
        raise ForbiddenError(MODULO_INDISPONIVEL, details={"error_code": "MEDIUM_MODULO_INDISPONIVEL"})
    return ctx


# ── Schemas ───────────────────────────────────────────────────────────────────


class PixDaCasa(BaseModel):
    """Chave da casa para quem prefere digitar (e para o Pix Agendado Recorrente)."""

    tipo: Optional[str] = None
    chave: str
    nome_recebedor: Optional[str] = None
    # Preenchido só se a casa trocou a chave nos últimos 30 dias (§7.3: "Chave alterada em dd/mm").
    chave_alterada_em: Optional[datetime] = None


class ComprovanteEnviado(BaseModel):
    """Um comprovante que o médium enviou (sem o arquivo, sem ids)."""

    enviado_em: datetime
    valor_informado: Optional[float] = None
    # em_conferencia | conferido | nao_confirmado
    status: str
    valor_conferido: Optional[float] = None
    motivo: Optional[str] = None


class MesMensalidade(BaseModel):
    mes: str
    # pendente | atrasada | em_conferencia | nao_confirmada | paga | isento
    status: str
    # Mês em aberto: o que FALTA pagar (pagamento parcial); pago: o total recebido.
    valor: Optional[float] = None
    # Valor do mês e o que a casa já recebeu (comprovantes conferidos + cobranças pagas).
    valor_mensalidade: Optional[float] = None
    valor_recebido: float = 0.0
    vencimento: Optional[date] = None
    data_pagamento: Optional[datetime] = None
    comprovante_enviado_em: Optional[datetime] = None
    recusa_motivo: Optional[str] = None
    recusado_em: Optional[datetime] = None
    atual: bool = False
    # Paga pela cobrança automática (PIX/boleto na conta da casa, baixa pelo webhook).
    pago_automatico: bool = False
    # Comprovantes enviados pela Área neste mês, do mais antigo para o mais novo.
    comprovantes: List[ComprovanteEnviado] = []


class CobrancaAutomaticaInfo(BaseModel):
    """A casa recebe com baixa automática: "Pagar com PIX" gera a cobrança dinâmica."""

    provedor: str
    provedor_label: str
    pix: bool
    boleto: bool


class MensalidadesResponse(BaseModel):
    hoje: date
    # Isenção permanente do cadastro: a tela mostra "Você é isento de mensalidade".
    isento: bool
    valor_mensal: Optional[float] = None
    dia_vencimento: Optional[int] = None
    # None = a casa ainda não cadastrou a chave PIX ("Combine o pagamento com a casa").
    pix: Optional[PixDaCasa] = None
    # None = sem baixa automática (fluxo da chave estática + comprovante).
    cobranca_automatica: Optional[CobrancaAutomaticaInfo] = None
    meses: List[MesMensalidade]


class PixDoMes(BaseModel):
    mes: str
    valor: float
    copia_e_cola: str
    txid: str
    tipo: Optional[str] = None
    chave: str
    nome_recebedor: Optional[str] = None
    cidade: Optional[str] = None
    instrucoes: Optional[str] = None
    chave_alterada_em: Optional[datetime] = None


# ── Leitura ───────────────────────────────────────────────────────────────────


async def _config(db: AsyncSession, ctx: MediumContext) -> Optional[MensalidadeConfig]:
    return (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()


async def _registros(db: AsyncSession, ctx: MediumContext) -> dict[date, dict]:
    """Registros do médium por mês — sem arquivo, sem campos internos — com os comprovantes
    (`resumo`, migração 092) e o que entrou por cobrança automática (`recebido_gateway`)."""
    rows = (
        await db.execute(
            select(
                MensalidadePagamento.id,
                MensalidadePagamento.mes_referencia,
                MensalidadePagamento.status,
                MensalidadePagamento.valor_vigente,
                MensalidadePagamento.valor_pago,
                MensalidadePagamento.data_pagamento,
                MensalidadePagamento.origem,
            ).where(
                MensalidadePagamento.tenant_id == ctx.tenant_id,
                MensalidadePagamento.mediun_id == ctx.medium.id,
            )
        )
    ).mappings().all()
    resumos = await parcial.comprovantes_do_medium(db, ctx.tenant_id, ctx.medium.id)
    gateway = await parcial.gateway_pago_por_mes(db, ctx.tenant_id, [r["mes_referencia"] for r in rows], [ctx.medium.id])
    regs: dict[date, dict] = {}
    for r in rows:
        reg = dict(r)
        reg["resumo"] = resumos.get(r["id"], parcial.RESUMO_VAZIO)
        reg["recebido_gateway"] = gateway.get((ctx.medium.id, r["mes_referencia"]), parcial.ZERO)
        regs[r["mes_referencia"]] = reg
    return regs


def _cobranca_ativa(config: Optional[MensalidadeConfig]) -> bool:
    return config is not None and bool(config.ativo)


def _situacao(
    ctx: MediumContext, config: Optional[MensalidadeConfig], hoje: date, mes: date, reg: Optional[dict]
) -> Optional[MensalidadeDoMes]:
    ativa = _cobranca_ativa(config)
    return situacao_mensalidade(
        hoje=hoje,
        mes=mes,
        data_entrada=ctx.medium.data_entrada,
        isento_permanente=bool(ctx.medium.mensalidade_isento),
        valor_config=config.valor_mensal if ativa else None,
        dia_vencimento=config.dia_vencimento if config else 10,
        pagamento_status=reg["status"] if reg else None,
        pagamento_valor_vigente=reg["valor_vigente"] if reg else None,
        pagamento_valor_pago=reg["valor_pago"] if reg else None,
        pagamento_data=reg["data_pagamento"] if reg else None,
        valor_recebido=(reg["resumo"].recebido + reg["recebido_gateway"]) if reg else None,
        **(reg["resumo"] if reg else parcial.RESUMO_VAZIO).para_situacao(),
    )


def _meses(ctx: MediumContext, config: Optional[MensalidadeConfig], hoje: date, regs: dict[date, dict]) -> list[date]:
    inicio_cobranca: Optional[date] = None
    if _cobranca_ativa(config):
        criada = config.created_at
        inicio_cobranca = criada.astimezone(APP_TZ).date() if criada is not None else hoje
    return meses_da_area(
        hoje=hoje,
        data_entrada=ctx.medium.data_entrada,
        inicio_cobranca=inicio_cobranca,
        meses_com_registro=regs.keys(),
        isento_permanente=bool(ctx.medium.mensalidade_isento),
    )


def _comprovantes_enviados(reg: Optional[dict]) -> list[ComprovanteEnviado]:
    if not reg:
        return []
    return [
        ComprovanteEnviado(
            enviado_em=c.enviado_em,
            valor_informado=float(c.valor_informado) if c.valor_informado is not None else None,
            status=c.status,
            valor_conferido=float(c.valor_conferido) if c.valor_conferido is not None else None,
            motivo=c.motivo if c.status == "nao_confirmado" else None,
        )
        for c in reg["resumo"].comprovantes
        if c.origem == "medium"
    ]


def _item(sit: MensalidadeDoMes, hoje: date, reg: Optional[dict] = None) -> MesMensalidade:
    return MesMensalidade(
        mes=sit.mes,
        status=sit.status,
        valor=sit.valor,
        valor_mensalidade=sit.valor_mensalidade,
        valor_recebido=sit.valor_recebido or 0.0,
        vencimento=sit.vencimento,
        data_pagamento=sit.data_pagamento,
        comprovante_enviado_em=sit.comprovante_enviado_em,
        recusa_motivo=sit.recusa_motivo,
        recusado_em=sit.recusado_em,
        atual=sit.mes == hoje.strftime("%Y-%m"),
        pago_automatico=bool(
            reg and sit.status == STATUS_PAGA and reg.get("origem") == gateway_service.ORIGEM_GATEWAY
        ),
        comprovantes=_comprovantes_enviados(reg),
    )


def _pix_da_casa(config: Optional[MensalidadeConfig]) -> Optional[PixDaCasa]:
    if config is None or not config.pix_chave:
        return None
    return PixDaCasa(
        tipo=config.pix_tipo,
        chave=config.pix_chave,
        nome_recebedor=config.pix_nome_recebedor,
        chave_alterada_em=chave_alterada_recente(config.pix_alterado_em, utc_now()),
    )


def _parse_mes(texto: str) -> date:
    try:
        return parse_mes(texto)
    except ValueError:
        raise ValidationError("Mês inválido. Use AAAA-MM.", details={"error_code": "MES_INVALIDO"})


async def _mes_da_area(
    db: AsyncSession, ctx: MediumContext, mes: date
) -> tuple[Optional[MensalidadeConfig], MensalidadeDoMes, Optional[dict]]:
    """Situação de um mês que a tela mostra ao médium (404 se o mês não é dele)."""
    hoje = today_local()
    config = await _config(db, ctx)
    regs = await _registros(db, ctx)
    sit = _situacao(ctx, config, hoje, mes, regs.get(mes)) if mes in _meses(ctx, config, hoje, regs) else None
    if sit is None:
        raise APIException(
            "Este mês não tem mensalidade para você.",
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="NOT_FOUND",
            details={"error_code": "MES_SEM_MENSALIDADE"},
        )
    return config, sit, regs.get(mes)


def _exigir_valor_em_aberto(sit: MensalidadeDoMes) -> None:
    """O PIX/cobrança é do valor que FALTA: sem falta, não há o que pagar."""
    if (not sit.valor or sit.valor <= 0) and (sit.valor_recebido or 0) > 0:
        raise ConflictError(
            "A casa já recebeu o valor deste mês. Se tiver dúvida, fale com a casa.",
            details={"error_code": "SEM_VALOR_EM_ABERTO"},
        )
    if not sit.valor or sit.valor <= 0:
        raise ConflictError(
            "A casa ainda não definiu o valor da mensalidade. Fale com a casa.",
            details={"error_code": "MENSALIDADE_SEM_VALOR"},
        )


_MOTIVO_MES_FECHADO = {
    STATUS_PAGA: "Esta mensalidade já está paga.",
    STATUS_ISENTO: "Você é isento desta mensalidade.",
    STATUS_EM_CONFERENCIA: "Você já enviou o comprovante deste mês. A casa vai conferir.",
}


@router.get("/mensalidades", response_model=MensalidadesResponse)
async def listar_minhas_mensalidades(
    ctx: MediumContext = Depends(require_modulo_mensalidade),
    db: AsyncSession = Depends(get_db),
) -> MensalidadesResponse:
    hoje = today_local()
    config = await _config(db, ctx)
    regs = await _registros(db, ctx)
    itens: list[MesMensalidade] = []
    for mes in _meses(ctx, config, hoje, regs):
        sit = _situacao(ctx, config, hoje, mes, regs.get(mes))
        if sit is not None:
            itens.append(_item(sit, hoje, regs.get(mes)))
    ativa = _cobranca_ativa(config)
    gw = await gateway_service.gateway_para_cobrar(db, ctx.tenant_id)
    return MensalidadesResponse(
        hoje=hoje,
        isento=bool(ctx.medium.mensalidade_isento),
        valor_mensal=float(config.valor_mensal) if ativa and config.valor_mensal else None,
        dia_vencimento=config.dia_vencimento if ativa else None,
        pix=_pix_da_casa(config),
        cobranca_automatica=(
            CobrancaAutomaticaInfo(
                provedor=gw.provedor,
                provedor_label=gateway_service.PROVEDOR_LABEL.get(gw.provedor, gw.provedor),
                pix=gw.pix_disponivel,
                boleto=gw.boleto_disponivel,
            )
            if gw is not None
            else None
        ),
        meses=itens,
    )


@router.get("/mensalidades/{mes}/pix", response_model=PixDoMes)
async def pix_do_mes(
    mes: str,
    ctx: MediumContext = Depends(require_modulo_mensalidade),
    db: AsyncSession = Depends(get_db),
) -> PixDoMes:
    """PIX copia e cola (e o texto do QR) do mês em aberto, com o valor que FALTA e o txid do mês."""
    mes_date = _parse_mes(mes)
    config, sit, _ = await _mes_da_area(db, ctx, mes_date)
    if sit.status not in STATUS_EM_ABERTO:
        raise ConflictError(
            _MOTIVO_MES_FECHADO.get(sit.status, "Este mês não está em aberto."),
            details={"error_code": "MES_FECHADO", "status": sit.status},
        )
    if config is None or not config.pix_chave:
        raise ConflictError(
            "A casa ainda não cadastrou a chave PIX. Combine o pagamento com a casa.",
            details={"error_code": "PIX_NAO_CONFIGURADO"},
        )
    _exigir_valor_em_aberto(sit)
    txid = txid_mensalidade(mes_date, ctx.medium.id)
    try:
        copia_e_cola = build_static_brcode(
            chave=config.pix_chave,
            nome_recebedor=config.pix_nome_recebedor or "",
            cidade=config.pix_cidade or "",
            valor=sit.valor,
            txid=txid,
            descricao=descricao_pix(mes_date),
        )
    except ValueError:
        raise ConflictError(
            "Não conseguimos montar o PIX agora. Fale com a casa.",
            details={"error_code": "PIX_INDISPONIVEL"},
        )
    return PixDoMes(
        mes=sit.mes,
        valor=sit.valor,
        copia_e_cola=copia_e_cola,
        txid=txid,
        tipo=config.pix_tipo,
        chave=config.pix_chave,
        nome_recebedor=config.pix_nome_recebedor,
        cidade=config.pix_cidade,
        instrucoes=config.pix_instrucoes,
        chave_alterada_em=chave_alterada_recente(config.pix_alterado_em, utc_now()),
    )


def _valor_informado(texto: Optional[str]) -> Optional[Decimal]:
    """"30", "30.5", "30,50" → Decimal; vazio → None; inválido, zero ou absurdo → 422."""
    if texto is None or not texto.strip():
        return None
    bruto = texto.strip().replace("R$", "").replace(" ", "")
    if "," in bruto:
        bruto = bruto.replace(".", "").replace(",", ".")
    try:
        valor: Optional[Decimal] = Decimal(bruto).quantize(Decimal("0.01"))
    except (ArithmeticError, ValueError):
        valor = None
    if valor is None or not valor.is_finite() or valor <= 0 or valor > Decimal("99999999.99"):
        raise ValidationError(
            "Confira o valor que você pagou (ou deixe em branco).",
            details={"error_code": "VALOR_INVALIDO", "field": "valor_informado"},
        )
    return valor


@router.post(
    "/mensalidades/{mes}/comprovante",
    response_model=MesMensalidade,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("20/hour")
async def enviar_comprovante(
    request: Request,
    mes: str,
    arquivo: UploadFile = File(...),
    valor_informado: Optional[str] = Form(None),
    ctx: MediumContext = Depends(require_modulo_mensalidade),
    db: AsyncSession = Depends(get_db),
) -> MesMensalidade:
    """Acrescenta um comprovante ao mês SEM marcar como pago: ele fica "em conferência".

    Cria o registro do mês (PENDENTE, com o valor vigente da configuração, como o 1º registro
    do painel) se ainda não existe. Cada envio é um comprovante novo (pagamento parcial, 092):
    os anteriores — conferidos, não confirmados ou em conferência — ficam no histórico.
    `valor_informado` (opcional): quanto o médium diz ter pago. Mês pago ou isento → 409.
    """
    mes_date = _parse_mes(mes)
    valor = _valor_informado(valor_informado)
    data = await arquivo.read(MAX_COMPROVANTE_MEDIUM_BYTES + 1)
    try:
        comp = validar_comprovante(arquivo.content_type, data, arquivo.filename)
    except ComprovanteInvalido as exc:
        raise ValidationError(str(exc), details={"error_code": exc.code})

    config, sit, _ = await _mes_da_area(db, ctx, mes_date)
    if sit.status in (STATUS_PAGA, STATUS_ISENTO):
        raise ConflictError(_MOTIVO_MES_FECHADO[sit.status], details={"error_code": "MES_FECHADO", "status": sit.status})

    pagamento = (
        await db.execute(
            select(MensalidadePagamento)
            .where(
                MensalidadePagamento.tenant_id == ctx.tenant_id,
                MensalidadePagamento.mediun_id == ctx.medium.id,
                MensalidadePagamento.mes_referencia == mes_date,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    agora = utc_now()
    if pagamento is None:
        pagamento = MensalidadePagamento(
            id=uuid.uuid4(),
            tenant_id=ctx.tenant_id,
            mediun_id=ctx.medium.id,
            mes_referencia=mes_date,
            status=MensalidadeStatus.PENDENTE,
            valor_vigente=config.valor_mensal if config is not None else None,
        )
        db.add(pagamento)
    elif pagamento.status != MensalidadeStatus.PENDENTE:
        # A casa confirmou (ou isentou) entre a leitura e o lock.
        raise ConflictError("Esta mensalidade já foi resolvida pela casa.", details={"error_code": "MES_FECHADO"})
    pagamento.updated_at = agora
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Outro envio deste mês chegou junto. Tente de novo.", details={"error_code": "ENVIO_SIMULTANEO"})

    comprovante = MensalidadeComprovante(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        pagamento_id=pagamento.id,
        mediun_id=ctx.medium.id,
        origem="medium",
        enviado_por=ctx.user.id,
        enviado_em=agora,
        arquivo_data=data,
        arquivo_filename=comp.filename,
        arquivo_mime=comp.mime,
        arquivo_tamanho=len(data),
        valor_informado=valor,
    )
    db.add(comprovante)
    await db.flush()

    # Auditoria sem o arquivo (§6.8): só ids, o mês, o tipo, o tamanho e o valor informado.
    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user.id,
        resource_type="mensalidade_comprovante_medium",
        resource_id=comprovante.id,
        previous_state={"status": sit.status},
        new_state={
            "mes": sit.mes,
            "pagamento_id": str(pagamento.id),
            "acao": "reenviado" if sit.status in (STATUS_EM_CONFERENCIA, STATUS_NAO_CONFIRMADA) else "enviado",
            "mime": comp.mime,
            "tamanho_bytes": len(data),
            "valor_informado": str(valor) if valor is not None else None,
        },
    )
    await db.commit()

    _, depois, reg = await _mes_da_area(db, ctx, mes_date)
    return _item(depois, today_local(), reg)


# ── Cobrança automática (F-02/AM-22) ──────────────────────────────────────────


class EnderecoBoleto(BaseModel):
    logradouro: str = Field(..., min_length=3, max_length=200)  # rua e número
    cidade: str = Field(..., min_length=2, max_length=100)
    uf: str = Field(..., min_length=2, max_length=2)
    cep: str = Field(..., min_length=8, max_length=9)


class CobrancaRequest(BaseModel):
    metodo: Literal["pix", "boleto"] = "pix"
    # Só quando o provedor pede (PIX) ou para o boleto (obrigatório). Não é gravado.
    cpf: Optional[str] = Field(None, max_length=18)
    endereco: Optional[EnderecoBoleto] = None


class CobrancaDoMes(BaseModel):
    mes: str
    valor: float
    metodo: str
    provedor: str
    provedor_label: str
    # pendente | paga | expirada | cancelada | estornada (da cobrança)
    status: str
    # Situação do mês (paga quando a baixa já entrou)
    mes_status: str
    copia_e_cola: Optional[str] = None
    boleto_url: Optional[str] = None
    boleto_linha_digitavel: Optional[str] = None
    expira_em: Optional[datetime] = None
    pago_em: Optional[datetime] = None


def _cobranca_do_mes(cob: MensalidadeCobranca, sit: MensalidadeDoMes) -> CobrancaDoMes:
    aberta = cob.status == "pendente"
    return CobrancaDoMes(
        mes=cob.mes_referencia.strftime("%Y-%m"),
        valor=float(cob.valor),
        metodo=cob.metodo,
        provedor=cob.provedor,
        provedor_label=gateway_service.PROVEDOR_LABEL.get(cob.provedor, cob.provedor),
        status=cob.status,
        mes_status=sit.status,
        copia_e_cola=cob.copia_e_cola if aberta else None,
        boleto_url=cob.boleto_url if aberta else None,
        boleto_linha_digitavel=cob.boleto_linha_digitavel if aberta else None,
        expira_em=cob.expira_em,
        pago_em=cob.pago_em,
    )


def _cpf_ou_cnpj(texto: Optional[str]) -> Optional[str]:
    if not texto or not texto.strip():
        return None
    digitos = "".join(ch for ch in texto if ch.isdigit())
    try:
        return normalizar_chave("cnpj" if len(digitos) == 14 else "cpf", texto)
    except ChavePixInvalida as exc:
        raise ValidationError(str(exc), details={"error_code": "CPF_INVALIDO", "field": "cpf"})


def _endereco_boleto(endereco: Optional[EnderecoBoleto]) -> Optional[dict[str, str]]:
    if endereco is None:
        return None
    cep = "".join(ch for ch in endereco.cep if ch.isdigit())
    uf = endereco.uf.strip().upper()
    if len(cep) != 8 or not uf.isalpha():
        raise ValidationError("Confira o CEP e a UF.", details={"error_code": "DADOS_BOLETO", "field": "endereco"})
    return {
        "line1": " ".join(endereco.logradouro.split()),
        "city": " ".join(endereco.cidade.split()),
        "state": uf,
        "postal_code": cep,
    }


@router.post(
    "/mensalidades/{mes}/cobranca",
    response_model=CobrancaDoMes,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("20/hour")
async def criar_cobranca(
    request: Request,
    mes: str,
    body: CobrancaRequest,
    ctx: MediumContext = Depends(require_modulo_mensalidade),
    db: AsyncSession = Depends(get_db),
) -> CobrancaDoMes:
    """Cobrança automática do mês em aberto na conta da casa (reaproveita a pendente que ainda vale)."""
    mes_date = _parse_mes(mes)
    gw = await gateway_service.gateway_para_cobrar(db, ctx.tenant_id)
    if gw is None:
        raise ConflictError(
            "A casa não recebe a mensalidade automaticamente. Use a chave PIX e envie o comprovante.",
            details={"error_code": "COBRANCA_AUTOMATICA_INDISPONIVEL"},
        )
    _, sit, _ = await _mes_da_area(db, ctx, mes_date)
    if sit.status not in STATUS_EM_ABERTO:
        raise ConflictError(
            _MOTIVO_MES_FECHADO.get(sit.status, "Este mês não está em aberto."),
            details={"error_code": "MES_FECHADO", "status": sit.status},
        )
    # Cobrança do valor que FALTA (pagamento parcial): a pendente de outro valor não é reaproveitada.
    _exigir_valor_em_aberto(sit)
    cpf = _cpf_ou_cnpj(body.cpf)
    endereco = _endereco_boleto(body.endereco)
    if body.metodo == "boleto" and (not cpf or endereco is None):
        raise ValidationError(
            "Para o boleto, informe o CPF e o endereço de quem paga.",
            details={"error_code": "DADOS_BOLETO", "field": "cpf" if not cpf else "endereco"},
        )
    try:
        cob, criada = await gateway_service.criar_ou_reusar_cobranca(
            db,
            tenant_id=ctx.tenant_id,
            gw=gw,
            medium=ctx.medium,
            user_id=ctx.user.id,
            mes=mes_date,
            valor=Decimal(str(sit.valor)),
            metodo=body.metodo,
            pagador=gateway_service.DadosPagador(
                nome=ctx.medium.nome,
                email=ctx.medium.email or ctx.user.email,
                cpf=cpf,
                endereco=endereco if body.metodo == "boleto" else None,
            ),
        )
    except gateway_service.CobrancaRecusada as exc:
        await db.rollback()
        raise ConflictError(str(exc), details={"error_code": exc.codigo})
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Outro pedido deste mês chegou junto. Tente de novo.", details={"error_code": "ENVIO_SIMULTANEO"})
    if criada:
        await AuditService(db).log_create(
            tenant_id=ctx.tenant_id,
            user_id=ctx.user.id,
            resource_type="mensalidade_cobranca",
            resource_id=cob.id,
            details={"mes": sit.mes, "metodo": cob.metodo, "provedor": cob.provedor, "valor": str(cob.valor)},
        )
    await db.commit()
    await db.refresh(cob)
    return _cobranca_do_mes(cob, sit)


@router.get("/mensalidades/{mes}/cobranca", response_model=CobrancaDoMes)
async def ver_cobranca(
    mes: str,
    metodo: Literal["pix", "boleto"] = "pix",
    ctx: MediumContext = Depends(require_modulo_mensalidade),
    db: AsyncSession = Depends(get_db),
) -> CobrancaDoMes:
    """A cobrança automática mais recente do mês (a tela consulta para mostrar "Paga" sozinha)."""
    mes_date = _parse_mes(mes)
    _, sit, _ = await _mes_da_area(db, ctx, mes_date)
    cob = (
        await db.execute(
            select(MensalidadeCobranca)
            .where(
                MensalidadeCobranca.tenant_id == ctx.tenant_id,
                MensalidadeCobranca.mediun_id == ctx.medium.id,
                MensalidadeCobranca.mes_referencia == mes_date,
                MensalidadeCobranca.metodo == metodo,
            )
            .order_by(MensalidadeCobranca.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    if cob is None:
        raise APIException(
            "Nenhuma cobrança automática neste mês.",
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="NOT_FOUND",
            details={"error_code": "SEM_COBRANCA"},
        )
    return _cobranca_do_mes(cob, sit)

