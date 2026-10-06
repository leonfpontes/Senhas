/**
 * Cache do Emotion que coloca todo CSS do MUI dentro de `@layer mui`.
 *
 * O MUI v5 não tem `enableCssLayer`; este plugin stylis faz o equivalente: toda regra
 * de nível raiz gerada pelo Emotion (`.css-abc{...}`, `@media{...}`, `@keyframes{...}`,
 * globais do CssBaseline) vira `@layer mui{...}`. Combinado com a declaração
 * `@layer theme, base, mui, components, utilities;` em src/styles/globals.css:
 *
 *   - o MUI vence o reset escopado do shadcn (`base`);
 *   - os utilitários Tailwind (`utilities`) vencem o MUI — `className="mb-4"` funciona
 *     num componente MUI, sem `!important` nem `sx`.
 *
 * Usado em src/pages/_app.tsx via <CacheProvider>, acima dos ThemeProviders.
 */
import createCache, { type EmotionCache, type StylisPlugin } from '@emotion/cache';
import { prefixer, stringify } from 'stylis';

export const MUI_CSS_LAYER = 'mui';

/** Declaração de ordem das camadas — deve ser idêntica à de globals.css. */
export const CSS_LAYER_ORDER = `@layer theme, base, ${MUI_CSS_LAYER}, components, utilities;`;

/** Tipos de nó raiz que não fazem sentido dentro de uma camada. */
const SKIP_TYPES = new Set(['@layer', '@import', '@charset', 'comm', 'decl']);

/**
 * Plugin stylis: envolve cada elemento de nível raiz em `@layer mui { ... }`.
 *
 * "Raiz" no stylis é `element.root === null` — inclui as regras aninhadas com `&`, que o
 * parser desaninha para o nível raiz (mesmo critério do `rulesheet` do Emotion). Elementos
 * dentro de `@media`/`@supports` têm `root` definido e já saem dentro da camada do pai.
 *
 * O plugin serializa o elemento original aqui mesmo (`stringify`), guarda a versão
 * envolvida em `element.return` e esvazia `children`: assim o `stringify` final do Emotion
 * não produz nada e o `rulesheet` insere `element.return`. `type` e `props` ficam intactos,
 * então o plugin `compat` do Emotion (que percorre `parent.type === 'rule'`) continua
 * funcionando para as regras aninhadas.
 */
export const muiLayerPlugin: StylisPlugin = (element, index, children, callback) => {
  if (element.root !== null) return;
  if (SKIP_TYPES.has(element.type)) return;

  const body = stringify(element, index, children, callback);
  element.children = [];
  if (!body) {
    element.return = '';
    return;
  }

  element.return = `@layer ${MUI_CSS_LAYER}{${body}}`;
  // `@keyframes` é o único tipo em que o stringify reescreve `return` mesmo sem filhos;
  // como regra sem filhos ele devolve '' e preserva o `return` já calculado.
  if (element.type === '@keyframes') {
    element.type = 'rule';
    element.props = [];
  }
  // No servidor (sem rulesheet) a saída é a concatenação dos retornos do middleware.
  return element.return;
};

/**
 * Referência estável: o cache de SSR do Emotion é memoizado pela identidade deste array.
 * `prefixer` é o plugin padrão do Emotion — passar `stylisPlugins` substitui os padrões,
 * então ele precisa ser reincluído explicitamente (e antes, para prefixar o nó original).
 */
const STYLIS_PLUGINS: StylisPlugin[] = [prefixer, muiLayerPlugin];

/**
 * Cria o cache do Emotion com a camada `mui`.
 *
 * No cliente, insere também a declaração de ordem das camadas na própria folha do Emotion:
 * a ordem das camadas é definida pela primeira ocorrência de cada nome, então isso garante
 * `base < mui < utilities` mesmo que algum `<style>` do Emotion seja inserido antes do CSS
 * global (ex.: hot reload em dev).
 */
export function createLayeredEmotionCache(): EmotionCache {
  const cache = createCache({ key: MUI_CSS_LAYER, stylisPlugins: STYLIS_PLUGINS });
  if (typeof document !== 'undefined') {
    try {
      cache.sheet.insert(CSS_LAYER_ORDER);
    } catch {
      /* navegador sem @layer: a ordem passa a ser a do documento, sem quebrar nada */
    }
  }
  return cache;
}
