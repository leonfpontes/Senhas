/**
 * Escala por função (AM-18) — tipos da API e regras de tela.
 *
 * API: `api/v1/admin/atividades_escala.py` (GET/PUT `/admin/atividades/{id}/escala`,
 * `POST .../escala/copiar-anterior`, `POST .../escala/rodizio`, `POST /admin/atividades/da-gira/
 * {gira_id}/escala`). `rodizio` é o espelho da função pura `services/escala_gira.rodizio` (a prévia
 * do drawer usa a mesma ordem circular que o servidor grava).
 */
import type { Resposta } from '@/constants/presenca';
import type { TipoMini } from '@/constants/atividades';

export const API_ESCALA = '/api/v1/admin/atividades';
export const RODIZIO_MAX_ATIVIDADES = 12;
export const RODIZIO_MAX_POR_VEZ = 20;

export interface PessoaEscala {
  medium_id: string;
  nome: string;
  origem: string;
  resposta: Resposta;
}

export interface GrupoNaFuncao {
  id: string;
  nome: string;
  cor: string;
  mediuns: PessoaEscala[];
}

export interface FuncaoNaEscala {
  id: string;
  nome: string;
  descricao?: string | null;
  arquivada: boolean;
  mediuns: PessoaEscala[];
  grupos: GrupoNaFuncao[];
}

export interface EscalaResponse {
  atividade: {
    atividade_id: string;
    origem: 'gira' | 'atividade';
    ref_id: string;
    titulo: string;
    inicio: string;
    fim?: string | null;
    local?: string | null;
    tipo: TipoMini;
    convocacao_padrao: 'todos_elegiveis' | 'so_escalados';
    cancelada: boolean;
    chamada_encerrada: boolean;
    pode_editar: boolean;
  };
  funcoes: FuncaoNaEscala[];
  tirados: { medium_id: string; nome: string; funcao?: string | null }[];
  elegiveis: { id: string; nome: string }[];
  anterior?: { atividade_id: string; titulo: string; inicio: string } | null;
  total_na_escala: number;
}

export interface EscalaResultado {
  novos: number;
  trocados: number;
  mantidos: number;
  tirados: number;
  fora_da_elegibilidade_nomes: string[];
  repetidos_nomes: string[];
  em_outra_funcao_nomes: string[];
}

export interface EscalaSalvaResponse extends EscalaResponse {
  resultado: EscalaResultado;
}

export interface RodizioAtividade {
  atividade_id: string;
  origem: 'gira' | 'atividade';
  ref_id: string;
  titulo: string;
  inicio: string;
  escolhidos: string[];
  em_outra_funcao_nomes: string[];
}

export interface RodizioResponse extends EscalaResponse {
  rodizio: RodizioAtividade[];
}

/** O que a tela edita: por função, médiuns um a um e grupos inteiros. */
export type Rascunho = Record<string, { mediumIds: string[]; grupoIds: string[] }>;

export function rascunhoDe(escala: EscalaResponse): Rascunho {
  const out: Rascunho = {};
  for (const f of escala.funcoes) {
    out[f.id] = { mediumIds: f.mediuns.map((m) => m.medium_id), grupoIds: f.grupos.map((g) => g.id) };
  }
  return out;
}

export function mesmoRascunho(a: Rascunho, b: Rascunho): boolean {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of chaves) {
    const x = a[k] ?? { mediumIds: [], grupoIds: [] };
    const y = b[k] ?? { mediumIds: [], grupoIds: [] };
    if ([...x.mediumIds].sort().join() !== [...y.mediumIds].sort().join()) return false;
    if ([...x.grupoIds].sort().join() !== [...y.grupoIds].sort().join()) return false;
  }
  return true;
}

/** Corpo do PUT: só as funções com alguém. */
export function corpoDoRascunho(r: Rascunho) {
  return {
    funcoes: Object.entries(r)
      .filter(([, v]) => v.mediumIds.length > 0 || v.grupoIds.length > 0)
      .map(([funcao_id, v]) => ({ funcao_id, medium_ids: v.mediumIds, grupo_ids: v.grupoIds })),
  };
}

/** Rodízio: a atividade i recebe `porVez` itens a partir de `i * porVez`, dando a volta. */
export function rodizio<T>(ordem: T[], quantidade: number, porVez = 1, comecaEm = 0): T[][] {
  const itens = Array.from(new Set(ordem));
  if (itens.length === 0 || quantidade < 1 || porVez < 1) return [];
  const k = Math.min(porVez, itens.length);
  return Array.from({ length: quantidade }, (_, i) =>
    Array.from({ length: k }, (__, j) => itens[(comecaEm + i * porVez + j) % itens.length]),
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Uma frase para o toast depois de salvar/copiar. */
export function textoResultadoEscala(r: EscalaResultado): string {
  const partes: string[] = [];
  if (r.novos) partes.push(`${plural(r.novos, 'médium entrou', 'médiuns entraram')} na escala`);
  if (r.trocados) partes.push(`${plural(r.trocados, 'trocou', 'trocaram')} de função`);
  if (r.tirados) partes.push(`${plural(r.tirados, 'saiu', 'saíram')} da escala`);
  if (partes.length === 0) partes.push('Escala salva sem mudanças');
  if (r.fora_da_elegibilidade_nomes.length)
    partes.push(`fora de quem pode participar: ${r.fora_da_elegibilidade_nomes.join(', ')}`);
  if (r.repetidos_nomes.length)
    partes.push(`em dois grupos, ficou na primeira função: ${r.repetidos_nomes.join(', ')}`);
  return `${partes.join(' · ')}.`;
}

/** "Cambone: Ana, Beto · Porteiro: G1 (3)" — o resumo em texto da escala. */
export function resumoDaEscala(escala: EscalaResponse): string {
  const partes = escala.funcoes
    .filter((f) => f.mediuns.length > 0 || f.grupos.length > 0)
    .map((f) => {
      const nomes = [
        ...f.grupos.map((g) => `${g.nome} (${g.mediuns.length})`),
        ...f.mediuns.map((m) => m.nome.split(/\s+/)[0]),
      ];
      return `${f.nome}: ${nomes.join(', ')}`;
    });
  return partes.length ? partes.join(' · ') : 'Ninguém escalado ainda.';
}
