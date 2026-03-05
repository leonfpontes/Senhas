"""
T036: Email Template for Ticket Emission
Responsive HTML template with inline CSS for email clients (Gmail, Outlook, etc)
"""

# This is a template generator module
# HTML is generated in-memory with dynamic values for tenant branding

def generate_ticket_emission_html(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    rescue_link: str,
    qr_code_url: str,
    tenant_name: str,
    tenant_logo_url: str,
    tenant_color: str = "#2E7D32",  # Default theme color (green)
) -> str:
    """Generate responsive HTML email for ticket emission

    Args:
        ticket_number: Formatted ticket number (e.g., "0042")
        consulente_name: Name of person who requested ticket
        gira_name: Name of the spiritual gathering
        gira_date: Date/time of gira (formatted string)
        gira_location: Location of gira
        rescue_link: Full URL to ticket rescue/redemption page
        qr_code_url: URL to QR code image (encodes rescue_link)
        tenant_name: Organization name
        tenant_logo_url: Logo URL (will be displayed in email header)
        tenant_color: Brand color hex code for button/links

    Returns:
        Complete HTML email body with inline CSS (no <style> tags needed)
    """

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua Senha - {ticket_number}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6; color: #333;">
    <!-- Wrapper -->
    <div style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        
        <!-- Header with Tenant Logo -->
        <div style="background: linear-gradient(135deg, {tenant_color}99 0%, {tenant_color} 100%); padding: 40px 20px; text-align: center; border-bottom: 4px solid {tenant_color};">
            <img src="{tenant_logo_url}" alt="{tenant_name}" style="max-width: 150px; height: auto; margin-bottom: 10px;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold; letter-spacing: 1px;">SENHA EMITIDA</h1>
        </div>

        <!-- Main Content -->
        <div style="padding: 40px 20px;">
            <!-- Greeting -->
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #555;">
                Olá <strong>{consulente_name}</strong>,
            </p>

            <!-- Ticket Number - PROMINENT -->
            <div style="background: linear-gradient(135deg, {tenant_color} 0%, {tenant_color}dd 100%); padding: 30px 20px; border-radius: 8px; text-align: center; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 2px;">Sua Senha</p>
                <p style="margin: 0; font-size: 56px; font-weight: bold; color: white; letter-spacing: 8px;">{ticket_number}</p>
            </div>

            <!-- Event Details -->
            <div style="background-color: #f9f9f9; border-left: 4px solid {tenant_color}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 15px 0; color: {tenant_color}; font-size: 18px;">Detalhes do Evento</h3>
                
                <p style="margin: 10px 0; font-size: 15px;">
                    <strong style="color: #333;">Gira:</strong> {gira_name}
                </p>
                
                <p style="margin: 10px 0; font-size: 15px;">
                    <strong style="color: #333;">Data:</strong> {gira_date}
                </p>
                
                <p style="margin: 10px 0; font-size: 15px;">
                    <strong style="color: #333;">Local:</strong> {gira_location}
                </p>
            </div>

            <!-- QR Code for Quick Redemption -->
            <div style="text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 15px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Scan para resgatar</p>
                <img src="{qr_code_url}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid {tenant_color};">
            </div>

            <!-- Rescue Link Button -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="{rescue_link}" style="display: inline-block; background-color: {tenant_color}; color: white; text-decoration: none; padding: 15px 40px; border-radius: 6px; font-weight: bold; font-size: 16px; letter-spacing: 0.5px; transition: background-color 0.3s; border: none; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
                    RESGATAR SENHA
                </a>
            </div>

            <!-- Instructions -->
            <div style="background-color: #fffbf0; border-left: 4px solid #ff9800; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h4 style="margin: 0 0 12px 0; color: #ff9800; font-size: 16px;">Como Usar Sua Senha</h4>
                <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #555;">
                    <li style="margin-bottom: 8px;">Clique no botão acima ou abra o link no seu navegador</li>
                    <li style="margin-bottom: 8px;">Sua senha será confirmada e apresentada na tela</li>
                    <li style="margin-bottom: 8px;">Apresente a senha (número {ticket_number}) na entrada</li>
                    <li>Escaneie o código de barras ou QR code do atendente</li>
                </ol>
            </div>

            <!-- Important Notes -->
            <div style="border-top: 2px solid #e0e0e0; padding-top: 20px; margin-top: 20px; font-size: 13px; color: #888; line-height: 1.8;">
                <p style="margin: 0 0 8px 0;">
                    ⏰ <strong>Validade:</strong> Esta senha é válida apenas para a data do evento listado acima.
                </p>
                <p style="margin: 0 0 8px 0;">
                    🔐 <strong>Privacidade:</strong> Este email contém informações pessoais. Não compartilhe com terceiros.
                </p>
                <p style="margin: 0;">
                    ❓ <strong>Dúvidas?</strong> Responda este email ou visite nosso site de suporte.
                </p>
            </div>

            <!-- Signature -->
            <p style="margin: 20px 0 0 0; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                {tenant_name} © 2026 - Administração de Senhas Espíritas
                <br>
                <a href="#" style="color: #2E7D32; text-decoration: none; font-size: 11px;">Política de Privacidade</a> | 
                <a href="#" style="color: #2E7D32; text-decoration: none; font-size: 11px;">Termos de Uso</a>
            </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0;">
            <p style="margin: 5px 0;">Este é um email automático. Por favor, não responda diretamente.</p>
            <p style="margin: 5px 0;">Enviado em: <span style="font-family: monospace;">{timestamp}</span></p>
        </div>
    </div>

    <!-- Email Client Fallbacks -->
    <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        Sua senha foi emitida com sucesso. Número: {ticket_number}. Visite o link de resgate para confirmar.
    </div>
</body>
</html>"""

    # Add timestamp
    from datetime import datetime
    
    timestamp = datetime.utcnow().strftime("%d/%m/%Y %H:%M:%S UTC")
    html = html.replace("{timestamp}", timestamp)

    return html


def generate_plain_text_fallback(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    rescue_link: str,
) -> str:
    """Generate plain text fallback for email clients that don't support HTML

    Args:
        ticket_number: Formatted ticket number
        consulente_name: Name of person
        gira_name: Name of event
        gira_date: Date/time of event
        gira_location: Location of event
        rescue_link: Redemption URL

    Returns:
        Plain text email body
    """
    return f"""SENHA EMITIDA

Olá {consulente_name},

Sua senha foi emitida com sucesso!

NÚMERO DA SENHA: {ticket_number}

Detalhes do Evento:
- Gira: {gira_name}
- Data: {gira_date}
- Local: {gira_location}

Para resgatar sua senha, visite:
{rescue_link}

---

1. Clique no link acima ou copie e cole no navegador
2. Sua senha será confirmada
3. Apresente o número {ticket_number} na entrada
4. O atendente fará a leitura do código

Validade: Esta senha é válida apenas para a data do evento acima.

Privacidade: Este email contém informações pessoais. Não compartilhe.

---

Nome da Organização © 2026
Administração de Senhas Espíritas
"""
