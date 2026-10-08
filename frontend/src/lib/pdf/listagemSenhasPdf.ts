/**
 * PDF "Listagem de senhas" da tela Senhas (botão "Exportar PDF", substituiu o CSV em
 * out/2026). A4 paisagem com todas as senhas da gira — dados de
 * `GET /api/v1/admin/giras/{id}/export-listagem`, que já manda rótulos e horários de
 * Brasília prontos.
 */
import {
  baseTableOptions,
  drawFooters,
  drawHeader,
  formatDateTimeBr,
  loadPdfLibs,
  loadRoundLogo,
  slugify,
  type PdfBrand,
} from './pdfDoc';

export interface ListagemSenha {
  senha: string;
  nome: string;
  email: string;
  telefone: string;
  tipo: string;
  prioridade: string;
  status: string;
  status_label: string;
  emitida_em: string;
  chegou_em: string;
  finalizada_em: string;
  medium: string;
  cambone: string;
  observacoes: string;
}

export interface ListagemSenhasData {
  gira: { nome: string; data_inicio?: string | null };
  items: ListagemSenha[];
}

/** "82 senhas · 60 aguardando · 20 atendidas · 2 não vieram · 9 preferenciais" */
export function resumoListagem(items: ListagemSenha[]): string {
  const count = (pred: (i: ListagemSenha) => boolean) => items.filter(pred).length;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const partes = [plural(items.length, 'senha', 'senhas')];
  const extras: [number, string, string][] = [
    [count((i) => i.status === 'emitted' || i.status === 'called'), 'aguardando', 'aguardando'],
    [count((i) => i.status === 'completed'), 'atendida', 'atendidas'],
    [count((i) => i.status === 'no_show'), 'não veio', 'não vieram'],
    [count((i) => i.status === 'cancelled'), 'cancelada', 'canceladas'],
    [count((i) => i.status === 'waitlisted'), 'na lista de espera', 'na lista de espera'],
    [count((i) => Boolean(i.prioridade)), 'preferencial', 'preferenciais'],
  ];
  for (const [n, um, varios] of extras) if (n > 0) partes.push(plural(n, um, varios));
  return partes.join(' · ');
}

const PRIORITY_COLOR: [number, number, number] = [191, 54, 12];

export async function gerarListagemSenhasPdf(data: ListagemSenhasData, brand: PdfBrand): Promise<void> {
  const [{ jsPDF, autoTable }, logo] = await Promise.all([loadPdfLibs(), loadRoundLogo(brand.logoUrl)]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });

  const dataGira = formatDateTimeBr(data.gira.data_inicio);
  const title = `${data.gira.nome}${dataGira ? ` — ${dataGira}` : ''}`;
  const subtitle = `Listagem de senhas · ${resumoListagem(data.items)}`;

  const base = baseTableOptions(8);
  autoTable(pdf, {
    ...base,
    head: [[
      'Senha', 'Nome', 'Telefone', 'Tipo', 'Prioridade', 'Status',
      'Emitida', 'Chegou', 'Médium', 'Cambone', 'Observações',
    ]],
    body: data.items.map((i) => [
      i.senha,
      i.email ? `${i.nome || '—'}\n${i.email}` : i.nome || '—',
      i.telefone || '—',
      i.tipo,
      i.prioridade || '—',
      i.status_label,
      i.emitida_em || '—',
      i.chegou_em || '—',
      i.medium || '—',
      i.cambone || '—',
      i.observacoes || '—',
    ]),
    columnStyles: {
      0: { cellWidth: 12, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 25 },
      3: { cellWidth: 21 },
      4: { cellWidth: 26 },
      5: { cellWidth: 19 },
      6: { cellWidth: 16 },
      7: { cellWidth: 16 },
      8: { cellWidth: 24 },
      9: { cellWidth: 24 },
      10: { cellWidth: 'auto' },
    },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      if (cell.column.index === 4 && cell.cell.raw !== '—') {
        cell.cell.styles.textColor = PRIORITY_COLOR;
        cell.cell.styles.fontStyle = 'bold';
      }
      if ([6, 7].includes(cell.column.index)) cell.cell.styles.fontSize = 7;
    },
    didDrawPage: () => drawHeader(pdf, { brand, logo, title, subtitle }),
  });

  drawFooters(pdf, `${data.gira.nome} · gerado em ${new Date().toLocaleString('pt-BR')} · girahub.com.br`);
  pdf.save(`senhas-${slugify(data.gira.nome)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
