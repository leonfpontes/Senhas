"""E-mails de lembrete e aviso da Área do Médium (AM-15) e o resumo diário dos administradores.

Discretos de propósito (docs/plano-area-do-medium.md §6.8, LGPD art. 11): ser médium revela
convicção religiosa e a caixa de entrada é vista por outras pessoas (prévia no celular, conta
compartilhada). Por isso:

- **assunto e prévia** (o texto escondido que o celular mostra) nunca têm termo religioso nem o
  nome da atividade/aviso — só o nome que o terreiro escolheu ("<terreiro>: lembrete para amanhã");
- o corpo pode ter o nome da atividade (é o que a casa escreveu) e, no aviso, o texto do aviso —
  é a mensagem da casa;
- **o texto do motivo de uma ausência nunca entra** (pode ter dado de saúde): o convite para contar o
  motivo e o resumo do admin só trazem "se quiser, conte o motivo" e contagens;
- todo texto variável é escapado (`html.escape`) e o aviso vira parágrafos de texto simples;
- vocabulário do glossário da Área (`docs/estudo-ux-area-do-medium.md` §6): "Você está na escala",
  "Vou / Não vou", "Conte o motivo", "Avisos", "Mensalidade", "Pagar com PIX" — nunca "convocado",
  "check-in" ou "justificativa obrigatória";
- rodapé com o link de descadastro daquele tipo de aviso e de todos (`/descadastro/<token>`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from typing import Optional


@dataclass(frozen=True)
class VisualTerreiro:
    nome: str
    cor: str = "#4f46e5"
    logo_url: Optional[str] = None


@dataclass
class Conteudo:
    """O que muda de um lembrete para outro. `preheader` = prévia no celular (discreta)."""

    assunto: str
    preheader: str
    titulo: str
    paragrafos: list[str] = field(default_factory=list)
    detalhes: list[tuple[str, str]] = field(default_factory=list)
    botao_texto: Optional[str] = None
    botao_url: Optional[str] = None
    # Texto livre da casa (aviso): vira parágrafos escapados, quebras de linha preservadas.
    texto_da_casa: Optional[str] = None
    # Linha do rodapé: por que a pessoa recebe.
    motivo_rodape: str = ""


@dataclass(frozen=True)
class LinksDescadastro:
    tipo: str  # link que desliga só este tipo de aviso
    todos: str  # link que desliga todos os avisos por e-mail
    rotulo_tipo: str  # "lembretes da mensalidade"


def _saudacao(nome: Optional[str]) -> str:
    primeiro = (nome or "").strip().split(" ")[0] if nome else ""
    return f"Olá, {primeiro}!" if primeiro else "Olá!"


def _cor(cor: Optional[str]) -> str:
    valor = (cor or "").strip()
    # Só hex de cor vai para o CSS (a cor vem do cadastro do terreiro).
    if len(valor) in (4, 7) and valor.startswith("#") and all(c in "0123456789abcdefABCDEF" for c in valor[1:]):
        return valor
    return "#4f46e5"


# ── Conteúdo de cada tipo ───────────────────────────────────────────────────


def conteudo_mensalidade(
    *, terreiro: str, nome: str, depois: bool, mes_label: str, valor: Optional[str], vencimento: str, link: str
) -> Conteudo:
    detalhes = [("Mês", mes_label), ("Vencimento", vencimento)]
    if valor:
        detalhes.insert(1, ("Valor", valor))
    if depois:
        return Conteudo(
            assunto=f"{terreiro}: lembrete da mensalidade",
            preheader="Um lembrete gentil sobre a mensalidade do mês.",
            titulo="Um lembrete sobre a mensalidade",
            paragrafos=[
                _saudacao(nome),
                f"A mensalidade de {mes_label} venceu há 3 dias e a casa ainda não recebeu o comprovante. "
                "Se você já pagou, é só enviar o comprovante pela Área. Se precisar de mais prazo, fale com a casa.",
            ],
            detalhes=detalhes,
            botao_texto="Abrir a mensalidade",
            botao_url=link,
            motivo_rodape="Você recebe este lembrete porque paga mensalidade à casa.",
        )
    return Conteudo(
        assunto=f"{terreiro}: sua mensalidade vence em 3 dias",
        preheader="Lembrete da mensalidade do mês.",
        titulo="Sua mensalidade vence em 3 dias",
        paragrafos=[
            _saudacao(nome),
            "Só um lembrete: a mensalidade do mês vence em 3 dias. Pela Área você paga com PIX e envia o comprovante.",
        ],
        detalhes=detalhes,
        botao_texto="Pagar com PIX",
        botao_url=link,
        motivo_rodape="Você recebe este lembrete porque paga mensalidade à casa.",
    )


def conteudo_pix_alterado(*, terreiro: str, nome: str, quando: str, link: str) -> Conteudo:
    """A chave em si nunca vai no e-mail: a pessoa confere na Área."""
    return Conteudo(
        assunto=f"{terreiro}: a chave PIX da mensalidade mudou",
        preheader="A casa atualizou a forma de pagar a mensalidade.",
        titulo="A casa trocou a chave PIX da mensalidade",
        paragrafos=[
            _saudacao(nome),
            f"Em {quando}, a casa trocou a chave PIX da mensalidade. Antes do próximo pagamento, confira a chave "
            "nova na Área (em Mensalidade → Pagar com PIX).",
            "Por segurança, este e-mail não traz a chave. Se alguém mandar outra chave por mensagem, confira na Área "
            "ou fale com a casa antes de pagar.",
        ],
        botao_texto="Conferir na Área",
        botao_url=link,
        motivo_rodape="Você recebe este aviso porque paga mensalidade à casa.",
    )


@dataclass(frozen=True)
class ItemAtividade:
    """Uma atividade/gira no e-mail: o que a casa chamou, quando e onde."""

    titulo: str
    quando: str  # "sábado, 12/10, às 9h"
    local: Optional[str] = None
    grupo: Optional[str] = None
    funcao: Optional[str] = None
    link: Optional[str] = None


def _detalhes_item(item: ItemAtividade) -> list[tuple[str, str]]:
    detalhes = [("O quê", item.titulo), ("Quando", item.quando)]
    if item.funcao:
        detalhes.append(("Sua função", item.funcao))
    if item.grupo:
        detalhes.append(("Seu grupo", item.grupo))
    if item.local:
        detalhes.append(("Onde", item.local))
    return detalhes


def conteudo_escala_nova(*, terreiro: str, nome: str, itens: list[ItemAtividade], link: str) -> Conteudo:
    um = len(itens) == 1
    detalhes: list[tuple[str, str]] = []
    for item in itens:
        detalhes.extend(_detalhes_item(item))
    return Conteudo(
        assunto=f"{terreiro}: você está na escala",
        preheader="Abra a Área para ver os dias e responder.",
        titulo="Você está na escala" if um else f"Você está na escala de {len(itens)} dias",
        paragrafos=[
            _saudacao(nome),
            "A casa colocou você na escala. Abra a Área para ver os detalhes e responder Vou ou Não vou.",
        ],
        detalhes=detalhes,
        botao_texto="Ver na Área",
        botao_url=itens[0].link if um and itens[0].link else link,
        motivo_rodape="Você recebe este aviso porque está na escala da casa.",
    )


def conteudo_vespera(*, terreiro: str, nome: str, item: ItemAtividade, na_escala: bool) -> Conteudo:
    frase = "Amanhã você está na escala." if na_escala else "Lembrete: amanhã você tem compromisso na casa."
    return Conteudo(
        assunto=f"{terreiro}: lembrete para amanhã",
        preheader="Um lembrete do que tem amanhã.",
        titulo="Amanhã você está na escala" if na_escala else "Lembrete para amanhã",
        paragrafos=[_saudacao(nome), frase + " Se não puder ir, avise a casa pela Área (Não vou)."],
        detalhes=_detalhes_item(item),
        botao_texto="Ver os detalhes",
        botao_url=item.link,
        motivo_rodape="Você recebe este lembrete porque está na escala da casa.",
    )


def conteudo_confirmacao(*, terreiro: str, nome: str, item: ItemAtividade) -> Conteudo:
    return Conteudo(
        assunto=f"{terreiro}: responda se você vai",
        preheader="A casa quer saber se você vai.",
        titulo="Você vai?",
        paragrafos=[
            _saudacao(nome),
            "Você está na escala e ainda não respondeu. Toque em Vou ou Não vou na Área — assim a casa se organiza.",
        ],
        detalhes=_detalhes_item(item),
        botao_texto="Responder na Área",
        botao_url=item.link,
        motivo_rodape="Você recebe este lembrete porque está na escala da casa.",
    )


def conteudo_falta(*, terreiro: str, nome: str, item: ItemAtividade, prazo: str, link: str) -> Conteudo:
    """Convite gentil para contar o motivo — nunca traz o motivo (nem o pede por e-mail)."""
    return Conteudo(
        assunto=f"{terreiro}: sentimos sua falta",
        preheader="Se quiser, conte o motivo pela Área.",
        titulo="Sentimos sua falta",
        paragrafos=[
            _saudacao(nome),
            f"Você não estava em “{item.titulo}” ({item.quando}). Se quiser, conte o motivo pela Área até "
            f"{prazo}. Não precisa detalhar motivo de saúde.",
        ],
        botao_texto="Conte o motivo",
        botao_url=link,
        motivo_rodape="Você recebe este aviso porque estava na escala da casa.",
    )


def conteudo_cancelada(*, terreiro: str, nome: str, item: ItemAtividade, motivo: Optional[str]) -> Conteudo:
    paragrafos = [_saudacao(nome), "A casa cancelou uma atividade em que você estava na escala."]
    detalhes = _detalhes_item(item)
    if motivo:
        detalhes.append(("Motivo", motivo))
    return Conteudo(
        assunto=f"{terreiro}: uma atividade foi cancelada",
        preheader="Uma mudança na agenda da casa.",
        titulo="Atividade cancelada",
        paragrafos=paragrafos,
        detalhes=detalhes,
        botao_texto="Ver a agenda",
        botao_url=item.link,
        motivo_rodape="Você recebe este aviso porque estava na escala da casa.",
    )


def conteudo_troca_pedida(
    *, terreiro: str, nome: str, colega: Optional[str], item: ItemAtividade, recado: Optional[str]
) -> Conteudo:
    """Ao colega chamado (AM-27): alguém pediu que ele vá no lugar. Só o primeiro nome de quem pediu."""
    quem = colega or "Um colega da corrente"
    detalhes = _detalhes_item(item)
    if recado:
        detalhes.append(("Recado", recado))
    return Conteudo(
        assunto=f"{terreiro}: pedido de troca na escala",
        preheader="Um colega perguntou se você pode ir no lugar dele.",
        titulo="Pedido de troca na escala",
        paragrafos=[
            _saudacao(nome),
            f"{quem} perguntou se você pode ir no lugar dele(a). Abra a Área para responder: Aceito ir ou Não posso.",
        ],
        detalhes=detalhes,
        botao_texto="Responder na Área",
        botao_url=item.link,
        motivo_rodape="Você recebe este aviso porque um colega pediu troca na escala da casa.",
    )


def conteudo_troca_resposta(
    *, terreiro: str, nome: str, colega: Optional[str], item: ItemAtividade, resultado: str
) -> Conteudo:
    """A quem pediu (AM-27): `resultado` = aceito (falta a direção) · recusado_colega ·
    recusado_direcao · cancelado_direcao."""
    quem = colega or "O colega"
    frases = {
        "aceito": f"{quem} aceitou ir no seu lugar. Agora falta a direção da casa aprovar; até lá, você continua na escala.",
        "recusado_colega": f"{quem} não pode ir no seu lugar. Você continua na escala — se precisar, peça a outro colega.",
        "recusado_direcao": "A direção da casa não aprovou a troca. Você continua na escala.",
        "cancelado_direcao": "A direção da casa cancelou o seu pedido de troca. Você continua na escala.",
    }
    return Conteudo(
        assunto=f"{terreiro}: resposta ao seu pedido de troca",
        preheader="Seu pedido de troca na escala teve resposta.",
        titulo="Resposta ao seu pedido de troca",
        paragrafos=[_saudacao(nome), frases.get(resultado, frases["recusado_direcao"])],
        detalhes=_detalhes_item(item),
        botao_texto="Ver na Área",
        botao_url=item.link,
        motivo_rodape="Você recebe este aviso porque pediu troca na escala da casa.",
    )


def conteudo_troca_aprovada(
    *, terreiro: str, nome: str, colega: Optional[str], item: ItemAtividade, foi_quem_pediu: bool
) -> Conteudo:
    """Aos dois (AM-27): a troca valeu. Quem pediu sai da escala; o colega entra no lugar."""
    if foi_quem_pediu:
        quem = colega or "um colega da corrente"
        frase = f"A troca foi confirmada: {quem} vai no seu lugar. Você não está mais nesta escala."
        titulo = "Troca confirmada"
    else:
        quem = colega or "um colega"
        frase = f"A troca foi confirmada: você está na escala no lugar de {quem}."
        titulo = "Você está na escala"
    return Conteudo(
        assunto=f"{terreiro}: troca na escala confirmada",
        preheader="Uma troca na escala foi confirmada.",
        titulo=titulo,
        paragrafos=[_saudacao(nome), frase],
        detalhes=_detalhes_item(item),
        botao_texto="Ver na Área",
        botao_url=item.link,
        motivo_rodape="Você recebe este aviso porque participou de uma troca na escala da casa.",
    )


def conteudo_aviso(*, terreiro: str, nome: str, titulo: str, texto: str, link: str) -> Conteudo:
    return Conteudo(
        assunto=f"{terreiro}: novo aviso da casa",
        preheader="A casa publicou um aviso para você.",
        titulo=titulo,
        paragrafos=[_saudacao(nome), "A casa publicou um aviso na Área:"],
        texto_da_casa=texto,
        botao_texto="Abrir na Área",
        botao_url=link,
        motivo_rodape="Você recebe este e-mail porque a casa pediu para avisar também por e-mail.",
    )


def conteudo_resumo_admin(
    *, terreiro: str, comprovantes: int, ausencias: int, motivos: int, link_comprovantes: str, link_atividades: str
) -> Conteudo:
    """Só contagens: nada de nome de médium, motivo de ausência ou valor."""
    detalhes: list[tuple[str, str]] = []
    if comprovantes:
        detalhes.append(("Comprovantes para conferir", str(comprovantes)))
    if ausencias:
        detalhes.append(("Ausências avisadas (últimas 24 h)", str(ausencias)))
    if motivos:
        detalhes.append(("Motivos novos de ausência (últimas 24 h)", str(motivos)))
    paragrafos = ["Resumo do que chegou pela Área do Médium e pede a atenção da casa."]
    if ausencias or motivos:
        paragrafos.append(
            "Ausências e motivos ficam em Corrente → Atividades e escalas → Confirmações de cada atividade "
            "(o motivo só aparece para quem tem acesso às escalas)."
        )
    return Conteudo(
        assunto=f"Resumo do dia na Área do Médium — {terreiro}",
        preheader="O que chegou pela Área do Médium.",
        titulo="Resumo do dia",
        paragrafos=paragrafos,
        detalhes=detalhes,
        botao_texto="Conferir comprovantes" if comprovantes else "Abrir o painel",
        botao_url=link_comprovantes if comprovantes else link_atividades,
        motivo_rodape="Você recebe este resumo porque é administrador deste terreiro no GiraHub.",
    )


# ── Montagem (HTML e texto) ─────────────────────────────────────────────────


def _paragrafos_da_casa(texto: str) -> str:
    blocos = [b.strip() for b in (texto or "").replace("\r\n", "\n").split("\n\n") if b.strip()]
    return "".join(
        '<p style="margin:0 0 12px;color:#111827;font-size:15px;line-height:1.6;">'
        + "<br>".join(escape(linha) for linha in bloco.split("\n"))
        + "</p>"
        for bloco in blocos
    )


def render_html(conteudo: Conteudo, visual: VisualTerreiro, descadastro: Optional[LinksDescadastro]) -> str:
    pc = escape(_cor(visual.cor))
    casa = escape(visual.nome or "seu terreiro")
    logo = (
        f'<img src="{escape(visual.logo_url)}" alt="{casa}" width="64" '
        'style="max-width:64px;height:auto;border-radius:50%;margin-bottom:8px;">'
        if visual.logo_url
        else ""
    )
    paragrafos = "".join(
        f'<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">{escape(p)}</p>'
        for p in conteudo.paragrafos
    )
    casa_texto = ""
    if conteudo.texto_da_casa:
        casa_texto = (
            '<div style="margin:4px 0 18px;padding:14px 16px;border-left:4px solid '
            f'{pc};background:#F9FAFB;border-radius:4px;">{_paragrafos_da_casa(conteudo.texto_da_casa)}</div>'
        )
    detalhes = ""
    if conteudo.detalhes:
        linhas = "".join(
            f'<tr><td style="padding:4px 12px 4px 0;color:#6B7280;font-size:14px;vertical-align:top;">{escape(k)}</td>'
            f'<td style="padding:4px 0;color:#111827;font-size:14px;">{escape(v)}</td></tr>'
            for k, v in conteudo.detalhes
        )
        detalhes = f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">{linhas}</table>'
    botao = ""
    if conteudo.botao_texto and conteudo.botao_url:
        botao = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            '<td align="center" style="padding:4px 0 20px;">'
            f'<a href="{escape(conteudo.botao_url)}" style="display:inline-block;background:{pc};color:#FFFFFF;'
            'text-decoration:none;font-size:15px;font-weight:700;padding:12px 28px;border-radius:8px;">'
            f"{escape(conteudo.botao_texto)}</a></td></tr></table>"
        )
    rodape_descadastro = ""
    if descadastro is not None:
        rodape_descadastro = (
            '<p style="margin:8px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">'
            f'Não quer mais receber {escape(descadastro.rotulo_tipo)} por e-mail? '
            f'<a href="{escape(descadastro.tipo)}" style="color:#6B7280;">Desligar estes avisos</a> · '
            f'<a href="{escape(descadastro.todos)}" style="color:#6B7280;">Desligar todos os e-mails da Área</a>. '
            "Você também muda isso no Perfil da Área.</p>"
        )
    preheader = escape(conteudo.preheader)
    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:{pc};padding:24px 32px;text-align:center;">
          {logo}
          <p style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">{casa}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 16px;color:#111827;font-size:21px;font-weight:700;">{escape(conteudo.titulo)}</h1>
          {paragrafos}
          {casa_texto}
          {detalhes}
          {botao}
        </td>
      </tr>
      <tr>
        <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 32px;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:1.6;">
            {escape(conteudo.motivo_rodape)} Enviado pelo GiraHub a pedido de {casa}.
          </p>
          {rodape_descadastro}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


def render_texto(conteudo: Conteudo, visual: VisualTerreiro, descadastro: Optional[LinksDescadastro]) -> str:
    linhas = [visual.nome or "", "", conteudo.titulo, ""]
    linhas.extend(p for p in conteudo.paragrafos)
    if conteudo.texto_da_casa:
        linhas.extend(["", conteudo.texto_da_casa.strip(), ""])
    for k, v in conteudo.detalhes:
        linhas.append(f"{k}: {v}")
    if conteudo.botao_url:
        linhas.extend(["", f"{conteudo.botao_texto or 'Abrir'}: {conteudo.botao_url}"])
    linhas.extend(["", f"{conteudo.motivo_rodape} Enviado pelo GiraHub a pedido de {visual.nome}."])
    if descadastro is not None:
        linhas.append(f"Desligar {descadastro.rotulo_tipo}: {descadastro.tipo}")
        linhas.append(f"Desligar todos os e-mails da Área: {descadastro.todos}")
    return "\n".join(linhas).strip() + "\n"
