#!/usr/bin/env node
/**
 * Audita se toda tela admin usa usePermissions (RBAC de grupo).
 *
 * Falha (exit 1) se encontrar página em src/pages/admin/ sem `usePermissions`,
 * fora da lista de exceções (telas de sistema/conta, sem módulo de RBAC).
 *
 * Uso: node scripts/audit-permission-guards.js
 */
const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, '..', 'src', 'pages', 'admin');

// Telas de sistema/conta sem feature de RBAC de grupo associada.
const EXEMPT_FILES = new Set([
  'admin_layout.tsx', // layout wrapper, não é uma tela
  'dashboard.tsx', // dashboard agregado geral (equivalente a dashboard_summary.py)
  'profile.tsx', // perfil da própria conta do usuário logado
  'plano.tsx', // gestão do plano da assinatura (equivalente a subscription_info.py)
  'billing.tsx', // billing Stripe (equivalente a billing_stripe.py)
  'impersonate.tsx', // ferramenta de super admin, mecanismo próprio
  path.join('permission-groups', 'index.tsx'), // gestão de RBAC em si, checagem is_admin própria
  path.join('permission-groups', '[id].tsx'),
  path.join('porta', 'kiosk.tsx'), // tela pública de TV, sem sessão de usuário normal
]);

function listTsxFiles(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsxFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(rel);
    }
  }
  return out;
}

function main() {
  const files = listTsxFiles(ADMIN_DIR).filter((f) => !EXEMPT_FILES.has(f));
  const violations = [];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(ADMIN_DIR, rel), 'utf8');
    if (!content.includes('usePermissions')) {
      violations.push(rel);
    }
  }

  if (violations.length === 0) {
    console.log('OK: todas as telas admin usam usePermissions.');
    return 0;
  }

  console.log('Telas admin SEM usePermissions (RBAC de grupo):\n');
  for (const rel of violations) {
    console.log(`  pages/admin/${rel}`);
  }
  console.log(
    '\nSe alguma destas é intencional (tela de sistema/conta), adicione o arquivo a ' +
      'EXEMPT_FILES neste script.'
  );
  return 1;
}

process.exit(main());
