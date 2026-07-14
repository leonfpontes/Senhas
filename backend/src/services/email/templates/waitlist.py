"""
Email templates for the waitlist (fila de espera) feature.

Two moments:
- Entry: consulente requested a senha after the gira reached capacity.
- Promotion: a senha was cancelled and this consulente is next in line —
  they must confirm within the gira's confirmation window or the slot
  cascades to the next person.

Single tenant-brand palette (no sponsor/regular split, unlike ticket_emission.py).
"""

from datetime import datetime, timezone
from urllib.parse import quote
from html import escape
from typing import Optional


def _esc(value: str) -> str:
    return escape(value) if value else ""


def _maps_url(address: str) -> str:
    return f"https://www.google.com/maps/dir/?api=1&destination={quote(address)}"


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def _shell(
    *,
    title: str,
    tenant_name: str,
    tenant_logo_url: str,
    primary_color: str,
    secondary_color: str,
    body_html: str,
) -> str:
    pc = primary_color or "#2E7D32"
    sc = secondary_color or pc
    t_name = _esc(tenant_name)
    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{t_name}" '
        f'style="max-width:140px;height:auto;margin-bottom:16px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);">'
        if tenant_logo_url else ""
    )
    ts = _timestamp()
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{_esc(title)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333;">
<div style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:36px 20px;text-align:center;border-bottom:4px solid {pc};">
    {logo_block}
    <p style="margin:0 0 10px 0;color:rgba(255,255,255,0.9);font-size:18px;font-weight:700;">{t_name}</p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">{_esc(title)}</h1>
  </div>
  <div style="padding:32px 24px;">
    {body_html}
  </div>
  <div style="background-color:#f0f0f0;padding:16px;text-align:center;font-size:11px;color:#666;border-top:1px solid #e0e0e0;">
    <p style="margin:4px 0;">Email automático &middot; Enviado em {ts}</p>
  </div>
</div>
</body>
</html>"""


def generate_waitlist_entry_html(
    *,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    position: int,
    tenant_name: str,
    tenant_logo_url: str = "",
    primary_color: str = "",
    secondary_color: str = "",
) -> str:
    """Sent when a request is recorded on the waitlist (gira at capacity)."""
    c_name = _esc(consulente_name)
    g_name = _esc(gira_name)
    body = f"""
    <p style="margin:0 0 20px 0;font-size:16px;color:#555;">Olá <strong>{c_name}</strong>,</p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#555;">
      As senhas de <strong>{g_name}</strong> ({_esc(gira_date)}) já atingiram o limite disponível,
      mas você entrou na <strong>fila de espera</strong>.
    </p>
    <div style="background:linear-gradient(135deg,#607d8b 0%,#455a64 100%);padding:24px 20px;border-radius:8px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:2px;font-weight:700;">Sua posição na fila</p>
      <p style="margin:0;font-size:44px;font-weight:900;color:#ffffff;">{position}º</p>
    </div>
    <p style="margin:0 0 6px 0;font-size:14px;color:#555;">
      Se alguma senha oficial for cancelada, avisaremos por e-mail assim que uma vaga abrir para você —
      não é preciso fazer nada agora.
    </p>
    """
    return _shell(
        title="Você está na fila de espera",
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
        primary_color=primary_color,
        secondary_color=secondary_color,
        body_html=body,
    )


def generate_waitlist_entry_text(
    *,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    position: int,
    tenant_name: str,
) -> str:
    return f"""FILA DE ESPERA

Olá {consulente_name},

As senhas de {gira_name} ({gira_date}) já atingiram o limite disponível, mas você
entrou na fila de espera.

Sua posição atual: {position}º

Se uma senha oficial for cancelada, avisaremos por e-mail assim que uma vaga
abrir para você.

---
{tenant_name} — Email automático
"""


def generate_waitlist_promotion_html(
    *,
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    confirm_link: str,
    confirmation_hours: int,
    tenant_name: str,
    tenant_address: str = "",
    tenant_logo_url: str = "",
    primary_color: str = "",
    secondary_color: str = "",
) -> str:
    """Sent when a slot opens up and this waitlisted consulente is next in line."""
    c_name = _esc(consulente_name)
    g_name = _esc(gira_name)
    address = tenant_address or gira_location or ""
    maps_block = ""
    if address:
        maps_block = f"""
        <p style="margin:0 0 16px 0;font-size:14px;color:#555;">📍 {_esc(address)}</p>"""
    body = f"""
    <p style="margin:0 0 20px 0;font-size:16px;color:#555;">Olá <strong>{c_name}</strong>,</p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#555;">
      Uma vaga abriu em <strong>{g_name}</strong> ({_esc(gira_date)}) e é a sua vez na fila de espera!
    </p>
    <div style="background:linear-gradient(135deg,#2E7D32 0%,#1B5E20 100%);padding:24px 20px;border-radius:8px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 8px 0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:2px;font-weight:700;">Sua senha</p>
      <p style="margin:0;font-size:44px;font-weight:900;color:#ffffff;letter-spacing:6px;">{_esc(ticket_number)}</p>
    </div>
    {maps_block}
    <div style="text-align:center;margin:28px 0;">
      <a href="{confirm_link}" target="_blank"
         style="display:inline-block;background-color:#2E7D32;color:#ffffff;text-decoration:none;
                padding:14px 32px;border-radius:6px;font-weight:bold;font-size:15px;">
        CONFIRMAR MINHA SENHA
      </a>
    </div>
    <p style="margin:0;font-size:13px;color:#c62828;text-align:center;font-weight:600;">
      ⏰ Confirme em até {confirmation_hours}h ou a vaga passa para o próximo da fila.
    </p>
    """
    return _shell(
        title="Uma vaga abriu para você!",
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
        primary_color=primary_color,
        secondary_color=secondary_color,
        body_html=body,
    )


def generate_waitlist_promotion_text(
    *,
    ticket_number: str,
    consulente_name: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    confirm_link: str,
    confirmation_hours: int,
    tenant_name: str,
    tenant_address: str = "",
) -> str:
    address = tenant_address or gira_location or ""
    return f"""UMA VAGA ABRIU PARA VOCÊ!

Olá {consulente_name},

Uma vaga abriu em {gira_name} ({gira_date}) e é a sua vez na fila de espera!

NÚMERO DA SENHA: {ticket_number}
Endereço: {address or 'Não informado'}

Confirme sua senha em até {confirmation_hours}h ou a vaga passa para o próximo
da fila:
{confirm_link}

---
{tenant_name} — Email automático
"""
