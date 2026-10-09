"""E-mail aos administradores: a conta que recebe a mensalidade automática mudou (F-02/AM-22).

Mesmo papel do aviso de troca da chave PIX (AM-10, D-05): alarme contra troca maliciosa.
Vai quando alguém conecta (ou retoma o cadastro de) uma conta Stripe/Mercado Pago e quando
desconecta. Discreto: só o nome do terreiro, quem fez, quando, o provedor e a ação — nenhum
identificador de conta, token ou dado bancário.
"""
from html import escape


def mensalidade_gateway_subject(tenant_name: str, acao: str) -> str:
    verbo = "desconectada" if acao == "desconectado" else "conectada"
    return f"Conta da mensalidade automática {verbo} — {tenant_name}"


def render_mensalidade_gateway_email(
    tenant_name: str,
    feito_por: str,
    quando: str,
    provedor_label: str,
    acao: str,
    painel_url: str,
) -> str:
    """HTML com CSS inline. `acao`: "conectado" | "desconectado". Textos variáveis escapados."""
    terreiro = escape(tenant_name or "seu terreiro")
    quem = escape(feito_por or "um usuário do painel")
    quando_txt = escape(quando)
    provedor = escape(provedor_label)
    url = escape(painel_url)
    if acao == "desconectado":
        titulo = "A mensalidade automática foi desligada"
        texto = (
            f"A conta {provedor} foi desconectada. Os médiuns voltam a pagar pela chave PIX da casa "
            "e a enviar o comprovante."
        )
    else:
        titulo = "Uma conta foi conectada para receber a mensalidade"
        texto = (
            f"Alguém iniciou a conexão de uma conta {provedor} para receber a mensalidade dos médiuns "
            "com baixa automática. Quando o cadastro terminar, o “Pagar com PIX” da Área passa a "
            "cobrar nessa conta."
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
          <h1 style="margin:0;color:#111827;font-size:22px;font-weight:700;">{titulo}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 8px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">{texto}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;width:40%;">Feito por</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{quem}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Quando</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{quando_txt}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:14px;">Conta</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;">{provedor}</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#FFF7ED;border-left:4px solid #C2410C;border-radius:4px;padding:12px 16px;">
                <p style="margin:0;color:#7C2D12;font-size:13px;line-height:1.5;">
                  Não reconhece essa alteração? Entre no painel, confira em
                  Financeiro → Configuração → Mensalidade e troque a senha de quem fez.
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
