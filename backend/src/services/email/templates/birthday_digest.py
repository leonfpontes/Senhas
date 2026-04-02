"""
Birthday digest email template.
Sent daily at 08:00 BRT to admins when médiuns have upcoming birthdays.
All user-supplied content is HTML-escaped to prevent injection.
"""

from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List

_CAKE = "&#127874;"  # 🎂 as HTML entity


def _esc(v: Any) -> str:
    if v is None:
        return ""
    return escape(str(v))


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def _dias_label(dias: int) -> str:
    if dias == 0:
        return "Hoje!"
    if dias == 1:
        return "Amanhã"
    return f"Em {dias} dia{'s' if dias > 1 else ''}"


def render_birthday_digest(
    mediuns: List[Dict[str, Any]],
    tenant_name: str,
    primary_color: str = "#1976d2",
) -> str:
    """Return the HTML body for a birthday digest email.

    Args:
        mediuns: List of dicts with keys: nome, telefone, data_nascimento,
                 dias_ate_aniversario.
        tenant_name: Display name of the terreiro.
        primary_color: Hex color for header and accents (default MUI blue).
    """
    t_name = _esc(tenant_name)
    ts = _timestamp()

    rows_html = ""
    for m in mediuns:
        nome = _esc(m.get("nome", ""))
        telefone = _esc(m.get("telefone") or "—")
        dn = m.get("data_nascimento")
        dn_str = dn.strftime("%d/%m") if hasattr(dn, "strftime") else _esc(str(dn)) if dn else "—"
        dias = int(m.get("dias_ate_aniversario", 0))
        badge_bg = primary_color if dias > 0 else "#d32f2f"
        badge_label = _dias_label(dias)
        rows_html += f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">{nome}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;">{dn_str}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;">{telefone}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
            <span style="background:{badge_bg};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap;">{_esc(badge_label)}</span>
          </td>
        </tr>"""

    count = len(mediuns)
    plural = "aniversariante" if count == 1 else "aniversariantes"

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aniversariantes — {t_name}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:{primary_color};padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:30px;">{_CAKE}</p>
              <h1 style="margin:8px 0 4px;font-size:22px;color:#ffffff;font-weight:700;">
                Aniversariantes da Semana
              </h1>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">{t_name}</p>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0;font-size:15px;color:#444;">
                Olá! Aqui estão os <strong>{count} {plural}</strong> nos próximos 7 dias.
                Aproveite para mandar uma mensagem especial! {_CAKE}
              </p>
            </td>
          </tr>

          <!-- Table -->
          <tr>
            <td style="padding:16px 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="border-collapse:collapse;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9f9f9;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;">Nome</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;">Aniversário</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;">Telefone</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;">Quando</th>
                  </tr>
                </thead>
                <tbody>{rows_html}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">
                Enviado automaticamente pelo Senhas &mdash; {ts}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return html
