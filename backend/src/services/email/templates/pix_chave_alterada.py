"""E-mail aos administradores: a chave PIX da mensalidade mudou (AM-10, decisão D-05).

Discreto de propósito: assunto e texto sem termos religiosos, só o nome do terreiro,
quem alterou, quando, o tipo e a chave nova MASCARADA (a chave inteira nunca vai por
e-mail). Serve de alarme contra troca maliciosa: quem não reconhece a alteração entra
no painel e confere.
"""
from html import escape


def pix_chave_alterada_subject(tenant_name: str) -> str:
    return f"Chave PIX da mensalidade alterada — {tenant_name}"


def render_pix_chave_alterada_email(
    tenant_name: str,
    alterado_por: str,
    quando: str,
    tipo_label: str,
    chave_mascarada: str,
    chave_anterior_mascarada: str | None,
    painel_url: str,
) -> str:
    """HTML com CSS inline. Todos os textos variáveis são escapados."""
    terreiro = escape(tenant_name or "seu terreiro")
    quem = escape(alterado_por or "um usuário do painel")
    quando_txt = escape(quando)
    tipo = escape(tipo_label)
    nova = escape(chave_mascarada)
    url = escape(painel_url)
    anterior = (
        f'<tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Chave anterior</td>'
        f'<td style="padding:4px 0;color:#111827;font-size:14px;font-family:monospace;">{escape(chave_anterior_mascarada)}</td></tr>'
        if chave_anterior_mascarada
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
           style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr>
        <td style="padding:32px 40px 8px;">
          <p style="margin:0 0 4px;color:#6B7280;font-size:13px;">{terreiro}</p>
          <h1 style="margin:0;color:#111827;font-size:22px;font-weight:700;">A chave PIX da mensalidade foi alterada</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 8px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Os próximos pagamentos de mensalidade vão para a chave abaixo.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;width:40%;">Alterada por</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{quem}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Quando</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{quando_txt}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Tipo</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{tipo}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Chave nova</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;font-family:monospace;">{nova}</td></tr>
            {anterior}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#FFF7ED;border-left:4px solid #C2410C;border-radius:4px;padding:12px 16px;">
                <p style="margin:0;color:#7C2D12;font-size:13px;line-height:1.5;">
                  Não reconhece essa alteração? Entre no painel, confira a chave em
                  Financeiro → Configuração → Mensalidade e troque a senha de quem alterou.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;">
            <a href="{url}" style="color:#4F46E5;font-size:14px;font-weight:700;">Abrir a configuração</a>
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
