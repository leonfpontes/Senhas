/**
 * Contraste da paleta "terra" das páginas de marketing (V-08, globals.css `@theme`).
 * Trava os pares texto/fundo usados na landing e em /planos em WCAG AA (4,5:1).
 */
import fs from 'fs';
import path from 'path';
import { contrastRatio } from '@/lib/brand';

const css = fs.readFileSync(path.join(__dirname, '../../src/styles/globals.css'), 'utf8');

function color(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`token --color-${name} não encontrado em globals.css`);
  return m[1];
}

const WHITE = '#ffffff';

/** [texto, fundo, onde aparece] */
const PAIRS: [string, string, string][] = [
  ['tinta', 'areia-50', 'títulos e texto no fundo claro'],
  ['tinta', 'areia-100', 'texto nas seções creme'],
  ['tinta-suave', 'areia-50', 'texto de apoio'],
  ['tinta-suave', 'areia-100', 'texto de apoio nas seções creme'],
  ['barro-700', 'areia-50', 'rótulos das seções e links'],
  ['barro-700', 'areia-100', 'selo de plano nos módulos'],
  ['areia-100', 'cafe-900', 'texto nas seções escuras'],
  ['areia-200', 'cafe-950', 'texto do topo e do menu'],
  ['areia-300', 'cafe-950', 'rodapé'],
  ['ouro-300', 'cafe-900', 'destaques nas seções escuras'],
  ['cafe-950', 'ouro-400', 'botão principal'],
];

describe('paleta de marketing', () => {
  it.each(PAIRS)('%s sobre %s (%s) passa de 4,5:1', (fg, bg) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['barro-600', 'barro-700', 'folha-600', 'folha-700', 'cafe-900'])('branco sobre %s passa de 4,5:1', (bg) => {
    expect(contrastRatio(WHITE, color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  // Telas de conta (AuthShell): cartão branco sobre areia, links e passos em barro-700.
  it.each(['tinta', 'tinta-suave', 'barro-700'])('%s sobre o cartão branco das telas de conta passa de 4,5:1', (fg) => {
    expect(contrastRatio(color(fg), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('a classe auth-terra usa só tokens da paleta para marca, texto de marca e texto de apoio', () => {
    const scope = css.split('.auth-terra {')[1]?.split('}')[0] ?? '';
    expect(scope).toMatch(/--primary:\s*var\(--color-barro-600\)/);
    expect(scope).toMatch(/--primary-text:\s*var\(--color-barro-700\)/);
    expect(scope).toMatch(/--muted-foreground:\s*var\(--color-tinta-suave\)/);
  });
});
