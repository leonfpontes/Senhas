"""Tela Início da Área do Médium (AM-06) — regras puras, sem banco.

As consultas ficam no endpoint (`src/api/v1/medium/inicio.py`, onde o auditor de tenant
confere o filtro por `ctx.tenant_id`/`ctx.medium.id`); aqui só o que dá para testar sem
Postgres:

- **Mensalidade do mês** (`situacao_mensalidade`): mesmas regras do painel (AGENTS.md §11.10)
  — isenção permanente ou registro ISENTO → "isento"; registro PAGO → "paga"; sem pagamento,
  "pendente" até o dia do vencimento e "atrasada" depois dele (no fuso de Brasília). O valor é
  o vigente gravado no 1º registro do mês ou, sem registro, o valor da configuração. Médium que
  só entrou depois do mês não tem mensalidade nele.
- **Pendências** (`montar_pendencias`, decisão D-24): o que o médium precisa resolver vem
  primeiro, já na ordem da tela — responder escala (AM-17, ainda vazio), mensalidade vencida ou
  a até 5 dias do vencimento (`DIAS_AVISO_MENSALIDADE`), aviso novo (AM-09, ainda vazio).
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from ..models.mensalidades import MensalidadeStatus

# Ordem das pendências na tela (D-24). Escala e aviso ficam reservados para AM-17 e AM-09.
ORDEM_PENDENCIAS = {"escala": 0, "mensalidade": 1, "aviso": 2}

# Mensalidade em aberto só sobe para "Para você ver agora" a partir de N dias antes do
# vencimento (decisão do dono, 07/10); antes disso fica em "Acompanhando". Atrasada sempre sobe.
DIAS_AVISO_MENSALIDADE = 5

STATUS_ISENTO = "isento"
STATUS_PAGA = "paga"
STATUS_PENDENTE = "pendente"
STATUS_ATRASADA = "atrasada"


def vencimento_do_mes(mes: date, dia: int) -> date:
    """Dia de vencimento dentro do mês (dia 31 em fevereiro vira o último dia)."""
    ultimo = calendar.monthrange(mes.year, mes.month)[1]
    return mes.replace(day=max(1, min(dia, ultimo)))


def fim_do_mes(mes: date) -> date:
    return mes.replace(day=calendar.monthrange(mes.year, mes.month)[1])


@dataclass(frozen=True)
class MensalidadeDoMes:
    mes: str  # "YYYY-MM"
    status: str  # isento | paga | pendente | atrasada
    valor: Optional[float]
    vencimento: Optional[date]
    data_pagamento: Optional[datetime]

    def as_dict(self) -> dict[str, Any]:
        return {
            "mes": self.mes,
            "status": self.status,
            "valor": self.valor,
            "vencimento": self.vencimento.isoformat() if self.vencimento else None,
            "data_pagamento": self.data_pagamento.isoformat() if self.data_pagamento else None,
        }


def situacao_mensalidade(
    *,
    hoje: date,
    data_entrada: Optional[date],
    isento_permanente: bool,
    valor_config: Optional[Decimal],
    dia_vencimento: int,
    pagamento_status: Optional[MensalidadeStatus],
    pagamento_valor_vigente: Optional[Decimal],
    pagamento_valor_pago: Optional[Decimal],
    pagamento_data: Optional[datetime],
) -> Optional[MensalidadeDoMes]:
    """Mensalidade do mês corrente do médium, ou None quando não há o que mostrar.

    None: médium que entrou depois do mês, ou casa sem valor configurado e sem registro no mês.
    """
    inicio = hoje.replace(day=1)
    mes = inicio.strftime("%Y-%m")
    tem_registro = pagamento_status is not None
    # Regra do mês de referência (§11.10): entra quem estava na casa em algum dia do mês — o
    # `require_medium` já garante que está ativo — ou quem já tem registro no mês.
    if not tem_registro and data_entrada is not None and data_entrada > fim_do_mes(inicio):
        return None

    if isento_permanente or pagamento_status == MensalidadeStatus.ISENTO:
        return MensalidadeDoMes(mes=mes, status=STATUS_ISENTO, valor=None, vencimento=None, data_pagamento=None)

    vencimento = vencimento_do_mes(inicio, dia_vencimento)
    if pagamento_status == MensalidadeStatus.PAGO:
        valor = pagamento_valor_pago if pagamento_valor_pago is not None else pagamento_valor_vigente
        return MensalidadeDoMes(
            mes=mes,
            status=STATUS_PAGA,
            valor=float(valor) if valor is not None else None,
            vencimento=vencimento,
            data_pagamento=pagamento_data,
        )

    valor = pagamento_valor_vigente if pagamento_valor_vigente is not None else valor_config
    if not tem_registro and (valor is None or valor <= 0):
        # A casa ainda não definiu o valor: nada a cobrar do médium.
        return None
    return MensalidadeDoMes(
        mes=mes,
        status=STATUS_ATRASADA if hoje > vencimento else STATUS_PENDENTE,
        valor=float(valor) if valor is not None else None,
        vencimento=vencimento,
        data_pagamento=None,
    )


def montar_pendencias(
    *,
    hoje: date,
    mensalidade: Optional[MensalidadeDoMes],
    avisos_nao_lidos: int = 0,
    escalas_a_responder: int = 0,
) -> list[dict[str, Any]]:
    """Pendências do Início, já ordenadas (D-24): escala → mensalidade → aviso novo."""
    itens: list[dict[str, Any]] = []
    if escalas_a_responder > 0:
        itens.append({"tipo": "escala", "quantidade": escalas_a_responder})
    dias = (mensalidade.vencimento - hoje).days if mensalidade and mensalidade.vencimento else None
    if mensalidade is not None and (
        mensalidade.status == STATUS_ATRASADA
        or (mensalidade.status == STATUS_PENDENTE and dias is not None and dias <= DIAS_AVISO_MENSALIDADE)
    ):
        itens.append(
            {
                "tipo": "mensalidade",
                "situacao": mensalidade.status,
                "mes": mensalidade.mes,
                "valor": mensalidade.valor,
                "vencimento": mensalidade.vencimento.isoformat() if mensalidade.vencimento else None,
                "dias_para_vencer": dias,
            }
        )
    if avisos_nao_lidos > 0:
        itens.append({"tipo": "aviso", "quantidade": avisos_nao_lidos})
    return sorted(itens, key=lambda p: ORDEM_PENDENCIAS[p["tipo"]])
