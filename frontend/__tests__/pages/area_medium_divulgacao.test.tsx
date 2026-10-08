/**
 * AM-24 — divulgação da Área do Médium atrás da chave de lançamento `AREA_MEDIUM_DIVULGADA`.
 * Desligada (padrão): landing, /planos, /login, comparativo e FAQ ficam como antes.
 * Ligada: link "Sou médium / Recebi um convite" no topo e no login, linha da Área no comparativo
 * (plano mínimo vindo de constants/plans.ts) e a pergunta "Os médiuns têm acesso?" no FAQ e no JSON-LD.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from '@/pages/index';
import LoginPage from '@/pages/login';
import { AREA_MEDIUM_ROW_LABEL } from '@/components/landing/PlanComparisonTable';
import { FAQ_AREA_MEDIUM, LANDING_FAQ, visibleFaq } from '@/constants/landingFaq';
import { PLAN_ORDER, minPlanPhrase, planIncludes } from '@/constants/plans';

let mockDivulgada = false;
jest.mock('@/constants/areaMedium', () => {
  const actual = jest.requireActual('@/constants/areaMedium');
  return {
    ...actual,
    get AREA_MEDIUM_DIVULGADA() {
      return mockDivulgada;
    },
  };
});

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { senhas_emitidas: 0, giras_realizadas: 0, terreiros_ativos: 0 } })),
    post: jest.fn(),
  },
  extractApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
jest.mock('@/services/authSession', () => ({
  completeLogin: jest.fn(),
  isAccountChoice: () => false,
  selectAccount: jest.fn(),
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  // framer-motion (whileInView) usa IntersectionObserver, que o jsdom não tem.
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

const SOU_MEDIUM = /sou médium \/ recebi um convite/i;
const comparativo = () => screen.getByRole('table', { name: 'Comparativo dos planos do GiraHub' });
const faqLd = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => JSON.parse(s.innerHTML))
    .find((s) => s['@type'] === 'FAQPage');

describe('AM-24 com a chave desligada (padrão)', () => {
  beforeEach(() => {
    mockDivulgada = false;
  });

  it('a landing não mostra nada da Área do Médium', () => {
    const { container } = render(<HomePage />);
    expect(screen.queryByRole('button', { name: SOU_MEDIUM })).not.toBeInTheDocument();
    expect(within(comparativo()).queryByText(/Área do Médium/)).not.toBeInTheDocument();
    const faq = screen.getByRole('region', { name: /perguntas que todo terreiro faz/i });
    expect(within(faq).queryByRole('button', { name: FAQ_AREA_MEDIUM.q })).not.toBeInTheDocument();
    expect(faqLd(container).mainEntity.map((q: { name: string }) => q.name)).not.toContain(FAQ_AREA_MEDIUM.q);
    expect(container).not.toHaveTextContent(/Área do Médium/);
  });

  it('o FAQ visível é a lista de sempre', () => {
    expect(visibleFaq()).toBe(LANDING_FAQ);
  });

  it('o login mantém o "Recebi um convite da casa" do AM-04', () => {
    render(<LoginPage />);
    expect(screen.queryByRole('button', { name: SOU_MEDIUM })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /recebi um convite da casa/i }));
    expect(screen.getByText(/o primeiro acesso começa pelo link da casa/i)).toBeInTheDocument();
    expect(screen.queryByText(/o acesso à área do médium vem da sua casa/i)).not.toBeInTheDocument();
  });
});

describe('AM-24 com a chave ligada', () => {
  beforeEach(() => {
    mockDivulgada = true;
  });

  it('o topo da landing tem o link que explica como o médium entra', () => {
    render(<HomePage />);
    const hero = document.getElementById('hero') as HTMLElement;
    fireEvent.click(within(hero).getByRole('button', { name: SOU_MEDIUM }));
    const dialog = screen.getByRole('dialog', { name: /sou médium: como eu entro/i });
    expect(within(dialog).getByText(/o acesso à área do médium vem da sua casa/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/convite: um link, quase sempre pelo whatsapp/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/agenda das giras, os avisos da casa, a sua mensalidade, a escala e a sua presença/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(dialog).not.toHaveTextContent(/convocad/i);
  });

  it('o comparativo ganha a linha da Área do Médium, com o plano mínimo de constants/plans.ts', () => {
    render(<HomePage />);
    const row = within(comparativo()).getByRole('rowheader', { name: AREA_MEDIUM_ROW_LABEL }).closest('tr') as HTMLElement;
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => Boolean(within(c).queryByLabelText('Incluído')));
    expect(cells).toEqual(PLAN_ORDER.map((p) => planIncludes(p, 'area_medium')));
    // Logo depois da mensalidade dos médiuns.
    const prev = row.previousElementSibling as HTMLElement;
    expect(within(prev).getByRole('rowheader')).toHaveTextContent('Mensalidade dos médiuns');
  });

  it('o FAQ tem "Os médiuns têm acesso?", igual no JSON-LD', () => {
    const { container } = render(<HomePage />);
    const faq = screen.getByRole('region', { name: /perguntas que todo terreiro faz/i });
    expect(within(faq).getByRole('button', { name: 'Os médiuns têm acesso?' })).toBeInTheDocument();
    const ld = faqLd(container);
    expect(ld.mainEntity).toHaveLength(LANDING_FAQ.length + 1);
    const item = ld.mainEntity.find((q: { name: string }) => q.name === FAQ_AREA_MEDIUM.q);
    expect(item.acceptedAnswer.text).toBe(FAQ_AREA_MEDIUM.a);
    expect(FAQ_AREA_MEDIUM.a).toContain(minPlanPhrase('area_medium'));
    expect(FAQ_AREA_MEDIUM.a).not.toMatch(/convocad/i);
  });

  it('o login troca o link por "Sou médium / Recebi um convite" com os passos', () => {
    render(<LoginPage />);
    const botao = screen.getByRole('button', { name: SOU_MEDIUM });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/o acesso à área do médium vem da sua casa/i)).toBeInTheDocument();
    expect(screen.getByText(/entrar acima com o seu e-mail e senha/i)).toBeInTheDocument();
  });
});
