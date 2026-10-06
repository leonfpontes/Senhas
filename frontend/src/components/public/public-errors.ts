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

export const NETWORK_MESSAGE = 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';

export function publicErrorMessage(err: unknown, fallback: string): string {
  if (isNetworkOrServerError(err)) {
    return errorStatus(err) ? `${fallback} Tente de novo em instantes.` : NETWORK_MESSAGE;
  }
  return extractApiErrorMessage(err, fallback);
}
