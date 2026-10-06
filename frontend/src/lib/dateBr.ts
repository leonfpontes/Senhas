/**
 * dateBr — datas no fuso de Brasília (America/Sao_Paulo) e formatação pt-BR.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC: depois das 21h em Brasília
 * já é "amanhã". Toda tela que precisa de "hoje" (vencimento, data de pagamento, filtros de
 * período) usa `todayBr()`.
 */

export const BR_TIME_ZONE = 'America/Sao_Paulo';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Partes (ano, mês 1–12, dia) de um instante no fuso de Brasília. */
export function brDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Data de hoje em Brasília como ISO "YYYY-MM-DD". */
export function todayBr(now: Date = new Date()): string {
  const { year, month, day } = brDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mês corrente em Brasília como "YYYY-MM". */
export function currentMonthBr(now: Date = new Date()): string {
  return todayBr(now).slice(0, 7);
}

/** ISO "YYYY-MM-DD" → Date local à meia-noite (sem deslocamento de fuso). */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Soma `n` dias a um ISO "YYYY-MM-DD" (aceita negativo). */
export function addDaysIso(iso: string, n: number): string {
  const d = isoToLocalDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoLocal(d);
}

/** Date local → ISO "YYYY-MM-DD" usando os campos locais (não UTC). */
export function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM" ± n meses → "YYYY-MM". */
export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Primeiro e último dia de um "YYYY-MM" em ISO. */
export function monthRangeIso(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toIsoLocal(start), end: toIsoLocal(end) };
}

/** "2026-03" → "mar/26". */
export function monthLabelShort(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_SHORT[idx] ?? m}/${y.slice(2)}`;
}

/** "2026-03" → "março de 2026". */
export function monthLabelLong(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_LONG[idx] ?? m} de ${y}`;
}

/** ISO (data ou data-hora) → "dd/mm/aaaa". Vazio/nulo → "—". */
export function formatDateBr(iso: string | null | undefined, empty = '—'): string {
  if (!iso) return empty;
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return empty;
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** ISO data-hora → "dd/mm/aaaa HH:mm" no fuso de Brasília. */
export function formatDateTimeBr(iso: string | null | undefined, empty = '—'): string {
  if (!iso) return empty;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleString('pt-BR', {
    timeZone: BR_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Valor em reais → "R$ 1.234,56". Nulo → "—". */
export function formatBRL(value: number | null | undefined, empty = '—'): string {
  if (value == null || !Number.isFinite(value)) return empty;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
