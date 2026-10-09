/**
 * Troca na escala (AM-27) — tipos da API, rotas e as frases prontas.
 *
 * Espelho de `backend/src/models/atividades.py` (`STATUS_TROCA`) e das respostas de
 * `api/v1/medium/trocas.py` (Área) e `api/v1/admin/atividades_trocas.py` (painel).
 *
 * Linguagem: na Área é "Pedir troca", "Aceito ir" / "Não posso", "Você está na escala no lugar de
 * Ana" — nunca "convocado". D-07: o médium só vê o PRIMEIRO nome de quem aceitou aparecer; sem
 * nome, "um colega da corrente".
 */

export type StatusTroca = 'pedido' | 'aceito' | 'aprovado' | 'recusado' | 'cancelado';
export type Aguardando = 'colega' | 'direcao';
export type FechadaPor = 'solicitante' | 'substituto' | 'direcao';

export const RECADO_MAX = 200;

interface AtividadeDaTroca {
  origem: 'gira' | 'atividade';
  id: string;
  titulo: string;
  inicio: string;
  tipo: { nome: string; icone: string; cor?: string | null };
  cancelada: boolean;
}

// ── Área do Médium (/api/v1/medium/*) ──────────────────────────────────────

export interface TrocaMedium {
  id: string;
  papel: 'pedi' | 'para_mim';
  status: StatusTroca;
  aguardando?: Aguardando | null;
  vigente: boolean;
  atividade: AtividadeDaTroca;
  funcao?: string | null;
  grupo?: string | null;
  /** Primeiro nome do outro lado; null = "um colega da corrente" / a direção escolhe. */
  colega?: string | null;
  direcao_escolhe: boolean;
  recado?: string | null;
  criada_em: string;
  fechada_em?: string | null;
  fechada_por?: FechadaPor | null;
  pode_aceitar: boolean;
  pode_recusar: boolean;
  pode_cancelar: boolean;
}

export interface MinhasTrocas {
  para_responder: TrocaMedium[];
  minhas: TrocaMedium[];
  exige_aprovacao: boolean;
}

export interface TrocaDaAtividade {
  pode_pedir: boolean;
  motivo?: string | null;
  exige_aprovacao: boolean;
  colegas: { id: string; nome: string }[];
  pedido?: TrocaMedium | null;
  para_mim: TrocaMedium[];
}

export function trocaDaAtividadeHref(origem: string, id: string): string {
  return `/api/v1/medium/atividades/${origem}/${encodeURIComponent(id)}/troca`;
}

export function acaoTrocaHref(trocaId: string, acao: 'aceitar' | 'recusar' | 'cancelar'): string {
  return `/api/v1/medium/trocas/${encodeURIComponent(trocaId)}/${acao}`;
}

/** Troca aberta (ainda pede alguma coisa a alguém). */
export function trocaAberta(t: Pick<TrocaMedium, 'status'>): boolean {
  return t.status === 'pedido' || t.status === 'aceito';
}

/** A frase do cartão da troca na Área, do ponto de vista de quem lê. */
export function fraseDaTroca(t: TrocaMedium): string {
  const colega = t.colega ?? null;
  if (t.papel === 'para_mim') {
    const quem = colega ?? 'Um colega';
    switch (t.status) {
      case 'pedido':
        return t.vigente
          ? `${quem} pediu para você ir no lugar dele(a).`
          : 'Este pedido de troca não vale mais.';
      case 'aceito':
        return 'Você aceitou ir. Falta a direção da casa aprovar.';
      case 'aprovado':
        return `Você está na escala no lugar de ${colega ?? 'um colega'}.`;
      case 'recusado':
        return t.fechada_por === 'direcao' ? 'A direção não aprovou a troca.' : 'Você respondeu que não pode ir.';
      default:
        return 'Este pedido de troca foi cancelado.';
    }
  }
  switch (t.status) {
    case 'pedido':
      if (!t.vigente) return 'Seu pedido de troca não vale mais.';
      return t.direcao_escolhe
        ? 'Pedido enviado. A direção da casa vai escolher quem vai no seu lugar.'
        : `Pedido enviado a ${colega ?? 'um colega'}. Esperando a resposta.`;
    case 'aceito':
      return `${colega ?? 'O colega'} aceitou ir no seu lugar. Falta a direção aprovar — até lá, você continua na escala.`;
    case 'aprovado':
      return `Você trocou com ${colega ?? 'um colega da corrente'}. Você não está mais nesta escala.`;
    case 'recusado':
      return t.fechada_por === 'direcao'
        ? 'A direção não aprovou a troca. Você continua na escala.'
        : `${colega ?? 'O colega'} não pode ir. Você continua na escala.`;
    default:
      return t.fechada_por === 'direcao'
        ? 'A direção cancelou o pedido de troca. Você continua na escala.'
        : 'Você cancelou o pedido de troca.';
  }
}

/** Tom do cartão: o que pede ação fica na cor da casa; aprovado verde; o resto neutro. */
export function tomDaTroca(t: TrocaMedium): 'brand' | 'ok' | 'warn' | 'muted' {
  if (t.pode_aceitar) return 'brand';
  if (t.status === 'aprovado') return 'ok';
  if (trocaAberta(t)) return 'warn';
  return 'muted';
}

// ── Painel (/api/v1/admin/atividades/trocas*) ──────────────────────────────

export interface TrocaAdmin {
  id: string;
  status: StatusTroca;
  aguardando?: Aguardando | null;
  vigente: boolean;
  atividade: AtividadeDaTroca & { atividade_id?: string | null };
  funcao?: string | null;
  grupo?: string | null;
  solicitante: { id: string; nome: string };
  substituto?: { id: string; nome: string } | null;
  indicado_pela_direcao: boolean;
  recado?: string | null;
  criada_em: string;
  respondido_em?: string | null;
  fechada_em?: string | null;
  fechada_por?: FechadaPor | null;
}

export interface TrocasAdminResponse {
  trocas: TrocaAdmin[];
  aguardando_direcao: number;
  exige_aprovacao: boolean;
}

export const TROCAS_ADMIN_URL = '/api/v1/admin/atividades/trocas';

export function acaoTrocaAdminHref(trocaId: string, acao: 'aprovar' | 'recusar' | 'cancelar' | 'substitutos'): string {
  return `${TROCAS_ADMIN_URL}/${encodeURIComponent(trocaId)}/${acao}`;
}

export const ROTULO_STATUS_TROCA: Record<StatusTroca, string> = {
  pedido: 'Pedido',
  aceito: 'Colega aceitou',
  aprovado: 'Aprovada',
  recusado: 'Recusada',
  cancelado: 'Cancelada',
};

/** O que a linha do painel diz que falta. */
export function situacaoTrocaAdmin(t: TrocaAdmin): string {
  if (!t.vigente && (t.status === 'pedido' || t.status === 'aceito')) {
    return 'Não vale mais (a escala ou a atividade mudou)';
  }
  if (t.aguardando === 'direcao') {
    return t.substituto ? 'Esperando a aprovação da direção' : 'A direção escolhe quem vai';
  }
  if (t.aguardando === 'colega') return `Esperando ${t.substituto?.nome ?? 'o colega'} responder`;
  if (t.status === 'recusado') {
    return t.fechada_por === 'direcao' ? 'Recusada pela direção' : 'O colega não pode ir';
  }
  if (t.status === 'cancelado') {
    return t.fechada_por === 'direcao' ? 'Cancelada pela direção' : 'Cancelada por quem pediu';
  }
  return t.indicado_pela_direcao ? 'Aprovada (a direção escolheu)' : 'Aprovada';
}
