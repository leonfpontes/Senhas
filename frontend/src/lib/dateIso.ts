/**
 * Conversões entre ISO local ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm") e o formato brasileiro
 * exibido pelos campos DateField/DateTimeField. Tudo em horário local, sem fuso — a mesma
 * convenção dos `<input type="date|datetime-local">` que as telas usavam.
 */

export interface DateParts {
  year: number;
  month: number; // 1–12
  day: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidDateParts({ year, month, day }: DateParts): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/** "YYYY-MM-DD" (ou ISO completo) → Date local à meia-noite, ou null. */
export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (!isValidDateParts(parts)) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

/** Date → "YYYY-MM-DD" (local). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "dd/mm/aaaa" digitado → "YYYY-MM-DD", ou null se incompleto/inválido. */
export function brToIsoDate(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const parts = { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  if (!isValidDateParts(parts)) return null;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** "YYYY-MM-DD" → "dd/mm/aaaa" ('' se vazio/inválido). */
export function isoToBrDate(iso: string | null | undefined): string {
  const d = parseIsoDate(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** Máscara de digitação "dd/mm/aaaa" (só dígitos, barras automáticas). */
export function maskBrDate(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Separa "YYYY-MM-DDTHH:mm[:ss]" em data e hora ("HH:mm"); hora vazia se ausente. */
export function splitIsoDateTime(iso: string | null | undefined): { date: string | null; time: string } {
  if (!iso) return { date: null, time: '' };
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return { date: null, time: '' };
  return { date: parseIsoDate(m[1]) ? m[1] : null, time: m[2] && m[3] ? `${m[2]}:${m[3]}` : '' };
}

/** Junta data ISO e hora "HH:mm" em "YYYY-MM-DDTHH:mm"; null se faltar a data. */
export function joinIsoDateTime(date: string | null, time: string): string | null {
  if (!date || !parseIsoDate(date)) return null;
  const t = /^(\d{2}):(\d{2})/.exec(time) ? time.slice(0, 5) : '00:00';
  return `${date}T${t}`;
}
