"""Cobrança do plano no cartão recusada (tolerância da migração 094, services/cobranca_cartao.py).

Dois momentos, mesmo molde visual:
- recusa (`suspenso=False`): o plano continua ativo enquanto a Stripe tenta de novo;
- suspensão (`suspenso=True`): a Stripe desistiu (ou passaram 10 dias) — plano suspenso até pagar.
"""
from html import escape


def _esc(value: str) -> str:
    return escape(value) if value else ""


def render_cartao_pagamento_pendente_email(
    user_name: str,
    plano: str,
    billing_url: str,
    suspenso: bool = False,
    desde: str = "",
) -> str:
    """E-mail (CSS inline) sobre a cobrança recusada do cartão. Textos variáveis escapados;
    `desde` já vem formatado (DD/MM/AAAA)."""
    name = _esc(user_name) or "usuário"
    plano_safe = _esc(plano)
    safe_url = escape(billing_url)

    if suspenso:
        subtitulo = "Plano suspenso por falta de pagamento"
        paragrafos = (
            f"Não conseguimos cobrar o plano <strong>{plano_safe}</strong> no cartão, mesmo depois das "
            "novas tentativas, e o plano foi <strong>suspenso por falta de pagamento</strong>.",
            "Para reativar, atualize o cartão no painel. Assim que o pagamento passar, tudo volta a "
            "funcionar na hora — nenhum dado do terreiro foi apagado.",
        )
        botao = "Atualizar o cartão e reativar"
    else:
        quando = f" (desde {_esc(desde)})" if desde else ""
        subtitulo = "O pagamento do plano não passou"
        paragrafos = (
            f"O pagamento do plano <strong>{plano_safe}</strong> no cartão não passou{quando}. "
            "Isso costuma acontecer por falta de saldo ou limite, ou por cartão vencido.",
            "<strong>O plano continua funcionando</strong> enquanto tentamos cobrar de novo nos próximos "
            "dias. Confira o saldo ou troque o cartão pelo painel para não correr o risco de o plano "
            "ser suspenso.",
        )
        botao = "Atualizar cartão"

    corpo = "\n".join(
        f'          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">{p}</p>'
        for p in paragrafos
    )

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
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">{subtitulo}</p>
        </td>
      </tr>

      <tr>
        <td style="padding:40px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">
            Olá, <strong>{name}</strong>!
          </p>
{corpo}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 8px;">
                <a href="{safe_url}"
                   style="display:inline-block;background:linear-gradient(135deg,#f59e0b 0%,#ec4899 100%);
                          color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;
                          padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                  {botao}
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
