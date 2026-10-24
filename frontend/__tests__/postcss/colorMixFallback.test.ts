/**
 * @jest-environment node
 *
 * postcss/colorMixFallback.js — fallback de opacidade para navegador sem `color-mix()` (o iPad
 * preso no iOS 15 pintava `bg-success/15` com a cor cheia). Os exemplos copiam a saída real do
 * Tailwind v4: aninhada no dev, achatada e minificada (com regras juntadas) no build.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const postcss = require('postcss');
const colorMixFallback = require('../../postcss/colorMixFallback');

const { channels } = colorMixFallback;
const run = (css: string): string => postcss([colorMixFallback]).process(css, { from: undefined }).css;

describe('colorMixFallback — canais dos tokens', () => {
  it('converte cores opacas em "r g b"', () => {
    expect(channels('#2e7d32')).toBe('46 125 50');
    expect(channels('#fff')).toBe('255 255 255');
    expect(channels('#ffffffff')).toBe('255 255 255');
    expect(channels('rgb(15, 23, 42)')).toBe('15 23 42');
    expect(channels('white')).toBe('255 255 255');
    // emerald-200 do Tailwind = #a4f4cf
    expect(channels('oklch(90.5% .093 164.15)')).toBe('164 244 207');
  });

  it('ignora cor translúcida (o fallback fica transparente, nunca a cor cheia)', () => {
    expect(channels('rgba(255, 255, 255, 0.16)')).toBeNull();
    expect(channels('#ffffff29')).toBeNull();
    expect(channels('oklch(70% .1 200 / 50%)')).toBeNull();
    expect(channels('currentcolor')).toBeNull();
  });

  it('declara --X-rgb ao lado do token, seguindo var() com fallback', () => {
    const out = run(':root{--success:#2e7d32;--primary-text:var(--brand-text-light,#4338ca);--border:#ffffff14}');
    expect(out).toContain('--success:#2e7d32;--success-rgb:46 125 50');
    expect(out).toContain('--primary-text-rgb:var(--brand-text-light-rgb, 67 56 202)');
    expect(out).not.toContain('--border-rgb');
  });
});

describe('colorMixFallback — fallback das classes com opacidade', () => {
  it('CSS aninhado (dev)', () => {
    const out = run(`.bg-success\\/15 {
  background-color: var(--success);
  @supports (color: color-mix(in lab, red, red)) {
    background-color: color-mix(in oklab, var(--success) 15%, transparent);
  }
}`);
    expect(out).toContain('background-color: rgb(var(--success-rgb) / 15%);');
    expect(out).toContain('color-mix(in oklab, var(--success) 15%, transparent)');
  });

  it('CSS achatado e minificado (build)', () => {
    const out = run(
      '.bg-success\\/15{background-color:var(--success)}' +
        '@supports (color:color-mix(in lab,red,red)){.bg-success\\/15{background-color:color-mix(in oklab,var(--success) 15%,transparent)}}',
    );
    expect(out).toContain('.bg-success\\/15{background-color:rgb(var(--success-rgb) / 15%)}');
  });

  it('separa a regra que o minificador juntou, sem mexer na classe de cor cheia', () => {
    const out = run(
      '.bg-warning,.bg-warning\\/5{background-color:var(--warning)}' +
        '@supports (color:color-mix(in lab,red,red)){.bg-warning\\/5{background-color:color-mix(in oklab,var(--warning) 5%,transparent)}}',
    );
    expect(out).toContain('.bg-warning{background-color:var(--warning)}');
    expect(out).toContain('.bg-warning\\/5{background-color:rgb(var(--warning-rgb) / 5%)}');
  });

  it('deixa como está o que não sabe reescrever (currentcolor)', () => {
    const css =
      '.x{outline-color:currentcolor}' +
      '@supports (color:color-mix(in lab,red,red)){.x{outline-color:color-mix(in oklab,currentcolor 50%,transparent)}}';
    expect(run(css)).toBe(css);
  });
});
