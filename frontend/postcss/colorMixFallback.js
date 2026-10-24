/**
 * PostCSS — fallback de transparência para navegador sem `color-mix()` (Safari/WebKit < 16.2,
 * o iPad de terreiro preso no iOS 15).
 *
 * O Tailwind v4 escreve as cores com opacidade (`bg-success/15`, `border-brand/30`…) como
 *
 *   .bg-success\/15 { background-color: var(--success) }
 *   @supports (color: color-mix(in lab, red, red)) {
 *     .bg-success\/15 { background-color: color-mix(in oklab, var(--success) 15%, transparent) }
 *   }
 *
 * Sem `color-mix` vale a primeira regra: a cor CHEIA. Tag vira bloco sólido com o texto da
 * mesma cor, cartão selecionado vira uma mancha. Este plugin (roda depois do Tailwind):
 *
 * 1. Ao lado de cada variável de cor opaca (`--success: #2e7d32`, `--color-cafe-950: …`,
 *    `--primary-text: var(--brand-text-light, #4338ca)`) declara os canais: `--success-rgb: 46 125 50`.
 *    As cores do terreiro, escritas em runtime, ganham os canais em `applyBrand` (lib/brand.ts).
 * 2. Troca o fallback sólido por `rgb(var(--success-rgb) / 15%)` — mesma cor do `color-mix` com
 *    transparente. Variável sem canal (cor já translúcida, ou escrita em runtime fora do
 *    applyBrand) deixa a declaração inválida e o navegador usa o valor inicial (fundo
 *    transparente): nunca mais a cor cheia.
 *
 * Funciona com o CSS aninhado (dev) e com o achatado/minificado do build, em que o lightningcss
 * junta regras iguais (`.bg-warning,.bg-warning\/5{…}`) — aí o seletor é separado.
 */
const MIX_RE = /color-mix\(\s*in\s+oklab\s*,\s*var\(\s*(--[\w-]+)\s*\)\s*([\d.]+%)\s*,\s*transparent\s*\)/g;

/** Canais "r g b" (0–255) de uma cor opaca literal; null se não for cor, ou se for translúcida. */
function channels(value) {
  const v = value.trim().toLowerCase();
  if (v === 'white') return '255 255 255';
  if (v === 'black') return '0 0 0';

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 8 && h.slice(6) !== 'ff') return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
  }

  const rgb = /^rgba?\(([^)]*)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 4 && parseFloat(parts[3]) * (parts[3].endsWith('%') ? 0.01 : 1) < 1) return null;
    const rgbParts = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
    if (rgbParts.length !== 3 || rgbParts.some(Number.isNaN)) return null;
    return rgbParts.map((n) => Math.round(n)).join(' ');
  }

  const oklch = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (oklch) {
    const [, l, c, h, alpha] = oklch;
    if (alpha !== undefined && parseFloat(alpha) * (alpha.endsWith('%') ? 0.01 : 1) < 1) return null;
    return oklchToRgb(l.endsWith('%') ? parseFloat(l) / 100 : parseFloat(l), parseFloat(c), parseFloat(h));
  }
  return null;
}

/** OKLCH → sRGB (Björn Ottosson), arredondado e preso em 0–255. */
function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear
    .map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))
    .map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255))
    .join(' ');
}

/** Valor do `--X-rgb` para a declaração `--X: value`, ou null. */
function channelValue(value) {
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (ref) {
    const [, name, fallback] = ref;
    if (fallback === undefined) return `var(${name}-rgb)`;
    const fb = channels(fallback);
    return fb ? `var(${name}-rgb, ${fb})` : null;
  }
  return channels(value);
}

/** Valor sem `color-mix` equivalente ao de dentro do @supports, ou null se não der. */
function fallbackValue(mixed) {
  const replaced = mixed.replace(MIX_RE, (_, name, pct) => `rgb(var(${name}-rgb) / ${pct})`);
  return replaced.includes('color-mix(') ? null : replaced;
}

function isColorMixSupports(node) {
  return node.type === 'atrule' && node.name === 'supports' && node.params.includes('color-mix');
}

/** Aninhado (dev): `.x { prop: fallback; @supports (…) { prop: color-mix(…) } }`. */
function fixNested(atRule) {
  const parent = atRule.parent;
  atRule.each((decl) => {
    if (decl.type !== 'decl') return;
    const value = fallbackValue(decl.value);
    if (!value) return;
    let prev = atRule.prev();
    while (prev && !(prev.type === 'decl' && prev.prop === decl.prop)) prev = prev.prev();
    if (prev && prev.parent === parent) prev.value = value;
  });
}

/** Achatado (build): regra irmã antes do `@supports`, possivelmente com seletores juntados. */
function fixFlat(atRule) {
  atRule.each((inner) => {
    if (inner.type !== 'rule') return;
    for (const selector of inner.selectors) {
      let prev = atRule.prev();
      while (prev && !(prev.type === 'rule' && prev.selectors.includes(selector))) prev = prev.prev();
      if (!prev) continue;
      const updates = [];
      inner.each((decl) => {
        if (decl.type !== 'decl') return;
        const value = fallbackValue(decl.value);
        if (value && prev.some((d) => d.type === 'decl' && d.prop === decl.prop)) updates.push([decl.prop, value]);
      });
      if (!updates.length) continue;
      let target = prev;
      if (prev.selectors.length > 1) {
        // Separa o seletor da regra juntada (as demais continuam com a cor cheia, que é a delas).
        prev.selectors = prev.selectors.filter((s) => s !== selector);
        target = prev.clone({ selectors: [selector] });
        prev.after(target);
      }
      for (const [prop, value] of updates) {
        target.walkDecls(prop, (d) => {
          d.value = value;
        });
      }
    }
  });
}

/** @type {import('postcss').PluginCreator<void>} */
const colorMixFallback = () => ({
  postcssPlugin: 'girahub-color-mix-fallback',
  OnceExit(root) {
    root.walkDecls(/^--/, (decl) => {
      if (decl.prop.endsWith('-rgb') || decl.prop.startsWith('--tw-')) return;
      const value = channelValue(decl.value);
      if (!value) return;
      const name = `${decl.prop}-rgb`;
      if (decl.parent.some((d) => d.type === 'decl' && d.prop === name)) return;
      decl.cloneAfter({ prop: name, value });
    });
    root.walkAtRules('supports', (atRule) => {
      if (!isColorMixSupports(atRule)) return;
      if (atRule.parent.type === 'rule') fixNested(atRule);
      else fixFlat(atRule);
    });
  },
});
colorMixFallback.postcss = true;

module.exports = colorMixFallback;
module.exports.channels = channels;
