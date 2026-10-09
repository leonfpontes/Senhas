"""Lembrete do PIX mês a mês ($-04): o mês pago do plano está acabando."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_pix_mensal_lembrete_email(
    user_name: str,
    plano: str,
    dias_restantes: int,
    pago_ate: str,
    tolerancia_ate: str,
    billing_url: str,
) -> str:
    """E-mail (CSS inline) avisando que o mês pago por PIX vence em `dias_restantes` dias.

    Todos os textos variáveis são escapados. `pago_ate`/`tolerancia_ate` já vêm formatados
    (DD/MM/AAAA).
    """
    name = _esc(user_name) or "usuário"
    plano_safe = _esc(plano)
    safe_url = escape(billing_url)
    dias_label = "amanhã" if dias_restantes == 1 else f"em {dias_restantes} dias"

    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <tr>
        <td style="background:linear-gradient(135deg,#f59e0b 0%,#ec4899 100%);padding:36px 40px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:700;letter-spacing:-0.5px;">GiraHub</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Pague o próximo mês por PIX</p>
        </td>
      </tr>

      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            O mês do plano <strong>{plano_safe}</strong> que vocês pagaram por PIX vence
            <strong>{dias_label}</strong> (pago até <strong>{_esc(pago_ate)}</strong>).
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Para continuar no plano, pague o próximo mês pelo painel — cada PIX libera mais 30 dias,
            contados a partir do fim do mês atual (pagar antes não perde nenhum dia). Sem pagamento,
            a conta volta para o <strong>plano gratuito</strong> em {_esc(tolerancia_ate)}.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 8px;">
                <a href="{safe_url}"
                   style="display:inline-block;background:linear-gradient(135deg,#f59e0b 0%,#ec4899 100%);
                          color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;
                          padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                  Pagar o próximo mês
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

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
