"""Account/tenant reactivation email template."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_account_reactivated_email(user_name: str, login_url: str) -> str:
    """Generate inline-CSS email confirming an account reactivation.

    Args:
        user_name: Display name of the user (escaped before rendering).
        login_url: Full URL to the login page.

    Returns:
        HTML string ready to send via email provider.
    """
    name = _esc(user_name) or "usuário"
    safe_url = escape(login_url)

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
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Bem-vindo(a) de volta!</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Sua conta e seu terreiro no GiraHub foram reativados com sucesso.
            Todos os seus dados anteriores (giras, tickets, médiuns, associados)
            continuam disponíveis. Sua assinatura volta no <strong>plano gratuito</strong>
            — você pode contratar um plano pago quando quiser, na tela de Cobrança.
          </p>

          <!-- CTA button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 32px;">
                <a href="{safe_url}"
                   style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#ec4899 100%);
                          color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;
                          padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                  Fazer login
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">
            Se você não solicitou essa reativação, entre em contato imediatamente com
            <a href="mailto:privacidade@girahub.com.br" style="color:#6366f1;">privacidade@girahub.com.br</a>.
          </p>
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
