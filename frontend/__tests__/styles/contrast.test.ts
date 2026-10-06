/**
 * Contraste dos tokens de cor (src/styles/globals.css) nos modos claro e escuro.
 *
 * Em 2026-10-06 etiquetas de status sumiam: `text-warning-foreground` (branco no claro, preto
 * no escuro) em cima de fundo suave, e o laranja/azul do MUI em ~3:1 como texto. Este teste
 * trava a regra: todo par texto/fundo que o kit usa passa de WCAG AA (4,5:1).
 */
import fs from 'fs';
import path from 'path';
import { contrastRatio } from '@/lib/brand';

const css = fs.readFileSync(path.join(__dirname, '../../src/styles/globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = block(':root');
const dark = { ...light, ...block('.dark') };

/** rgba(0,0,0,.87) → hex sobre o fundo (para o par foreground/sólido do modo escuro). */
function solid(color: string, bg: string): string {
  const m = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return color;
  const a = Number(m[4]);
  const b = bg.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `#${[1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + b[k] * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
}

function mix(fg: string, bg: string, alpha: number): string {
  const f = fg.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = bg.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

const SEMANTIC = ['success', 'warning', 'info', 'destructive'] as const;

describe.each([
  ['claro', light],
  ['escuro', dark],
])('modo %s', (_mode, t) => {
  const surfaces = [t.background, t.card];

  it.each(SEMANTIC)('text-%s lê sobre o fundo e o card', (c) => {
    surfaces.forEach((bg) => expect(contrastRatio(t[c], bg)).toBeGreaterThanOrEqual(4.5));
  });

  it.each(SEMANTIC)('text-%s-strong lê sobre o fundo suave bg-%s/15', (c) => {
    expect(contrastRatio(t[`${c}-strong`], mix(t[c], t.card, 0.15))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SEMANTIC.filter((c) => c !== 'destructive'))('%s-foreground lê sobre o sólido', (c) => {
    expect(contrastRatio(solid(t[`${c}-foreground`], t[c]), t[c])).toBeGreaterThanOrEqual(4.5);
  });

  it('texto secundário (muted-foreground) lê sobre o fundo e o card', () => {
    surfaces.forEach((bg) => expect(contrastRatio(t['muted-foreground'], bg)).toBeGreaterThanOrEqual(4.5));
  });

  it('a cor padrão de text-brand lê sobre o fundo e o card', () => {
    const fallback = t['primary-text'].match(/#[0-9a-f]{6}/i)![0];
    surfaces.forEach((bg) => expect(contrastRatio(fallback, bg)).toBeGreaterThanOrEqual(4.5));
  });
});
