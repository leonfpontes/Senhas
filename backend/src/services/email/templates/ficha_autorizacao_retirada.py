"""E-mail aos administradores: um médium retirou, na Área, a autorização da ficha (AM-19).

Discreto de propósito (docs/plano-area-do-medium.md §6.8): sem o nome do médium, sem termo
religioso, sem nenhum dado da ficha — só o nome do terreiro e o caminho no painel, onde quem tem
a permissão vê quem foi e apaga os dados guardados.
"""
from html import escape


def ficha_autorizacao_retirada_subject(tenant_name: str) -> str:
    return f"Autorização de dados retirada — {tenant_name}"


def render_ficha_autorizacao_retirada_email(tenant_name: str, painel_url: str) -> str:
    """HTML com CSS inline. Textos variáveis escapados."""
    terreiro = escape(tenant_name or "seu terreiro")
    url = escape(painel_url)
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
        <td style="padding:32px 40px 8px;">
          <p style="margin:0 0 4px;color:#6B7280;font-size:13px;">{terreiro}</p>
          <h1 style="margin:0;color:#111827;font-size:22px;font-weight:700;">Uma pessoa da corrente retirou uma autorização</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Uma pessoa da corrente retirou a autorização para a casa guardar os dados da ficha dela.
            Esses dados já não aparecem mais no painel. Pela lei de proteção de dados (LGPD), a casa
            deve apagá-los.
          </p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Entre no painel para ver quem foi e apagar os dados guardados.
          </p>
          <p style="margin:20px 0 0;">
            <a href="{url}" style="color:#4F46E5;font-size:14px;font-weight:700;">Abrir no painel</a>
          </p>
          <p style="margin:24px 0 0;color:#9CA3AF;font-size:12px;line-height:1.5;">
            Você recebe este aviso porque é administrador deste terreiro no GiraHub.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""
