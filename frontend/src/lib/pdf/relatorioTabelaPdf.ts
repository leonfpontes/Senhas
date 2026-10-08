/**
 * Tabela de senhas do Relatório da gira (páginas 2+ do PDF), desenhada como texto pelo
 * jspdf-autotable. A página 1 (resumo e gráficos) continua sendo imagem — ver
 * hooks/useRelatorioPDF.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import type { autoTable as AutoTable } from 'jspdf-autotable';
import type { PdfTicket } from '@/components/pdf/RelatorioPDFLayout';
import { numeroDaSenha } from '@/components/admin/senhaFormat';
import { baseTableOptions, drawFooters, drawHeader, formatDateBr, type PdfBrand, type Rgb } from './pdfDoc';

/** Rótulo e cor da coluna Tag (mesma regra da página de resumo). */
export function tagDoTicket(t: PdfTicket): { label: string; color: Rgb } {
  if (t.is_sponsor) return { label: 'Associado', color: [184, 134, 11] };
  if (t.preferencial) return { label: 'Preferencial', color: [230, 81, 0] };
  if (t.is_walk_in) return { label: 'Walk-in', color: [21, 101, 192] };
  return { label: 'Comum', color: [84, 110, 122] };
}

/**
 * Desenha a tabela a partir da página corrente e o rodapé "Página X de Y" das páginas
 * da tabela (a página 1 do relatório tem o rodapé dela, na imagem, mas entra na contagem).
 */
export function desenharTabelaRelatorio(
  pdf: JsPDF,
  autoTable: typeof AutoTable,
  opts: { tickets: PdfTicket[]; gira: { nome: string; data?: string }; brand: PdfBrand; logo: string | null },
) {
  const { tickets, gira, brand, logo } = opts;
  const firstTablePage = pdf.getNumberOfPages();
  const title = `${gira.nome}${gira.data ? ` — ${formatDateBr(gira.data)}` : ''}`;
  const tags = tickets.map(tagDoTicket);

  autoTable(pdf, {
    ...baseTableOptions(),
    head: [['Senha', 'Nome', 'Tag', 'Médium', 'Cambone', 'Observações']],
    body: tickets.length
      ? tickets.map((t, i) => [
          numeroDaSenha(t),
          t.consulente_nome || '—',
          tags[i].label,
          t.medium_nome || '—',
          t.cambone_nome || '—',
          t.atendimento_descricao || '—',
        ])
      : [[{ content: 'Nenhuma senha com os filtros aplicados.', colSpan: 6, styles: { halign: 'center', textColor: [120, 120, 120] } }]],
    columnStyles: {
      0: { cellWidth: 15, fontStyle: 'bold' },
      1: { cellWidth: 46 },
      2: { cellWidth: 22, fontSize: 8, fontStyle: 'bold' },
      3: { cellWidth: 30 },
      4: { cellWidth: 30 },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.column.index === 2 && tags[cell.row.index]) {
        cell.cell.styles.textColor = tags[cell.row.index].color;
      }
    },
    didDrawPage: () => drawHeader(pdf, { brand, logo, title, subtitle: 'Relatório de Gira · senhas' }),
  });

  drawFooters(pdf, gira.nome, firstTablePage);
}
