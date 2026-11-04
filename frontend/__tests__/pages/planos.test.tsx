/** $-03 — página pública /planos gerada de constants/plans.ts. */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PlanosPage from '@/pages/planos';
import { FEATURE_CATALOG, PLAN_LIST } from '@/constants/plans';

jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

describe('/planos', () => {
  it('mostra os 4 planos com preço e CTA para o cadastro', () => {
    render(<PlanosPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/comece grátis/i);
    for (const p of PLAN_LIST) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Assinar Pro' })).toHaveAttribute('href', '/cadastro?plan=pro');
    expect(screen.getAllByRole('link', { name: /começar grátis/i })[0]).toHaveAttribute('href', '/cadastro');
  });

  it('o comparativo tem uma linha para cada recurso do catálogo', () => {
    render(<PlanosPage />);
    const table = screen.getByRole('table', { name: /comparativo dos planos/i });
    for (const f of FEATURE_CATALOG) expect(within(table).getByRole('rowheader', { name: f.label })).toBeInTheDocument();
  });

  it('destaca o Gratuito e o teste de 30 dias sem cartão', () => {
    render(<PlanosPage />);
    expect(screen.getByText('Plano Gratuito de verdade')).toBeInTheDocument();
    expect(screen.getByText('30 dias de Premium')).toBeInTheDocument();
  });
});
