/**
 * PDF do Relatório de assiduidade (AM-26, aba "Relatórios" de Atividades e escalas).
 *
 * A4 retrato na base dos PDFs de listagem (`pdfDoc`: logo e cor do terreiro, cabeçalho repetido,
 * "Página X de Y"): período, filtros e a tabela por médium ou por grupo, com a linha de total.
 * Recebe SÓ contagens (`dadosDoPdf` em `constants/assiduidade.ts`) — a justificativa (pode ter
 * dado de saúde, §6.8 do plano) nunca entra; aqui só "com/sem justificativa".
 */
import type { AssiduidadePdfData } from '@/constants/assiduidade';
import { formatPercentual } from '@/constants/assiduidade';
import {
  baseTableOptions,
  drawFooters,
  drawHeader,
  formatDateBr,
  hexToRgb,
  loadPdfLibs,
  loadRoundLogo,
  slugify,
  type PdfBrand,
} from './pdfDoc';

export const TITULO_PDF = 'Relatório de assiduidade';

/** "01/10/2026 a 31/10/2026 · Tipo: Faxina · Por médium" */
export function subtituloPdf(data: AssiduidadePdfData): string {
  const periodo = `${formatDateBr(`${data.inicio}T12:00:00`)} a ${formatDateBr(`${data.fim}T12:00:00`)}`;
  const visao = data.agrupar === 'grupo' ? 'Por grupo' : 'Por médium';
  return [periodo, ...data.filtros, visao].join(' · ');
}

export async function gerarAssiduidadePdf(data: AssiduidadePdfData, brand: PdfBrand): Promise<void> {
  const [{ jsPDF, autoTable }, logo] = await Promise.all([loadPdfLibs(), loadRoundLogo(brand.logoUrl)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const subtitle = subtituloPdf(data);
  const primeira = data.agrupar === 'grupo' ? 'Grupo' : 'Médium';
  const t = data.totais;
  const resumo =
    `Presença geral: ${formatPercentual(t.percentual)} · ${data.atividadesComChamada} com chamada encerrada` +
    ` · ${data.atividadesSemChamada} sem chamada (fora do percentual)`;

  autoTable(pdf, {
    ...baseTableOptions(8.5),
    head: [[primeira, 'Convocações', 'Presenças', 'Faltas com justificativa', 'Faltas sem justificativa', 'Sem chamada', 'Presença']],
    body: data.linhas.length
      ? data.linhas.map((l) => [
          l.nome,
          String(l.convocacoes),
          String(l.presencas),
          String(l.ausencias_justificadas),
          String(l.ausencias_sem_justificativa),
          String(l.sem_chamada),
          formatPercentual(l.percentual),
        ])
      : [[{ content: 'Nenhuma escala no período com os filtros aplicados.', colSpan: 7, styles: { halign: 'center', textColor: [120, 120, 120] } }]],
    foot: [[
      'Total',
      String(t.convocacoes),
      String(t.presencas),
      String(t.ausencias_justificadas),
      String(t.ausencias_sem_justificativa),
      String(t.sem_chamada),
      formatPercentual(t.percentual),
    ]],
    showFoot: 'lastPage',
    footStyles: { fillColor: [245, 245, 245], textColor: [33, 33, 33], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'head' && cell.column.index > 0) cell.cell.styles.halign = 'right';
      if (cell.section === 'foot' && cell.column.index > 0) cell.cell.styles.halign = 'right';
      if (cell.section === 'body' && cell.column.index === 6 && cell.cell.raw !== '—') {
        cell.cell.styles.textColor = hexToRgb(brand.primaryColor);
      }
    },
    didDrawPage: () => drawHeader(pdf, { brand, logo, title: TITULO_PDF, subtitle }),
  });

  // Resumo e nota da regra abaixo da tabela.
  const finalY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(85, 85, 85);
  pdf.text(resumo, 12, finalY + 7);
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    'Presença = presenças ÷ convocações de atividades com a chamada encerrada, sem quem saiu da escala e sem atividades canceladas.',
    12,
    finalY + 12,
    { maxWidth: pdf.internal.pageSize.getWidth() - 24 },
  );

  drawFooters(pdf, `${brand.nome} · ${TITULO_PDF} · gerado em ${new Date().toLocaleString('pt-BR')} · girahub.com.br`);
  pdf.save(`assiduidade-${slugify(brand.nome || 'terreiro')}-${data.inicio}-a-${data.fim}.pdf`);
}
