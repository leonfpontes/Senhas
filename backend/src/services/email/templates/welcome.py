"""Welcome email template for new tenant onboarding."""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def generate_welcome_html(
    responsavel_nome: str,
    tenant_name: str,
    dashboard_url: str,
    is_trial: bool = False,
    trial_days: int = 30,
) -> str:
    """Generate Gmail-safe inline-CSS welcome email."""
    name = _esc(responsavel_nome)
    t_name = _esc(tenant_name)
    primary = "#6C63FF"
    dark = "#1A1A2E"

    if is_trial:
        plan_label = "Premium"
        intro = (
            f"Sua conta para <strong>{t_name}</strong> foi criada com sucesso — e você ganhou "
            f"<strong>{trial_days} dias grátis no plano Premium</strong>, sem precisar de cartão de crédito."
        )
        beneficios = """\
                <li>Usuários, giras e médiuns <strong>ilimitados</strong></li>
                <li>Financeiro completo, estoque e site do terreiro</li>
                <li>Analytics avançado e suporte prioritário</li>
                <li>Emitir senhas para consulentes em tempo real</li>"""
        aviso = (
            f"Seu trial Premium termina em {trial_days} dias. Antes disso, avisaremos por e-mail — "
            "e se você não assinar um plano, sua conta continua ativa no plano Grátis, sem cobrança."
        )
    else:
        plan_label = "Grátis"
        intro = (
            f"Sua conta para <strong>{t_name}</strong> foi criada com sucesso no plano "
            f"<strong>Grátis</strong>."
        )
        beneficios = """\
                <li>Criar até <strong>4 giras por mês</strong></li>
                <li>Emitir senhas para consulentes</li>
                <li>Gerenciar fila de atendimento em tempo real</li>
                <li>Acompanhar o painel de controle</li>"""
        aviso = None

    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="580" cellpadding="0" cellspacing="0"
           style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,{primary},{dark});padding:32px 24px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:28px;letter-spacing:1px;">GiraHub</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
            Gestão de Senhas para Giras
          </p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px 28px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:{dark};">
            Bem-vindo, {name}! 🎉
          </h2>
          <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;">
            {intro}
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background-color:#F8F7FF;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:{dark};">
                O que você já pode fazer no plano {plan_label}:
              </p>
              <ul style="margin:0;padding:0 0 0 20px;color:#555;font-size:14px;line-height:2;">
{beneficios}
              </ul>
            </td></tr>
          </table>

          {f'<p style="margin:0 0 24px;font-size:13px;color:#777;line-height:1.6;">{aviso}</p>' if aviso else ''}

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td align="center" style="border-radius:8px;background-color:{primary};">
              <a href="{dashboard_url}" target="_blank"
                 style="display:inline-block;padding:14px 36px;color:#FFFFFF;
                        text-decoration:none;font-size:16px;font-weight:700;
                        letter-spacing:0.5px;">
                Acessar meu painel
              </a>
            </td></tr>
          </table>

          <p style="margin:28px 0 0;font-size:13px;color:#999;line-height:1.5;text-align:center;">
            Quer mais recursos? Conheça nossos planos em
            <a href="https://girahub.com.br/#planos" style="color:{primary};text-decoration:none;">
              girahub.com.br
            </a>.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background-color:#F4F4F8;padding:20px 24px;text-align:center;
                    border-top:1px solid #E8E8E8;">
          <p style="margin:0;font-size:12px;color:#AAA;">
            &copy; 2026 GiraHub &mdash; Todos os direitos reservados.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""
