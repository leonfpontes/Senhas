"""Tela Mensalidade da Área do Médium (AM-11/AM-12) — regras puras, sem banco.

As consultas ficam no endpoint (`src/api/v1/medium/mensalidades.py`, onde o auditor de tenant
confere o filtro por `ctx.tenant_id`/`ctx.medium.id`). O status de cada mês é o MESMO do Início
(`services/medium_inicio.situacao_mensalidade`); aqui fica só o que é próprio da tela:

- **Quais meses aparecem** (`meses_da_area`): do mês de entrada do médium (`data_entrada`, regra
  do mês de referência do AGENTS.md §11.10) até o mês corrente, mas nunca antes de a casa ter
  configurado a mensalidade (`inicio_cobranca` = criação da `mensalidade_configs`) nem mais de
  `MESES_NA_TELA` meses para trás — médium antigo numa casa que acabou de entrar no GiraHub não
  vê anos de "atrasada" que a casa nunca cobrou por aqui. Mês com registro (pago, isento,
  comprovante) sempre aparece. Isento permanente vê só o mês corrente (e os registros).
- **Comprovante enviado pelo médium** (`validar_comprovante`): JPEG, PNG, WebP ou PDF de até
  2 MB (`MAX_COMPROVANTE_MEDIUM_BYTES`; o navegador comprime a foto antes). O tipo é conferido
  pelos primeiros bytes do arquivo, não só pelo `Content-Type` que o celular declarou.
- **PIX do mês**: descrição curta para o BR Code e o aviso "Chave alterada em dd/mm" por
  `DIAS_AVISO_CHAVE_ALTERADA` dias (§7.3 do plano).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from dateutil.relativedelta import relativedelta

from .medium_inicio import fim_do_mes

MESES_NA_TELA = 12
MAX_COMPROVANTE_MEDIUM_BYTES = 2 * 1024 * 1024  # 2 MB (o painel aceita 5 MB)
DIAS_AVISO_CHAVE_ALTERADA = 30
RECUSA_MOTIVO_MAX = 500

# Tipo declarado → extensão. `image/jpg` aparece em alguns Androids antigos.
_TIPOS = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}
_MES_RE = re.compile(r"^(\d{4})-(\d{2})$")


class ComprovanteInvalido(ValueError):
    """Arquivo recusado; `code` vai no `error_code` da resposta (a tela traduz)."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ComprovanteValido:
    mime: str
    filename: str


def parse_mes(texto: str) -> date:
    """"AAAA-MM" → 1º dia do mês. ValueError se o formato ou o mês forem inválidos."""
    m = _MES_RE.fullmatch(texto or "")
    if not m:
        raise ValueError("Mês inválido. Use AAAA-MM.")
    return date(int(m.group(1)), int(m.group(2)), 1)


def meses_da_area(
    *,
    hoje: date,
    data_entrada: Optional[date],
    inicio_cobranca: Optional[date],
    meses_com_registro: Iterable[date],
    isento_permanente: bool = False,
    max_meses: int = MESES_NA_TELA,
) -> list[date]:
    """Meses (1º dia) que a tela mostra, do mais novo para o mais antigo (o corrente primeiro).

    `inicio_cobranca` None = a casa não tem mensalidade configurada/ativa: só os meses com
    registro aparecem.
    """
    atual = hoje.replace(day=1)
    meses: set[date] = {m.replace(day=1) for m in meses_com_registro if m.replace(day=1) <= atual}
    if inicio_cobranca is not None:
        limite = atual - relativedelta(months=max_meses - 1)
        inicio = max(limite, inicio_cobranca.replace(day=1))
        if data_entrada is not None:
            inicio = max(inicio, data_entrada.replace(day=1))
        if isento_permanente:
            inicio = max(inicio, atual)
        m = inicio
        while m <= atual:
            # Regra do mês de referência: entrou até o fim do mês.
            if data_entrada is None or data_entrada <= fim_do_mes(m):
                meses.add(m)
            m = m + relativedelta(months=1)
    return sorted(meses, reverse=True)


def _tipo_pelos_bytes(data: bytes) -> Optional[str]:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:1024].lstrip().startswith(b"%PDF-"):
        return "application/pdf"
    return None


def _nome_seguro(filename: Optional[str], ext: str) -> str:
    base = os.path.basename((filename or "").replace("\\", "/")).strip()
    base = re.sub(r"[^\w.\- ]+", "", base, flags=re.UNICODE)[:120].strip(" .")
    if not base:
        base = "comprovante"
    stem = base.rsplit(".", 1)[0] if "." in base else base
    return f"{stem or 'comprovante'}.{ext}"


def validar_comprovante(content_type: Optional[str], data: bytes, filename: Optional[str]) -> ComprovanteValido:
    """Confere tamanho e tipo do comprovante enviado pelo médium.

    Aceita JPEG/PNG/WebP/PDF de até 2 MB. O tipo vale pelo conteúdo: um arquivo declarado
    como imagem que não é imagem (ou um `application/octet-stream` que é PDF) é decidido
    pelos bytes iniciais, e é ele que fica gravado (`mime`). Tipo declarado fora da lista
    (ex.: `text/html`) é recusado mesmo que os bytes pareçam uma imagem.
    """
    if not data:
        raise ComprovanteInvalido("O arquivo chegou vazio. Escolha a foto ou o PDF de novo.", "COMPROVANTE_VAZIO")
    if len(data) > MAX_COMPROVANTE_MEDIUM_BYTES:
        raise ComprovanteInvalido(
            "O arquivo passa de 2 MB. Tire uma foto do comprovante ou envie o PDF do banco.",
            "COMPROVANTE_GRANDE",
        )
    declarado = (content_type or "").split(";")[0].strip().lower()
    real = _tipo_pelos_bytes(data)
    if real is None:
        raise ComprovanteInvalido(
            "Esse tipo de arquivo não serve. Envie uma foto (JPG, PNG ou WebP) ou um PDF.",
            "COMPROVANTE_TIPO",
        )
    if declarado not in _TIPOS and declarado not in ("", "application/octet-stream"):
        raise ComprovanteInvalido(
            "Esse tipo de arquivo não serve. Envie uma foto (JPG, PNG ou WebP) ou um PDF.",
            "COMPROVANTE_TIPO",
        )
    return ComprovanteValido(mime=real, filename=_nome_seguro(filename, _TIPOS[real]))


def descricao_pix(mes: date) -> str:
    """Texto curto que alguns bancos mostram no PIX ("Mensalidade 10/2026")."""
    return f"Mensalidade {mes.month:02d}/{mes.year}"


def chave_alterada_recente(alterado_em: Optional[datetime], agora: datetime) -> Optional[datetime]:
    """`alterado_em` se a chave mudou há menos de 30 dias (a tela avisa o médium), senão None."""
    if alterado_em is None:
        return None
    return alterado_em if agora - alterado_em <= timedelta(days=DIAS_AVISO_CHAVE_ALTERADA) else None


def comprovante_para_conferir(
    status: Optional[str],
    comprovante_enviado_em: Optional[datetime],
    comprovante_presente: bool,
    recusado_em: Optional[datetime],
) -> bool:
    """O registro está na fila "Comprovantes para conferir" do painel (AM-12).

    PENDENTE, com comprovante enviado pela Área ainda guardado e sem recusa depois do envio —
    a mesma condição do "em conferência" que o médium vê (`situacao_mensalidade`).
    """
    pendente = (getattr(status, "value", status) or "PENDENTE") == "PENDENTE"
    return (
        pendente
        and comprovante_enviado_em is not None
        and comprovante_presente
        and (recusado_em is None or recusado_em < comprovante_enviado_em)
    )
