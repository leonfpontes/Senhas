/**
 * PDF "Relatório de Fluxo de Caixa" — páginas dos lançamentos de cada mês (pedido do contador).
 *
 * A página de resumo continua sendo foto do HTML (`RelatorioFluxoCaixaPDF`, html2canvas). Os
 * lançamentos vêm depois, como texto de verdade (jspdf-autotable, base `pdfDoc`): a lista pode ser
 * longa e a foto cortaria linhas no meio da quebra de página. Por mês: os recebidos e os pagos, pela
 * data de pagamento, com total de cada lado — os totais fecham com o Recebido/Pago do resumo.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import type { CellInput, RowInput, UserOptions } from 'jspdf-autotable';
import { PDF_HEADER_H, PDF_MARGIN_X, baseTableOptions, drawHeader, formatDateBr, hexToRgb, type PdfBrand } from './pdfDoc';

export interface FluxoLancamento {
  id: string;
  tipo: 'receber' | 'pagar';
  data_pagamento: string; // YYYY-MM-DD
  descricao: string;
  categoria_nome: string | null;
  conta_bancaria_nome: string | null;
  valor: number;
}

export interface FluxoMesLancamentos {
  ano: number;
  mes: number;
  mes_label: string;
  receitas: number;
  despesas: number;
  lancamentos?: FluxoLancamento[];
}

export const TITULO_LANCAMENTOS = 'Relatório de Fluxo de Caixa — lançamentos do mês';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const VERDE: [number, number, number] = [27, 122, 78];
const VERMELHO: [number, number, number] = [192, 57, 43];

type AutoTable = (doc: JsPDF, options: UserOptions) => void;
type LastTable = { lastAutoTable?: { finalY: number } };
const finalY = (pdf: JsPDF, fallback: number) => (pdf as unknown as LastTable).lastAutoTable?.finalY ?? fallback;

/** Corpo da tabela de um mês: bloco dos recebidos e bloco dos pagos, cada um com o total. */
export function linhasDoMes(mes: FluxoMesLancamentos, comConta: boolean): RowInput[] {
  const cols = comConta ? 5 : 4;
  const lancs = mes.lancamentos ?? [];
  const linhas: RowInput[] = [];
  const lados: { tipo: FluxoLancamento['tipo']; titulo: string; vazio: string; total: string; cor: [number, number, number] }[] = [
    { tipo: 'receber', titulo: 'Recebidos', vazio: 'Nenhum recebimento no mês.', total: 'Total recebido', cor: VERDE },
    { tipo: 'pagar', titulo: 'Pagos', vazio: 'Nenhum pagamento no mês.', total: 'Total pago', cor: VERMELHO },
  ];
  for (const lado of lados) {
    const itens = lancs.filter((l) => l.tipo === lado.tipo);
    linhas.push([
      {
        content: `${lado.titulo} (${itens.length})`,
        colSpan: cols,
        styles: { fontStyle: 'bold', textColor: lado.cor, fillColor: [245, 245, 245] },
      },
    ]);
    if (itens.length === 0) {
      linhas.push([{ content: lado.vazio, colSpan: cols, styles: { textColor: [120, 120, 120], fontStyle: 'italic' } }]);
      continue;
    }
    for (const l of itens) {
      const row: CellInput[] = [formatDateBr(`${l.data_pagamento}T12:00:00`), l.descricao, l.categoria_nome ?? '—'];
      if (comConta) row.push(l.conta_bancaria_nome ?? '—');
      row.push({ content: brl(l.valor), styles: { halign: 'right', textColor: lado.cor } });
      linhas.push(row);
    }
    const total = itens.reduce((s, l) => s + l.valor, 0);
    linhas.push([
      { content: lado.total, colSpan: cols - 1, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: brl(total), styles: { fontStyle: 'bold', halign: 'right', textColor: lado.cor } },
    ]);
  }
  return linhas;
}

/**
 * Acrescenta ao `pdf` (que já tem o resumo) as páginas com os lançamentos de cada mês.
 * `comConta`: mostra a coluna Conta (relatório de todas as contas). Não salva nem numera páginas.
 */
export function anexarLancamentosFluxo(
  pdf: JsPDF,
  autoTable: AutoTable,
  meses: FluxoMesLancamentos[],
  opts: { brand: PdfBrand; logo: string | null; subtitle: string; comConta: boolean },
): void {
  const { brand, logo, subtitle, comConta } = opts;
  const primary = hexToRgb(brand.primaryColor);
  const header = () => drawHeader(pdf, { brand, logo, title: TITULO_LANCAMENTOS, subtitle });
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.addPage('a4', 'portrait');
  header();
  let y = PDF_HEADER_H + 4;

  for (const mes of meses) {
    // título do mês não fica sozinho no pé da página
    if (y > pageH - 45) {
      pdf.addPage('a4', 'portrait');
      header();
      y = PDF_HEADER_H + 4;
    }
    const saldo = mes.receitas - mes.despesas;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...primary);
    pdf.text(mes.mes_label, PDF_MARGIN_X, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(85, 85, 85);
    pdf.text(
      `Recebido ${brl(mes.receitas)} · Pago ${brl(mes.despesas)} · Saldo do mês ${saldo >= 0 ? '+' : ''}${brl(saldo)}`,
      pdf.internal.pageSize.getWidth() - PDF_MARGIN_X,
      y,
      { align: 'right' },
    );

    const head = comConta ? ['Data', 'Descrição', 'Categoria', 'Conta', 'Valor'] : ['Data', 'Descrição', 'Categoria', 'Valor'];
    autoTable(pdf, {
      ...baseTableOptions(8.5),
      startY: y + 2,
      head: [head],
      body: linhasDoMes(mes, comConta),
      alternateRowStyles: {},
      columnStyles: comConta
        ? { 0: { cellWidth: 20 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 34 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 } }
        : { 0: { cellWidth: 20 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 42 }, 3: { cellWidth: 30 } },
      didParseCell: (cell) => {
        if (cell.section === 'head' && cell.column.index === head.length - 1) cell.cell.styles.halign = 'right';
      },
      didDrawPage: header,
    });
    y = finalY(pdf, y) + 10;
  }
}
