/**
 * senhaFormat — como uma senha aparece na interface (número sem cerquilha, status em palavras
 * do terreiro). Compartilhado por Porta, modo TV e Senhas.
 */

/** "#0042" → "0042"; sem formatação vinda da API, completa com zeros à esquerda. */
export function numeroDaSenha(item: { numero: number; numero_formatado?: string | null }): string {
  const base = item.numero_formatado || String(item.numero).padStart(4, '0');
  return base.replace(/^#/, '');
}

/** Status do ticket no vocabulário da Porta. */
export const SENHA_STATUS_LABELS: Record<string, string> = {
  emitted: 'Aguardando',
  called: 'Em atendimento',
  completed: 'Atendido',
  no_show: 'Não veio',
  cancelled: 'Cancelada',
};

export function senhaStatusLabel(status: string, checkedIn = false): string {
  if (status === 'emitted' && checkedIn) return 'Chegou';
  return SENHA_STATUS_LABELS[status] ?? status;
}
