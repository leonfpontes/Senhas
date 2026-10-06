/**
 * Plugin stylis que envolve o CSS do MUI em `@layer mui`.
 * Roda o pipeline real do stylis (compile → middleware → stringify), como o Emotion faz.
 */
import { StyleSheet } from '@emotion/sheet';
import { compile, middleware, prefixer, serialize, stringify } from 'stylis';
import {
  CSS_LAYER_ORDER,
  MUI_CSS_LAYER,
  createLayeredEmotionCache,
  muiLayerPlugin,
} from '@/lib/emotionLayerCache';

const run = (css: string) => serialize(compile(css), middleware([prefixer, muiLayerPlugin, stringify]));

describe('muiLayerPlugin', () => {
  it('uma regra de entrada vira @layer mui{...}', () => {
    expect(run('.css-abc{color:red;}')).toBe('@layer mui{.css-abc{color:red;}}');
  });

  it('cada regra raiz ganha a própria camada, inclusive as desaninhadas de &', () => {
    const out = run('.css-abc{color:red;&:hover{color:blue;}}');
    expect(out).toBe('@layer mui{.css-abc{color:red;}}@layer mui{.css-abc:hover{color:blue;}}');
  });

  it('envolve @media e @keyframes de nível raiz', () => {
    expect(run('@media (min-width:600px){.css-abc{margin:0;}}')).toBe(
      '@layer mui{@media (min-width:600px){.css-abc{margin:0;}}}',
    );
    // O prefixer emite também a cópia @-webkit-keyframes; cada uma na própria camada.
    expect(run('@keyframes fade{to{opacity:0;}}')).toBe(
      '@layer mui{@-webkit-keyframes fade{to{opacity:0;}}}@layer mui{@keyframes fade{to{opacity:0;}}}',
    );
  });

  it('não envolve regras dentro de @media duas vezes', () => {
    expect(run('@media print{.a{display:none;}.b{color:red;}}')).toBe(
      '@layer mui{@media print{.a{display:none;}.b{color:red;}}}',
    );
  });

  it('envolve globais do CssBaseline (html, body) separadamente', () => {
    expect(run('html{box-sizing:border-box;}body{margin:0;}')).toBe(
      '@layer mui{html{box-sizing:border-box;}}@layer mui{body{margin:0;}}',
    );
  });

  it('mantém o prefixer do Emotion funcionando dentro da camada', () => {
    expect(run('.css-abc{user-select:none;}')).toBe(
      '@layer mui{.css-abc{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;}}',
    );
  });

  it('não aninha camada em @layer/@import já existentes', () => {
    expect(run('@import url(x.css);')).toBe('@import url(x.css);');
    expect(run('@layer outra{.a{color:red;}}')).toBe('@layer outra{.a{color:red;}}');
  });
});

describe('createLayeredEmotionCache', () => {
  it('usa a chave da camada e declara a ordem das camadas na própria folha', () => {
    // jsdom descarta `@layer` no CSSOM sem erro, então observa-se a inserção na folha do Emotion.
    const insertSpy = jest.spyOn(StyleSheet.prototype, 'insert');
    const cache = createLayeredEmotionCache();
    expect(cache.key).toBe(MUI_CSS_LAYER);
    expect(CSS_LAYER_ORDER).toBe('@layer theme, base, mui, components, utilities;');
    expect(insertSpy).toHaveBeenCalledWith(CSS_LAYER_ORDER);
    insertSpy.mockRestore();
    cache.sheet.flush();
  });

  it('o CSS compilado pelo cache sai dentro de @layer mui', () => {
    const cache = createLayeredEmotionCache();
    const insertSpy = jest.spyOn(cache.sheet, 'insert');
    cache.insert('.mui-abc', { name: 'abc', styles: 'color:red;&:hover{color:blue;}' }, cache.sheet, true);
    expect(insertSpy.mock.calls.map((c) => c[0])).toEqual([
      '@layer mui{.mui-abc{color:red;}}',
      '@layer mui{.mui-abc:hover{color:blue;}}',
    ]);
    cache.sheet.flush();
  });
});
