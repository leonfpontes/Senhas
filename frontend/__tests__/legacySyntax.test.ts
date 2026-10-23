/**
 * @jest-environment node
 *
 * Sintaxe do build × Safari do iOS 15 (iPad que não passa do 15.8). O auditor
 * (`scripts/audit-legacy-syntax.js`, rodado no CI depois do build) precisa achar o que o WebKit
 * antigo recusa, e o `@radix-ui/react-collection` — que traz `static {}` — tem que ser
 * transpilado pelo Next.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { findIssues } = require('../scripts/audit-legacy-syntax');
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

  it('o Next transpila o @radix-ui/react-collection', () => {
    expect(nextConfig.transpilePackages).toContain('@radix-ui/react-collection');
  });
});
