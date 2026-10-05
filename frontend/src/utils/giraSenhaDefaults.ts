/**
 * Sugestões para a configuração de senhas de uma gira nova.
 *
 * Análise de produção (2026-10-05): terreiros novos configuravam janelas de
 * liberação de uma hora — ou terminando antes do dia da gira — e nenhum
 * consulente conseguia pegar senha. Os terreiros que usam o GiraHub de
 * verdade deixam a emissão aberta por horas ou dias. A sugestão padrão é
 * liberar a partir de agora até o início da gira: quem vê o link no grupo
 * de WhatsApp consegue pegar a senha na hora.
 */

export const DEFAULT_MAX_TICKETS = 30;
/** Abaixo disso a tela avisa que a janela é curta. */
export const SHORT_WINDOW_HOURS = 3;

/** Date → "YYYY-MM-DDTHH:mm" no fuso do navegador (valor de input datetime-local). */
export function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Mediana das quantidades já usadas pelo terreiro (ignora giras sem
 * configuração e a própria gira); sem histórico, DEFAULT_MAX_TICKETS.
 */
export function suggestMaxTickets(
  giras: ReadonlyArray<{ id: string; max_tickets?: number | null }>,
  excludeId?: string,
): number {
  const values = giras
    .filter((g) => g.id !== excludeId && typeof g.max_tickets === 'number' && g.max_tickets > 0)
    .map((g) => g.max_tickets as number)
    .sort((a, b) => a - b);
  if (values.length === 0) return DEFAULT_MAX_TICKETS;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.max(1, Math.round(median));
}

/**
 * Janela sugerida: de agora (arredondado para os próximos 5 minutos) até o
 * início da gira. Null se a gira já começou ou começa em menos de 5 minutos —
 * aí não há janela útil para sugerir.
 */
export function suggestReleaseWindow(giraStartIso: string, now: Date = new Date()): { start: string; end: string } | null {
  const end = new Date(giraStartIso);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(now);
  start.setSeconds(0, 0);
  const remainder = start.getMinutes() % 5;
  if (remainder) start.setMinutes(start.getMinutes() + (5 - remainder));
  if (end.getTime() <= start.getTime()) return null;
  return { start: toLocalDatetimeInput(start), end: toLocalDatetimeInput(end) };
}

/** Duração da janela em horas a partir dos valores dos inputs; null se inválida. */
export function releaseWindowHours(startLocal: string, endLocal: string): number | null {
  if (!startLocal || !endLocal) return null;
  const start = new Date(startLocal).getTime();
  const end = new Date(endLocal).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return (end - start) / 3_600_000;
}

export function isShortWindow(startLocal: string, endLocal: string): boolean {
  const hours = releaseWindowHours(startLocal, endLocal);
  return hours !== null && hours < SHORT_WINDOW_HOURS;
}

/** "45 minutos", "1 hora", "2,5 horas" — para o aviso de janela curta. */
export function formatWindowDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutos`;
  const rounded = Math.round(hours * 10) / 10;
  if (rounded === 1) return '1 hora';
  return `${String(rounded).replace('.', ',')} horas`;
}
