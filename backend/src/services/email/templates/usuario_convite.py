"""E-mail do convite da casa para entrar no painel do terreiro (11/2026).

Identidade terra do GiraHub (areia, café, barro; título em Fraunces com fonte de reserva),
o logo do terreiro quando houver e o botão na cor da casa — sem cor escolhida, verde folha
#2E6A4E, o padrão do botão principal. Não usa termo religioso além do nome da casa: caixa de
entrada é vista por outras pessoas.
"""
from __future__ import annotations

from html import escape
from typing import Optional

BOTAO_PADRAO = "#2E6A4E"  # folha-600, botão principal de quem nunca escolheu cor

# O que cada tipo de acesso faz, em palavras de quem usa o terreiro.
O_QUE_FAZ = {
    "admin": "como administrador(a): vê e muda tudo, inclusive pessoas e plano",
    "operator": "para ajudar no dia a dia da casa, com o que o seu perfil de acesso permitir",
}


def _esc(value: Optional[str]) -> str:
    return escape(str(value)) if value else ""


def usuario_convite_subject(tenant_name: str) -> str:
    return f"{tenant_name} convidou você para o GiraHub"


def _quem(convidou: Optional[str], tenant_name: str) -> str:
    return f"{convidou}, de {tenant_name}," if convidou else tenant_name


def usuario_convite_text(
    primeiro_nome: str, tenant_name: str, convidou: Optional[str], role: str, link: str, dias: int
) -> str:
    saudacao = f"Olá, {primeiro_nome}!" if primeiro_nome else "Olá!"
    return (
        f"{saudacao}\n\n"
        f"{_quem(convidou, tenant_name)} convidou você para entrar no GiraHub {O_QUE_FAZ.get(role, '')}.\n\n"
        "Para aceitar, abra o link e crie a sua senha. Se você já usa o GiraHub, pode entrar com a "
        f"senha de sempre. O link vale por {dias} dias e só pode ser usado uma vez:\n"
        f"{link}\n\n"
        "Se você não esperava este convite, é só ignorar este e-mail.\n"
    )


def render_usuario_convite_email(
    primeiro_nome: str,
    tenant_name: str,
    convidou: Optional[str],
    role: str,
    link: str,
    dias: int,
    primary_color: Optional[str] = None,
    logo_url: Optional[str] = None,
) -> str:
    """HTML com CSS inline. `link` vem de `public_links.usuario_convite_link` (FRONTEND_URL)."""
    botao = _esc(primary_color) or BOTAO_PADRAO
    nome = _esc(primeiro_nome)
    casa = _esc(tenant_name)
    url = escape(link)
    quem = _esc(_quem(convidou, tenant_name))
    faz = _esc(O_QUE_FAZ.get(role, ""))
    saudacao = f"Olá, {nome}!" if nome else "Olá!"
    logo = (
        f'<img src="{escape(logo_url)}" alt="{casa}" width="72" '
        'style="max-width:72px;height:auto;border-radius:50%;margin:0 0 12px;">'
        if logo_url
        else ""
    )
    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F4EDE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2B1D14;line-height:1.6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EDE2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background-color:#FCF8F2;border:1px solid #E7DCCB;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background-color:#180E09;padding:18px 28px;color:#FCF8F2;font-size:18px;font-weight:800;letter-spacing:-0.3px;">
          GiraHub
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px 8px;text-align:center;">
          {logo}
          <p style="margin:0;font-size:14px;color:#6A5444;">{saudacao}</p>
          <h1 style="margin:6px 0 0;font-family:Fraunces,Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.25;color:#2B1D14;">
            Você foi convidado(a) para <em style="color:#A64B22;font-style:italic;">{casa}</em>
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 8px;">
          <p style="margin:0 0 16px;font-size:16px;color:#2B1D14;">
            {quem} convidou você para entrar no GiraHub {faz}.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#5A4636;">
            Toque no botão e crie a sua senha. Se você já usa o GiraHub, pode entrar com a senha de sempre.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 0 24px;">
                <a href="{url}"
                   style="display:inline-block;background:{botao};color:#FFFFFF;text-decoration:none;font-size:16px;
                          font-weight:700;padding:14px 32px;border-radius:10px;">
                  Aceitar convite
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:13px;color:#6A5444;">
            O link vale por <strong>{dias} dias</strong> e só pode ser usado uma vez.
            Se você não esperava este convite, é só ignorar este e-mail.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#8A6F5A;">
            Se o botão não funcionar, copie e cole o link no navegador:<br>
            <span style="word-break:break-all;">{url}</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px dashed #D9C8B0;padding:18px 28px 22px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#8A6F5A;">Enviado pelo GiraHub a pedido de {casa}.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""
