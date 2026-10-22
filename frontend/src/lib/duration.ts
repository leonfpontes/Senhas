/**
 * Durações em minutos ↔ texto "hh:mm" (campo `DurationField`) e texto legível ("1h30", "45 min").
 *
 * A digitação funciona como um cronômetro: os dois últimos dígitos são os minutos e o resto são
 * as horas ("130" → "1:30", "0130" → "01:30"). Minutos ≥ 60 são normalizados ("00:90" = 1h30).
 * Espelha `waitlist_service.format_duration` do backend (texto do e-mail da fila de espera).
 */

/** Até 3 dígitos de hora + 2 de minuto (999:59). */
const MAX_DIGITS = 5;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Máscara de digitação: só dígitos, ":" antes dos dois últimos. */
export function maskDuration(raw: string): string {
  // Zeros à esquerda saem quando passa de 4 dígitos (digitar no fim de "01:30" vira "13:0x").
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d{4})/, '').slice(0, MAX_DIGITS);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

/** Texto do campo → minutos (`null` se vazio). "1:30" → 90, "45" → 45, "00:90" → 90. */
export function parseDuration(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 2) return Number(digits);
  return Number(digits.slice(0, -2)) * 60 + Number(digits.slice(-2));
}

/** Minutos → "hh:mm" (90 → "01:30"; 600 → "10:00"; 6000 → "100:00"). */
export function formatHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Minutos → texto legível: 45 → "45 min", 120 → "2h", 90 → "1h30", 65 → "1h05". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h${pad2(mins)}` : `${hours}h`;
}
