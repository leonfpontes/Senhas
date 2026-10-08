"""Aviso à equipe GiraHub de um pedido novo no Programa de Parceiros (C-06).

Vai para ``settings.ALERT_EMAIL`` (o mesmo endereço da plataforma que recebe os alertas de erro);
``reply_to`` é o e-mail do interessado, para a equipe responder direto.
"""
from html import escape


def _row(label: str, value: str) -> str:
    return (
        '<tr><td style="padding:6px 12px 6px 0;color:#6b5a4e;font-size:13px;vertical-align:top;white-space:nowrap;">'
        f"{escape(label)}</td>"
        f'<td style="padding:6px 0;color:#2a1d16;font-size:14px;">{escape(value) if value else "—"}</td></tr>'
    )


def generate_parceiro_interesse_html(
    *,
    nome: str,
    tipo_label: str,
    nome_negocio: str,
    cidade: str,
    uf: str,
    whatsapp: str,
    email: str,
    como_divulgar: str,
    platform_url: str,
) -> str:
    rows = "".join(
        [
            _row("Nome", nome),
            _row("Tipo", tipo_label),
            _row("Loja / casa / perfil", nome_negocio),
            _row("Cidade", f"{cidade}/{uf}"),
            _row("WhatsApp", whatsapp),
            _row("E-mail", email),
            _row("Como pretende divulgar", como_divulgar),
        ]
    )
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Novo pedido de parceria</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f6f1ea;color:#2a1d16;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <div style="background:#180e09;padding:24px;color:#ffffff;">
    <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e9c46a;">Programa de Parceiros</p>
    <h1 style="margin:6px 0 0 0;font-size:20px;">Novo pedido de parceria</h1>
  </div>
  <div style="padding:24px;">
    <table role="presentation" style="border-collapse:collapse;width:100%;">{rows}</table>
    <p style="margin:24px 0 0 0;font-size:14px;">Prazo combinado na página: resposta em até 2 dias úteis.</p>
    <p style="margin:16px 0 0 0;"><a href="{escape(platform_url)}" style="display:inline-block;background:#9c4a2b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;">Abrir na plataforma</a></p>
  </div>
</div>
</body>
</html>"""


def generate_parceiro_interesse_text(
    *,
    nome: str,
    tipo_label: str,
    nome_negocio: str,
    cidade: str,
    uf: str,
    whatsapp: str,
    email: str,
    como_divulgar: str,
    platform_url: str,
) -> str:
    return (
        "Novo pedido no Programa de Parceiros GiraHub\n\n"
        f"Nome: {nome}\nTipo: {tipo_label}\nLoja/casa/perfil: {nome_negocio or '—'}\n"
        f"Cidade: {cidade}/{uf}\nWhatsApp: {whatsapp}\nE-mail: {email}\n"
        f"Como pretende divulgar: {como_divulgar}\n\n"
        f"Responder em até 2 dias úteis. Plataforma: {platform_url}\n"
    )
