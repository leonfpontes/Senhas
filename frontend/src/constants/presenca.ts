/**
 * Presença (AM-17/AM-28) — modos, situações e tipos da API.
 *
 * Espelho de `backend/src/models/atividades.py` (`MODOS_PRESENCA`) e de
 * `backend/src/services/presenca.py` (`SITUACOES`); `tests/unit/test_am17_28_presenca.py` confere
 * que as chaves batem.
 *
 * Linguagem (D-17/D-18/D-19): na Área do Médium é "Você está na escala", "Vou"/"Não vou",
 * "Cheguei" e "Conte o motivo" — nunca "convocado" nem "check-in". No painel, "Chamada",
 * "Confirmações", "Na escala".
 */
import type { Opcao, TipoMini } from '@/constants/atividades';

export type ModoPresenca = 'confianca' | 'app' | 'qr';

export const OPCOES_MODO_PRESENCA: readonly Opcao<ModoPresenca>[] = [
  {
    valor: 'confianca',
    rotulo: 'Confiança',
    ajuda: 'Quem respondeu “Vou” conta como presente, a não ser que a chamada marque ausência.',
  },
  {
    valor: 'app',
    rotulo: '“Cheguei” pelo app',
    ajuda: 'O médium toca em “Cheguei” na Área, só na janela de horário do tipo.',
  },
  {
    valor: 'qr',
    rotulo: '“Cheguei” com o QR do dia',
    ajuda:
      'O “Cheguei” pede o QR que aparece na Porta, no modo TV e na tela da chamada. Evita marcar de casa.',
  },
];

export type Situacao =
  | 'convocado'
  | 'confirmado'
  | 'ausencia_avisada'
  | 'presente'
  | 'ausente_justificado'
  | 'ausente'
  | 'dispensado'
  | 'substituido';

/** Rótulo da situação no painel (chamada/confirmações). */
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  convocado: 'Sem resposta',
  confirmado: 'Vai',
  ausencia_avisada: 'Avisou que não vai',
  presente: 'Presente',
  ausente_justificado: 'Ausente com motivo',
  ausente: 'Ausente',
  dispensado: 'Fora da escala',
  substituido: 'Substituído',
};

/** Rótulo da situação na Área do Médium (D-17: nada de "convocado"). */
export const ROTULO_SITUACAO_MEDIUM: Record<Situacao, string> = {
  convocado: 'Responda se vai',
  confirmado: 'Você vai',
  ausencia_avisada: 'Você avisou que não vai',
  presente: 'Presente',
  ausente_justificado: 'Ausência com motivo',
  ausente: 'Ausente',
  dispensado: 'Fora da escala',
  substituido: 'Trocou a escala',
};

export type TomSituacao = 'ok' | 'warn' | 'bad' | 'muted' | 'brand';

export const TOM_SITUACAO: Record<Situacao, TomSituacao> = {
  convocado: 'brand',
  confirmado: 'ok',
  ausencia_avisada: 'warn',
  presente: 'ok',
  ausente_justificado: 'warn',
  ausente: 'bad',
  dispensado: 'muted',
  substituido: 'muted',
};

/** Classes do selo da situação (fundo suave → texto `-strong`, AGENTS.md §11.16). */
export const CLASSE_TOM: Record<TomSituacao, string> = {
  ok: 'bg-success/15 text-success-strong',
  warn: 'bg-warning/15 text-warning-strong',
  bad: 'bg-destructive/15 text-destructive-strong',
  muted: 'bg-muted text-muted-foreground',
  brand: 'bg-primary/15 text-brand',
};

export const JUSTIFICATIVA_MAX = 500;
export const AVISO_SAUDE = 'A direção da casa vê o motivo. Não precisa detalhar questões de saúde.';

// ── Área do Médium (/api/v1/medium/*) ──────────────────────────────────────

export type Resposta = 'sem_resposta' | 'vou' | 'nao_vou';
export type Presenca = 'nao_registrada' | 'presente' | 'ausente';

export interface MinhaParticipacao {
  convocado: boolean;
  situacao: Situacao;
  resposta: Resposta;
  presenca: Presenca;
  presenca_em?: string | null;
  justificativa?: string | null;
  grupo?: string | null;
  funcao?: string | null;
  pede_confirmacao: boolean;
  exige_justificativa: boolean;
  controla_presenca: boolean;
  modo_presenca: ModoPresenca;
  pode_responder: boolean;
  responder_ate: string;
  pode_checkin: boolean;
  checkin_abre_em?: string | null;
  checkin_fecha_em?: string | null;
  pode_justificar: boolean;
  justificar_ate?: string | null;
  chamada_encerrada: boolean;
}

export interface ItemPresenca {
  origem: 'gira' | 'atividade';
  id: string;
  tipo: { nome: string; icone: string; cor?: string | null };
  titulo: string;
  inicio: string;
  fim?: string | null;
  local?: string | null;
  cancelada?: boolean;
  minha_participacao: MinhaParticipacao | null;
}

export interface PresencasResponse {
  proximas: ItemPresenca[];
  historico: ItemPresenca[];
  resumo: { presentes: number; total: number; percentual: number | null; desde: string };
  prazo_justificativa_dias: number;
}

/** Rota base das ações da Área numa gira/atividade. */
export function acaoHref(
  origem: string,
  id: string,
  acao: 'resposta' | 'checkin' | 'justificativa',
): string {
  return `/api/v1/medium/atividades/${origem}/${encodeURIComponent(id)}/${acao}`;
}

// ── Painel (/api/v1/admin/atividades/{id}/chamada|confirmacoes|qr) ─────────

export interface PessoaChamada {
  medium_id: string;
  nome: string;
  convocado: boolean;
  origem: string;
  grupo?: string | null;
  funcao?: string | null;
  resposta: Resposta;
  respondido_em?: string | null;
  presenca: Presenca;
  presenca_origem?: 'checkin_medium' | 'chamada' | 'encerramento' | 'confianca' | null;
  presenca_registrada_em?: string | null;
  presenca_registrada_por?: string | null;
  situacao: Situacao;
  tem_justificativa: boolean;
  justificativa?: string | null;
  dispensado: boolean;
}

export interface ChamadaResponse {
  atividade: {
    atividade_id: string;
    origem: 'gira' | 'atividade';
    ref_id: string;
    titulo: string;
    inicio: string;
    fim?: string | null;
    local?: string | null;
    tipo: TipoMini;
    modo_presenca: ModoPresenca;
    controla_presenca: boolean;
    pede_confirmacao: boolean;
    exige_justificativa: boolean;
    convocacao_padrao: 'todos_elegiveis' | 'so_escalados';
    cancelada: boolean;
    chamada_encerrada_em?: string | null;
    chamada_encerrada_por?: string | null;
    pode_encerrar: boolean;
  };
  contadores: {
    esperados: number;
    confirmados: number;
    ausencias_avisadas: number;
    sem_resposta: number;
    presentes: number;
    ausentes: number;
    sem_registro: number;
    dispensados: number;
  };
  pessoas: PessoaChamada[];
  outros_mediuns: { id: string; nome: string }[];
  ver_justificativa: boolean;
}

export interface QrResponse {
  modo: ModoPresenca;
  ativo: boolean;
  codigo?: string | null;
  conteudo?: string | null;
  expira_em?: string | null;
  intervalo_s: number;
  janela_abre_em?: string | null;
  janela_fecha_em?: string | null;
  titulo: string;
}

/** Origem da presença registrada, em palavras da casa. */
export function textoOrigemPresenca(
  p: Pick<PessoaChamada, 'presenca_origem' | 'presenca_registrada_por'>,
): string | null {
  switch (p.presenca_origem) {
    case 'checkin_medium':
      return 'Marcou “Cheguei”';
    case 'confianca':
      return 'Confirmou e contou como presente';
    case 'encerramento':
      return 'Sem marcação no encerramento';
    case 'chamada':
      return p.presenca_registrada_por
        ? `Marcado por ${p.presenca_registrada_por}`
        : 'Marcado na chamada';
    default:
      return null;
  }
}
