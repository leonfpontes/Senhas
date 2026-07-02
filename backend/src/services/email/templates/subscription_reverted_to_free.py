"""Subscription reverted-to-FREE email template."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_subscription_reverted_to_free_email(user_name: str, billing_url: str) -> str:
    """Generate inline-CSS email confirming a subscription reverted to FREE.

    Args:
        user_name: Display name of the user (escaped before rendering).
        billing_url: Full URL to the billing page (to resubscribe).

    Returns:
        HTML string ready to send via email provider.
    """
    name = _esc(user_name) or "usuário"
    safe_url = escape(billing_url)

    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header gradient -->
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#ec4899 100%);padding:36px 40px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:700;letter-spacing:-0.5px;">GiraHub</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Sua conta agora é gratuita</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            O período pago da sua assinatura terminou e, conforme combinado no
            cancelamento, sua conta no GiraHub voltou automaticamente para o
            <strong>plano gratuito</strong>.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:4px;padding:12px 16px;">
                <p style="margin:0;color:#1E40AF;font-size:13px;line-height:1.5;">
                  No plano gratuito, os limites de usuários, giras por mês e
                  médiuns/cambones cadastrados foram reduzidos. Dados já
                  cadastrados não foram apagados — apenas a criação de novos
                  registros acima do limite fica bloqueada.
                </p>
              </td>
            </tr>
          </table>

          <!-- CTA button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:24px 0 8px;">
                <a href="{safe_url}"
                   style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#ec4899 100%);
                          color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;
                          padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                  Ver planos disponíveis
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">
            GiraHub — Gestão de Atendimento em Giras<br>
            Este é um e-mail automático, por favor não responda.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""
