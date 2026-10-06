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

  it('com prefers-reduced-motion a mensagem não troca sozinha', () => {
    jest.useFakeTimers();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    mockRouter.asPath = '/x/y';
    render(<Custom404 />);
    expect(screen.getByText('Essa página não está aqui.')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(8000); });
    expect(screen.getByText('Essa página não está aqui.')).toBeInTheDocument();
  });

  it('sem reduced-motion as mensagens alternam', () => {
    jest.useFakeTimers();
    mockRouter.asPath = '/x/y';
    render(<Custom404 />);
    act(() => { jest.advanceTimersByTime(4000); });
    expect(screen.getByText('O link pode ter mudado ou expirado.')).toBeInTheDocument();
  });
});
