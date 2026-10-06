/**
 * Mensagens de erro da jornada pública.
 *
 * O interceptor do `apiClient` rejeita com `{ status, message, detail }`. Para o consulente:
 * - rede (status 0/ausente) e 5xx → texto fixo em português (a mensagem do interceptor e os
 *   `detail` de 5xx do backend vêm em inglês e/ou técnicos: "Network error…", "Internal server error…");
 * - 4xx → o `detail` do backend (já escrito em português para o público) ou o fallback.
 */
import { extractApiErrorMessage } from '@/services/api_client';

export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { status?: number; response?: { status?: number } };
  return e.status ?? e.response?.status;
}

/** Rede fora ou servidor com problema (≠ "não encontrado"). */
export function isNetworkOrServerError(err: unknown): boolean {
  const status = errorStatus(err);
  return !status || status >= 500;
}

/**
 * `error_code` estável do backend, quando houver: no corpo `{error_code, message}` (APIException)
 * ou dentro de `detail` (`{detail: {error_code, message}}`).
 */
export function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { response?: { data?: unknown }; detail?: unknown };
  const data = e.response?.data as { error_code?: unknown; detail?: unknown } | undefined;
  const candidates = [data?.error_code, (data?.detail as { error_code?: unknown } | undefined)?.error_code, (e.detail as { error_code?: unknown } | undefined)?.error_code];
  const code = candidates.find((c) => typeof c === 'string' && c.length > 0);
  return code as string | undefined;
}

/** Recusas por horário na emissão (emit_ticket.py): horário obrigatório, inválido, lotado ou removido. */
export const TIME_SLOT_ERROR_CODES = new Set(['TIME_SLOT_REQUIRED', 'TIME_SLOT_INVALID', 'TIME_SLOT_FULL', 'TIME_SLOT_UNAVAILABLE']);

export function isTimeSlotError(err: unknown): boolean {
  const code = errorCode(err);
  return Boolean(code && TIME_SLOT_ERROR_CODES.has(code));
}

export const NETWORK_MESSAGE ='Sem conexão com o servidor. Verifique sua internet e tente de novo.';

export function publicErrorMessage(err: unknown, fallback: string): string {
  if (isNetworkOrServerError(err)) {
    return errorStatus(err) ? `${fallback} Tente de novo em instantes.` : NETWORK_MESSAGE;
  }
  return extractApiErrorMessage(err, fallback);
}
