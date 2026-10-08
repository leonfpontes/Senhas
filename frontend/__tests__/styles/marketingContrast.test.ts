/**
 * Contraste da paleta "terra" das páginas de marketing (V-08, globals.css `@theme`).
 * Trava os pares texto/fundo usados na landing e em /planos em WCAG AA (4,5:1).
 */
import fs from 'fs';
import path from 'path';
import { applyTerraBrandText, brandTextColorOn, contrastRatio, pickForeground, TERRA_SURFACES } from '@/lib/brand';

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

/**
 * Área do Médium (AM-06, `.medium-terra`): paleta terra com a cor do terreiro nos detalhes, nos
 * modos claro e escuro (segue o sistema). Trava os pares de texto da casca e das telas (faixa café,
 * cartões, caixas, etiquetas de status) e o `text-brand` calculado por applyTerraBrandText para
 * qualquer cor de terreiro.
 */
function cssVars(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${selector} não encontrado em globals.css`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

/** `var(--color-x)` → hex da paleta; hex literal passa direto. */
function resolve(value: string): string {
  const v = value.match(/^var\(--color-([\w-]+)\)$/);
  return v ? color(v[1]) : value;
}

function mixHex(fg: string, bg: string, alpha: number): string {
  const f = fg.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = bg.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

const terraLight = cssVars('.medium-terra');
const terraDark = { ...terraLight, ...cssVars('.dark .medium-terra,\n.dark.medium-terra') };
const semanticLight = cssVars(':root');
const semanticDark = { ...semanticLight, ...cssVars('.dark') };

// Cores de terreiro difíceis: amarelo, índigo padrão, verde da casa, quase preto, branco, vermelho, ouro.
const BRANDS = ['#f5d90a', '#4f46e5', '#2f6b4f', '#111111', '#ffffff', '#d32f2f', '#e9b04a', '#6366f1'];

describe('Área do Médium — paleta terra com a marca do terreiro', () => {
  it('não redefine a cor do terreiro (vem do applyBrand) e usa o texto da marca calculado para a paleta', () => {
    expect(terraLight.primary).toBeUndefined();
    expect(terraLight['primary-foreground']).toBeUndefined();
    expect(terraLight['primary-text']).toBe('var(--terra-brand-text-light, var(--color-barro-700))');
    expect(terraDark['primary-text']).toBe('var(--terra-brand-text-dark, var(--color-ouro-300))');
  });

  it('TERRA_SURFACES espelha os fundos da classe (cartão, fundo e caixa)', () => {
    expect([...TERRA_SURFACES.light]).toEqual([resolve(terraLight.card), resolve(terraLight.background), resolve(terraLight.muted)]);
    expect([...TERRA_SURFACES.dark]).toEqual([resolve(terraDark.card), resolve(terraDark.background), resolve(terraDark.muted)]);
  });

  describe.each([
    ['claro', terraLight, semanticLight],
    ['escuro', terraDark, semanticDark],
  ])('modo %s', (_modo, t, sem) => {
    const surfaces = [resolve(t.background), resolve(t.card), resolve(t.muted)];

    it.each(['foreground', 'muted-foreground', 'card-foreground'])('%s lê no fundo, no cartão e na caixa', (k) => {
      surfaces.forEach((bg) => expect(contrastRatio(resolve(t[k]), bg)).toBeGreaterThanOrEqual(4.5));
    });

    it('a cor padrão de text-brand (sem terreiro) lê nas superfícies', () => {
      const fallback = color(t['primary-text'].match(/--color-([\w-]+)\)\)$/)![1]);
      surfaces.forEach((bg) => expect(contrastRatio(fallback, bg)).toBeGreaterThanOrEqual(4.5));
    });

    it.each(['success', 'warning', 'info', 'destructive'])('text-%s-strong lê sobre bg-%s/15 no cartão da Área', (c) => {
      expect(contrastRatio(sem[`${c}-strong`], mixHex(sem[c], resolve(t.card), 0.15))).toBeGreaterThanOrEqual(4.5);
    });
  });

  it.each(BRANDS)('text-brand do terreiro %s lê nas superfícies e no fundo suave da marca, nos dois modos', (brand) => {
    (['light', 'dark'] as const).forEach((mode) => {
      const text = brandTextColorOn(brand, mode, TERRA_SURFACES[mode]);
      TERRA_SURFACES[mode].forEach((bg) => {
        expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
        // bg-primary/10 e /15 (ícones, cartões de área, itens do perfil) sobre cada superfície.
        expect(contrastRatio(text, mixHex(brand, bg, 0.15))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(text, mixHex(brand, bg, 0.1))).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

  it.each(BRANDS)('botão, aba e data na cor do terreiro %s têm texto legível (primary-foreground)', (brand) => {
    expect(contrastRatio(pickForeground(brand, '#FFFFFF'), brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('applyTerraBrandText escreve as duas cores no elemento', () => {
    const el = document.createElement('div');
    applyTerraBrandText(el, '#f5d90a');
    expect(contrastRatio(el.style.getPropertyValue('--terra-brand-text-light'), '#fcf8f2')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(el.style.getPropertyValue('--terra-brand-text-dark'), '#180e09')).toBeGreaterThanOrEqual(4.5);
  });

  // Faixa café do Início, do Perfil e da escolha de área: eyebrow ouro, texto areia, título branco.
  it.each(['ouro-300', 'areia-100', 'areia-200'])('%s sobre café-950 (faixa café da Área) passa de 4,5:1', (fg) => {
    expect(contrastRatio(color(fg), color('cafe-950'))).toBeGreaterThanOrEqual(4.5);
  });
});
