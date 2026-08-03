"""
Email Templates for Ticket Emission
Two variants: sponsor (gold/black) and regular (tenant brand colors).
All CSS is inline for maximum Gmail/Outlook compatibility.
"""

from datetime import datetime, timezone
from urllib.parse import quote
from html import escape
from typing import Optional


# ---------------------------------------------------------------------------
# Priority category labels (PT-BR) — intentionally duplicated from shared-types
# to avoid cross-layer coupling between backend email templates and TS packages.
# ---------------------------------------------------------------------------
_PRIORITY_LABELS: dict[str, str] = {
    "ELDERLY": "Idoso (60+)",
    "DISABILITY_OR_AUTISM": "PcD / TEA",
    "PREGNANT_LACTATING_OR_INFANT": "Gestante, Lactante ou Criança de colo",
    "REDUCED_MOBILITY": "Mobilidade Reduzida",
}


def _maps_url(address: str) -> str:
    """Build a Google Maps directions URL from an address string."""
    return f"https://www.google.com/maps/dir/?api=1&destination={quote(address)}"


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def _esc(value: str) -> str:
    """Escape HTML entities in user-provided text."""
    return escape(value) if value else ""


def _esc_multiline(value: str) -> str:
    """Escape HTML entities, preserving line breaks typed by the admin."""
    return _esc(value).replace("\n", "<br>")


def _recados_block(recados: Optional[str], accent: str, bg: str, text: str) -> str:
    """Bloco de 'Recados' (investimento, itens de doação, avisos) — só
    aparece no email se a gira tiver algo cadastrado nesse campo."""
    if not recados or not recados.strip():
        return ""
    return f"""
        <div style="background-color:{bg};border-left:4px solid {accent};padding:16px;margin:24px 0;border-radius:4px;">
          <h3 style="margin:0 0 10px 0;color:{accent};font-size:17px;font-weight:700;">Recados</h3>
          <p style="margin:0;font-size:14px;color:{text};line-height:1.6;white-space:pre-line;">{_esc_multiline(recados.strip())}</p>
        </div>"""


# ---------------------------------------------------------------------------
# Sponsor template  –  gold (#C9A84C) / black palette
# ---------------------------------------------------------------------------

def _sponsor_html(
    ticket_number: str,
    consulente_name: str,
    consulente_email: str,
    consulente_phone: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    tenant_address: str,
    rescue_link: str,
    tenant_logo_url: str,
    priority_category: Optional[str] = None,
    recados: Optional[str] = None,
    horario_desejado: Optional[str] = None,
) -> str:
    gold = "#C9A84C"
    gold_light = "#B8963F"
    black = "#1A1A1A"
    white_bg = "#FFFFFF"
    light_bg = "#FEFCF5"
    maps_link = _maps_url(tenant_address) if tenant_address else ""
    ts = _timestamp()
    c_name = _esc(consulente_name)
    c_email = _esc(consulente_email)
    c_phone = _esc(consulente_phone)
    g_name = _esc(gira_name)
    t_name = _esc(tenant_name)
    t_address = _esc(tenant_address)

    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{t_name}" '
        f'style="max-width:160px;height:auto;margin-bottom:16px;border-radius:50%;border:3px solid {gold};">'
        if tenant_logo_url else ""
    )

    priority_badge = ""
    if priority_category:
        prio_label = _esc(_PRIORITY_LABELS.get(priority_category, priority_category))
        priority_badge = (
            f'<div style="display:inline-block;margin-top:12px;padding:6px 18px;'
            f'background:rgba(0,0,0,0.15);border-radius:20px;'
            f'font-size:13px;font-weight:700;color:{black};letter-spacing:0.5px;">'
            f'\u2605 Atendimento Preferencial &mdash; {prio_label}'
            f'</div>'
        )

    address_block = ""
    if tenant_address:
        address_block = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;vertical-align:top;white-space:nowrap;">Endereço</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;">{t_address}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:10px 12px;text-align:center;">
                <a href="{maps_link}" target="_blank"
                   style="display:inline-block;background-color:{gold};color:{black};
                          text-decoration:none;padding:10px 28px;border-radius:6px;
                          font-weight:bold;font-size:14px;letter-spacing:0.5px;">
                    📍 COMO CHEGAR
                </a>
              </td>
            </tr>"""

    phone_row = ""
    if consulente_phone:
        phone_row = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Telefone</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;">{c_phone}</td>
            </tr>"""

    recados_block = _recados_block(recados, accent=gold_light, bg=light_bg, text="#333")

    horario_row = ""
    if horario_desejado:
        horario_row = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Horário</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;font-weight:700;">{_esc(horario_desejado)}</td>
            </tr>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Senha Associado - {_esc(ticket_number)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:{white_bg};border:2px solid {gold};border-radius:8px;overflow:hidden;">

  <!-- Header with Logo -->
  <div style="background:linear-gradient(135deg,{gold} 0%,#E8D48B 100%);padding:40px 20px;text-align:center;border-bottom:3px solid {gold_light};">
    {logo_block}
    <p style="margin:0 0 10px 0;color:{black};font-size:18px;font-weight:700;">{t_name}</p>
    <h1 style="margin:0;color:{black};font-size:24px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
      ✦ ASSOCIADO ✦
    </h1>
    <p style="margin:6px 0 0 0;color:#333;font-size:13px;letter-spacing:1px;">
      Agradecemos imensamente o seu apoio e contribuição
    </p>
    {priority_badge}
  </div>

  <!-- Body -->
  <div style="padding:36px 24px;">
    <p style="margin:0 0 20px 0;font-size:16px;color:#333;">
      Olá <strong style="color:{black};">{c_name}</strong>,
    </p>

    <p style="margin:0 0 24px 0;font-size:15px;color:#555;">
      Como associado, sua contribuição fortalece o trabalho espiritual e ajuda a manter
      as portas abertas para todos que buscam acolhimento. O terreiro agradece de coração.
    </p>

    <!-- Ticket Number -->
    <div style="background:linear-gradient(135deg,{gold} 0%,#B8963F 100%);padding:28px 20px;border-radius:8px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(0,0,0,0.6);text-transform:uppercase;letter-spacing:3px;font-weight:700;">Sua Senha</p>
      <p style="margin:0;font-size:52px;font-weight:900;color:{black};letter-spacing:8px;">{_esc(ticket_number)}</p>
    </div>

    <!-- Consulente Info -->
    <div style="background-color:{light_bg};border-left:4px solid {gold};padding:16px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 10px 0;color:{gold_light};font-size:15px;font-weight:700;">Seus Dados</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Nome</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{c_name}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Email</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{c_email}</td>
        </tr>{phone_row}
      </table>
    </div>

    <!-- Event Details -->
    <div style="background-color:{light_bg};border-left:4px solid {gold};padding:16px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 10px 0;color:{gold};font-size:17px;font-weight:700;">Detalhes da Gira</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Gira</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{g_name}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:{gold};font-weight:700;white-space:nowrap;">Data</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{_esc(gira_date)}</td>
        </tr>{horario_row}{address_block}
      </table>
    </div>
{recados_block}
    <!-- Notes -->
    <div style="border-top:1px solid #e0e0e0;padding-top:18px;margin-top:20px;font-size:13px;color:#777;line-height:1.8;">
      <p style="margin:0 0 6px 0;">⏰ <strong>Validade:</strong> Apenas para a data do evento acima.</p>{f'''
      <p style="margin:0 0 6px 0;">🕐 <strong>Horário marcado:</strong> Chegue por volta das {_esc(horario_desejado)}.</p>''' if horario_desejado else ''}
      <p style="margin:0 0 6px 0;">📋 <strong>Na entrada:</strong> Informe o número {_esc(ticket_number)} ao atendente.</p>
      <p style="margin:0;">🔐 <strong>Privacidade:</strong> Não compartilhe este email com terceiros.</p>
    </div>

    <p style="margin:24px 0 0 0;text-align:center;font-size:12px;color:#999;border-top:1px solid #e0e0e0;padding-top:16px;">
      {t_name} &copy; {datetime.now().year}
    </p>
  </div>

  <!-- Footer -->
  <div style="background-color:{light_bg};padding:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #e0e0e0;">
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
    consulente_email: str,
    consulente_phone: str,
    gira_name: str,
    gira_date: str,
    tenant_name: str,
    tenant_address: str,
    rescue_link: str,
    tenant_logo_url: str,
    primary_color: str,
    secondary_color: str,
    priority_category: Optional[str] = None,
    recados: Optional[str] = None,
    horario_desejado: Optional[str] = None,
) -> str:
    pc = primary_color or "#2E7D32"
    sc = secondary_color or "#1B5E20"
    maps_link = _maps_url(tenant_address) if tenant_address else ""
    ts = _timestamp()
    c_name = _esc(consulente_name)
    c_email = _esc(consulente_email)
    c_phone = _esc(consulente_phone)
    g_name = _esc(gira_name)
    t_name = _esc(tenant_name)
    t_address = _esc(tenant_address)

    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{t_name}" '
        f'style="max-width:160px;height:auto;margin-bottom:16px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);">'
        if tenant_logo_url else ""
    )

    priority_badge = ""
    if priority_category:
        prio_label = _esc(_PRIORITY_LABELS.get(priority_category, priority_category))
        priority_badge = (
            f'<div style="display:inline-block;margin-top:12px;padding:6px 18px;'
            f'background:rgba(255,255,255,0.25);border-radius:20px;'
            f'font-size:13px;font-weight:700;color:#fff;letter-spacing:0.5px;">'
            f'\u2605 Atendimento Preferencial &mdash; {prio_label}'
            f'</div>'
        )

    address_block = ""
    if tenant_address:
        address_block = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;vertical-align:top;white-space:nowrap;">Endereço</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;">{t_address}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:10px 12px;text-align:center;">
                <a href="{maps_link}" target="_blank"
                   style="display:inline-block;background-color:{pc};color:#ffffff;
                          text-decoration:none;padding:10px 28px;border-radius:6px;
                          font-weight:bold;font-size:14px;letter-spacing:0.5px;">
                    📍 COMO CHEGAR
                </a>
              </td>
            </tr>"""

    phone_row = ""
    if consulente_phone:
        phone_row = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Telefone</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;">{c_phone}</td>
            </tr>"""

    recados_block = _recados_block(recados, accent=pc, bg="#f9f9f9", text="#555")

    horario_row = ""
    if horario_desejado:
        horario_row = f"""
            <tr>
              <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Horário</td>
              <td style="padding:6px 12px;font-size:14px;color:#333;font-weight:700;">{_esc(horario_desejado)}</td>
            </tr>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sua Senha - {_esc(ticket_number)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;">

  <!-- Header with Logo -->
  <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:40px 20px;text-align:center;border-bottom:4px solid {pc};">
    {logo_block}
    <p style="margin:0 0 10px 0;color:rgba(255,255,255,0.9);font-size:18px;font-weight:700;">{t_name}</p>
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1px;">SENHA EMITIDA</h1>
    {priority_badge}
  </div>

  <!-- Body -->
  <div style="padding:36px 24px;">
    <p style="margin:0 0 20px 0;font-size:16px;color:#555;">
      Olá <strong>{c_name}</strong>,
    </p>

    <!-- Ticket Number -->
    <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:28px 20px;border-radius:8px;text-align:center;margin:20px 0;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:3px;font-weight:700;">Sua Senha</p>
      <p style="margin:0;font-size:52px;font-weight:900;color:#ffffff;letter-spacing:8px;">{_esc(ticket_number)}</p>
    </div>

    <!-- Consulente Info -->
    <div style="background-color:#fffbf0;border-left:4px solid #ff9800;padding:16px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 10px 0;color:#e65100;font-size:15px;font-weight:700;">Seus Dados</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Nome</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{c_name}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Email</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{c_email}</td>
        </tr>{phone_row}
      </table>
    </div>

    <!-- Event Details -->
    <div style="background-color:#f9f9f9;border-left:4px solid {pc};padding:16px;margin:24px 0;border-radius:4px;">
      <h3 style="margin:0 0 10px 0;color:{pc};font-size:17px;font-weight:700;">Detalhes da Gira</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Gira</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{g_name}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#555;font-weight:700;white-space:nowrap;">Data</td>
          <td style="padding:6px 12px;font-size:14px;color:#333;">{_esc(gira_date)}</td>
        </tr>{horario_row}{address_block}
      </table>
    </div>
{recados_block}
    <!-- Notes -->
    <div style="border-top:2px solid #e0e0e0;padding-top:18px;margin-top:20px;font-size:13px;color:#888;line-height:1.8;">
      <p style="margin:0 0 6px 0;">⏰ <strong>Validade:</strong> Apenas para a data do evento acima.</p>{f'''
      <p style="margin:0 0 6px 0;">🕐 <strong>Horário marcado:</strong> Chegue por volta das {_esc(horario_desejado)}.</p>''' if horario_desejado else ''}
      <p style="margin:0 0 6px 0;">📋 <strong>Na entrada:</strong> Informe o número {_esc(ticket_number)} ao atendente.</p>
      <p style="margin:0;">🔐 <strong>Privacidade:</strong> Não compartilhe este email com terceiros.</p>
    </div>

    <p style="margin:24px 0 0 0;text-align:center;font-size:12px;color:#999;border-top:1px solid #e0e0e0;padding-top:16px;">
      {t_name} &copy; {datetime.now().year}
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
    tenant_name: str,
    tenant_logo_url: str,
    tenant_color: str = "#2E7D32",
    *,
    is_sponsor: bool = False,
    tenant_address: str = "",
    primary_color: str = "",
    secondary_color: str = "",
    consulente_email: str = "",
    consulente_phone: str = "",
    priority_category: Optional[str] = None,
    recados: Optional[str] = None,
    horario_desejado: Optional[str] = None,
) -> str:
    """Generate responsive HTML email for ticket emission.

    Selects sponsor (gold/black) or regular (tenant colors) variant.
    priority_category: one of ELDERLY|DISABILITY_OR_AUTISM|
                       PREGNANT_LACTATING_OR_INFANT|REDUCED_MOBILITY, or None.
    recados: optional free text set on the Gira (investment, donation items,
             notices) — rendered as its own block only when non-blank.
    horario_desejado: "HH:MM" horário the consulente picked (agendamento por
             horário) — rendered as its own row only when set.
    """
    address = tenant_address or gira_location or ""

    if is_sponsor:
        return _sponsor_html(
            ticket_number=ticket_number,
            consulente_name=consulente_name,
            consulente_email=consulente_email,
            consulente_phone=consulente_phone,
            gira_name=gira_name,
            gira_date=gira_date,
            tenant_name=tenant_name,
            tenant_address=address,
            rescue_link=rescue_link,
            tenant_logo_url=tenant_logo_url,
            priority_category=priority_category,
            recados=recados,
            horario_desejado=horario_desejado,
        )

    return _regular_html(
        ticket_number=ticket_number,
        consulente_name=consulente_name,
        consulente_email=consulente_email,
        consulente_phone=consulente_phone,
        gira_name=gira_name,
        gira_date=gira_date,
        tenant_name=tenant_name,
        tenant_address=address,
        rescue_link=rescue_link,
        tenant_logo_url=tenant_logo_url,
        primary_color=primary_color or tenant_color,
        secondary_color=secondary_color or tenant_color,
        priority_category=priority_category,
        recados=recados,
        horario_desejado=horario_desejado,
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
    consulente_email: str = "",
    consulente_phone: str = "",
    priority_category: Optional[str] = None,
    recados: Optional[str] = None,
    horario_desejado: Optional[str] = None,
) -> str:
    """Generate plain text fallback for email clients that don't support HTML."""
    address = tenant_address or gira_location or ""
    sponsor_note = (
        "\nAgradecemos imensamente o seu apoio e contribuição ao trabalho espiritual.\n"
        if is_sponsor else ""
    )
    maps_line = (
        f"\nComo chegar: {_maps_url(address)}\n" if address else ""
    )
    phone_line = f"\n- Telefone: {consulente_phone}" if consulente_phone else ""
    priority_line = (
        f"\n- Prioridade: {_PRIORITY_LABELS.get(priority_category, priority_category)}"
        if priority_category else ""
    )
    horario_line = f"\n- Horário: {horario_desejado}" if horario_desejado else ""
    recados_section = (
        f"\nRecados:\n{recados.strip()}\n" if recados and recados.strip() else ""
    )

    return f"""SENHA EMITIDA{' — ASSOCIADO' if is_sponsor else ''}

Olá {consulente_name},

Sua senha foi emitida com sucesso!
{sponsor_note}
NÚMERO DA SENHA: {ticket_number}

Seus Dados:
- Nome: {consulente_name}
- Email: {consulente_email}{phone_line}{priority_line}

Detalhes da Gira:
- Gira: {gira_name}
- Data: {gira_date}{horario_line}
- Endereço: {address or 'Não informado'}
{maps_line}{recados_section}
Para resgatar sua senha, acesse:
{rescue_link}

Na entrada, informe o número {ticket_number} ao atendente.

Validade: Esta senha é válida apenas para a data do evento acima.

---
{tenant_name} — Email automático
"""
