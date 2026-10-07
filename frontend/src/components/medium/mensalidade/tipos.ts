/**
 * Tipos e textos da Mensalidade na Área do Médium (AM-11/AM-12). Espelham
 * `backend/src/api/v1/medium/mensalidades.py`.
 */

export type StatusMes =
  | 'pendente'
  | 'atrasada'
  | 'em_conferencia'
  | 'nao_confirmada'
  | 'paga'
  | 'isento';

export interface MesMensalidade {
  mes: string; // "AAAA-MM"
  status: StatusMes;
  valor?: number | null;
  vencimento?: string | null;
  data_pagamento?: string | null;
  comprovante_enviado_em?: string | null;
  recusa_motivo?: string | null;
  recusado_em?: string | null;
  atual: boolean;
}

export interface PixDaCasa {
  tipo?: string | null;
  chave: string;
  nome_recebedor?: string | null;
  chave_alterada_em?: string | null;
}

export interface MensalidadesResponse {
  hoje: string;
  isento: boolean;
  valor_mensal?: number | null;
  dia_vencimento?: number | null;
  pix: PixDaCasa | null;
  meses: MesMensalidade[];
}

export interface PixDoMes {
  mes: string;
  valor: number;
  copia_e_cola: string;
  txid: string;
  tipo?: string | null;
  chave: string;
  nome_recebedor?: string | null;
  cidade?: string | null;
  instrucoes?: string | null;
  chave_alterada_em?: string | null;
}

/** Mês em que o médium ainda paga/envia comprovante. */
export const EM_ABERTO: ReadonlySet<StatusMes> = new Set([
  'pendente',
  'atrasada',
  'nao_confirmada',
]);

/** Rótulo e cor da etiqueta de cada situação (fundo suave → `text-X-strong`, AGENTS.md §11.16). */
export const PILL: Record<StatusMes, { label: string; className: string }> = {
  pendente: { label: 'Em aberto', className: 'bg-warning/15 text-warning-strong' },
  atrasada: { label: 'Atrasada', className: 'bg-destructive/15 text-destructive-strong' },
  em_conferencia: { label: 'Aguardando a casa', className: 'bg-info/15 text-info-strong' },
  nao_confirmada: {
    label: 'Não confirmado',
    className: 'bg-destructive/15 text-destructive-strong',
  },
  paga: { label: 'Paga', className: 'bg-success/15 text-success-strong' },
  isento: { label: 'Isento', className: 'bg-muted text-muted-foreground' },
};

/** Link do "Falar com a casa" (WhatsApp da casa, dígitos com DDI, configurado no AM-10). */
export function whatsappDaCasa(digitos?: string | null, texto?: string): string | null {
  const d = (digitos || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const numero = d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
