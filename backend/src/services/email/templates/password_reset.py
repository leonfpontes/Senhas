"""Password reset email template."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_password_reset_email(reset_url: str, user_name: str) -> str:
    """Generate inline-CSS password reset email.

    Args:
        reset_url: Full URL for the reset link (must come from settings.FRONTEND_URL).
        user_name: Display name of the user (escaped before rendering).

    Returns:
        HTML string ready to send via email provider.
    """
    name = _esc(user_name) or "usuário"
    safe_url = escape(reset_url)

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
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Redefinição de senha</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Recebemos uma solicitação para redefinir a senha da sua conta no GiraHub.
            Clique no botão abaixo para criar uma nova senha:
          </p>

          <!-- CTA button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 32px;">
                <a href="{safe_url}"
                   style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#ec4899 100%);
                          color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;
                          padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                  Redefinir Minha Senha
                </a>
              </td>
            </tr>
          </table>

          <!-- Expiry warning -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;padding:12px 16px;">
                <p style="margin:0;color:#92400E;font-size:13px;line-height:1.5;">
                  ⏱ Este link é válido por <strong>1 hora</strong>.
                  Após esse prazo, você precisará solicitar um novo link.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0;color:#6B7280;font-size:13px;line-height:1.6;">
            Se você não solicitou a redefinição de senha, ignore este e-mail.
            Sua senha permanece a mesma e nenhuma alteração foi feita.
          </p>

          <!-- Fallback URL -->
          <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">
            Se o botão não funcionar, copie e cole o link abaixo no seu navegador:<br>
            <span style="color:#6366f1;word-break:break-all;">{safe_url}</span>
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
