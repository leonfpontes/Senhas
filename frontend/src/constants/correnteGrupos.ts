/**
 * Grupos da corrente (AM-23) — paleta fechada de cores.
 *
 * As chaves espelham `CORES_GRUPO` de `backend/src/models/corrente_grupos.py` (CHECK no banco,
 * migração 075; `tests/unit/test_am23_grupos.py` confere que as listas batem). O grupo guarda a
 * CHAVE, nunca o hex: a cor pode ser ajustada aqui sem migração.
 *
 * Cada cor é usada como fundo sólido com texto branco (`GrupoChip`) e como bolinha ao lado do
 * nome. Todas têm contraste AA (≥ 4,5) com branco — `__tests__/constants/correnteGrupos.test.ts`
 * trava isso. As três primeiras são as do protótipo (G1 âmbar, G2 petróleo, G3 violeta).
 */
export type CorGrupo = 'ambar' | 'petroleo' | 'violeta' | 'azul' | 'verde' | 'vinho' | 'terra' | 'grafite';

export interface CorGrupoInfo {
  chave: CorGrupo;
  nome: string;
  hex: string;
}

export const CORES_GRUPO: readonly CorGrupoInfo[] = [
  { chave: 'ambar', nome: 'Âmbar', hex: '#b45309' },
  { chave: 'petroleo', nome: 'Petróleo', hex: '#0f766e' },
  { chave: 'violeta', nome: 'Violeta', hex: '#7c3aed' },
  { chave: 'azul', nome: 'Azul', hex: '#1d4ed8' },
  { chave: 'verde', nome: 'Verde', hex: '#15803d' },
  { chave: 'vinho', nome: 'Vinho', hex: '#be123c' },
  { chave: 'terra', nome: 'Terra', hex: '#9a3412' },
  { chave: 'grafite', nome: 'Grafite', hex: '#475569' },
];

export const COR_GRUPO_PADRAO: CorGrupo = 'ambar';

const POR_CHAVE = new Map(CORES_GRUPO.map((c) => [c.chave, c]));

/** Hex da cor do grupo; chave desconhecida cai no grafite (neutro, também AA). */
export function corDoGrupo(chave: string | null | undefined): string {
  return (chave && POR_CHAVE.get(chave as CorGrupo)?.hex) || '#475569';
}

/** Primeira cor da paleta que nenhum grupo usa ainda (sugestão ao criar). */
export function proximaCorLivre(usadas: readonly string[]): CorGrupo {
  return CORES_GRUPO.find((c) => !usadas.includes(c.chave))?.chave ?? COR_GRUPO_PADRAO;
}

/** Grupo como chega da API (resumo). */
export interface GrupoResumo {
  id: string;
  nome: string;
  cor: string;
}

/** `GET /api/v1/admin/corrente-grupos/opcoes` — grupos ativos, sem os nomes dos médiuns. */
export interface GrupoOpcao extends GrupoResumo {
  total_membros: number;
}
