#!/usr/bin/env node
/**
 * Audita o build (`.next/static`) atrás de sintaxe que o Safari/WebKit do iOS 15 não entende.
 *
 * Por quê: o Next não rebaixa a sintaxe dos pacotes de node_modules. Um `static {}` em classe
 * (vindo do `@radix-ui/react-collection`) derrubava um chunk inteiro com
 * "SyntaxError: Unexpected token '{'" no iPad da casa, que não passa do iOS 15.8 — e todo
 * navegador de iOS usa o WebKit do sistema. O painel abria sem perfil nem permissões.
 *
 * Falha (exit 1) se algum .js do build tiver:
 *   - bloco estático de classe (`static { … }`, WebKit 16.4+);
 *   - regex com lookbehind (`(?<=`, `(?<!`, WebKit 16.4+) ou com a flag `v` (WebKit 17+);
 *   - chamada a método que o iOS 15 não tem e que o Next não "polifila": `x.toSorted()`,
 *     `x.toReversed()`, `x.toSpliced()` (16+), `Object.groupBy`/`Map.groupBy`,
 *     `Promise.withResolvers` (17.4+), `Array.fromAsync` (16.4+). Não é erro de sintaxe: o chunk
 *     carrega e a tela quebra só quando o código passa por ali ("x.toSorted is not a function").
 * Correção: pôr o pacote em `transpilePackages` (next.config.js) ou trocar o código.
 *
 * E se algum .css do build tiver (jornadas v2, nov/2026):
 *   - `color-mix()`, `light-dark()` ou cor relativa (`rgb(from …)`) fora de `@supports` e sem uma
 *     declaração anterior da mesma propriedade que o WebKit antigo entenda. Sem `color-mix` a
 *     declaração inteira é descartada; numa variável (`--input: color-mix(…)`) quem usa a variável
 *     cai no valor inicial — as bordas dos campos ficavam na cor do texto;
 *   - CSS aninhado (regra dentro de regra, WebKit 16.5+): o iOS 15 ignora o bloco inteiro.
 * Correção: escrever a cor pronta (hex) ou pôr a versão sem `color-mix` antes, na mesma regra.
 *
 * Uso (depois do `npm run build`): node scripts/audit-legacy-syntax.js [pasta]
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const postcss = require('postcss');

/** Métodos chamados como `algo.metodo(…)` que o WebKit do iOS 15 não tem. */
const METODOS_NOVOS = new Set(['toSorted', 'toReversed', 'toSpliced']);
/** Estáticos `Objeto.metodo(…)` que o WebKit do iOS 15 não tem. */
const ESTATICOS_NOVOS = {
  Object: ['groupBy'],
  Map: ['groupBy'],
  Promise: ['withResolvers'],
  Array: ['fromAsync'],
};
/** Funções de cor que o WebKit do iOS 15 não entende (color-mix: 16.2; light-dark: 17.5; `from`: 16.4). */
const COR_NOVA = /color-mix\(|light-dark\(|\(\s*from\s/i;

const BUILD_DIR = process.argv[2] || path.join(__dirname, '..', '.next', 'static');

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function parse(src) {
  try {
    return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  } catch {
    return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  }
}

/** Problemas de sintaxe legada num arquivo do build (texto curto de cada ocorrência). */
function findIssues(src) {
  const issues = [];
  const ast = parse(src);
  // Classe do próprio arquivo que define o método (o OrderedDict do @radix-ui/react-collection tem
  // `toSorted` próprio): a chamada é a dele, não a do Array.
  const definidos = new Set();
  const coletar = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if ((node.type === 'MethodDefinition' || node.type === 'Property' || node.type === 'PropertyDefinition') &&
        node.key && !node.computed && METODOS_NOVOS.has(node.key.name)) {
      definidos.add(node.key.name);
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(coletar);
      else if (child && typeof child === 'object') coletar(child);
    }
  };
  coletar(ast);
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'StaticBlock') {
      issues.push(`static block: ${src.slice(node.start, node.start + 80)}`);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
      const { object, property } = node.callee;
      const nome = property.name;
      if (METODOS_NOVOS.has(nome) && !definidos.has(nome)) issues.push(`método novo: .${nome}()`);
      if (object.type === 'Identifier' && (ESTATICOS_NOVOS[object.name] || []).includes(nome)) {
        issues.push(`método novo: ${object.name}.${nome}()`);
      }
    }
    if (node.type === 'Literal' && node.regex) {
      const { pattern, flags } = node.regex;
      if (/\(\?<[=!]/.test(pattern)) issues.push(`regex lookbehind: /${pattern}/${flags}`);
      if (flags.includes('v')) issues.push(`regex flag v: /${pattern}/${flags}`);
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(ast);
  return issues;
}

/** Dentro de um `@supports` que testa a função nova? Então o navegador antigo nem lê. */
function dentroDeSupports(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && p.name === 'supports' && COR_NOVA.test(p.params)) return true;
  }
  return false;
}

/** Problemas de CSS no iOS 15 num arquivo do build (texto curto de cada ocorrência). */
function findCssIssues(css) {
  const issues = [];
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'rule') issues.push(`CSS aninhado: ${rule.parent.selector} { ${rule.selector} }`);
  });
  root.walkDecls((decl) => {
    if (!COR_NOVA.test(decl.value) || dentroDeSupports(decl)) return;
    const onde = `${decl.parent.selector || '@' + decl.parent.name}: ${decl.prop}: ${decl.value}`.slice(0, 160);
    if (decl.prop.startsWith('--')) {
      issues.push(`cor nova em variável (sem fallback possível): ${onde}`);
      return;
    }
    const temFallback = decl.parent.nodes.some(
      (n) => n !== decl && n.type === 'decl' && n.prop === decl.prop && !COR_NOVA.test(n.value) &&
        decl.parent.index(n) < decl.parent.index(decl),
    );
    if (!temFallback) issues.push(`cor nova sem fallback: ${onde}`);
  });
  return issues;
}

function listCss(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCss(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error(`Build não encontrado em ${BUILD_DIR} — rode \`npm run build\` antes.`);
    process.exit(1);
  }
  const files = listJs(BUILD_DIR);
  let failed = 0;
  for (const file of files) {
    let issues;
    try {
      issues = findIssues(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      issues = [`não foi possível analisar: ${err.message}`];
    }
    if (issues.length) {
      failed += 1;
      console.error(`✗ ${path.relative(BUILD_DIR, file)}`);
      for (const issue of [...new Set(issues)].slice(0, 5)) console.error(`    ${issue}`);
    }
  }
  const cssFiles = listCss(BUILD_DIR);
  for (const file of cssFiles) {
    let issues;
    try {
      issues = findCssIssues(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      issues = [`não foi possível analisar: ${err.message}`];
    }
    if (issues.length) {
      failed += 1;
      console.error(`✗ ${path.relative(BUILD_DIR, file)}`);
      for (const issue of [...new Set(issues)].slice(0, 8)) console.error(`    ${issue}`);
    }
  }
  if (failed) {
    console.error(
      `\n${failed} arquivo(s) com código que o Safari do iOS 15 não entende. ` +
        'JS de pacote: ponha o pacote em transpilePackages (next.config.js). ' +
        'CSS: escreva a cor pronta ou ponha antes uma versão sem color-mix.',
    );
    process.exit(1);
  }
  console.log(`✓ ${files.length} JS e ${cssFiles.length} CSS do build sem nada além do iOS 15.`);
}

if (require.main === module) main();

module.exports = { findIssues, findCssIssues };
