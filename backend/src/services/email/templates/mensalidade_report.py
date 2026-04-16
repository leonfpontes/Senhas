"""
Mensalidade report email template.
Sent on-demand to tenant ADMINs with the monthly inadimplência summary.
All user-supplied content is HTML-escaped to prevent injection.
"""

from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List


def _esc(v: Any) -> str:
    if v is None:
        return ""
    return escape(str(v))


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def _fmt_brl(value: float) -> str:
    """Format a float as Brazilian currency string."""
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_mensalidade_report(
    inadimplentes: List[Dict[str, Any]],
    config_resumo: Dict[str, Any],
    tenant_name: str,
    primary_color: str = "#7C3AED",
    mes_referencia: str = "",
) -> str:
    """Return the HTML body for a mensalidade report email.

    Args:
        inadimplentes: List of row dicts with at minimum 'mediun_nome'.
        config_resumo: Dict with 'valor_mensal' (float).
        tenant_name: Display name of the terreiro.
        primary_color: Hex color for header accents.
        mes_referencia: String year-month like '2026-04' for display.
    """
    t_name = _esc(tenant_name)
    ts = _timestamp()
    mes_display = _esc(mes_referencia)
    valor_mensal: float = float(config_resumo.get("valor_mensal", 0.0))

    count = len(inadimplentes)
    total_em_aberto = valor_mensal * count
    plural = "inadimplente" if count == 1 else "inadimplentes"

    # Build table rows
    rows_html = ""
    if inadimplentes:
        for item in inadimplentes:
            nome = _esc(item.get("mediun_nome") or item.get("nome", ""))
            rows_html += f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">{nome}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;text-align:right;">{_fmt_brl(valor_mensal)}</td>
        </tr>"""
    else:
        rows_html = """
        <tr>
          <td colspan="2" style="padding:24px;text-align:center;color:#4caf50;font-size:15px;font-weight:600;">
            ✓ Todos os médiuns estão em dia neste mês!
          </td>
        </tr>"""

    table_section = f"""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;font-weight:600;">Médium</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;font-weight:600;">Valor em Aberto</th>
      </tr>
    </thead>
    <tbody>{rows_html}
    </tbody>
  </table>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório de Mensalidades — {t_name}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:{_esc(primary_color)};padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">{t_name}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.85);">
                Relatório de Mensalidades — {mes_display}
              </p>
            </td>
          </tr>

          <!-- KPI Cards -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#f5f5f5;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Valor Mensal</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#333;">{_esc(_fmt_brl(valor_mensal))}</p>
                    </div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#ffebee;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Inadimplentes</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#d32f2f;">{count} {_esc(plural)}</p>
                    </div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#ffebee;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Total em Aberto</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#d32f2f;">{_esc(_fmt_brl(total_em_aberto))}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Table section -->
          <tr>
            <td style="padding:16px 32px 8px;">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#333;">Médiuns Pendentes</p>
              {table_section}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                Gerado em: {ts} · Senhas — Enviado automaticamente
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return html


def render_mensalidade_report_associados(
    inadimplentes: List[Dict[str, Any]],
    config_resumo: Dict[str, Any],
    tenant_name: str,
    primary_color: str = "#7C3AED",
    mes_referencia: str = "",
) -> str:
    """Return the HTML body for an associados mensalidade report email.

    Args:
        inadimplentes: List of row dicts with at minimum 'associado_nome'.
        config_resumo: Dict with 'valor_mensal_associado' (float).
        tenant_name: Display name of the terreiro.
        primary_color: Hex color for header accents.
        mes_referencia: String year-month like '2026-04' for display.
    """
    t_name = _esc(tenant_name)
    ts = _timestamp()
    mes_display = _esc(mes_referencia)
    valor_mensal: float = float(config_resumo.get("valor_mensal_associado", 0.0))

    count = len(inadimplentes)
    total_em_aberto = valor_mensal * count
    plural = "inadimplente" if count == 1 else "inadimplentes"

    rows_html = ""
    if inadimplentes:
        for item in inadimplentes:
            nome = _esc(item.get("associado_nome") or item.get("nome", ""))
            rows_html += f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">{nome}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;text-align:right;">{_fmt_brl(valor_mensal)}</td>
        </tr>"""
    else:
        rows_html = """
        <tr>
          <td colspan="2" style="padding:24px;text-align:center;color:#4caf50;font-size:15px;font-weight:600;">
            ✓ Todos os associados estão em dia neste mês!
          </td>
        </tr>"""

    table_section = f"""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;font-weight:600;">Associado</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;font-weight:600;">Valor em Aberto</th>
      </tr>
    </thead>
    <tbody>{rows_html}
    </tbody>
  </table>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório de Mensalidades (Associados) — {t_name}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:{_esc(primary_color)};padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">{t_name}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.85);">
                Relatório de Mensalidades (Associados) — {mes_display}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#f5f5f5;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Valor Mensal</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#333;">{_esc(_fmt_brl(valor_mensal))}</p>
                    </div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#ffebee;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Inadimplentes</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#d32f2f;">{count} {_esc(plural)}</p>
                    </div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 8px;">
                    <div style="background:#ffebee;border-radius:8px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Total em Aberto</p>
                      <p style="margin:0;font-size:20px;font-weight:700;color:#d32f2f;">{_esc(_fmt_brl(total_em_aberto))}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#333;">Associados Pendentes</p>
              {table_section}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                Gerado em: {ts} · Senhas — Enviado automaticamente
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return html


def render_mensalidade_report_duplo(
    inadimplentes_mediuns: List[Dict[str, Any]],
    inadimplentes_associados: List[Dict[str, Any]],
    config_resumo: Dict[str, Any],
    tenant_name: str,
    primary_color: str = "#7C3AED",
    mes_referencia: str = "",
) -> str:
    """Return a combined HTML report covering both médiuns and associados.

    Args:
        inadimplentes_mediuns: Pending mediuns rows (with 'mediun_nome').
        inadimplentes_associados: Pending associados rows (with 'associado_nome').
        config_resumo: Dict with 'valor_mensal' and 'valor_mensal_associado'.
        tenant_name: Display name of the terreiro.
        primary_color: Hex color for header accents.
        mes_referencia: String year-month like '2026-04' for display.
    """
    t_name = _esc(tenant_name)
    ts = _timestamp()
    mes_display = _esc(mes_referencia)
    valor_mediuns: float = float(config_resumo.get("valor_mensal", 0.0))
    valor_assoc: float = float(config_resumo.get("valor_mensal_associado", 0.0))

    def _build_table(rows: List[Dict[str, Any]], nome_key: str, valor: float, label_plural: str) -> str:
        count = len(rows)
        total = valor * count
        plural = "inadimplente" if count == 1 else "inadimplentes"

        rows_html = ""
        if rows:
            for item in rows:
                nome = _esc(item.get(nome_key) or item.get("nome", ""))
                rows_html += f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">{nome}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;text-align:right;">{_fmt_brl(valor)}</td>
        </tr>"""
        else:
            rows_html = f"""
        <tr>
          <td colspan="2" style="padding:24px;text-align:center;color:#4caf50;font-size:15px;font-weight:600;">
            ✓ Todos os {label_plural} estão em dia neste mês!
          </td>
        </tr>"""

        return f"""
  <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">
    {_esc(label_plural.capitalize())} — {count} {_esc(plural)} · Total: {_esc(_fmt_brl(total))}
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:8px;overflow:hidden;margin-bottom:20px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;font-weight:600;">{_esc(label_plural.rstrip('s').capitalize())}</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;font-weight:600;">Valor em Aberto</th>
      </tr>
    </thead>
    <tbody>{rows_html}
    </tbody>
  </table>"""

    table_mediuns = _build_table(inadimplentes_mediuns, "mediun_nome", valor_mediuns, "médiuns")
    table_assoc = _build_table(inadimplentes_associados, "associado_nome", valor_assoc, "associados")

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório de Mensalidades — {t_name}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:{_esc(primary_color)};padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">{t_name}</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.85);">
                Relatório de Mensalidades — {mes_display}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              {table_mediuns}
              {table_assoc}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                Gerado em: {ts} · Senhas — Enviado automaticamente
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return html
