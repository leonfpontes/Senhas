/**
 * Datas e valores da Área do Médium, sempre no fuso de Brasília e em português de casa
 * ("sexta, 9 de outubro · 20h"), sem termos de sistema.
 */
import { BR_TIME_ZONE, formatBRL } from '@/lib/dateBr';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function partes(iso: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    semana: get('weekday').replace('-feira', ''),
    dia: Number(get('day')),
    mes: Number(get('month')),
    hora: Number(get('hour')) % 24,
    minuto: Number(get('minute')),
  };
}

/** "20h" ou "19h30". */
export function horaBr(iso: string): string {
  const { hora, minuto } = partes(iso);
  return minuto ? `${hora}h${String(minuto).padStart(2, '0')}` : `${hora}h`;
}

/** Caixinha de data: { dia: "9", mes: "out" }. */
export function diaMesBr(iso: string): { dia: string; mes: string } {
  const { dia, mes } = partes(iso);
  return { dia: String(dia), mes: MESES[mes - 1].slice(0, 3) };
}

/** "sexta, 9 de outubro · 20h". */
export function quandoBr(iso: string): string {
  const { semana, dia, mes } = partes(iso);
  return `${semana}, ${dia} de ${MESES[mes - 1]} · ${horaBr(iso)}`;
}

/** Data sem hora ("2026-10-10") → "10/10". */
export function diaMesCurto(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** "2026-10" → "outubro". */
export function nomeDoMes(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MESES[m - 1] ?? ym;
}

/** "Ana Paula Ribeiro" → "Ana". */
export function primeiroNome(nome?: string | null): string {
  return (nome || '').trim().split(/\s+/)[0] || '';
}

export const valorBr = (v: number | null | undefined) => formatBRL(v);
