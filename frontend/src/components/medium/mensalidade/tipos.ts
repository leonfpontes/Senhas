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

/** Um comprovante que o médium enviou (pagamento parcial, migração 092 — vários por mês). */
export interface ComprovanteEnviado {
  enviado_em: string;
  valor_informado?: number | null;
  status: 'em_conferencia' | 'conferido' | 'nao_confirmado';
  valor_conferido?: number | null;
  motivo?: string | null;
}

export interface MesMensalidade {
  mes: string; // "AAAA-MM"
  status: StatusMes;
  /** Mês em aberto: o que FALTA pagar; mês pago: o total recebido. */
  valor?: number | null;
  /** Valor do mês e o que a casa já recebeu (comprovantes conferidos + PIX automático). */
  valor_mensalidade?: number | null;
  valor_recebido?: number;
  vencimento?: string | null;
  data_pagamento?: string | null;
  comprovante_enviado_em?: string | null;
  recusa_motivo?: string | null;
  recusado_em?: string | null;
  atual: boolean;
  /** Paga pela cobrança automática (PIX/boleto na conta da casa — F-02/AM-22). */
  pago_automatico?: boolean;
  /** Comprovantes enviados neste mês, do mais antigo para o mais novo. */
  comprovantes?: ComprovanteEnviado[];
}

/** Pagou parte (a casa já recebeu algo) e ainda falta: a tela diz "Falta pagar". */
export function pagamentoParcial(mes: MesMensalidade): boolean {
  return (mes.valor_recebido ?? 0) > 0 && mes.status !== 'paga' && mes.status !== 'isento';
}

/** A casa recebe com baixa automática (Stripe ou Mercado Pago). */
export interface CobrancaAutomaticaInfo {
  provedor: string;
  provedor_label: string;
  pix: boolean;
  boleto: boolean;
}

export type MetodoCobranca = 'pix' | 'boleto';

/** `POST/GET /api/v1/medium/mensalidades/{mes}/cobranca`. */
export interface CobrancaDoMes {
  mes: string;
  valor: number;
  metodo: MetodoCobranca;
  provedor: string;
  provedor_label: string;
  status: 'pendente' | 'paga' | 'expirada' | 'cancelada' | 'estornada';
  mes_status: StatusMes;
  copia_e_cola?: string | null;
  boleto_url?: string | null;
  boleto_linha_digitavel?: string | null;
  expira_em?: string | null;
  pago_em?: string | null;
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
  /** null = sem baixa automática (chave estática + comprovante). */
  cobranca_automatica?: CobrancaAutomaticaInfo | null;
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
