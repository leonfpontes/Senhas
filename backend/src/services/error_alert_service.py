"""Monitor de taxa de erro 5xx com alerta por email.

Conta erros por janela de tempo (in-memory). Quando o threshold é atingido,
envia email para ALERT_EMAIL e aguarda o cooldown antes de enviar novamente.
Funciona independente do Sentry — não consome cota do plano Free.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger("senhas.error_alert")

_TZ_BRT = ZoneInfo("America/Sao_Paulo")
_SENTRY_PROJECT_URL = "https://lfpontes-consultoria-em-inform.sentry.io/issues/?project=python-fastapi"


@dataclass
class ErrorEvent:
    timestamp: datetime
    method: str
    path: str
    status_code: int
    tenant_id: Optional[str]
    user_id: Optional[str]


class ErrorAlertService:
    """Singleton para rastrear erros 5xx e disparar alertas."""

    def __init__(self) -> None:
        self._errors: deque[ErrorEvent] = deque()
        self._last_alert_sent: Optional[datetime] = None

    def record_error(
        self,
        method: str,
        path: str,
        status_code: int,
        tenant_id: str | None,
        user_id: str | None,
    ) -> None:
        event = ErrorEvent(
            timestamp=datetime.now(_TZ_BRT),
            method=method,
            path=path,
            status_code=status_code,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        self._errors.append(event)
        logger.debug("Erro %s registrado (path=%s tenant=%s)", status_code, path, tenant_id)

    def _prune_old(self, window: timedelta) -> None:
        cutoff = datetime.now(_TZ_BRT) - window
        while self._errors and self._errors[0].timestamp < cutoff:
            self._errors.popleft()

    def should_alert(self, threshold: int, window_minutes: int, cooldown_minutes: int) -> bool:
        self._prune_old(timedelta(minutes=window_minutes))
        if len(self._errors) < threshold:
            return False
        if self._last_alert_sent:
            if datetime.now(_TZ_BRT) - self._last_alert_sent < timedelta(minutes=cooldown_minutes):
                return False
        return True

    def mark_alert_sent(self) -> None:
        self._last_alert_sent = datetime.now(_TZ_BRT)

    def recent_errors(self, window_minutes: int) -> list[ErrorEvent]:
        self._prune_old(timedelta(minutes=window_minutes))
        return list(self._errors)


error_alert_service = ErrorAlertService()


def build_alert_email_html(errors: list[ErrorEvent], window_minutes: int, threshold: int) -> str:
    now_str = datetime.now(_TZ_BRT).strftime("%d/%m/%Y %H:%M:%S")
    count = len(errors)

    # Agrupar por (method, path, status_code) para mostrar frequência
    from collections import Counter
    freq: Counter = Counter((e.method, e.path, e.status_code) for e in errors)

    # Tenants únicos afetados
    tenants_afetados = sorted({e.tenant_id for e in errors if e.tenant_id})

    # Tabela de endpoints com mais erros
    rows_endpoint = ""
    for (method, path, status), qtd in freq.most_common(10):
        cor_status = "#c0392b" if status >= 500 else "#e67e22"
        rows_endpoint += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <span style="background:#2c3e50;color:white;padding:2px 6px;border-radius:3px;font-size:11px;font-family:monospace;">{method}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;color:#333;">{path}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">
            <span style="background:{cor_status};color:white;padding:2px 8px;border-radius:3px;font-weight:bold;">{status}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#c0392b;">{qtd}x</td>
        </tr>"""

    # Tabela de últimas ocorrências (até 5)
    rows_recent = ""
    for e in reversed(errors[-5:]):
        ts = e.timestamp.strftime("%H:%M:%S")
        tenant_label = e.tenant_id[:8] + "…" if e.tenant_id and len(e.tenant_id) > 8 else (e.tenant_id or "—")
        rows_recent += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;color:#555;">{ts}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">{e.method} {e.path}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#c0392b;">{e.status_code}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#777;font-size:12px;">{tenant_label}</td>
        </tr>"""

    tenants_html = ""
    if tenants_afetados:
        items = "".join(
            f'<li style="font-family:monospace;font-size:12px;color:#555;">{t}</li>'
            for t in tenants_afetados
        )
        tenants_html = f"""
        <h3 style="color:#333;margin:24px 0 8px;">Tenants afetados ({len(tenants_afetados)})</h3>
        <ul style="margin:0;padding-left:20px;">{items}</ul>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:24px auto;">

  <!-- Header -->
  <div style="background:#c0392b;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:20px;">⚠️ Alerta de Erros 5xx — GiraHub</h2>
    <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">{now_str} (BRT) &nbsp;·&nbsp; {count} erros nos últimos {window_minutes} min (threshold: {threshold})</p>
  </div>

  <!-- Body -->
  <div style="background:#ffffff;padding:24px;border:1px solid #ddd;border-radius:0 0 8px 8px;">

    <!-- Endpoints com mais erros -->
    <h3 style="color:#333;margin:0 0 12px;">Endpoints com mais erros</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Método</th>
          <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Endpoint</th>
          <th style="padding:8px 12px;text-align:center;color:#555;font-weight:600;">Status</th>
          <th style="padding:8px 12px;text-align:center;color:#555;font-weight:600;">Qtd</th>
        </tr>
      </thead>
      <tbody>{rows_endpoint}</tbody>
    </table>

    <!-- Últimas ocorrências -->
    <h3 style="color:#333;margin:24px 0 12px;">Últimas ocorrências</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Horário</th>
          <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Requisição</th>
          <th style="padding:8px 12px;text-align:center;color:#555;font-weight:600;">Status</th>
          <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Tenant</th>
        </tr>
      </thead>
      <tbody>{rows_recent}</tbody>
    </table>

    {tenants_html}

    <!-- CTA -->
    <div style="margin:28px 0 0;text-align:center;">
      <a href="{_SENTRY_PROJECT_URL}"
         style="background:#c0392b;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">
        Ver no Sentry →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px;">
    <p style="font-size:11px;color:#aaa;margin:0;">
      Alerta automático GiraHub · próximo alerta em no mínimo {window_minutes} min ·
      Configuração: ERROR_RATE_THRESHOLD={threshold} / ERROR_RATE_WINDOW_MINUTES={window_minutes}
    </p>

  </div>
</div>
</body>
</html>"""
