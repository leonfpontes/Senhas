"""
E-mail da beta "Lembrete no dia da gira" (Laboratório, jornadas v2 · J2 07).

Sai na manhã do dia da gira para quem tem senha emitida: o número, a hora, o recado da casa e
"Não vai poder vir? Libere a vaga". Sem caixa-alta. CSS inline (Gmail/Outlook).
"""

from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def gerar_lembrete_html(
    consulente_name: str,
    ticket_number: str,
    gira_name: str,
    gira_hora: str,
    tenant_name: str,
    ticket_link: str,
    cancel_link: str,
    recados: str = "",
    primary_color: str = "#2E6A4E",
) -> str:
    pc = primary_color or "#2E6A4E"
    nome = _esc(consulente_name.split(" ")[0] if consulente_name else "")
    recado = (
        f'<div style="padding:14px 22px;border-top:1px solid #EDE4D6;"><p style="margin:0 0 4px 0;font-size:13px;font-weight:600;">Recado da casa</p>'
        f'<p style="margin:0;font-size:14px;color:#6B5F55;">{_esc(recados)}</p></div>'
        if recados
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Hoje tem gira</title></head>
<body style="margin:0;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#FAF6EF;color:#2A2420;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #EDE4D6;border-radius:14px;overflow:hidden;">
  <div style="background:{pc};padding:14px 22px;color:#FAF6EF;font-size:14px;font-weight:600;">{_esc(tenant_name)}</div>
  <div style="padding:22px 22px 8px 22px;">
    <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:28px;">{'Olá, ' + nome + '.' if nome else 'Olá.'}</p>
    <p style="margin:0;font-size:16px;">Hoje tem <strong>{_esc(gira_name)}</strong>, às {_esc(gira_hora)}. Sua senha é a
    <strong style="font-family:Georgia,serif;font-size:20px;">{_esc(ticket_number)}</strong>: informe o número na entrada.</p>
  </div>
  <div style="padding:14px 22px 18px 22px;"><a href="{_esc(ticket_link)}" style="display:inline-block;background:{pc};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Ver o bilhete</a></div>
  {recado}
  <div style="padding:12px 22px 16px 22px;background:#F4EDE2;font-size:13px;color:#6B5F55;">Não vai poder vir?
    <a href="{_esc(cancel_link)}" style="color:#8A4A2B;font-weight:600;">Libere a vaga</a> para outra pessoa.</div>
</div>
</body></html>"""


def gerar_lembrete_texto(
    consulente_name: str, ticket_number: str, gira_name: str, gira_hora: str, tenant_name: str, ticket_link: str, cancel_link: str
) -> str:
    nome = consulente_name.split(" ")[0] if consulente_name else ""
    return (
        f"Olá{', ' + nome if nome else ''}.\n\n"
        f"Hoje tem {gira_name}, às {gira_hora}, na casa {tenant_name}. Sua senha é a {ticket_number}: informe o número na entrada.\n\n"
        f"Ver o bilhete: {ticket_link}\n"
        f"Não vai poder vir? Libere a vaga: {cancel_link}\n"
    )
