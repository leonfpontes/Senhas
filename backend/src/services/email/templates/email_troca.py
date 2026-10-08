"""E-mails da troca do e-mail de login (AM-13, Perfil da Área do Médium).

- **Confirmação** → endereço NOVO: o link de confirmação (24 h, uso único). O e-mail de login só
  muda depois que esse link é aberto.
- **Aviso** → endereço ANTIGO, depois da confirmação: "o e-mail de acesso da sua conta foi
  trocado" (sem mostrar o endereço novo inteiro), com o que fazer se não foi a pessoa.

Discretos como o convite (docs/plano-area-do-medium.md §6.8, LGPD art. 11): sem termo religioso
além do nome que o terreiro escolheu — "sua conta no GiraHub", "acesso de <terreiro>".
"""
from __future__ import annotations

from html import escape
from typing import Optional


def _esc(value: Optional[str]) -> str:
    return escape(str(value)) if value else ""


def _layout(pc: str, casa: str, subtitulo: str, corpo: str) -> str:
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
        <td style="background:{pc};padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;">{casa}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">{subtitulo}</p>
        </td>
      </tr>
      <tr><td style="padding:32px 40px 24px;">{corpo}</td></tr>
      <tr>
        <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">Enviado pelo GiraHub a pedido de {casa}.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


# ── Confirmação (endereço novo) ─────────────────────────────────────────────


def email_troca_confirmacao_subject(tenant_name: str) -> str:
    return f"Confirme seu novo e-mail de acesso de {tenant_name}"


def email_troca_confirmacao_text(primeiro_nome: str, tenant_name: str, link: str, horas: int) -> str:
    saudacao = f"Olá, {primeiro_nome}!" if primeiro_nome else "Olá!"
    return (
        f"{saudacao}\n\n"
        f"Você pediu para usar este e-mail para entrar na sua conta do GiraHub de {tenant_name}.\n\n"
        f"Para confirmar, abra o link (vale por {horas} horas e só pode ser usado uma vez):\n"
        f"{link}\n\n"
        "O e-mail de acesso só muda depois da confirmação. Se você não pediu esta troca, é só ignorar "
        "este e-mail: nada muda na sua conta.\n"
    )


def render_email_troca_confirmacao(
    primeiro_nome: str, tenant_name: str, link: str, horas: int, primary_color: Optional[str] = None
) -> str:
    pc = _esc(primary_color) or "#4f46e5"
    casa = _esc(tenant_name)
    url = escape(link)
    nome = _esc(primeiro_nome)
    saudacao = f"Olá, <strong>{nome}</strong>!" if nome else "Olá!"
    corpo = f"""
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">{saudacao}</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Você pediu para usar este e-mail para entrar na sua conta do GiraHub de {casa}.
            Toque no botão para confirmar.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:8px 0 28px;">
                <a href="{url}"
                   style="display:inline-block;background:{pc};color:#FFFFFF;text-decoration:none;font-size:16px;
                          font-weight:700;padding:14px 36px;border-radius:8px;">
                  Confirmar meu novo e-mail
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">
            O link vale por <strong>{horas} horas</strong> e só pode ser usado uma vez. O e-mail de acesso só
            muda depois da confirmação. Se você não pediu esta troca, é só ignorar este e-mail.
          </p>
          <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">
            Se o botão não funcionar, copie e cole o link no navegador:<br>
            <span style="word-break:break-all;">{url}</span>
          </p>"""
    return _layout(pc, casa, "Confirmação do novo e-mail de acesso", corpo)


# ── Aviso (endereço antigo) ─────────────────────────────────────────────────


def email_troca_aviso_subject(tenant_name: str) -> str:
    return f"O e-mail de acesso da sua conta de {tenant_name} foi trocado"


def email_troca_aviso_text(primeiro_nome: str, tenant_name: str, novo_mascarado: str) -> str:
    saudacao = f"Olá, {primeiro_nome}!" if primeiro_nome else "Olá!"
    return (
        f"{saudacao}\n\n"
        f"O e-mail de acesso da sua conta do GiraHub de {tenant_name} foi trocado para {novo_mascarado}. "
        "A partir de agora, entre com o novo e-mail.\n\n"
        f"Se não foi você, fale com a direção de {tenant_name} o quanto antes.\n"
    )


def render_email_troca_aviso(
    primeiro_nome: str, tenant_name: str, novo_mascarado: str, primary_color: Optional[str] = None
) -> str:
    pc = _esc(primary_color) or "#4f46e5"
    casa = _esc(tenant_name)
    nome = _esc(primeiro_nome)
    saudacao = f"Olá, <strong>{nome}</strong>!" if nome else "Olá!"
    corpo = f"""
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">{saudacao}</p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            O e-mail de acesso da sua conta do GiraHub de {casa} foi trocado para
            <strong>{_esc(novo_mascarado)}</strong>. A partir de agora, entre com o novo e-mail.
          </p>
          <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">
            Se não foi você, fale com a direção de {casa} o quanto antes.
          </p>"""
    return _layout(pc, casa, "Aviso de segurança da sua conta", corpo)
