"""
E-mail da beta "Avisar quem tem senha quando a gira é excluída" (Laboratório, jornadas v2).

Vai para cada pessoa com senha ativa (emitida ou na fila) quando a casa exclui a gira e marca
"Avisar por e-mail". Texto factual, sem caixa-alta. CSS inline (Gmail/Outlook).
"""

from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def gerar_gira_excluida_html(
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    primary_color: str = "#2E6A4E",
) -> str:
    pc = primary_color or "#2E6A4E"
    nome = _esc(consulente_name.split(" ")[0] if consulente_name else "")
    saudacao = f"Olá, {nome}." if nome else "Olá."
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>A gira foi cancelada</title></head>
<body style="margin:0;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#FAF6EF;color:#2A2420;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #EDE4D6;border-radius:14px;overflow:hidden;">
  <div style="background:{pc};padding:14px 22px;color:#FAF6EF;font-size:14px;font-weight:600;">{_esc(tenant_name)}</div>
  <div style="padding:24px 22px;">
    <p style="margin:0 0 12px 0;font-family:Georgia,serif;font-size:26px;">{saudacao}</p>
    <p style="margin:0 0 12px 0;font-size:16px;">A <strong>{_esc(gira_name)}</strong>, de {_esc(gira_date)}, foi cancelada pela casa.
    A sua senha para esta gira não vale mais.</p>
    <p style="margin:0;font-size:15px;color:#6B5F55;">Quando a casa marcar a próxima gira, o link para pegar a senha volta a circular.</p>
  </div>
</div>
</body></html>"""


def gerar_gira_excluida_texto(consulente_name: str, gira_name: str, gira_date: str, tenant_name: str) -> str:
    nome = consulente_name.split(" ")[0] if consulente_name else ""
    return (
        f"Olá{', ' + nome if nome else ''}.\n\n"
        f"A {gira_name}, de {gira_date}, foi cancelada pela casa {tenant_name}. "
        "A sua senha para esta gira não vale mais.\n\n"
        "Quando a casa marcar a próxima gira, o link para pegar a senha volta a circular.\n"
    )
