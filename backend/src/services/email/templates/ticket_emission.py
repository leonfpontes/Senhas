"""
Email Templates for Ticket Emission
Two variants: sponsor (gold/black) and regular (tenant brand colors).
All CSS is inline for maximum Gmail/Outlook compatibility.
"""

from datetime import datetime, timezone
from urllib.parse import quote


def _maps_url(address: str) -> str:
    """Build a Google Maps directions URL from an address string."""
    return f"https://www.google.com/maps/dir/?api=1&destination={quote(address)}"


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


# ---------------------------------------------------------------------------
# Sponsor template  –  gold (#C9A84C) / black palette
# ---------------------------------------------------------------------------

def _sponsor_html(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    tenant_address: str,
    rescue_link: str,
    qr_code_url: str,
    tenant_logo_url: str,
) -> str:
    gold = "#C9A84C"
    gold_light = "#E8D48B"
    black = "#1A1A1A"
    dark_bg = "#0D0D0D"
    maps_link = _maps_url(tenant_address) if tenant_address else ""
    ts = _timestamp()

    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{tenant_name}" '
        f'style="max-width:120px;height:auto;margin-bottom:12px;">'
        if tenant_logo_url else ""
    )

    address_block = ""
    if tenant_address:
        address_block = f"""
            <p style="margin:10px 0;font-size:15px;">
                <strong style="color:{gold};">Endereço:</strong> {tenant_address}
            </p>
            <div style="text-align:center;margin:12px 0 0 0;">
                <a href="{maps_link}" target="_blank"
                   style="display:inline-block;background-color:{gold};color:{black};
                          text-decoration:none;padding:10px 28px;border-radius:6px;
                          font-weight:bold;font-size:14px;letter-spacing:0.5px;">
                    📍 COMO CHEGAR
                </a>
            </div>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Senha Patrocinador - {ticket_number}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#111;line-height:1.6;color:#e0e0e0;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:{black};border:2px solid {gold};border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,{dark_bg} 0%,{black} 100%);padding:36px 20px;text-align:center;border-bottom:3px solid {gold};">
    {logo_block}
    <h1 style="margin:0;color:{gold};font-size:24px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
      ✦ PATROCINADOR ✦
    </h1>
    <p style="margin:6px 0 0 0;color:{gold_light};font-size:13px;letter-spacing:1px;">
      Agradecemos imensamente o seu apoio e patrocínio
    </p>
  </div>

  <!-- Body -->
  <div style="padding:36px 24px;">
    <p style="margin:0 0 20px 0;font-size:16px;color:#ccc;">
      Olá <strong style="color:#fff;">{consulente_name}</strong>,
    </p>

    <p style="margin:0 0 24px 0;font-size:15px;color:#bbb;">
      Sua contribuição fortalece o trabalho espiritual e ajuda a manter as portas abertas
      para todos que buscam acolhimento. O terreiro agradece de coração.
    </p>

    <!-- Ticket Number -->
    <div style="background:linear-gradient(135deg,{gold} 0%,#B8963F 100%);padding:28px 20px;border-radius:8px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(0,0,0,0.6);text-transform:uppercase;letter-spacing:3px;font-weight:700;">Sua Senha</p>
      <p style="margin:0;font-size:52px;font-weight:900;color:{black};letter-spacing:8px;">{ticket_number}</p>
    </div>

    <!-- Event Details -->
    <div style="background-color:rgba(201,168,76,0.08);border-left:4px solid {gold};padding:20px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 14px 0;color:{gold};font-size:17px;font-weight:700;">Detalhes da Gira</h3>
      <p style="margin:10px 0;font-size:15px;">
        <strong style="color:{gold};">Gira:</strong> {gira_name}
      </p>
      <p style="margin:10px 0;font-size:15px;">
        <strong style="color:{gold};">Data:</strong> {gira_date}
      </p>
      {address_block}
    </div>

    <!-- QR Code -->
    <div style="text-align:center;margin:28px 0;">
      <p style="margin:0 0 12px 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:2px;">Apresente na entrada</p>
      <img src="{qr_code_url}" alt="QR Code" style="width:180px;height:180px;border-radius:8px;border:2px solid {gold};">
    </div>

    <!-- Rescue Button -->
    <div style="text-align:center;margin:28px 0;">
      <a href="{rescue_link}" target="_blank"
         style="display:inline-block;background-color:{gold};color:{black};text-decoration:none;
                padding:14px 44px;border-radius:6px;font-weight:800;font-size:15px;letter-spacing:1px;">
        RESGATAR SENHA
      </a>
    </div>

    <!-- Instructions -->
    <div style="background-color:rgba(201,168,76,0.06);border-left:4px solid #B8963F;padding:18px;margin:20px 0;border-radius:4px;">
      <h4 style="margin:0 0 10px 0;color:{gold_light};font-size:15px;">Como Usar Sua Senha</h4>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#bbb;">
        <li style="margin-bottom:6px;">Clique no botão acima ou abra o link no navegador</li>
        <li style="margin-bottom:6px;">Apresente a senha (número {ticket_number}) na entrada</li>
        <li>O atendente fará a leitura do QR Code</li>
      </ol>
    </div>

    <!-- Notes -->
    <div style="border-top:1px solid #333;padding-top:18px;margin-top:20px;font-size:13px;color:#777;line-height:1.8;">
      <p style="margin:0 0 6px 0;">⏰ <strong>Validade:</strong> Apenas para a data do evento acima.</p>
      <p style="margin:0;">🔐 <strong>Privacidade:</strong> Não compartilhe este email com terceiros.</p>
    </div>

    <p style="margin:24px 0 0 0;text-align:center;font-size:12px;color:#666;border-top:1px solid #333;padding-top:16px;">
      {tenant_name} &copy; {datetime.now().year}
    </p>
  </div>

  <!-- Footer -->
  <div style="background-color:{dark_bg};padding:16px;text-align:center;font-size:11px;color:#555;border-top:1px solid #333;">
    <p style="margin:4px 0;">Email automático &middot; Enviado em {ts}</p>
  </div>
</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Regular template  –  tenant brand colors
# ---------------------------------------------------------------------------

def _regular_html(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    tenant_address: str,
    rescue_link: str,
    qr_code_url: str,
    tenant_logo_url: str,
    primary_color: str,
    secondary_color: str,
) -> str:
    pc = primary_color or "#2E7D32"
    sc = secondary_color or "#1B5E20"
    maps_link = _maps_url(tenant_address) if tenant_address else ""
    ts = _timestamp()

    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{tenant_name}" '
        f'style="max-width:120px;height:auto;margin-bottom:12px;">'
        if tenant_logo_url else ""
    )

    address_block = ""
    if tenant_address:
        address_block = f"""
            <p style="margin:10px 0;font-size:15px;">
                <strong style="color:#333;">Endereço:</strong> {tenant_address}
            </p>
            <div style="text-align:center;margin:12px 0 0 0;">
                <a href="{maps_link}" target="_blank"
                   style="display:inline-block;background-color:{pc};color:#ffffff;
                          text-decoration:none;padding:10px 28px;border-radius:6px;
                          font-weight:bold;font-size:14px;letter-spacing:0.5px;">
                    📍 COMO CHEGAR
                </a>
            </div>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sua Senha - {ticket_number}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:36px 20px;text-align:center;border-bottom:4px solid {pc};">
    {logo_block}
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1px;">SENHA EMITIDA</h1>
  </div>

  <!-- Body -->
  <div style="padding:36px 24px;">
    <p style="margin:0 0 20px 0;font-size:16px;color:#555;">
      Olá <strong>{consulente_name}</strong>,
    </p>

    <!-- Ticket Number -->
    <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:28px 20px;border-radius:8px;text-align:center;margin:20px 0;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:3px;font-weight:700;">Sua Senha</p>
      <p style="margin:0;font-size:52px;font-weight:900;color:#ffffff;letter-spacing:8px;">{ticket_number}</p>
    </div>

    <!-- Event Details -->
    <div style="background-color:#f9f9f9;border-left:4px solid {pc};padding:20px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 14px 0;color:{pc};font-size:17px;font-weight:700;">Detalhes da Gira</h3>
      <p style="margin:10px 0;font-size:15px;">
        <strong style="color:#333;">Gira:</strong> {gira_name}
      </p>
      <p style="margin:10px 0;font-size:15px;">
        <strong style="color:#333;">Data:</strong> {gira_date}
      </p>
      {address_block}
    </div>

    <!-- QR Code -->
    <div style="text-align:center;margin:28px 0;">
      <p style="margin:0 0 12px 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:2px;">Apresente na entrada</p>
      <img src="{qr_code_url}" alt="QR Code" style="width:180px;height:180px;border-radius:8px;border:2px solid {pc};">
    </div>

    <!-- Rescue Button -->
    <div style="text-align:center;margin:28px 0;">
      <a href="{rescue_link}" target="_blank"
         style="display:inline-block;background-color:{pc};color:#ffffff;text-decoration:none;
                padding:14px 44px;border-radius:6px;font-weight:800;font-size:15px;letter-spacing:1px;
                box-shadow:0 4px 6px rgba(0,0,0,0.15);">
        RESGATAR SENHA
      </a>
    </div>

    <!-- Instructions -->
    <div style="background-color:#fffbf0;border-left:4px solid #ff9800;padding:18px;margin:20px 0;border-radius:4px;">
      <h4 style="margin:0 0 10px 0;color:#ff9800;font-size:15px;">Como Usar Sua Senha</h4>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#555;">
        <li style="margin-bottom:6px;">Clique no botão acima ou abra o link no navegador</li>
        <li style="margin-bottom:6px;">Apresente a senha (número {ticket_number}) na entrada</li>
        <li>O atendente fará a leitura do QR Code</li>
      </ol>
    </div>

    <!-- Notes -->
    <div style="border-top:2px solid #e0e0e0;padding-top:18px;margin-top:20px;font-size:13px;color:#888;line-height:1.8;">
      <p style="margin:0 0 6px 0;">⏰ <strong>Validade:</strong> Apenas para a data do evento acima.</p>
      <p style="margin:0;">🔐 <strong>Privacidade:</strong> Não compartilhe este email com terceiros.</p>
    </div>

    <p style="margin:24px 0 0 0;text-align:center;font-size:12px;color:#999;border-top:1px solid #e0e0e0;padding-top:16px;">
      {tenant_name} &copy; {datetime.now().year}
    </p>
  </div>

  <!-- Footer -->
  <div style="background-color:#f0f0f0;padding:16px;text-align:center;font-size:11px;color:#666;border-top:1px solid #e0e0e0;">
    <p style="margin:4px 0;">Email automático &middot; Enviado em {ts}</p>
  </div>
</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Public API  –  kept backward-compatible
# ---------------------------------------------------------------------------

def generate_ticket_emission_html(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,          # legacy — kept for backward compat
    rescue_link: str,
    qr_code_url: str,
    tenant_name: str,
    tenant_logo_url: str,
    tenant_color: str = "#2E7D32",
    *,
    is_sponsor: bool = False,
    tenant_address: str = "",
    primary_color: str = "",
    secondary_color: str = "",
) -> str:
    """Generate responsive HTML email for ticket emission.

    Selects sponsor (gold/black) or regular (tenant colors) variant.
    """
    address = tenant_address or gira_location or ""

    if is_sponsor:
        return _sponsor_html(
            ticket_number=ticket_number,
            consulente_name=consulente_name,
            gira_name=gira_name,
            gira_date=gira_date,
            tenant_name=tenant_name,
            tenant_address=address,
            rescue_link=rescue_link,
            qr_code_url=qr_code_url,
            tenant_logo_url=tenant_logo_url,
        )

    return _regular_html(
        ticket_number=ticket_number,
        consulente_name=consulente_name,
        gira_name=gira_name,
        gira_date=gira_date,
        tenant_name=tenant_name,
        tenant_address=address,
        rescue_link=rescue_link,
        qr_code_url=qr_code_url,
        tenant_logo_url=tenant_logo_url,
        primary_color=primary_color or tenant_color,
        secondary_color=secondary_color or tenant_color,
    )


def generate_plain_text_fallback(
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    rescue_link: str,
    *,
    is_sponsor: bool = False,
    tenant_address: str = "",
    tenant_name: str = "",
) -> str:
    """Generate plain text fallback for email clients that don't support HTML."""
    address = tenant_address or gira_location or ""
    sponsor_note = (
        "\nAgradecemos imensamente o seu apoio e patrocínio ao trabalho espiritual.\n"
        if is_sponsor else ""
    )
    maps_line = (
        f"\nComo chegar: {_maps_url(address)}\n" if address else ""
    )

    return f"""SENHA EMITIDA{' — PATROCINADOR' if is_sponsor else ''}

Olá {consulente_name},

Sua senha foi emitida com sucesso!
{sponsor_note}
NÚMERO DA SENHA: {ticket_number}

Detalhes da Gira:
- Gira: {gira_name}
- Data: {gira_date}
- Endereço: {address or 'Não informado'}
{maps_line}
Para resgatar sua senha, acesse:
{rescue_link}

1. Clique no link acima ou copie e cole no navegador
2. Apresente o número {ticket_number} na entrada
3. O atendente fará a leitura do QR Code

Validade: Esta senha é válida apenas para a data do evento acima.

---
{tenant_name} — Email automático
"""
