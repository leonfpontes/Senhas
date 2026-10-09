/**
 * Ficha espiritual do médium (F-05, painel) e "Minha caminhada" (AM-19, Área do Médium).
 *
 * Dado religioso (LGPD art. 11): a casa só grava com o consentimento explícito do médium, dado na
 * Área ou registrado pela direção no painel com o texto abaixo. A versão é espelho de
 * `CONSENTIMENTO_FICHA_VERSAO` em `backend/src/services/ficha_espiritual.py` (o teste
 * `tests/unit/test_f05_ficha.py` confere). Mudou o texto → suba a versão nos dois lugares.
 */
export const FICHA_CONSENTIMENTO_VERSAO = '1';

export const API_FICHA_ADMIN = '/api/v1/admin/mediuns';
export const API_FICHA_CAMPOS = `${API_FICHA_ADMIN}/ficha-campos`;
export const API_FICHA_AREA = '/api/v1/medium/ficha';

export type TipoCampoFicha = 'texto' | 'data' | 'lista' | 'sim_nao';
export type TradicaoFicha = 'umbanda' | 'candomble' | 'outra';
export type TipoMarco = 'entrada' | 'batismo' | 'obrigacao' | 'coroacao' | 'outro';

export const TIPOS_CAMPO: { value: TipoCampoFicha; label: string }[] = [
  { value: 'texto', label: 'Texto' },
  { value: 'data', label: 'Data' },
  { value: 'lista', label: 'Lista de opções' },
  { value: 'sim_nao', label: 'Sim ou não' },
];

export const TRADICOES: { value: TradicaoFicha; label: string }[] = [
  { value: 'umbanda', label: 'Umbanda' },
  { value: 'candomble', label: 'Candomblé' },
  { value: 'outra', label: 'Outra' },
];

export const TIPOS_MARCO: { value: TipoMarco; label: string }[] = [
  { value: 'entrada', label: 'Entrada na casa' },
  { value: 'batismo', label: 'Batismo' },
  { value: 'obrigacao', label: 'Obrigação' },
  { value: 'coroacao', label: 'Coroação' },
  { value: 'outro', label: 'Outro marco' },
];

export function rotuloTipoMarco(tipo: string): string {
  return TIPOS_MARCO.find((t) => t.value === tipo)?.label ?? 'Marco';
}

export function rotuloTradicao(tradicao: string): string {
  return TRADICOES.find((t) => t.value === tradicao)?.label ?? 'Outra';
}

export interface ConsentimentoFicha {
  dado: boolean;
  em?: string | null;
  versao?: string | null;
  versao_atual: string;
  revogado_em?: string | null;
}

export interface CampoFicha {
  id: string;
  chave: string;
  rotulo: string;
  tipo: TipoCampoFicha;
  tradicao: TradicaoFicha;
  opcoes?: string[] | null;
  ordem: number;
  visivel_ao_medium: boolean;
  medium_pode_sugerir: boolean;
  arquivado_em?: string | null;
}

export interface CampoComValor extends CampoFicha {
  valor?: string | null;
  atualizado_em?: string | null;
}

export interface SugestaoFicha {
  id: string;
  medium_id: string;
  medium_nome: string;
  campo_id: string;
  campo_rotulo: string;
  valor_sugerido: string;
  valor_atual?: string | null;
  criado_em: string;
}

export interface FichaDoMedium {
  medium: { id: string; nome: string; is_active: boolean };
  consentimento: ConsentimentoFicha;
  registros_guardados: number;
  campos: CampoComValor[];
  sugestoes: SugestaoFicha[];
}

export interface MarcoCaminhada {
  id: string;
  tipo: TipoMarco;
  titulo: string;
  data: string;
  observacao?: string | null;
  visivel_ao_medium?: boolean;
}

export interface RevogacaoFicha {
  medium_id: string;
  medium_nome: string;
  revogado_em: string;
  registros_guardados: number;
}

export interface PendenciasFicha {
  sugestoes: SugestaoFicha[];
  revogacoes: RevogacaoFicha[];
}

/** Valor da ficha para leitura ("sim"/"nao" → Sim/Não; data ISO → dd/mm/aaaa). */
export function valorLegivel(tipo: string, valor?: string | null): string {
  if (!valor) return '—';
  if (tipo === 'sim_nao') return valor === 'sim' ? 'Sim' : 'Não';
  if (tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-');
    return `${d}/${m}/${a}`;
  }
  return valor;
}

/** Texto que a direção confirma no painel ao registrar a autorização dada pelo médium. */
export function consentimentoPainelLabel(nome: string): string {
  return `${nome} autorizou a casa a guardar os dados da ficha espiritual (orixás, guias, obrigações e marcos da caminhada).`;
}

export function termoFichaParagrafos(casa: string): string[] {
  return [
    `Ao autorizar, você deixa ${casa} guardar no GiraHub os dados da sua ficha espiritual: por exemplo orixá de cabeça, guias, datas de batismo, obrigações e outros marcos da sua caminhada.`,
    'Quem vê: só a direção da casa e as pessoas que ela escolher no painel. Os outros médiuns não veem nada seu. Você vê aqui o que a casa liberar.',
    'Por que pedimos: a sua religião é um dado sensível para a Lei Geral de Proteção de Dados (LGPD). Por isso a casa só guarda com o seu sim, separado do acesso à Área.',
    'Nada disso vai para e-mail, relatório ou planilha, nem é usado para outra finalidade.',
    'Você pode mudar de ideia quando quiser: ao retirar a autorização, os dados deixam de aparecer e a direção da casa é avisada para apagá-los.',
  ];
}

export const TERMO_FICHA_RODAPE = `Versão ${FICHA_CONSENTIMENTO_VERSAO} · outubro de 2026`;
