"""Textos da notificação no celular da Área do Médium (AM-16) — regras puras, testadas sem banco.

O push sai pelo agendador do AM-15 (`services/medium_lembrete_scheduler.py`), junto do e-mail e com
a mesma marca de "já mandei". Aqui fica só o que aparece na tela do celular, para cada tipo:

- **Discreto (R-06 do plano)**: aparece na tela bloqueada. Nada de nome de gira/atividade, título
  ou texto de aviso, motivo de cancelamento, valor, chave PIX ou justificativa — só o tipo do
  lembrete, o mês, o dia/hora. O título é o nome do terreiro (como no assunto do e-mail).
- **Toque abre a Área** no lugar certo (`url` sempre um caminho `/medium/...`).
- `tag`: notificação nova do mesmo assunto substitui a anterior no celular em vez de empilhar.
"""
from __future__ import annotations

from typing import Any, Optional

from src.models.medium_lembretes import (
    TIPO_AVISO,
    TIPO_CANCELADA,
    TIPO_CONFIRMACAO,
    TIPO_ESCALA_NOVA,
    TIPO_FALTA,
    TIPO_MENSALIDADE_ANTES,
    TIPO_MENSALIDADE_DEPOIS,
    TIPO_PIX_ALTERADO,
    TIPO_TROCA_APROVADA,
    TIPO_TROCA_PEDIDA,
    TIPO_TROCA_RESPOSTA,
    TIPO_VESPERA,
)
from src.services.medium_lembretes import MESES, local, quando_legivel
from src.services.web_push import Notificacao

AREA = "/medium"


def _dia_e_hora(inicio) -> str:
    """"sábado, 12/10, às 9h" (Brasília) — sem o nome da atividade."""
    return quando_legivel(inicio)


def _hora(inicio) -> str:
    d = local(inicio)
    return f"{d.hour}h" if d.minute == 0 else f"{d.hour}h{d.minute:02d}"


def _mes(mes) -> str:
    return MESES[mes.month - 1]


def _agenda(p: Any) -> str:
    return f"{AREA}/agenda/{p.origem}/{p.ref_id}"


def notificacao(tipo: str, terreiro: str, reservadas: list[Any]) -> Optional[Notificacao]:
    """O push de um lembrete já reservado (as mesmas `reservadas` que montam o e-mail)."""
    titulo = (terreiro or "Área do Médium").strip()[:60]
    primeiro = reservadas[0] if reservadas else None
    if tipo == TIPO_MENSALIDADE_ANTES and primeiro is not None:
        return Notificacao(
            titulo,
            f"A mensalidade de {_mes(primeiro.mes)} vence em 3 dias.",
            f"{AREA}/mensalidade?pagar=1",
            tag="mensalidade",
        )
    if tipo == TIPO_MENSALIDADE_DEPOIS and primeiro is not None:
        return Notificacao(
            titulo,
            f"Lembrete: a mensalidade de {_mes(primeiro.mes)} ainda está em aberto.",
            f"{AREA}/mensalidade",
            tag="mensalidade",
        )
    if tipo == TIPO_PIX_ALTERADO:
        return Notificacao(
            titulo,
            "A casa trocou a chave PIX da mensalidade. Confira antes de pagar.",
            f"{AREA}/mensalidade",
            tag="pix",
        )
    if tipo == TIPO_ESCALA_NOVA and reservadas:
        n = len(reservadas)
        corpo = (
            f"Você entrou na escala de {_dia_e_hora(primeiro.inicio)}."
            if n == 1
            else f"Você entrou na escala de {n} atividades. Toque para ver."
        )
        return Notificacao(titulo, corpo, f"{AREA}/presencas", tag="escala")
    if tipo == TIPO_VESPERA and primeiro is not None:
        return Notificacao(
            titulo,
            f"Lembrete para amanhã, às {_hora(primeiro.inicio)}. Toque para ver.",
            _agenda(primeiro),
            tag=f"atividade-{primeiro.atividade_id}",
        )
    if tipo == TIPO_CONFIRMACAO and primeiro is not None:
        return Notificacao(
            titulo,
            f"Você vai em {_dia_e_hora(primeiro.inicio)}? Responda Vou ou Não vou.",
            _agenda(primeiro),
            tag=f"atividade-{primeiro.atividade_id}",
        )
    if tipo == TIPO_FALTA and primeiro is not None:
        return Notificacao(
            titulo,
            "Sentimos sua falta. Se quiser, conte o motivo para a casa.",
            f"{AREA}/presencas",
            tag=f"falta-{primeiro.atividade_id}",
        )
    if tipo == TIPO_AVISO and primeiro is not None:
        return Notificacao(titulo, "Novo aviso da casa. Toque para ler.", f"{AREA}/avisos/{primeiro.id}", tag="aviso")
    if tipo == TIPO_CANCELADA and primeiro is not None:
        return Notificacao(
            titulo,
            f"A atividade de {_dia_e_hora(primeiro.inicio)} foi cancelada.",
            _agenda(primeiro),
            tag=f"atividade-{primeiro.atividade_id}",
        )
    # Troca na escala (AM-27): sem nome de colega nem de atividade — a Área mostra o resto.
    if tipo == TIPO_TROCA_PEDIDA:
        return Notificacao(titulo, "Um colega pediu troca na escala com você. Toque para responder.", AREA, tag="troca")
    if tipo == TIPO_TROCA_RESPOSTA:
        return Notificacao(titulo, "Seu pedido de troca na escala teve resposta. Toque para ver.", AREA, tag="troca")
    if tipo == TIPO_TROCA_APROVADA:
        return Notificacao(titulo, "A troca na escala foi confirmada. Toque para ver.", f"{AREA}/presencas", tag="troca")
    return None


def notificacao_teste(terreiro: str) -> Notificacao:
    """O "Mandar um teste" do Perfil."""
    return Notificacao(
        (terreiro or "Área do Médium").strip()[:60],
        "Pronto! As notificações da Área chegam neste celular.",
        f"{AREA}/perfil",
        tag="teste",
    )
