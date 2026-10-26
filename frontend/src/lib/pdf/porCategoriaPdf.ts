/**
 * PDF "Relatório por categoria" (Financeiro → Por categoria).
 *
 * Base dos PDFs de listagem (`pdfDoc`: logo e cor do terreiro, cabeçalho repetido, "Página X
 * de Y"). Página em retrato com o resumo do período e uma tabela de Entradas e outra de Saídas
 * (categoria, lançamentos pagos, realizado, % do total, em aberto, linha de total). Período com
 * mais de um mês ganha, em paisagem, o realizado de cada categoria mês a mês.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import {
  ROTULO_LADO,
  corDaCategoria,
  totaisDoLado,
  type LadoCategoria,
  type PorCategoriaResponse,
} from '@/lib/financeiroPorCategoria';
import {
  PDF_HEADER_H,
  PDF_MARGIN_X,
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

export const TITULO_PDF = 'Relatório por categoria';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function subtituloPdf(dados: PorCategoriaResponse): string {
  const periodo = `${formatDateBr(`${dados.data_inicio}T12:00:00`)} a ${formatDateBr(`${dados.data_fim}T12:00:00`)}`;
  return `${periodo} · Realizado pela data de pagamento; em aberto pelo vencimento`;
}

type LastTable = { lastAutoTable?: { finalY: number } };
const finalY = (pdf: JsPDF, fallback: number) => (pdf as unknown as LastTable).lastAutoTable?.finalY ?? fallback;

function tituloSecao(pdf: JsPDF, texto: string, y: number, cor: [number, number, number]) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...cor);
  pdf.text(texto, PDF_MARGIN_X, y);
}

export async function gerarPorCategoriaPdf(dados: PorCategoriaResponse, brand: PdfBrand): Promise<void> {
  const [{ jsPDF, autoTable }, logo] = await Promise.all([loadPdfLibs(), loadRoundLogo(brand.logoUrl)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const subtitle = subtituloPdf(dados);
  const primary = hexToRgb(brand.primaryColor);
  const header = () => drawHeader(pdf, { brand, logo, title: TITULO_PDF, subtitle });
  header();

  // Resumo do período.
  const saldo = dados.total_receitas - dados.total_despesas;
  const resumo: [string, string][] = [
    ['Recebido', brl(dados.total_receitas)],
    ['Pago', brl(dados.total_despesas)],
    ['Saldo do período', brl(saldo)],
    ['A receber', brl(dados.total_a_receber)],
    ['A pagar', brl(dados.total_a_pagar)],
  ];
  const pageW = pdf.internal.pageSize.getWidth();
  const boxW = (pageW - PDF_MARGIN_X * 2 - 4 * 3) / 5;
  let y = PDF_HEADER_H + 2;
  resumo.forEach(([rotulo, valor], i) => {
    const x = PDF_MARGIN_X + i * (boxW + 3);
    pdf.setFillColor(247, 247, 247);
    pdf.roundedRect(x, y, boxW, 14, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(rotulo.toUpperCase(), x + 2.5, y + 5);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    const corValor: [number, number, number] =
      rotulo === 'Saldo do período' ? (saldo >= 0 ? [27, 122, 78] : [192, 57, 43]) : [33, 33, 33];
    pdf.setTextColor(...corValor);
    pdf.text(valor, x + 2.5, y + 11);
  });
  y += 22;

  const lados: LadoCategoria[] = ['receitas', 'despesas'];
  for (const lado of lados) {
    const rot = ROTULO_LADO[lado];
    const itens = dados[lado];
    const t = totaisDoLado(dados, lado);
    if (y > pdf.internal.pageSize.getHeight() - 50) {
      pdf.addPage();
      header();
      y = PDF_HEADER_H + 4;
    }
    tituloSecao(pdf, rot.titulo, y, primary);
    autoTable(pdf, {
      ...baseTableOptions(9),
      startY: y + 2,
      head: [['Categoria', 'Lançamentos pagos', rot.realizado, '% do total', rot.emAberto]],
      body: itens.length
        ? itens.map((c) => [c.nome, String(c.qtd_realizado), brl(c.realizado), pct(c.percentual), c.em_aberto ? brl(c.em_aberto) : '—'])
        : [[{ content: `Nenhuma ${lado === 'receitas' ? 'entrada' : 'saída'} no período.`, colSpan: 5, styles: { halign: 'center', textColor: [120, 120, 120] } }]],
      foot: [['Total', String(t.qtd), brl(t.realizado), t.realizado ? '100,0%' : '—', t.emAberto ? brl(t.emAberto) : '—']],
      showFoot: 'lastPage',
      footStyles: { fillColor: [245, 245, 245], textColor: [33, 33, 33], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
      },
      didParseCell: (cell) => {
        if ((cell.section === 'head' || cell.section === 'foot') && cell.column.index > 0) cell.cell.styles.halign = 'right';
        if (cell.section === 'body' && cell.column.index === 0 && itens[cell.row.index]) {
          // recuo para a bolinha de cor da categoria
          cell.cell.styles.cellPadding = { top: 1.8, bottom: 1.8, left: 6, right: 1.6 };
        }
      },
      didDrawCell: (cell) => {
        const c = itens[cell.row.index];
        if (cell.section !== 'body' || cell.column.index !== 0 || !c) return;
        pdf.setFillColor(...hexToRgb(corDaCategoria(c, cell.row.index)));
        pdf.circle(cell.cell.x + 3, cell.cell.y + cell.cell.height / 2, 1.2, 'F');
      },
      didDrawPage: header,
    });
    y = finalY(pdf, y) + 10;
  }

  // Mês a mês (paisagem) quando o período tem mais de um mês.
  if (dados.meses.length > 1) {
    const fonte = dados.meses.length > 9 ? 7 : 8;
    for (const lado of lados) {
      const itens = dados[lado];
      if (itens.length === 0) continue;
      const rot = ROTULO_LADO[lado];
      const t = totaisDoLado(dados, lado);
      pdf.addPage('a4', 'landscape');
      header();
      tituloSecao(pdf, `${rot.titulo} — ${rot.realizado.toLowerCase()} por mês`, PDF_HEADER_H + 4, primary);
      autoTable(pdf, {
        ...baseTableOptions(fonte),
        startY: PDF_HEADER_H + 6,
        head: [['Categoria', ...dados.meses.map((m) => m.mes_label), 'Total']],
        body: itens.map((c) => [c.nome, ...c.por_mes.map((v) => (v ? brl(v) : '—')), brl(c.realizado)]),
        foot: [['Total', ...t.porMes.map((v) => (v ? brl(v) : '—')), brl(t.realizado)]],
        showFoot: 'lastPage',
        footStyles: { fillColor: [245, 245, 245], textColor: [33, 33, 33], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 'auto', fontStyle: 'bold' } },
        didParseCell: (cell) => {
          if (cell.column.index > 0) cell.cell.styles.halign = 'right';
          if (cell.section === 'body' && cell.column.index === dados.meses.length + 1) cell.cell.styles.fontStyle = 'bold';
        },
        didDrawPage: header,
      });
    }
  }

  drawFooters(pdf, `${brand.nome} · ${TITULO_PDF} · gerado em ${new Date().toLocaleString('pt-BR')} · girahub.com.br`);
  pdf.save(`categorias-${slugify(brand.nome || 'terreiro')}-${dados.data_inicio}-a-${dados.data_fim}.pdf`);
}
