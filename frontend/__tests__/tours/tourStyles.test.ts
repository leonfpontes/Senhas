/**
 * O balão do tour não pode usar cor fixa: com o fundo `#fff` padrão do
 * reactour e `color: inherit`, o texto ficava claro sobre branco no modo escuro.
 */
import { tourStyles } from '@/tours/tourStyles';

describe('tourStyles', () => {
  const base = { backgroundColor: '#fff', color: 'inherit' };

  it('pinta o balão com os tokens do tema (claro e escuro)', () => {
    const s = tourStyles.popover(base);
    expect(s.backgroundColor).toBe('var(--popover)');
    expect(s.color).toBe('var(--popover-foreground)');
  });

  it('setas, pontos, selo e fechar também seguem o tema', () => {
    expect(tourStyles.arrow({ color: '#646464' }).color).toBe('var(--popover-foreground)');
    expect(tourStyles.dot({}, { current: true }).background).toBe('var(--primary)');
    expect(tourStyles.dot({}, { current: false }).border).toContain('var(--muted-foreground)');
    expect(tourStyles.badge({}).color).toBe('var(--primary-foreground)');
    expect(tourStyles.close({})['--rt-close-btn']).toBe('var(--muted-foreground)');
  });

  it('nenhum estilo deixa cor fixa (hex) que ignore o modo escuro', () => {
    const all = [
      tourStyles.popover(base),
      tourStyles.badge({}),
      tourStyles.arrow({}),
      tourStyles.dot({}, { current: true }),
      tourStyles.dot({}, { current: false }),
      tourStyles.close({}),
    ];
    for (const s of all) {
      for (const [k, v] of Object.entries(s)) {
        if (k === 'boxShadow') continue;
        expect(String(v)).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      }
    }
  });
});
