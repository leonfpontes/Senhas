/**
 * Relatório de assiduidade (AM-26) — tipos da API, atalhos de período e os dados do PDF.
 *
 * Backend: `GET /api/v1/admin/atividades/assiduidade` (por médium ou, no Pro, por grupo) e
 * `GET .../assiduidade/medium/{id}` (detalhe com a justificativa — só na tela, §6.8 do plano).
 * Percentual = presentes ÷ convocações de atividades com a chamada encerrada, sem dispensados;
 * "sem chamada" fica fora da conta (`backend/src/services/assiduidade.py`).
 *
 * O PDF recebe SÓ contagens (`dadosDoPdf` escolhe campo a campo): o texto da justificativa nunca
 * entra, nem que um dia venha na resposta do agregado.
 */
import type { TipoMini } from '@/constants/atividades';
import type { Situacao } from '@/constants/presenca';
import { addMonthsYm, currentMonthBr, monthRangeIso, todayBr } from '@/lib/dateBr';

export type Agrupar = 'medium' | 'grupo';

export interface NumerosAssiduidade {
  convocacoes: number;
  presencas: number;
  ausencias_justificadas: number;
  ausencias_sem_justificativa: number;
  sem_chamada: number;
  dispensados: number;
  avulsos: number;
  /** AM-27: trocou com um colega (troca aprovada) — não é falta, fora do percentual. */
  substituidos?: number;
  percentual: number | null;
}

export interface LinhaAssiduidade extends NumerosAssiduidade {
  id: string;
  nome: string;
  /** Médium: ativo na casa. */
  ativo?: boolean | null;
  /** Grupo: chave da cor e número de membros. */
  cor?: string | null;
  membros?: number | null;
}

export interface AssiduidadeResponse {
  inicio: string;
  fim: string;
  agrupar: Agrupar;
  tipo: TipoMini | null;
  grupo: { id: string; nome: string; cor: string } | null;
  atividades_com_chamada: number;
  atividades_sem_chamada: number;
  totais: NumerosAssiduidade;
  linhas: LinhaAssiduidade[];
}

export type CategoriaAssiduidade =
  | 'presente'
  | 'ausente_justificado'
  | 'ausente'
  | 'sem_chamada'
  | 'dispensado'
  | 'substituido'
  | 'avulso'
  | 'futura';

export interface ItemAssiduidade {
  atividade_id: string;
  origem: 'gira' | 'atividade';
  ref_id: string;
  titulo: string;
  inicio: string;
  tipo: TipoMini;
  situacao: Situacao;
  categoria: CategoriaAssiduidade;
  conta_no_percentual: boolean;
  chamada_encerrada: boolean;
  cancelada: boolean;
  tem_justificativa: boolean;
  /** Só nesta tela (ESCALAS:view) — nunca no PDF. */
  justificativa: string | null;
  /** Abono (AM-27): null (não avaliada), "aceita" ou "recusada". */
  justificativa_avaliacao?: 'aceita' | 'recusada' | null;
  /** De onde veio a convocação ("troca": foi no lugar de um colega). */
  medium_origem?: string | null;
}

export interface DetalheAssiduidade {
  medium: { id: string; nome: string; ativo: boolean };
  inicio: string;
  fim: string;
  tipo: TipoMini | null;
  resumo: NumerosAssiduidade;
  itens: ItemAssiduidade[];
}

/** O que a categoria quer dizer no detalhe (complementa a situação). */
export const NOTA_CATEGORIA: Partial<Record<CategoriaAssiduidade, string>> = {
  sem_chamada: 'Sem chamada encerrada — fora do percentual',
  dispensado: 'Fora da escala ou cancelada — fora do percentual',
  substituido: 'Trocou com um colega — não é falta, fora do percentual',
  avulso: 'Veio sem estar na escala — fora do percentual',
  futura: 'Ainda não aconteceu',
};

export type PresetPeriodo = 'mes' | 'tres_meses' | 'ano' | 'personalizado';

export const OPCOES_PERIODO: readonly { valor: PresetPeriodo; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'tres_meses', rotulo: 'Últimos 3 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'personalizado', rotulo: 'Escolher datas' },
];

/** Período (ISO, dias de Brasília) de um atalho. "Últimos 3 meses" = este mês e os 2 anteriores. */
export function periodoDoPreset(
  preset: Exclude<PresetPeriodo, 'personalizado'>,
  now: Date = new Date(),
): { inicio: string; fim: string } {
  const mes = currentMonthBr(now);
  if (preset === 'ano') {
    const ano = todayBr(now).slice(0, 4);
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }
  const { end } = monthRangeIso(mes);
  const inicioMes = preset === 'tres_meses' ? addMonthsYm(mes, -2) : mes;
  return { inicio: monthRangeIso(inicioMes).start, fim: end };
}

/** O backend aceita até um ano por consulta. */
export const DIAS_MAXIMO = 366;

export function periodoValido(p: { inicio: string | null; fim: string | null }): string | null {
  if (!p.inicio || !p.fim) return 'Escolha a data inicial e a final.';
  if (p.fim < p.inicio) return 'A data final precisa ser depois da inicial.';
  const dias = (Date.parse(`${p.fim}T00:00:00Z`) - Date.parse(`${p.inicio}T00:00:00Z`)) / 86_400_000;
  if (dias > DIAS_MAXIMO) return 'Escolha um período de até um ano.';
  return null;
}

export function formatPercentual(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${p}%`;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export interface LinhaPdf extends NumerosAssiduidade {
  nome: string;
}

export interface AssiduidadePdfData {
  agrupar: Agrupar;
  inicio: string;
  fim: string;
  /** "Tipo: Faxina", "Grupo: G1"… (só rótulos de filtro). */
  filtros: string[];
  atividadesComChamada: number;
  atividadesSemChamada: number;
  linhas: LinhaPdf[];
  totais: NumerosAssiduidade;
}

function numeros(n: NumerosAssiduidade): NumerosAssiduidade {
  return {
    convocacoes: n.convocacoes,
    presencas: n.presencas,
    ausencias_justificadas: n.ausencias_justificadas,
    ausencias_sem_justificativa: n.ausencias_sem_justificativa,
    sem_chamada: n.sem_chamada,
    dispensados: n.dispensados,
    avulsos: n.avulsos,
    percentual: n.percentual,
  };
}

/**
 * Dados do PDF a partir do agregado, campo a campo: só nomes e contagens ("com/sem
 * justificativa"), nunca o texto do motivo (§6.8). `linhas` na ordem em que a tela mostra.
 */
export function dadosDoPdf(resp: AssiduidadeResponse, linhas: LinhaAssiduidade[] = resp.linhas): AssiduidadePdfData {
  const filtros: string[] = [];
  if (resp.tipo) filtros.push(`Tipo: ${resp.tipo.nome}`);
  if (resp.grupo) filtros.push(`Grupo: ${resp.grupo.nome}`);
  return {
    agrupar: resp.agrupar,
    inicio: resp.inicio,
    fim: resp.fim,
    filtros,
    atividadesComChamada: resp.atividades_com_chamada,
    atividadesSemChamada: resp.atividades_sem_chamada,
    linhas: linhas.map((l) => ({ nome: l.nome, ...numeros(l) })),
    totais: numeros(resp.totais),
  };
}
