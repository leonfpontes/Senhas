/**
 * Celular: nada pode alargar a página além da tela. Quando um elemento passava da largura, o
 * navegador "afastava o zoom" e o painel inteiro ficava em ~70% da tela, com cards cortados à
 * direita (visto em /admin/dashboard e /admin/giras com nome de gira comprido).
 *
 * Causas travadas aqui:
 * - `grid gap-3 md:grid-cols-2` sem `grid-cols-*` na base = coluna implícita `auto`, que cresce até
 *   o título `truncate` mais comprido. globals.css define a coluna única padrão `minmax(0, 1fr)`;
 * - barra de abas (`TabsList`) mais larga que a tela: rola dentro dela, não alarga a página.
 *
 * Conferido de verdade no navegador (Playwright, 390px): scrollWidth === largura da tela.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../../src');
const css = fs.readFileSync(path.join(SRC, 'styles/globals.css'), 'utf8');
const tabs = fs.readFileSync(path.join(SRC, 'components/ui/tabs.tsx'), 'utf8');

it('grid sem grid-cols-* na base tem coluna única minmax(0, 1fr), em @layer base', () => {
  const m = css.match(/@layer base \{\s*\.grid:not\(\[class\*='grid-flow-col'\]\):not\(\[class\*='auto-cols-'\]\) \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  // Em @layer base para que qualquer utilitário grid-cols-* (camada utilities) continue vencendo.
  expect(m).not.toBeNull();
});

it('TabsList não alarga a página: rola dentro da própria barra', () => {
  const variants = tabs.slice(tabs.indexOf('const tabsListVariants'));
  expect(variants).toMatch(/max-w-full/);
  expect(variants).toMatch(/overflow-x-auto/);
  // `center-safe`: quando transborda alinha à esquerda, sem esconder a primeira aba.
  expect(variants).toMatch(/justify-center-safe/);
});
