"""
Email template — confirmação de cancelamento de senha pelo próprio consulente.
All CSS is inline for maximum Gmail/Outlook compatibility.
"""

from datetime import datetime, timezone
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def generate_ticket_cancelled_html(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    tenant_logo_url: str = "",
    primary_color: str = "#2E7D32",
    secondary_color: str = "",
) -> str:
    """HTML email confirming the consulente's self-service cancellation."""
    pc = primary_color or "#2E7D32"
    sc = secondary_color or pc
    ts = _timestamp()
    c_name = _esc(consulente_name)
    g_name = _esc(gira_name)
    t_name = _esc(tenant_name)

    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{t_name}" '
        f'style="max-width:160px;height:auto;margin-bottom:16px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);">'
        if tenant_logo_url else ""
    )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Senha Cancelada - {_esc(ticket_number)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:40px 20px;text-align:center;border-bottom:4px solid {pc};">
    {logo_block}
    <p style="margin:0 0 10px 0;color:rgba(255,255,255,0.9);font-size:18px;font-weight:700;">{t_name}</p>
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1px;">SENHA CANCELADA</h1>
  </div>

  <!-- Body -->
  <div style="padding:36px 24px;">
    <p style="margin:0 0 20px 0;font-size:16px;color:#555;">
      Olá <strong>{c_name}</strong>,
    </p>

    <p style="margin:0 0 24px 0;font-size:15px;color:#555;">
      Sua senha <strong>{_esc(ticket_number)}</strong> para a gira
      <strong>{g_name}</strong>{f" ({_esc(gira_date)})" if gira_date else ""} foi cancelada
      conforme solicitado. A vaga foi liberada para outra pessoa.
    </p>

    <div style="background-color:#f9f9f9;border-left:4px solid {pc};padding:16px;margin:24px 0;border-radius:4px;">
      <p style="margin:0;font-size:14px;color:#555;">
        Mudou de ideia? Se a emissão de senhas ainda estiver aberta, basta emitir
        uma nova senha pela página da gira. Esperamos você em uma próxima oportunidade!
      </p>
    </div>

    <p style="margin:24px 0 0 0;text-align:center;font-size:12px;color:#999;border-top:1px solid #e0e0e0;padding-top:16px;">
      {t_name} &copy; {datetime.now().year}
    </p>
  </div>

  <!-- Footer -->
  <div style="background-color:#f0f0f0;padding:16px;text-align:center;font-size:11px;color:#666;border-top:1px solid #e0e0e0;">
    <p style="margin:4px 0;">Email automático &middot; Enviado em {ts}</p>
  </div>
</div>
</body>
</html>"""


def generate_ticket_cancelled_text(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
) -> str:
    """Plain text fallback for the cancellation confirmation email."""
    date_part = f" ({gira_date})" if gira_date else ""
    return f"""SENHA CANCELADA

Olá {consulente_name},

Sua senha {ticket_number} para a gira {gira_name}{date_part} foi cancelada
conforme solicitado. A vaga foi liberada para outra pessoa.

Mudou de ideia? Se a emissão de senhas ainda estiver aberta, basta emitir uma
nova senha pela página da gira.

---
{tenant_name} — Email automático
"""
