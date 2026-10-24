/**
 * PostCSS — Tailwind v4 via @tailwindcss/postcss.
 * O Next.js aplica este config a todo CSS importado (src/styles/globals.css).
 *
 * Depois do Tailwind, `postcss/colorMixFallback.js` troca o fallback de cor cheia das classes
 * com opacidade (`bg-success/15`) por `rgb(var(--success-rgb) / 15%)`: o Safari do iOS 15 não
 * tem `color-mix()` e pintava tags e cartões com a cor sólida.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    './postcss/colorMixFallback.js': {},
  },
};

export default config;
