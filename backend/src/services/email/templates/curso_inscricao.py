"""HTML Email Template for Course Registration Confirmation."""
from html import escape
from typing import Optional
from datetime import datetime, timezone
from urllib.parse import quote


def _esc(value: str) -> str:
    """Escape HTML entities in user-provided text."""
    return escape(str(value)) if value is not None else ""


def _maps_url(address: str) -> str:
    """Build a Google Maps directions URL from an address string."""
    return f"https://www.google.com/maps/dir/?api=1&destination={quote(address)}"


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def generate_curso_inscricao_html(
    participante_nome: str,
    participante_email: str,
    curso_titulo: str,
    tenant_name: str,
    primary_color: str,
    secondary_color: str,
    tenant_logo_url: Optional[str] = None,
    *,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    local: Optional[str] = None,
    valor_mensalidade: Optional[float] = None,
    celular: Optional[str] = None,
    data_nascimento: Optional[str] = None,
    genero: Optional[str] = None,
    cpf: Optional[str] = None,
    rg: Optional[str] = None,
    estado_civil: Optional[str] = None,
    profissao: Optional[str] = None,
    cep: Optional[str] = None,
    logradouro: Optional[str] = None,
    numero: Optional[str] = None,
    complemento: Optional[str] = None,
    bairro: Optional[str] = None,
    cidade: Optional[str] = None,
    estado: Optional[str] = None,
    emergencia_contato: Optional[str] = None,
    emergencia_fone: Optional[str] = None,
    experiencia_umbanda: Optional[str] = None,
    contato_contexto_espiritual: Optional[str] = None,
    motivo_busca_desenvolvimento: Optional[str] = None,
    interesse_aprendizado: Optional[str] = None,
    ja_conhece_terreiro: Optional[bool] = None,
    como_conheceu_terreiro: Optional[str] = None,
    tem_plano_saude: Optional[bool] = None,
    plano_saude_nome: Optional[str] = None,
    toma_medicamento: Optional[bool] = None,
    medicamentos_nome: Optional[str] = None,
    tem_doenca_tratamento: Optional[bool] = None,
    doenca_tratamento_nome: Optional[str] = None,
    tem_diabetes: Optional[bool] = None,
    tratamento_psiquiatrico: Optional[bool] = None,
    tratamento_psiquiatrico_detalhes: Optional[str] = None,
    restricoes_saude: Optional[str] = None,
) -> str:
    pc = primary_color or "#4f46e5"
    sc = secondary_color or "#818cf8"
    ts = _timestamp()
    
    p_name = _esc(participante_nome)
    p_email = _esc(participante_email)
    c_title = _esc(curso_titulo)
    t_name = _esc(tenant_name)
    
    logo_block = (
        f'<img src="{tenant_logo_url}" alt="{t_name}" '
        f'style="max-width:110px;height:auto;margin-bottom:16px;border-radius:50%;'
        f'border:3px solid rgba(255,255,255,0.35);box-shadow:0 4px 10px rgba(0,0,0,0.15);">'
        if tenant_logo_url else ""
    )

    # 1. Course Details rows
    course_rows = []
    
    # Format dates
    def fmt_date_str(d_str: Optional[str]) -> str:
        if not d_str:
            return ""
        try:
            # Check if it has time component
            if "T" in d_str:
                dt = datetime.fromisoformat(d_str.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(d_str, "%Y-%m-%d")
            return dt.strftime("%d/%m/%Y")
        except Exception:
            return d_str

    if data_inicio:
        course_rows.append(f'<tr><td style="padding:8px 0;font-weight:bold;color:#4B5563;width:120px;">Data de Início</td><td style="padding:8px 0;color:#1F2937;">{_esc(fmt_date_str(data_inicio))}</td></tr>')
    if data_fim:
        course_rows.append(f'<tr><td style="padding:8px 0;font-weight:bold;color:#4B5563;">Data de Término</td><td style="padding:8px 0;color:#1F2937;">{_esc(fmt_date_str(data_fim))}</td></tr>')
    
    if valor_mensalidade is not None:
        val_str = f"R$ {valor_mensalidade:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        course_rows.append(f'<tr><td style="padding:8px 0;font-weight:bold;color:#4B5563;">Mensalidade</td><td style="padding:8px 0;color:#111827;font-weight:bold;">{val_str}</td></tr>')
    
    if local:
        maps_link = _maps_url(local)
        course_rows.append(f"""
            <tr>
              <td style="padding:8px 0;font-weight:bold;color:#4B5563;vertical-align:top;">Local</td>
              <td style="padding:8px 0;color:#1F2937;">
                {_esc(local)}<br>
                <a href="{maps_link}" target="_blank" style="display:inline-block;margin-top:6px;color:{pc};text-decoration:none;font-weight:bold;font-size:13px;">
                  📍 Abrir no Google Maps &rarr;
                </a>
              </td>
            </tr>
        """)

    course_info_block = ""
    if course_rows:
        rows_html = "\n".join(course_rows)
        course_info_block = f"""
        <!-- Curso Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:12px;background-color:#FBFBFE;overflow:hidden;border-collapse:separate;">
          <tr>
            <td style="padding:20px 24px;background-color:#F3F4F6;border-bottom:1px solid #E5E7EB;">
              <h3 style="margin:0;font-size:16px;color:#111827;font-weight:700;letter-spacing:0.5px;">📖 DADOS DO CURSO</h3>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;">
                {rows_html}
              </table>
            </td>
          </tr>
        </table>
        """

    # 2. Participant details lists
    def make_row(label: str, val: Optional[str]) -> str:
        if val is None or str(val).strip() == "":
            return ""
        return f"""
        <tr>
          <td style="padding:6px 0;font-weight:bold;color:#6B7280;width:160px;vertical-align:top;">{label}</td>
          <td style="padding:6px 0;color:#1F2937;vertical-align:top;">{_esc(val)}</td>
        </tr>"""

    def make_bool_row(label: str, val: Optional[bool], details: Optional[str] = None) -> str:
        if val is None:
            return ""
        status_text = "Sim" if val else "Não"
        details_text = f" ({_esc(details)})" if val and details else ""
        return f"""
        <tr>
          <td style="padding:6px 0;font-weight:bold;color:#6B7280;width:160px;vertical-align:top;">{label}</td>
          <td style="padding:6px 0;color:#1F2937;vertical-align:top;">{status_text}{details_text}</td>
        </tr>"""

    # Demographics Section
    demo_html = []
    demo_html.append(make_row("Nome Completo", p_name))
    demo_html.append(make_row("E-mail", p_email))
    demo_html.append(make_row("CPF", cpf))
    demo_html.append(make_row("RG", rg))
    demo_html.append(make_row("WhatsApp/Celular", celular))
    demo_html.append(make_row("Data de Nascimento", fmt_date_str(data_nascimento)))
    demo_html.append(make_row("Sexo/Gênero", genero))
    demo_html.append(make_row("Estado Civil", estado_civil))
    demo_html.append(make_row("Profissão", profissao))
    demo_rows = "\n".join([r for r in demo_html if r])

    # Endereço
    end_html = []
    if cep:
        addr_str = f"{logradouro}, nº {numero}"
        if complemento:
            addr_str += f" - {complemento}"
        addr_str += f", {bairro} - {cidade}/{estado} (CEP: {cep})"
        end_html.append(make_row("Endereço Completo", addr_str))
    end_rows = "\n".join([r for r in end_html if r])

    # Ficha Espiritual
    esp_html = []
    esp_html.append(make_row("Experiência Umbanda", experiencia_umbanda))
    esp_html.append(make_row("Filho Contexto Espiritual", contato_contexto_espiritual))
    esp_html.append(make_row("Motivo Desenvolvimento", motivo_busca_desenvolvimento))
    esp_html.append(make_row("Interesse Aprendizado", interesse_aprendizado))
    esp_html.append(make_bool_row("Já conhece o Terreiro?", ja_conhece_terreiro))
    esp_html.append(make_row("Como conheceu o Terreiro", como_conheceu_terreiro))
    esp_rows = "\n".join([r for r in esp_html if r])

    # Ficha Médica
    med_html = []
    med_html.append(make_bool_row("Possui plano de saúde?", tem_plano_saude, plano_saude_nome))
    med_html.append(make_bool_row("Toma remédio controlado?", toma_medicamento, medicamentos_nome))
    med_html.append(make_bool_row("Faz tratamento de saúde?", tem_doenca_tratamento, doenca_tratamento_nome))
    med_html.append(make_bool_row("Diabetes?", tem_diabetes))
    med_html.append(make_bool_row("Acompanhamento Psiquiátrico?", tratamento_psiquiatrico, tratamento_psiquiatrico_detalhes))
    med_html.append(make_row("Restrições de saúde", restricoes_saude))
    med_rows = "\n".join([r for r in med_html if r])

    # Build sections
    sections = []
    if demo_rows:
        sections.append(f"""
        <!-- Identificação -->
        <h4 style="margin:20px 0 10px 0;font-size:14px;color:{pc};text-transform:uppercase;letter-spacing:1px;font-weight:700;">👤 DADOS PESSOAIS</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;margin-bottom:16px;">
          {demo_rows}
        </table>
        """)
        
    if end_rows:
        sections.append(f"""
        <!-- Endereço -->
        <h4 style="margin:20px 0 10px 0;font-size:14px;color:{pc};text-transform:uppercase;letter-spacing:1px;font-weight:700;">🏠 ENDEREÇO</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;margin-bottom:16px;">
          {end_rows}
        </table>
        """)

    if emergencia_contato:
        sections.append(f"""
        <!-- Emergência -->
        <h4 style="margin:20px 0 10px 0;font-size:14px;color:{pc};text-transform:uppercase;letter-spacing:1px;font-weight:700;">🚨 CONTATO DE EMERGÊNCIA</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;margin-bottom:16px;">
          {make_row("Nome do Contato", emergencia_contato)}
          {make_row("WhatsApp/Telefone", emergencia_fone)}
        </table>
        """)

    if esp_rows:
        sections.append(f"""
        <!-- Ficha Espiritual -->
        <h4 style="margin:20px 0 10px 0;font-size:14px;color:{pc};text-transform:uppercase;letter-spacing:1px;font-weight:700;">🔮 RESPOSTAS COMPLEMENTARES</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;margin-bottom:16px;">
          {esp_rows}
        </table>
        """)

    if med_rows:
        sections.append(f"""
        <!-- Ficha Médica -->
        <h4 style="margin:20px 0 10px 0;font-size:14px;color:{pc};text-transform:uppercase;letter-spacing:1px;font-weight:700;">🏥 FICHA MÉDICA E RESTRIÇÕES</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;margin-bottom:16px;">
          {med_rows}
        </table>
        """)

    sections_html = "\n<hr style=\"border:0;border-top:1px solid #E5E7EB;margin:16px 0;\">\n".join(sections)

    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmação de Inscrição — {c_title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" max-width="600" style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);border-collapse:separate;">
        
        <!-- Header Gradiente -->
        <tr>
          <td style="background:linear-gradient(135deg,{pc} 0%,{sc} 100%);padding:48px 32px;text-align:center;">
            {logo_block}
            <p style="margin:0 0 8px 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">{t_name}</p>
            <h1 style="margin:0;color:#FFFFFF;font-size:26px;font-weight:800;letter-spacing:0.5px;line-height:1.3;">INSCRIÇÃO CONFIRMADA!</h1>
            <p style="margin:8px 0 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Seu cadastro foi recebido com sucesso</p>
          </td>
        </tr>

        <!-- Conteúdo Principal -->
        <tr>
          <td style="padding:40px 32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#1F2937;line-height:1.6;">
              Olá <strong>{p_name}</strong>,
            </p>
            <p style="margin:0 0 24px 0;font-size:15px;color:#4B5563;line-height:1.6;">
              Sua ficha de inscrição para o curso presencial <strong>{c_title}</strong> foi registrada. Confira abaixo os dados enviados. Qualquer alteração ou dúvida, entre em contato diretamente com a administração do terreiro.
            </p>

            {course_info_block}

            <!-- Formulário Card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;border-collapse:separate;">
              <tr>
                <td style="padding:20px 24px;background-color:#F3F4F6;border-bottom:1px solid #E5E7EB;">
                  <h3 style="margin:0;font-size:16px;color:#111827;font-weight:700;letter-spacing:0.5px;">📝 DADOS DO FORMULÁRIO</h3>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;">
                  {sections_html}
                </td>
              </tr>
            </table>

            <!-- Rodapé Informativo / LGPD -->
            <p style="margin:32px 0 0 0;font-size:11px;color:#9CA3AF;line-height:1.6;text-align:center;">
              Este e-mail é uma confirmação automática enviada para <strong>{p_email}</strong> em conformidade com a Lei Geral de Proteção de Dados (LGPD). Seus dados são confidenciais e utilizados estritamente para fins de organização do curso do terreiro.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#F9FAFB;padding:24px;text-align:center;border-top:1px solid #F3F4F6;font-size:12px;color:#9CA3AF;">
            <p style="margin:0 0 4px 0;font-weight:bold;color:#4B5563;">{t_name}</p>
            <p style="margin:0;">GiraHub &copy; {datetime.now().year} &middot; Enviado em {ts}</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""
