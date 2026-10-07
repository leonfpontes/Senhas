"""E-mail do convite da casa para a Área do Médium (AM-03).

Discreto de propósito (docs/plano-area-do-medium.md §6.8, LGPD art. 11): ser médium de um
terreiro revela convicção religiosa, e caixa de entrada é vista por outras pessoas (prévia
no celular, conta compartilhada). Assunto e texto não usam termo religioso além do nome que
o próprio terreiro escolheu — "sua área no GiraHub", "agenda, avisos e mensalidade".
"""
from __future__ import annotations

from html import escape
from typing import Optional


def _esc(value: Optional[str]) -> str:
    return escape(str(value)) if value else ""


def medium_convite_subject(tenant_name: str) -> str:
    return f"Convite de {tenant_name} para acessar sua área no GiraHub"


def medium_convite_text(primeiro_nome: str, tenant_name: str, link: str, dias: int) -> str:
    saudacao = f"Olá, {primeiro_nome}!" if primeiro_nome else "Olá!"
    return (
        f"{saudacao}\n\n"
        f"{tenant_name} convidou você para acessar sua área no GiraHub: a agenda, os avisos e a "
        "mensalidade da casa, tudo no seu celular.\n\n"
        f"Para ativar, abra o link e crie sua senha de acesso (vale por {dias} dias e só pode ser usado uma vez):\n"
        f"{link}\n\n"
        "Se você não esperava este convite, é só ignorar este e-mail.\n"
    )


def render_medium_convite_email(
    primeiro_nome: str,
    tenant_name: str,
    link: str,
    dias: int,
    primary_color: Optional[str] = None,
    logo_url: Optional[str] = None,
) -> str:
    """HTML com CSS inline. `link` vem de `public_links.medium_convite_link` (FRONTEND_URL)."""
    pc = _esc(primary_color) or "#4f46e5"
    nome = _esc(primeiro_nome)
    casa = _esc(tenant_name)
    url = escape(link)
    saudacao = f"Olá, <strong>{nome}</strong>!" if nome else "Olá!"
    logo = (
        f'<img src="{escape(logo_url)}" alt="{casa}" width="88" '
        'style="max-width:88px;height:auto;border-radius:50%;margin-bottom:12px;">'
        if logo_url
        else ""
    )
    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="max-width:560px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:{pc};padding:32px 40px;text-align:center;">
          {logo}
          <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;">{casa}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Convite para acessar sua área no GiraHub</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px 24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">{saudacao}</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            {casa} convidou você para acessar sua área no GiraHub: a agenda, os avisos e a
            mensalidade da casa, tudo no seu celular. Para ativar, toque no botão e crie sua senha de acesso.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 28px;">
                <a href="{url}"
                   style="display:inline-block;background:{pc};color:#FFFFFF;text-decoration:none;font-size:16px;
                          font-weight:700;padding:14px 36px;border-radius:8px;">
                  Ativar meu acesso
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">
            O link vale por <strong>{dias} dias</strong> e só pode ser usado uma vez.
            Se você não esperava este convite, é só ignorar este e-mail.
          </p>
          <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">
            Se o botão não funcionar, copie e cole o link no navegador:<br>
            <span style="word-break:break-all;">{url}</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">
            Enviado pelo GiraHub a pedido de {casa}.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""
