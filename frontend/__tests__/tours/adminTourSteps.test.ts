/**
 * Guias de tela (tours/adminTourSteps.ts): toda âncora existe no código, toda
 * rota existe, e as telas principais do painel têm guia.
 */
import fs from 'fs';
import path from 'path';
import { adminTourSteps, getAdminTourSteps } from '@/tours/adminTourSteps';

const SRC = path.join(__dirname, '..', '..', 'src');

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const codigo = listFiles(SRC)
  .filter((f) => !f.includes(`${path.sep}tours${path.sep}`))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

function routeFile(route: string): string | undefined {
  const base = path.join(SRC, 'pages', ...route.split('/').filter(Boolean));
  return [`${base}.tsx`, path.join(base, 'index.tsx')].find((f) => fs.existsSync(f));
}

describe('adminTourSteps', () => {
  it.each(Object.keys(adminTourSteps))('%s é uma tela que existe', (route) => {
    expect(routeFile(route)).toBeDefined();
  });

  const ancoras = Array.from(
    new Set(Object.values(adminTourSteps).flatMap((steps) => steps.map((s) => s.selector))),
  );
  it.each(ancoras)('a âncora %s existe no código', (selector) => {
    const nome = selector.match(/^\[data-tour="([^"]+)"\]$/)?.[1];
    expect(nome).toBeTruthy();
    expect(codigo).toMatch(new RegExp(`data-tour(=|: )["'\`]${nome}["'\`]|data-tour=\\{\`${nome}`));
  });

  it('todo passo tem título e texto', () => {
    for (const steps of Object.values(adminTourSteps)) {
      for (const s of steps) {
        expect(s.title.trim()).not.toBe('');
        expect(s.body.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it.each([
    '/admin/dashboard',
    '/admin/porta',
    '/admin/giras',
    '/admin/tickets',
    '/admin/mediuns',
    '/admin/financeiro/mensalidades',
    '/admin/financeiro/lancamentos',
    '/admin/financeiro/fluxo-de-caixa',
    '/admin/atividades',
    '/admin/comunicados',
    '/admin/materiais',
    '/admin/meu-site',
    '/admin/cursos-presenciais',
    '/admin/permission-groups',
  ])('a tela principal %s tem guia', (route) => {
    expect(getAdminTourSteps(route).length).toBeGreaterThan(0);
  });

  it('rota sem guia devolve lista vazia', () => {
    expect(getAdminTourSteps('/admin/nao-existe')).toEqual([]);
  });
});
