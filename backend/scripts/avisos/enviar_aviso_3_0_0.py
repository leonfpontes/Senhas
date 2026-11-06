"""
Envio único do aviso da versão 3.0.0 aos administradores dos terreiros ativos.

Roda DENTRO do container do backend (usa a mesma conexão e o mesmo Resend/Brevo do sistema):

    # 1) Só lista quem receberia (não envia nada):
    docker compose -f docker-compose.prod.yml exec -T backend python - --listar < enviar_aviso_3_0_0.py

    # 2) Envia de verdade:
    docker compose -f docker-compose.prod.yml exec -T backend python - --enviar < enviar_aviso_3_0_0.py

Destinatários: usuários ADMIN ativos (não excluídos) de terreiros ativos (não excluídos). Conta de
médium, operador e super admin não recebem. E-mail repetido em mais de um terreiro recebe uma vez só.
O HTML vai embutido abaixo (mesmo conteúdo de aviso-3.0.0.html), com o nome do terreiro trocado.
Resposta vai para contato@girahub.com.br.
"""

import asyncio
import sys
from html import escape

ASSUNTO = "O GiraHub ganhou cara nova, e nada sumiu"
RESPONDER_PARA = "contato@girahub.com.br"
PAUSA_ENTRE_ENVIOS = 0.6  # segundos; fica bem abaixo do limite do Resend

TEXTO = """Olá, {nome}.

O GiraHub ganhou cara nova, e nada sumiu.

Hoje entrou no ar a versão nova do GiraHub. Ela não muda nada na sua gira: as senhas, os links que vocês já mandaram e tudo o que está cadastrado continuam iguais. Muda o jeito de achar as coisas:

- Menu: em cima ficam sempre Início, Giras, Porta e Senhas. Logo abaixo, em "Da casa", os módulos que vocês usam.
- Ver os módulos: no fim do menu, mostra todos os módulos da casa, com o plano de cada um.
- Busca: no alto da tela, ou Ctrl K. Digite "médiuns", "fluxo" ou "nova gira" e vá direto.
- Plano e assinatura, Pessoas e acessos, Configurações, Auditoria e Ajuda: no círculo com a sua inicial, no alto à direita. No celular, no fim do Menu.
- Área do Médium: em Configurações > Área do Médium.
- Para editar uma gira, um médium ou um lançamento, é só clicar nele.

Abrir o GiraHub: https://girahub.com.br/login

Quando entrar, a janela "Novidades do GiraHub" mostra tudo isso de novo. Se algo não estiver onde você espera, é só responder este e-mail que a gente ajuda na hora.

Axé,
Equipe GiraHub
"""

HTML = r"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>O GiraHub ganhou cara nova, e nada sumiu</title>
</head>
<body style="margin:0;padding:0;background-color:#F4EDE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2B1D14;line-height:1.6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">O GiraHub ganhou cara nova. Suas giras, senhas e links continuam iguais. Veja onde ficou cada coisa.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EDE2;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FCF8F2;border:1px solid #E7DCCB;border-radius:14px;overflow:hidden;">

      <!-- Cabeçalho: marca -->
      <tr>
        <td style="background-color:#180E09;padding:20px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:8px;">
              <img src="https://girahub.com.br/icons/icon-192.png" width="24" height="24" alt="" style="display:block;border:0;">
            </td>
            <td style="vertical-align:middle;color:#FCF8F2;font-size:20px;font-weight:800;letter-spacing:-0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">GiraHub</td>
          </tr></table>
        </td>
      </tr>

      <!-- Abertura -->
      <tr>
        <td style="padding:32px 28px 8px 28px;">
          <p style="margin:0 0 6px 0;font-size:14px;color:#8A6F5A;">Olá, {{nome_terreiro}}.</p>
          <h1 style="margin:0 0 16px 0;font-family:Fraunces,Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;line-height:1.2;color:#2B1D14;">
            O GiraHub ganhou cara nova, e <em style="color:#A64B22;font-style:italic;">nada sumiu</em>.
          </h1>
          <p style="margin:0 0 14px 0;font-size:16px;">
            Hoje entrou no ar a versão nova do GiraHub. Ela não muda nada na sua gira: as senhas, os links que vocês já mandaram e tudo o que está cadastrado continuam iguais.
          </p>
          <p style="margin:0;font-size:16px;">Muda o jeito de achar as coisas. Fica assim:</p>
        </td>
      </tr>

      <!-- Onde ficou cada coisa -->
      <tr>
        <td style="padding:20px 28px 4px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #D9C8B0;">
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Menu</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">Em cima ficam sempre Início, Giras, Porta e Senhas. Logo abaixo, em "Da casa", os módulos que vocês usam.</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Ver os módulos</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">No fim do menu. Mostra todos os módulos da casa, com o plano de cada um.</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Busca</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">No alto da tela, ou Ctrl K. Digite "médiuns", "fluxo" ou "nova gira" e vá direto.</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Plano, pessoas e configurações</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">Plano e assinatura, Pessoas e acessos, Configurações, Auditoria e Ajuda ficam no círculo com a sua inicial, no alto à direita. No celular, no fim do Menu.</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Área do Médium</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">Em Configurações &gt; Área do Médium.</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-bottom:1px dashed #D9C8B0;">
              <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#2B1D14;">Editar</p>
              <p style="margin:0;font-size:15px;color:#5A4636;">Para editar uma gira, um médium ou um lançamento, é só clicar nele.</p>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- Botão -->
      <tr>
        <td align="center" style="padding:28px 28px 8px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" style="border-radius:10px;background-color:#2E6A4E;">
              <a href="https://girahub.com.br/login" target="_blank" style="display:inline-block;padding:14px 32px;color:#FCF8F2;text-decoration:none;font-size:16px;font-weight:700;">Abrir o GiraHub</a>
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- Ajuda -->
      <tr>
        <td style="padding:16px 28px 28px 28px;">
          <p style="margin:0 0 12px 0;font-size:15px;color:#5A4636;">
            Quando entrar, a janela "Novidades do GiraHub" mostra tudo isso de novo. Se algo não estiver onde você espera, é só responder este e-mail que a gente ajuda na hora.
          </p>
          <p style="margin:0;font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:18px;color:#2B1D14;">Axé,<br>Equipe GiraHub</p>
        </td>
      </tr>

      <!-- Rodapé -->
      <tr>
        <td style="background-color:#F4EDE2;padding:16px 28px;border-top:1px solid #E7DCCB;">
          <p style="margin:0;font-size:12px;color:#8A6F5A;line-height:1.5;">
            Você recebe este aviso porque administra um terreiro no GiraHub. É um aviso sobre o funcionamento do sistema, não uma propaganda.
            <a href="https://girahub.com.br" style="color:#A64B22;text-decoration:underline;">girahub.com.br</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
"""


def mascarar(email):
    """Saída de terminal/log: mostra só o começo do e-mail."""
    usuario, _, dominio = email.partition("@")
    return f"{usuario[:2]}***@{dominio}"


async def destinatarios():
    from sqlalchemy import select

    from src.core.database import AsyncSessionLocal
    from src.models import Tenant, User, UserRole

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(User.email, User.full_name, Tenant.name, Tenant.slug)
                .join(Tenant, Tenant.id == User.tenant_id)
                .where(
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                    Tenant.is_active.is_(True),
                    Tenant.deleted_at.is_(None),
                )
                .order_by(Tenant.name, User.created_at)
            )
        ).all()
    vistos, lista = set(), []
    for email, _nome, terreiro, slug in rows:
        chave = (email or "").strip().lower()
        if not chave or chave in vistos:
            continue
        vistos.add(chave)
        lista.append((email.strip(), terreiro, slug))
    return lista


async def enviar_um(email, terreiro):
    from src.services.email.base import EmailMessage
    from src.services.email.brevo_provider import BrevoEmailService
    from src.services.email.resend_fallback import ResendEmailService

    msg = EmailMessage(
        to_email=email,
        subject=ASSUNTO,
        html_body=HTML.replace("{{nome_terreiro}}", escape(terreiro)),
        text_body=TEXTO.format(nome=terreiro),
        reply_to=RESPONDER_PARA,
    )
    try:
        if await ResendEmailService().send_async(msg):
            return True
    except Exception:
        pass
    try:
        return bool(await BrevoEmailService().send_async(msg))
    except Exception as exc:
        print(f"   falhou: {exc}")
        return False


async def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "--listar"
    lista = await destinatarios()
    print(f"{len(lista)} destinatários (admins de terreiros ativos, sem repetir e-mail):")
    for email, terreiro, slug in lista:
        print(f" - {terreiro} ({slug}): {mascarar(email)}")
    if modo != "--enviar":
        print("\nNada foi enviado. Para enviar, rode de novo com --enviar.")
        return
    ok = falha = 0
    for email, terreiro, _slug in lista:
        if await enviar_um(email, terreiro):
            ok += 1
            print(f"enviado: {mascarar(email)}")
        else:
            falha += 1
            print(f"FALHOU: {mascarar(email)}")
        await asyncio.sleep(PAUSA_ENTRE_ENVIOS)
    print(f"\nFim: {ok} enviados, {falha} falharam.")


asyncio.run(main())
