/**
 * PDF "Itens para repor" da tela Estoque → Itens (botão "PDF para repor", pedido de
 * out/2026). A4 retrato com os itens zerados, negativos ou abaixo do mínimo — a lista
 * de compras do terreiro. Usa os itens que a tela já carregou (todos, ou só do grupo
 * filtrado); a regra de status é a mesma do selo de saldo (`saldoStatus` em itens.tsx),
 * mais o item zerado sem mínimo definido, que também acabou.
 */
import {
  baseTableOptions,
  drawFooters,
  drawHeader,
  loadPdfLibs,
  loadRoundLogo,
  slugify,
  type PdfBrand,
  type Rgb,
} from './pdfDoc';

export interface EstoqueItemPdf {
  nome: string;
  grupo_nome: string | null;
  descricao: string | null;
  unidade_medida: string;
  estoque_minimo: number;
  custo_unitario: number | null;
  saldo: number;
}

export type MotivoReposicao = 'negativo' | 'zerado' | 'abaixo';

export interface ItemParaRepor extends EstoqueItemPdf {
  motivo: MotivoReposicao;
  /** Quanto falta para chegar ao mínimo (0 quando o item não tem mínimo). */
  falta: number;
}

export const MOTIVO_LABEL: Record<MotivoReposicao, string> = {
  negativo: 'Negativo',
  zerado: 'Zerado',
  abaixo: 'Abaixo do mínimo',
};

const ORDEM: Record<MotivoReposicao, number> = { negativo: 0, zerado: 1, abaixo: 2 };

function motivo(item: EstoqueItemPdf): MotivoReposicao | null {
  if (item.saldo < 0) return 'negativo';
  if (item.saldo === 0) return 'zerado';
  if (item.estoque_minimo > 0 && item.saldo < item.estoque_minimo) return 'abaixo';
  return null;
}

/** Itens que precisam de reposição: primeiro os que acabaram, depois os abaixo do mínimo; por grupo e nome. */
export function itensParaRepor(items: EstoqueItemPdf[]): ItemParaRepor[] {
  const out: ItemParaRepor[] = [];
  for (const i of items) {
    const m = motivo(i);
    if (!m) continue;
    out.push({ ...i, motivo: m, falta: Math.max(0, i.estoque_minimo - i.saldo) });
  }
  return out.sort(
    (a, b) =>
      ORDEM[a.motivo] - ORDEM[b.motivo] ||
      (a.grupo_nome ?? '').localeCompare(b.grupo_nome ?? '', 'pt-BR') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Custo estimado para repor até o mínimo (só itens com custo unitário cadastrado). */
export function custoReposicao(items: ItemParaRepor[]): number {
  return items.reduce((acc, i) => acc + (i.custo_unitario ? i.falta * i.custo_unitario : 0), 0);
}

/** "5 itens para repor · 3 zerados ou negativos · 2 abaixo do mínimo" */
export function resumoReposicao(items: ItemParaRepor[]): string {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const acabaram = items.filter((i) => i.motivo !== 'abaixo').length;
  const abaixo = items.length - acabaram;
  const partes = [plural(items.length, 'item para repor', 'itens para repor')];
  if (acabaram) partes.push(plural(acabaram, 'zerado ou negativo', 'zerados ou negativos'));
  if (abaixo) partes.push(plural(abaixo, 'abaixo do mínimo', 'abaixo do mínimo'));
  return partes.join(' · ');
}

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const COR_MOTIVO: Record<MotivoReposicao, Rgb> = {
  negativo: [183, 28, 28],
  zerado: [183, 28, 28],
  abaixo: [180, 83, 9],
};

export async function gerarEstoqueCriticoPdf(
  items: EstoqueItemPdf[],
  brand: PdfBrand,
  opts: { grupo?: string | null } = {},
): Promise<void> {
  const lista = itensParaRepor(items);
  const [{ jsPDF, autoTable }, logo] = await Promise.all([loadPdfLibs(), loadRoundLogo(brand.logoUrl)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const title = `Estoque — itens para repor${opts.grupo ? ` · ${opts.grupo}` : ''}`;
  const subtitle = lista.length ? resumoReposicao(lista) : 'Nenhum item zerado ou abaixo do mínimo';
  const custo = custoReposicao(lista);

  autoTable(pdf, {
    ...baseTableOptions(9),
    head: [['Item', 'Grupo', 'Situação', 'Saldo', 'Mínimo', 'Falta', 'Custo p/ repor']],
    body: lista.length
      ? lista.map((i) => [
          i.descricao ? `${i.nome}\n${i.descricao}` : i.nome,
          i.grupo_nome || '—',
          MOTIVO_LABEL[i.motivo],
          `${fmtQtd(i.saldo)} ${i.unidade_medida}`,
          i.estoque_minimo > 0 ? `${fmtQtd(i.estoque_minimo)} ${i.unidade_medida}` : '—',
          i.falta > 0 ? `${fmtQtd(i.falta)} ${i.unidade_medida}` : '—',
          i.custo_unitario && i.falta > 0 ? fmtBRL(i.falta * i.custo_unitario) : '—',
        ])
      : [[{ content: 'Estoque em dia: nenhum item zerado ou abaixo do mínimo.', colSpan: 7 }]],
    foot: custo > 0
      ? [[{ content: 'Custo estimado para repor até o mínimo', colSpan: 6 }, fmtBRL(custo)]]
      : undefined,
    showFoot: 'lastPage',
    footStyles: { fillColor: [245, 245, 245], textColor: [33, 33, 33], fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'head' && cell.column.index >= 3) cell.cell.styles.halign = 'right';
      if (cell.section !== 'body' || !lista.length) return;
      const item = lista[cell.row.index];
      if (cell.column.index === 2 || cell.column.index === 3) {
        cell.cell.styles.textColor = COR_MOTIVO[item.motivo];
        cell.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => drawHeader(pdf, { brand, logo, title, subtitle }),
  });

  drawFooters(pdf, `Estoque · gerado em ${new Date().toLocaleString('pt-BR')} · girahub.com.br`);
  const sufixo = opts.grupo ? `-${slugify(opts.grupo)}` : '';
  pdf.save(`estoque-para-repor${sufixo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
