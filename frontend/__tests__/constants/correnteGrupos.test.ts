/**
 * AM-23 — paleta fechada dos grupos da corrente: toda cor tem contraste AA (≥ 4,5) com o texto
 * branco do `GrupoChip`. As chaves espelham o backend (`tests/unit/test_am23_grupos.py`).
 */
import { contrastRatio } from '@/lib/brand';
import { CORES_GRUPO, COR_GRUPO_PADRAO, corDoGrupo, proximaCorLivre } from '@/constants/correnteGrupos';

describe('paleta dos grupos da corrente', () => {
  it.each(CORES_GRUPO.map((c) => [c.chave, c.hex]))('%s (%s) tem contraste AA com branco', (_chave, hex) => {
    expect(contrastRatio(hex, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('chaves únicas, padrão é a primeira e as três primeiras são as do protótipo', () => {
    const chaves = CORES_GRUPO.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(COR_GRUPO_PADRAO).toBe(chaves[0]);
    expect(chaves.slice(0, 3)).toEqual(['ambar', 'petroleo', 'violeta']);
  });

  it('corDoGrupo: hex da chave; desconhecida cai num neutro que também é AA', () => {
    expect(corDoGrupo('petroleo')).toBe('#0f766e');
    for (const ruim of ['', null, undefined, 'rosa']) {
      expect(contrastRatio(corDoGrupo(ruim), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('proximaCorLivre sugere a primeira cor ainda não usada', () => {
    expect(proximaCorLivre([])).toBe('ambar');
    expect(proximaCorLivre(['ambar', 'violeta'])).toBe('petroleo');
    expect(proximaCorLivre(CORES_GRUPO.map((c) => c.chave))).toBe('ambar');
  });
});
