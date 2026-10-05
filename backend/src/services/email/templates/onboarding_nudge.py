"""E-mails de onboarding D+1 e D+3 (enviados por onboarding_email_scheduler).

- D+1 — terreiro ainda sem gira: "sua primeira gira leva 1 minuto".
- D+3 — nenhuma senha pelo link público ainda: "mande o link para os
  consulentes", com o link e um botão de WhatsApp com mensagem pronta.

Mesma identidade visual de welcome.py. Todo texto dinâmico é escapado.
"""
from html import escape
from urllib.parse import quote

PRIMARY = "#6C63FF"
DARK = "#1A1A2E"
WHATSAPP = "#25D366"

# Módulo de cada trilha (principal_dor) para o P.S. do D+1.
_TRAIL_MODULE = {
    "mediuns": ("Médiuns", "/admin/mediuns"),
    "financeiro": ("Mensalidades", "/admin/financeiro/mensalidades"),
    "divulgacao": ("Meu Site", "/admin/meu-site"),
    "estoque": ("Estoque", "/admin/estoque/itens"),
}


def _esc(value: str | None) -> str:
    return escape(value) if value else ""


def _with_utm(url: str, campaign: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}utm_source=email&utm_medium=onboarding&utm_campaign={campaign}"


def whatsapp_share_url(public_link: str, terreiro_nome: str | None) -> str:
    """Mesmo texto do botão do checklist (FirstGiraChecklist.buildWhatsAppShareUrl)."""
    quem = f" do {terreiro_nome}" if terreiro_nome else ""
    text = (
        f"Para pegar sua senha para as giras{quem}, é só abrir este link no celular:\n{public_link}\n\n"
        "O link é o mesmo para todas as giras — pode salvar."
    )
    return f"https://wa.me/?text={quote(text)}"


def _button(href: str, label: str, color: str = PRIMARY) -> str:
    return f"""\
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto;">
  <tr><td align="center" style="border-radius:8px;background-color:{color};">
    <a href="{escape(href)}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;text-decoration:none;
       font-size:16px;font-weight:700;border-radius:8px;">{escape(label)}</a>
  </td></tr>
</table>"""


def _layout(subtitle: str, body_html: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F4F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,{PRIMARY},{DARK});padding:32px 24px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:28px;letter-spacing:1px;">GiraHub</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">{escape(subtitle)}</p>
        </td>
      </tr>
      <tr><td style="padding:32px 32px 24px;color:#374151;font-size:15px;line-height:1.6;">
{body_html}
      </td></tr>
      <tr>
        <td style="background-color:#F4F4F8;padding:20px 24px;text-align:center;border-top:1px solid #E8E8E8;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:1.5;">
            Você recebe este e-mail porque criou a conta do seu terreiro no GiraHub.<br>
            Dúvidas? Responda este e-mail ou fale com o suporte dentro do painel.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


def render_onboarding_d1_email(
    user_name: str | None,
    terreiro_nome: str | None,
    frontend_url: str,
    principal_dor: str | None = None,
) -> tuple[str, str, str]:
    """D+1 para terreiro sem gira. Retorna (subject, html, text)."""
    base = frontend_url.rstrip("/")
    name = (user_name or "").split(" ")[0] or "tudo bem"
    create_url = _with_utm(f"{base}/admin/giras?nova=1", "onboarding_d1")

    ps_html, ps_text = "", ""
    module = _TRAIL_MODULE.get(principal_dor or "")
    if module:
        label, path = module
        module_url = _with_utm(f"{base}{path}", "onboarding_d1")
        ps_html = (
            f'<p style="margin:24px 0 0;font-size:14px;color:#6B7280;">P.S.: você contou que quer começar por '
            f'<strong>{escape(label)}</strong> — está tudo em <a href="{escape(module_url)}" '
            f'style="color:{PRIMARY};">{escape(label)}</a>.</p>'
        )
        ps_text = f"\n\nP.S.: você contou que quer começar por {label}: {module_url}"

    subject = "Sua primeira gira no GiraHub leva 1 minuto"
    html = _layout(
        "Vamos criar a sua primeira gira",
        f"""\
<p style="margin:0 0 16px;font-size:16px;">Olá, <strong>{_esc(name)}</strong>!</p>
<p style="margin:0 0 16px;">O {"<strong>" + _esc(terreiro_nome) + "</strong>" if terreiro_nome else "seu terreiro"}
já está no GiraHub. O próximo passo é criar a primeira gira — é ela que libera as senhas para os consulentes.</p>
<ol style="margin:0 0 20px;padding-left:20px;">
  <li style="margin-bottom:6px;">Crie a gira com a data e quantas senhas liberar.</li>
  <li style="margin-bottom:6px;">Mande o link de senhas no grupo de WhatsApp do terreiro.</li>
  <li>No dia, use a Porta no celular para o check-in e para chamar as senhas.</li>
</ol>
{_button(create_url, "Criar minha primeira gira")}
{ps_html}""",
    )
    text = (
        f"Olá, {name}!\n\nO próximo passo no GiraHub é criar a primeira gira — é ela que libera as senhas "
        f"para os consulentes.\n\n1. Crie a gira com a data e quantas senhas liberar.\n"
        f"2. Mande o link de senhas no grupo de WhatsApp do terreiro.\n"
        f"3. No dia, use a Porta no celular.\n\nCriar a gira: {create_url}{ps_text}"
    )
    return subject, html, text


def render_onboarding_d3_email(
    user_name: str | None,
    terreiro_nome: str | None,
    frontend_url: str,
    public_link: str | None,
    has_gira: bool,
) -> tuple[str, str, str]:
    """D+3 para terreiro sem nenhuma senha pelo link. Retorna (subject, html, text)."""
    base = frontend_url.rstrip("/")
    name = (user_name or "").split(" ")[0] or "tudo bem"
    dashboard_url = _with_utm(f"{base}/admin/dashboard", "onboarding_d3")
    create_url = _with_utm(f"{base}/admin/giras?nova=1", "onboarding_d3")

    intro = (
        "Sua gira já está criada, mas nenhum consulente pegou senha pelo link ainda. "
        "Quase sempre é porque o link não chegou até eles."
        if has_gira
        else "Falta pouco: crie a gira e mande o link de senhas para os consulentes — "
        "é por ele que eles pegam a senha pelo celular."
    )

    link_html, link_text, wa_html, wa_text = "", "", "", ""
    if public_link:
        wa_url = whatsapp_share_url(public_link, terreiro_nome)
        link_html = (
            '<p style="margin:0 0 6px;font-size:14px;color:#6B7280;">O link de senhas do terreiro '
            "(vale para todas as giras):</p>"
            f'<p style="margin:0 0 20px;padding:12px;background-color:#F8F7FF;border-radius:8px;'
            f'font-family:monospace;font-size:13px;word-break:break-all;">{escape(public_link)}</p>'
        )
        wa_html = _button(wa_url, "Enviar no WhatsApp", WHATSAPP)
        link_text = f"\n\nLink de senhas (vale para todas as giras): {public_link}"
        wa_text = f"\nEnviar no WhatsApp: {wa_url}"

    primary_cta = "" if has_gira else _button(create_url, "Criar a gira")
    subject = "Falta um passo: mande o link de senhas para os consulentes"
    html = _layout(
        "Seus consulentes já podem pegar senha pelo celular",
        f"""\
<p style="margin:0 0 16px;font-size:16px;">Olá, <strong>{_esc(name)}</strong>!</p>
<p style="margin:0 0 20px;">{escape(intro)}</p>
{primary_cta}
{link_html}
{wa_html}
<p style="margin:20px 0 0;font-size:14px;color:#6B7280;">Dica: no painel você também gera um QR code para imprimir
e deixar na entrada do terreiro. <a href="{escape(dashboard_url)}" style="color:{PRIMARY};">Abrir o painel</a></p>""",
    )
    text = (
        f"Olá, {name}!\n\n{intro}"
        + ("" if has_gira else f"\n\nCriar a gira: {create_url}")
        + link_text
        + wa_text
        + f"\n\nNo painel você também gera um QR code para imprimir: {dashboard_url}"
    )
    return subject, html, text
