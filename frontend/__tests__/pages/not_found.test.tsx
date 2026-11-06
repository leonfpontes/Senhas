/**
 * 404 — reconhece URLs de terreiro e respeita prefers-reduced-motion.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';

const mockRouter = { asPath: '/', push: jest.fn(), replace: jest.fn(), query: {}, events: { on: jest.fn(), off: jest.fn() } };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

import Custom404, { tenantSlugFromPath } from '@/pages/404';

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.useRealTimers();
});

describe('tenantSlugFromPath', () => {
  it('reconhece /public/{slug} e /{slug}, ignora rotas da plataforma', () => {
    expect(tenantSlugFromPath('/public/tenda-pai-joaquim/senha-antiga')).toBe('tenda-pai-joaquim');
    expect(tenantSlugFromPath('/Tenda-X/pagina?x=1')).toBe('tenda-x');
    expect(tenantSlugFromPath('/public/gira/123')).toBeNull();
    expect(tenantSlugFromPath('/admin/nada')).toBeNull();
    expect(tenantSlugFromPath('/')).toBeNull();
  });
});

describe('Página 404', () => {
  it('em URL de terreiro oferece "Ir para o terreiro"', () => {
    mockRouter.asPath = '/public/tenda-pai-joaquim/coisa';
    render(<Custom404 />);
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir para o terreiro/i })).toHaveAttribute('href', '/tenda-pai-joaquim');
    expect(screen.getByRole('link', { name: /voltar ao início/i })).toHaveAttribute('href', '/');
  });

  it('fora de terreiro só oferece voltar', () => {
    mockRouter.asPath = '/admin/inexistente';
    render(<Custom404 />);
    expect(screen.queryByRole('link', { name: /ir para o terreiro/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument();
  });

  it('J11 v2: recado fixo, sem ícones decorativos nem animação', () => {
    mockRouter.asPath = '/admin/inexistente';
    const { container } = render(<Custom404 />);
    expect(screen.getByText(/O endereço pode ter mudado ou a gira já passou/)).toBeInTheDocument();
    expect(container.querySelector('.motion-safe\\:animate-bounce, .motion-safe\\:animate-pulse')).toBeNull();
  });
});
