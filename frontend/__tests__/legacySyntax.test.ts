/**
 * @jest-environment node
 *
 * Sintaxe do build × Safari do iOS 15 (iPad que não passa do 15.8). O auditor
 * (`scripts/audit-legacy-syntax.js`, rodado no CI depois do build) precisa achar o que o WebKit
 * antigo recusa, e o `@radix-ui/react-collection` — que traz `static {}` — tem que ser
 * transpilado pelo Next.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { findIssues, findCssIssues } = require('../scripts/audit-legacy-syntax');
const nextConfig = require('../next.config');

describe('audit-legacy-syntax', () => {
  it('acusa bloco estático de classe (o erro do iPad)', () => {
    const src = 'var h=class e extends Map{static{f(this,"OrderedDict")}#e;constructor(e){super(e)}}';
    expect(findIssues(src)).toEqual([expect.stringContaining('static block')]);
  });

  it('acusa regex com lookbehind e com a flag v', () => {
    expect(findIssues('var a=/(?<=R\\$)\\d+/g;')).toEqual([expect.stringContaining('lookbehind')]);
    expect(findIssues('var b=/[\\p{L}--[a-z]]/v;')).toEqual([expect.stringContaining('flag v')]);
  });

  it('aceita o que o iOS 15 entende: campos privados, ?? e ?.', () => {
    const src = 'class A{#x=1;static y=2;get(o){return o?.z??this.#x}}var r=/(?<nome>a)/;';
    expect(findIssues(src)).toEqual([]);
  });

  it('acusa método que o iOS 15 não tem (toSorted, Object.groupBy, Promise.withResolvers)', () => {
    expect(findIssues('a.toSorted((x,y)=>x-y)')).toEqual([expect.stringContaining('.toSorted()')]);
    expect(findIssues('Object.groupBy(l,f);Promise.withResolvers()')).toHaveLength(2);
  });

  it('aceita toSorted de classe própria (o OrderedDict do Radix) e groupBy de lodash', () => {
    const src = 'class D extends Map{toSorted(c){return new D([...this].sort(c))}};d.toSorted(c);_.groupBy(l,f)';
    expect(findIssues(src)).toEqual([]);
  });

  it('acusa color-mix sem fallback, em variável e CSS aninhado', () => {
    expect(findCssIssues('a{border-color:color-mix(in srgb,red 50%,#fff)}')).toEqual([
      expect.stringContaining('sem fallback'),
    ]);
    expect(findCssIssues('b{--input:color-mix(in srgb,red 50%,#fff)}')).toEqual([expect.stringContaining('variável')]);
    expect(findCssIssues('c{d{color:red}}')).toEqual([expect.stringContaining('aninhado')]);
  });

  it('aceita color-mix com fallback antes ou dentro de @supports', () => {
    const css =
      'a{color:#888;color:color-mix(in srgb,red,blue)}' +
      '@supports (color:color-mix(in lab,red,red)){b{--input:color-mix(in srgb,red,#fff)}}';
    expect(findCssIssues(css)).toEqual([]);
  });

  it('o Next transpila o @radix-ui/react-collection', () => {
    expect(nextConfig.transpilePackages).toContain('@radix-ui/react-collection');
  });
});
