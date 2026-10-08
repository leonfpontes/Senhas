/**
 * PDF legível de "Baixar meus dados" da Área do Médium (AM-14).
 *
 * A4 retrato na base dos PDFs (`pdfDoc`: logo e cor do terreiro, cabeçalho repetido, "Página X de
 * Y"), gerado no navegador a partir do MESMO JSON de `GET /api/v1/medium/meus-dados/exportar`
 * (nada sai do aparelho além do que a API já devolveu). Seções: cadastro, conta e consentimento,
 * grupos e avisos por e-mail, mensalidades, avisos lidos e participações.
 */
import {
  ROTULO_PRESENCA,
  ROTULO_RESPOSTA,
  ROTULO_SITUACAO_MENSALIDADE,
  nomeDoArquivo,
  type MeusDadosExport,
} from '@/components/medium/meusDados/meusDados';
import { maskTelefone } from '@/components/fields';
import {
  PDF_HEADER_H,
  PDF_MARGIN_X,
  baseTableOptions,
  drawFooters,
  drawHeader,
  formatDateBr,
  formatDateTimeBr,
  hexToRgb,
  loadPdfLibs,
  loadRoundLogo,
  type PdfBrand,
} from './pdfDoc';

export const TITULO_MEUS_DADOS = 'Meus dados na Área do Médium';

const NAO_INFORMADO = '—';

function data(iso: string | null | undefined): string {
  return iso ? formatDateBr(iso.length === 10 ? `${iso}T12:00:00` : iso) : NAO_INFORMADO;
}

function dataHora(iso: string | null | undefined): string {
  return iso ? formatDateTimeBr(iso) : NAO_INFORMADO;
}

function valor(v: number | null | undefined): string {
  return v == null ? NAO_INFORMADO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mesBr(mes: string): string {
  const [a, m] = mes.split('-');
  return a && m ? `${m}/${a}` : mes;
}

/** Linhas "rótulo · valor" de cada seção (puro: o teste confere o conteúdo sem desenhar). */
export function secoesDoPdf(d: MeusDadosExport): { titulo: string; linhas: [string, string][] }[] {
  const c = d.cadastro;
  const e = c.endereco;
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
  const endereco = [rua, e.bairro, e.cidade, e.cep].filter(Boolean).join(' · ') || NAO_INFORMADO;
  return [
    {
      titulo: 'Cadastro na casa',
      linhas: [
        ['Nome', c.nome],
        ['Na corrente', c.na_corrente === 'atendimento' ? 'Médium de atendimento' : 'Cambone'],
        ['Entrada na casa', data(c.data_entrada)],
        ['Telefone', c.telefone ? maskTelefone(c.telefone) : NAO_INFORMADO],
        ['E-mail do cadastro', c.email_do_cadastro || NAO_INFORMADO],
        ['Data de nascimento', data(c.data_nascimento)],
        ['Endereço', endereco],
        ['Mensalidade', c.isento_de_mensalidade ? 'Isento' : 'Paga mensalidade'],
        ['Mostrar aniversário para a corrente', c.mostrar_aniversario_para_a_corrente ? 'Sim' : 'Não'],
      ],
    },
    {
      titulo: 'Conta de acesso e autorização',
      linhas: [
        ['E-mail de acesso', d.conta.email_de_acesso],
        ['Também acessa o painel da casa', d.conta.tambem_acessa_o_painel ? 'Sim' : 'Não'],
        ['Conta criada em', dataHora(d.conta.criada_em)],
        ['Autorização aceita em', dataHora(d.consentimento.aceito_em)],
        ['Versão do termo aceito', d.consentimento.versao_aceita || NAO_INFORMADO],
        ...(d.consentimento.revogado_em
          ? ([
              ['Autorização retirada em', dataHora(d.consentimento.revogado_em)],
              ['Versão retirada', d.consentimento.versao_revogada || NAO_INFORMADO],
            ] as [string, string][])
          : []),
        ['Grupos da corrente', d.grupos.map((g) => g.nome).join(', ') || 'Nenhum'],
        [
          'Avisos por e-mail ligados',
          Object.entries(d.avisos_por_email)
            .filter(([, ligado]) => ligado)
            .map(([tipo]) => tipo)
            .join(', ') || 'Nenhum',
        ],
      ],
    },
  ];
}

export async function gerarMeusDadosPdf(d: MeusDadosExport, brand: PdfBrand): Promise<void> {
  const [{ jsPDF, autoTable }, logo] = await Promise.all([loadPdfLibs(), loadRoundLogo(brand.logoUrl)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const subtitle = `${d.cadastro.nome} · gerado em ${dataHora(d.gerado_em)}`;
  const primary = hexToRgb(brand.primaryColor);
  const header = () => drawHeader(pdf, { brand, logo, title: TITULO_MEUS_DADOS, subtitle });
  const lastY = () => (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? PDF_HEADER_H;

  // Texto de abertura.
  header();
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(85, 85, 85);
  const largura = pdf.internal.pageSize.getWidth() - PDF_MARGIN_X * 2;
  const sobre = pdf.splitTextToSize(d.sobre, largura) as string[];
  pdf.text(sobre, PDF_MARGIN_X, PDF_HEADER_H + 4);
  let y = PDF_HEADER_H + 4 + sobre.length * 4 + 2;

  const titulo = (texto: string, colSpan: number) => ({
    content: texto,
    colSpan,
    styles: { fontStyle: 'bold' as const, textColor: primary, fillColor: [255, 255, 255] as [number, number, number], fontSize: 10.5 },
  });

  for (const s of secoesDoPdf(d)) {
    autoTable(pdf, {
      ...baseTableOptions(9),
      startY: y,
      head: [[titulo(s.titulo, 2)]],
      body: s.linhas.map(([k, v]) => [k, v]),
      columnStyles: { 0: { cellWidth: 62, textColor: [100, 100, 100] } },
      didDrawPage: header,
    });
    y = lastY() + 6;
  }

  autoTable(pdf, {
    ...baseTableOptions(8.5),
    startY: y,
    head: [[titulo('Mensalidades', 6)], ['Mês', 'Situação', 'Valor', 'Pago em', 'Comprovante', 'Não confirmado']],
    body: d.mensalidades.length
      ? d.mensalidades.map((m) => [
          mesBr(m.mes),
          ROTULO_SITUACAO_MENSALIDADE[m.situacao] ?? m.situacao,
          valor(m.valor_pago ?? m.valor),
          dataHora(m.pago_em),
          m.comprovante ? m.comprovante.arquivo : NAO_INFORMADO,
          m.motivo_nao_confirmado || NAO_INFORMADO,
        ])
      : [[{ content: 'Nenhuma mensalidade registrada.', colSpan: 6 }]],
    didDrawPage: header,
  });
  y = lastY() + 6;

  autoTable(pdf, {
    ...baseTableOptions(8.5),
    startY: y,
    head: [[titulo('Avisos lidos', 2)], ['Aviso', 'Lido em']],
    body: d.avisos_lidos.length
      ? d.avisos_lidos.map((a) => [a.aviso, dataHora(a.lido_em)])
      : [[{ content: 'Nenhum aviso lido.', colSpan: 2 }]],
    columnStyles: { 1: { cellWidth: 36 } },
    didDrawPage: header,
  });
  y = lastY() + 6;

  autoTable(pdf, {
    ...baseTableOptions(8),
    startY: y,
    head: [[titulo('Giras e atividades', 6)], ['Quando', 'Atividade', 'Função', 'Resposta', 'Motivo que você contou', 'Presença']],
    body: d.participacoes.length
      ? d.participacoes.map((p) => [
          dataHora(p.quando),
          `${p.atividade}${p.cancelada ? ' (cancelada)' : ''}`,
          p.funcao || NAO_INFORMADO,
          ROTULO_RESPOSTA[p.resposta] ?? p.resposta,
          p.motivo_contado || NAO_INFORMADO,
          ROTULO_PRESENCA[p.presenca] ?? p.presenca,
        ])
      : [[{ content: 'Nenhuma participação registrada.', colSpan: 6 }]],
    didDrawPage: header,
  });

  drawFooters(pdf, `${brand.nome} · ${TITULO_MEUS_DADOS} · girahub.com.br`);
  pdf.save(nomeDoArquivo(d, 'pdf'));
}
