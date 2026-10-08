/**
 * Atividades da casa (AM-08) — listas fechadas e tipos da API.
 *
 * Espelho de `backend/src/models/atividades.py` (CHECKs da migração 078): ícones, quem é elegível,
 * convocação padrão, modo de escala e visibilidade. `tests/unit/test_am08_atividades.py` confere
 * que as chaves batem. O desenho de cada ícone fica em `lib/icons.ts` (`ICONES_DE_ATIVIDADE`).
 *
 * Cor do tipo: a mesma paleta fechada dos grupos da corrente (`constants/correnteGrupos.ts`,
 * contraste AA com texto branco). `null` = cor do terreiro (padrão do tipo Gira).
 */
import { CORES_GRUPO, type CorGrupo } from '@/constants/correnteGrupos';

export interface Opcao<T extends string = string> {
  valor: T;
  rotulo: string;
  ajuda?: string;
}

export type IconeAtividade =
  | 'gira'
  | 'faxina'
  | 'vela'
  | 'flor'
  | 'organizacao'
  | 'curso'
  | 'desenvolvimento'
  | 'reuniao'
  | 'atabaque'
  | 'cozinha'
  | 'estudo'
  | 'estrela'
  | 'folha'
  | 'agua';

export const ICONES_ATIVIDADE: readonly Opcao<IconeAtividade>[] = [
  { valor: 'gira', rotulo: 'Gira' },
  { valor: 'faxina', rotulo: 'Faxina' },
  { valor: 'vela', rotulo: 'Vela' },
  { valor: 'flor', rotulo: 'Flor' },
  { valor: 'organizacao', rotulo: 'Organização' },
  { valor: 'curso', rotulo: 'Curso' },
  { valor: 'desenvolvimento', rotulo: 'Desenvolvimento' },
  { valor: 'reuniao', rotulo: 'Reunião' },
  { valor: 'atabaque', rotulo: 'Atabaque' },
  { valor: 'cozinha', rotulo: 'Cozinha' },
  { valor: 'estudo', rotulo: 'Estudo' },
  { valor: 'estrela', rotulo: 'Estrela' },
  { valor: 'folha', rotulo: 'Folha' },
  { valor: 'agua', rotulo: 'Água' },
];

export type Elegiveis = 'todos' | 'atendimento' | 'cambones' | 'grupos';
export const OPCOES_ELEGIVEIS: readonly Opcao<Elegiveis>[] = [
  { valor: 'todos', rotulo: 'Toda a corrente' },
  { valor: 'atendimento', rotulo: 'Só médiuns de atendimento' },
  { valor: 'cambones', rotulo: 'Só cambones' },
  { valor: 'grupos', rotulo: 'Grupos escolhidos' },
];

export type Convocacao = 'todos_elegiveis' | 'so_escalados';
export const OPCOES_CONVOCACAO: readonly Opcao<Convocacao>[] = [
  { valor: 'todos_elegiveis', rotulo: 'Todos que podem participar', ajuda: 'Ex.: gira, ritual coletivo, reunião' },
  { valor: 'so_escalados', rotulo: 'Só quem estiver na escala', ajuda: 'Ex.: faxina, organização' },
];

export type ModoEscala = 'nenhuma' | 'grupos_por_dia' | 'funcoes';
export const OPCOES_MODO_ESCALA: readonly Opcao<ModoEscala>[] = [
  { valor: 'nenhuma', rotulo: 'Sem escala' },
  { valor: 'grupos_por_dia', rotulo: 'Grupos por dia do mês', ajuda: 'Como a faxina: G1 num dia, G2 no outro' },
  { valor: 'funcoes', rotulo: 'Por função', ajuda: 'Como a gira: cambone, porteiro, ogã…' },
];

export type Visibilidade = 'corrente' | 'convocados';
export const OPCOES_VISIBILIDADE: readonly Opcao<Visibilidade>[] = [
  { valor: 'corrente', rotulo: 'Toda a corrente vê', ajuda: 'Quem o tipo alcança vê na Agenda da Área do Médium' },
  {
    valor: 'convocados',
    rotulo: 'Só quem estiver na escala',
    ajuda: 'Por enquanto ninguém da corrente vê: aparece quando a escala chegar à Área',
  },
];

/** Cores do tipo: "Cor da casa" (null) + a paleta fechada dos grupos. */
export const CORES_TIPO = CORES_GRUPO;
export type CorTipo = CorGrupo | null;

const HEX = new Map(CORES_GRUPO.map((c) => [c.chave as string, c.hex]));

/** Hex da cor do tipo, ou null para "cor do terreiro" (o chip usa a cor da marca). */
export function corDoTipo(chave: string | null | undefined): string | null {
  return (chave && HEX.get(chave)) || null;
}

export function rotuloDe<T extends string>(opcoes: readonly Opcao<T>[], valor: string | null | undefined): string {
  return opcoes.find((o) => o.valor === valor)?.rotulo ?? '';
}

// ── Tipos da API (/api/v1/admin/atividades) ────────────────────────────────

export interface TipoMini {
  id?: string | null;
  nome: string;
  icone: string;
  cor?: string | null;
}

export interface TipoAtividade {
  id: string;
  nome: string;
  natureza: 'gira' | 'atividade';
  icone: IconeAtividade;
  cor: string | null;
  controla_presenca: boolean;
  pede_confirmacao: boolean;
  exige_justificativa: boolean;
  checkin_pelo_medium: boolean;
  checkin_antes_min: number;
  checkin_depois_min: number;
  elegiveis: Elegiveis;
  grupos: { id: string; nome: string; cor: string }[];
  convocacao_padrao: Convocacao;
  modo_escala: ModoEscala;
  hora_padrao: string | null;
  duracao_min: number | null;
  visibilidade_padrao: Visibilidade;
  is_sistema: boolean;
  visivel_no_site: boolean;
  ordem: number;
  arquivado_em: string | null;
}

export interface FuncaoCorrente {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  arquivado_em: string | null;
}

export interface Atividade {
  id: string;
  tipo: TipoMini;
  gira_id: string | null;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
  descricao: string | null;
  orientacoes: string | null;
  visibilidade: Visibilidade;
  origem: 'manual' | 'plano_escala' | 'gira';
  cancelada_em: string | null;
  cancelamento_motivo: string | null;
}

export interface CalendarioItem {
  origem: 'gira' | 'atividade';
  id: string;
  tipo: TipoMini;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
  visibilidade: Visibilidade | null;
  cancelada: boolean;
}

export interface CalendarioResponse {
  inicio: string;
  fim: string;
  itens: CalendarioItem[];
}
