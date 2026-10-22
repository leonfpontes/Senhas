/**
 * Recibo emitido pela plataforma para um terreiro (aba Recibos do Tenant 360).
 *
 * Tudo vem do registro salvo (`/api/v1/platform/recibos`), inclusive número, valor por extenso e
 * dados do emissor gravados na emissão — a 2ª via sai igual à 1ª. Recibo cancelado sai com a
 * marca CANCELADO e o motivo. A assinatura (PNG transparente) vem de `GET /recibos/assinatura` — o arquivo
 * fica só no servidor, nunca no repositório (público); sem ela o recibo sai só com a linha para assinar.
 */
import { loadPdfLibs } from './pdfDoc';

export interface ReciboPdfData {
  numero_formatado: string;
  tenant_nome: string;
  pagador_nome: string;
  pagador_documento: string | null;
  valor: string | number;
  valor_extenso: string;
  referente: string;
  forma_pagamento: string | null;
  data_pagamento: string; // YYYY-MM-DD
  emissor_nome: string;
  emissor_empresa: string;
  emissor_cnpj: string | null;
  emissor_cidade: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
}

export const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
  pix: 'Pix',
  transferencia: 'transferência bancária',
  dinheiro: 'dinheiro',
  cartao: 'cartão',
  boleto: 'boleto',
  outro: 'outro meio',
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const INK: [number, number, number] = [33, 33, 33];
const MUTED: [number, number, number] = [117, 117, 117];
const ACCENT: [number, number, number] = [134, 57, 26]; // barro-700 da marca GiraHub (globals.css)

/** Fonte padrão do PDF é WinAnsi: travessão e aspas curvas viram equivalentes simples. */
function pdfSafe(s: string): string {
  return s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

export function formatDocumento(doc: string | null | undefined): string {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc || '';
}

function brl(v: string | number): string {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dataExtenso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Data local (YYYY-MM-DD) de um timestamp ISO. */
function localIso(ts: string): string {
  const dt = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function reciboFileName(r: Pick<ReciboPdfData, 'numero_formatado' | 'tenant_nome'>): string {
  const slug = r.tenant_nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `recibo-${r.numero_formatado.replace('/', '-')}-${slug || 'terreiro'}.pdf`;
}

export interface AssinaturaImg {
  dataUrl: string;
  /** largura / altura */
  ratio: number;
}

/** Converte o PNG baixado em dataURL + proporção, para o jsPDF. null se não carregar. */
export function assinaturaFromBlob(blob: Blob): Promise<AssinaturaImg | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => resolve(img.height ? { dataUrl, ratio: img.width / img.height } : null);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function gerarReciboPdf(r: ReciboPdfData, assinatura: AssinaturaImg | null = null): Promise<void> {
  const { jsPDF } = await loadPdfLibs();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const x = 20;
  const w = pageW - x * 2;
  let y = 24;

  // Cabeçalho: marca + título à esquerda, número e valor à direita.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...ACCENT);
  pdf.text('GiraHub', x, y);
  pdf.setFontSize(24);
  pdf.setTextColor(...INK);
  pdf.text('RECIBO', x, y + 11);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...MUTED);
  pdf.text(`Nº ${r.numero_formatado}`, x + w, y, { align: 'right' });
  const valorTxt = brl(r.valor);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  const boxW = pdf.getTextWidth(valorTxt) + 12;
  pdf.setDrawColor(...ACCENT);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(x + w - boxW, y + 3, boxW, 11, 1.5, 1.5, 'S');
  pdf.setTextColor(...INK);
  pdf.text(valorTxt, x + w - boxW / 2, y + 10.5, { align: 'center' });

  y += 22;
  pdf.setDrawColor(224, 224, 224);
  pdf.setLineWidth(0.3);
  pdf.line(x, y, x + w, y);
  y += 12;

  // Corpo.
  const doc = r.pagador_documento ? `, ${r.pagador_documento.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'} ${formatDocumento(r.pagador_documento)}` : '';
  const forma = r.forma_pagamento ? ` via ${FORMA_PAGAMENTO_LABELS[r.forma_pagamento] ?? r.forma_pagamento}` : '';
  const corpo = pdfSafe(
    `Recebi de ${r.pagador_nome}${doc}, em nome de ${r.tenant_nome}, a importância de ${valorTxt} ` +
      `(${r.valor_extenso}), referente a ${r.referente.replace(/\.$/, '')}, paga${forma} em ${dataBr(r.data_pagamento)}.`,
  );
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(...INK);
  const linhas = pdf.splitTextToSize(corpo, w) as string[];
  pdf.text(linhas, x, y, { lineHeightFactor: 1.6 });
  y += linhas.length * 12 * 0.3528 * 1.6 + 8;

  const quitacao = 'Para clareza e como prova de pagamento, firmo o presente recibo, dando plena quitação do valor recebido.';
  const linhasQ = pdf.splitTextToSize(quitacao, w) as string[];
  pdf.text(linhasQ, x, y, { lineHeightFactor: 1.6 });
  y += linhasQ.length * 12 * 0.3528 * 1.6 + 14;

  const emitidoEm = localIso(r.created_at);
  const local = r.emissor_cidade ? `${pdfSafe(r.emissor_cidade)}, ` : '';
  pdf.text(`${local}${dataExtenso(emitidoEm)}.`, x + w, y, { align: 'right' });

  // Assinatura.
  y += 32;
  const assW = 90;
  const ax = pageW / 2 - assW / 2;
  if (assinatura) {
    // Altura fixa; a perna de baixo da assinatura cruza a linha, como à caneta, sem chegar no nome.
    const sw = Math.min(26 * assinatura.ratio, assW);
    const sh = sw / assinatura.ratio;
    pdf.addImage(assinatura.dataUrl, 'PNG', pageW / 2 - sw / 2, y - sh + 3, sw, sh, 'assinatura', 'FAST');
  }
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.3);
  pdf.line(ax, y, ax + assW, y);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(pdfSafe(r.emissor_nome), pageW / 2, y + 8, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...MUTED);
  pdf.text(pdfSafe(r.emissor_empresa), pageW / 2, y + 13.5, { align: 'center' });
  if (r.emissor_cnpj) pdf.text(`CNPJ ${formatDocumento(r.emissor_cnpj)}`, pageW / 2, y + 18.5, { align: 'center' });

  // Rodapé.
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(8);
  pdf.setTextColor(158, 158, 158);
  pdf.text(`Recibo nº ${r.numero_formatado} · emitido em ${dataBr(emitidoEm)} · girahub.com.br`, x, pageH - 12);

  if (r.cancelado_em) {
    pdf.setTextColor(198, 40, 40);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(54);
    pdf.text('CANCELADO', pageW / 2, 150, { align: 'center', angle: 25 });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const motivo = pdfSafe(`Cancelado em ${dataBr(localIso(r.cancelado_em))}${r.motivo_cancelamento ? ` - ${r.motivo_cancelamento}` : ''}`);
    pdf.text(pdf.splitTextToSize(motivo, w) as string[], x, pageH - 20);
  }

  pdf.save(reciboFileName(r));
}
