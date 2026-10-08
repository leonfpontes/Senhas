"""E-mail aos administradores: um médium encerrou o próprio acesso à Área do Médium (AM-14).

Só o primeiro nome, o terreiro e a data — nada do cadastro. Explica que o cadastro do médium
continua com a casa e que a direção pode convidar de novo (Médiuns → "Acesso à Área").
"""
from html import escape


def medium_acesso_encerrado_subject(primeiro_nome: str) -> str:
    quem = primeiro_nome or "Um médium"
    return f"{quem} encerrou o acesso à Área do Médium"


def medium_acesso_encerrado_text(primeiro_nome: str, tenant_name: str, quando: str, painel_url: str) -> str:
    quem = primeiro_nome or "Um médium"
    return (
        f"{quem} encerrou o acesso à Área do Médium de {tenant_name} em {quando}.\n\n"
        "O cadastro continua com a casa: nada foi apagado. A autorização de uso dos dados na Área foi "
        "retirada, então a pessoa não entra mais na Área.\n\n"
        "Se foi engano, é só convidar de novo em Médiuns → Acesso à Área:\n"
        f"{painel_url}\n\n"
        "Você recebe este aviso porque é administrador deste terreiro no GiraHub."
    )


def render_medium_acesso_encerrado_email(primeiro_nome: str, tenant_name: str, quando: str, painel_url: str) -> str:
    """HTML com CSS inline. Todos os textos variáveis são escapados."""
    quem = escape(primeiro_nome or "Um médium")
    terreiro = escape(tenant_name or "seu terreiro")
    quando_txt = escape(quando)
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
          <h1 style="margin:0;color:#111827;font-size:22px;font-weight:700;">{quem} encerrou o acesso à Área do Médium</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 40px 8px;">
          <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
            Em {quando_txt}, {quem} encerrou o próprio acesso à Área do Médium e retirou a autorização
            de uso dos dados na Área.
          </p>
          <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
            O cadastro continua com a casa: nada foi apagado. Se foi engano, é só convidar de novo em
            Médiuns → Acesso à Área.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 40px 32px;">
          <p style="margin:12px 0 0;">
            <a href="{url}" style="color:#4F46E5;font-size:14px;font-weight:700;">Abrir Médiuns</a>
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
