/**
 * Base dos PDFs de listagem (jsPDF + jspdf-autotable): cabeçalho com logo e cores
 * do terreiro, estilo de tabela e rodapé "Página X de Y".
 *
 * Tabelas são desenhadas como texto de verdade (autotable), não como foto do HTML
 * (html2canvas): a foto cortava a parte de baixo do texto das células com
 * `-webkit-line-clamp` e obrigava a um limite fixo de linhas por página. Aqui a
 * célula cresce o quanto o texto pedir e a quebra de página é automática.
 *
 * As libs são importadas sob demanda (só quando alguém exporta).
 */
import type { jsPDF as JsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

export interface PdfBrand {
  nome: string;
  logoUrl?: string;
  primaryColor: string;
}

export type Rgb = [number, number, number];

export async function loadPdfLibs() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
}

export function hexToRgb(hex: string, fallback: Rgb = [33, 33, 33]): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/**
 * Logo recortada em círculo como PNG (dataURL). null se não carregar (CORS, 404…) —
 * o cabeçalho cai no círculo com a inicial.
 */
export function loadRoundLogo(url: string | undefined, sizePx = 160): Promise<string | null> {
  if (!url || typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.beginPath();
        ctx.arc(sizePx / 2, sizePx / 2, sizePx / 2, 0, Math.PI * 2);
        ctx.clip();
        // object-fit: cover
        const scale = Math.max(sizePx / img.width, sizePx / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (sizePx - w) / 2, (sizePx - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export const PDF_MARGIN_X = 12;
export const PDF_HEADER_H = 26; // área do cabeçalho repetido em toda página (mm)
export const PDF_FOOTER_H = 12;

/** Cabeçalho compacto: logo (ou inicial) + nome do terreiro + linha de título + subtítulo. */
export function drawHeader(
  pdf: JsPDF,
  opts: { brand: PdfBrand; logo: string | null; title: string; subtitle?: string },
) {
  const { brand, logo, title, subtitle } = opts;
  const primary = hexToRgb(brand.primaryColor);
  const pageW = pdf.internal.pageSize.getWidth();
  const x = PDF_MARGIN_X;
  const y = 7;
  const d = 13;

  if (logo) {
    pdf.addImage(logo, 'PNG', x, y, d, d);
  } else {
    pdf.setFillColor(...primary);
    pdf.circle(x + d / 2, y + d / 2, d / 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text((brand.nome || 'T')[0].toUpperCase(), x + d / 2, y + d / 2, { align: 'center', baseline: 'middle' });
  }

  const tx = x + d + 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12.5);
  pdf.setTextColor(...primary);
  pdf.text(brand.nome || 'Terreiro', tx, y + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 51, 51);
  pdf.text(title, tx, y + 9);
  if (subtitle) {
    pdf.setFontSize(8.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(subtitle, tx, y + 13.5);
  }

  pdf.setDrawColor(224, 224, 224);
  pdf.setLineWidth(0.3);
  pdf.line(x, PDF_HEADER_H - 3, pageW - x, PDF_HEADER_H - 3);
}

/**
 * Rodapé em todas as páginas a partir de `fromPage` (1-based). A numeração é sobre
 * o total do documento — a página de resumo do relatório conta, só não recebe este rodapé.
 */
export function drawFooters(pdf: JsPDF, left: string, fromPage = 1) {
  const total = pdf.getNumberOfPages();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const y = pageH - 7;
  for (let p = fromPage; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(224, 224, 224);
    pdf.setLineWidth(0.3);
    pdf.line(PDF_MARGIN_X, y - 4, pageW - PDF_MARGIN_X, y - 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(158, 158, 158);
    pdf.text(left, PDF_MARGIN_X, y);
    pdf.text(`Página ${p} de ${total}`, pageW - PDF_MARGIN_X, y, { align: 'right' });
  }
}

/** Estilo base das tabelas (cabeçalho cinza, zebra, texto que quebra linha). */
export function baseTableOptions(fontSize = 9): Partial<UserOptions> {
  const pad = fontSize < 9 ? 1.4 : 1.8;
  return {
    theme: 'plain',
    margin: { top: PDF_HEADER_H, bottom: PDF_FOOTER_H + 2, left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding: { top: pad, bottom: pad, left: 1.6, right: 1.6 },
      textColor: [33, 33, 33],
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [240, 240, 240],
      lineWidth: { bottom: 0.2 },
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [85, 85, 85],
      fontStyle: 'bold',
      fontSize: fontSize - 1,
      lineColor: [224, 224, 224],
      lineWidth: { bottom: 0.4 },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  };
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

export function formatDateBr(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

export function formatDateTimeBr(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
