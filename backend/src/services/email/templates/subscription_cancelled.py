"""Subscription cancellation-scheduled email template."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_subscription_cancelled_email(user_name: str, plan_label: str, access_until: str) -> str:
    """Generate inline-CSS email confirming a scheduled cancellation.

    Args:
        user_name: Display name of the user (escaped before rendering).
        plan_label: Human-readable plan name (e.g. "Pro"), already localized.
        access_until: Human-readable date (e.g. "15/08/2026") until which
            premium access remains active.

    Returns:
        HTML string ready to send via email provider.
    """
    name = _esc(user_name) or "usuário"
    plan = _esc(plan_label)
    until = _esc(access_until)

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
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Cancelamento agendado</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Confirmamos o cancelamento da sua assinatura <strong>{plan}</strong>.
            Nenhuma nova cobrança será feita.
          </p>

          <!-- Access-until notice -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;padding:12px 16px;">
                <p style="margin:0;color:#92400E;font-size:13px;line-height:1.5;">
                  ⏱ Você continua com acesso aos recursos do plano <strong>{plan}</strong>
                  até <strong>{until}</strong>. Depois dessa data, sua conta passa
                  automaticamente para o plano gratuito.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0;color:#6B7280;font-size:13px;line-height:1.6;">
            Mudou de ideia? Você pode reativar a assinatura a qualquer momento antes
            de {until}, na tela de Cobrança do painel administrativo.
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
