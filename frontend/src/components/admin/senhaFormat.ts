/**
 * senhaFormat — como uma senha aparece na interface (número sem cerquilha, status em palavras
 * do terreiro). Compartilhado por Porta, Senhas e Relatório. O nome reduzido do modo TV
 * ("Maria S.") é calculado no servidor (`GET /giras/{id}/door/tv`, T-04).
 *
 * A Porta tem fluxo de um passo: "Chamar" já registra o atendimento (emitted → completed).
 * O status `called` não é mais gravado; um `called` antigo aparece como "Aguardando".
 */

/**
 * "#0042" → "0042". Sem formatação vinda da API, monta igual ao backend: "P001" para senha de
 * associado, "0001" para as demais.
 */
export function numeroDaSenha(item: {
  numero: number;
  numero_formatado?: string | null;
  is_sponsor?: boolean | null;
}): string {
  const fallback = item.is_sponsor ? `P${String(item.numero).padStart(3, '0')}` : String(item.numero).padStart(4, '0');
  const base = item.numero_formatado || fallback;
  return base.replace(/^#/, '');
}

/** Status do ticket no vocabulário da Porta. */
export const SENHA_STATUS_LABELS: Record<string, string> = {
  emitted: 'Aguardando',
  called: 'Aguardando', // legado — ver comentário do arquivo
  completed: 'Atendido',
  no_show: 'Não veio',
  cancelled: 'Cancelada',
  waitlisted: 'Lista de espera',
  waitlist_expired: 'Espera expirada',
};

export function senhaStatusLabel(status: string, checkedIn = false): string {
  if ((status === 'emitted' || status === 'called') && checkedIn) return 'Chegou';
  return SENHA_STATUS_LABELS[status] ?? status;
}

/** `called` legado vira `emitted`: quem foi "chamado" no fluxo antigo continua na fila. */
export function normalizeLegacyStatus<T extends { status: string }>(item: T): T {
  return item.status === 'called' ? { ...item, status: 'emitted' } : item;
}
