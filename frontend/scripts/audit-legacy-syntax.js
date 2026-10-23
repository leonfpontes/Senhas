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
 *   - regex com lookbehind (`(?<=`, `(?<!`, WebKit 16.4+) ou com a flag `v` (WebKit 17+).
 * Correção: pôr o pacote em `transpilePackages` (next.config.js) ou trocar o código.
 *
 * Uso (depois do `npm run build`): node scripts/audit-legacy-syntax.js [pasta]
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

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
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'StaticBlock') {
      issues.push(`static block: ${src.slice(node.start, node.start + 80)}`);
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
  visit(parse(src));
  return issues;
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
  if (failed) {
    console.error(
      `\n${failed} arquivo(s) com sintaxe que o Safari do iOS 15 não entende. ` +
        'Ponha o pacote de origem em transpilePackages (next.config.js).',
    );
    process.exit(1);
  }
  console.log(`✓ ${files.length} arquivos do build sem sintaxe além do iOS 15.`);
}

if (require.main === module) main();

module.exports = { findIssues };
