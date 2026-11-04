/**
 * C-06 — Programa de Parceiros atrás da chave de lançamento `PARCEIROS_PUBLICADO`.
 * Desligada (padrão): /parceiros é 404 (getStaticProps → notFound), sem link no rodapé, sem chamada
 * na landing e fora do sitemap. Ligada: página com as regras, exemplo calculado de constants/plans.ts,
 * formulário que valida, envia e mostra a confirmação.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HomePage from '@/pages/index';
import ParceirosPage, { getStaticProps } from '@/pages/parceiros';
import { buildSitemap } from '@/pages/sitemap.xml';
import { PAID_PLANS, PLANS } from '@/constants/plans';
import { comissaoMensal, comissaoTotal, formatBRL, planoExemplo } from '@/constants/parceiros';

let mockPublicado = false;
jest.mock('@/constants/parceiros', () => {
  const actual = jest.requireActual('@/constants/parceiros');
  return {
    ...actual,
    get PARCEIROS_PUBLICADO() {
      return mockPublicado;
    },
  };
});

const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { senhas_emitidas: 0, giras_realizadas: 0, terreiros_ativos: 0 } })),
    post: (...a: unknown[]) => mockPost(...a),
  },
  extractApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn() }),
}));
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

beforeEach(() => mockPost.mockReset());

const linksParaParceiros = () =>
  Array.from(document.querySelectorAll('a')).filter((a) => a.getAttribute('href') === '/parceiros');

describe('C-06 com a chave desligada (padrão)', () => {
  beforeEach(() => {
    mockPublicado = false;
  });

  it('/parceiros responde 404', async () => {
    await expect(getStaticProps({})).resolves.toEqual({ notFound: true });
  });

  it('a landing não aponta para /parceiros (rodapé nem chamada)', () => {
    render(<HomePage />);
    expect(linksParaParceiros()).toHaveLength(0);
    expect(screen.queryByText(/seja parceiro/i)).not.toBeInTheDocument();
  });

  it('o sitemap não lista /parceiros', () => {
    expect(buildSitemap([])).not.toContain('/parceiros');
  });
});

describe('C-06 com a chave ligada', () => {
  beforeEach(() => {
    mockPublicado = true;
  });

  it('getStaticProps publica a página', async () => {
    await expect(getStaticProps({})).resolves.toEqual({ props: {} });
  });

  it('landing ganha o link no rodapé e a chamada; sitemap lista /parceiros', () => {
    render(<HomePage />);
    const footer = screen.getByRole('navigation', { name: 'Plataforma' });
    expect(within(footer).getByRole('link', { name: 'Seja parceiro' })).toHaveAttribute('href', '/parceiros');
    expect(screen.getByRole('heading', { name: /loja de artigos religiosos/i })).toBeInTheDocument();
    expect(linksParaParceiros().length).toBeGreaterThanOrEqual(2);
    expect(buildSitemap([])).toContain('<loc>https://girahub.com.br/parceiros</loc>');
  });

  it('mostra as regras e o exemplo calculado dos preços de constants/plans.ts', () => {
    render(<ParceirosPage />);
    expect(screen.getByRole('heading', { level: 1, name: /indique o girahub/i })).toBeInTheDocument();
    const ex = planoExemplo();
    expect(ex).toBe(PAID_PLANS.find((p) => p.popular));
    expect(screen.getByTestId('parceiros-exemplo')).toHaveTextContent(
      `Um terreiro no plano ${ex.label} rende ${formatBRL(comissaoMensal(ex))} por mês para você`,
    );
    expect(screen.getByTestId('parceiros-exemplo')).toHaveTextContent(formatBRL(comissaoTotal(ex)));
    const porPlano = screen.getByRole('list', { name: 'Comissão por plano' });
    for (const p of PAID_PLANS) expect(porPlano).toHaveTextContent(`${formatBRL(comissaoMensal(p))}/mês`);
    expect(screen.getByText(/20% de desconto nos 3 primeiros meses/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /posso indicar o meu próprio terreiro/i })).toBeInTheDocument();
  });

  it('as contas batem: 20% do preço cheio; 12 meses com 3 de desconto', () => {
    expect(comissaoMensal(PLANS.pro)).toBeCloseTo(PLANS.pro.price * 0.2, 2);
    expect(comissaoTotal(PLANS.pro)).toBeCloseTo(PLANS.pro.price * (0.16 * 3 + 0.2 * 9), 2);
  });

  it('formulário valida antes de enviar (inclusive o aceite)', async () => {
    render(<ParceirosPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Quero ser parceiro' }));
    expect(await screen.findByText('Conte o seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o tipo de parceiro.')).toBeInTheDocument();
    expect(screen.getByText('Para enviar, aceite o regulamento.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('envia o pedido e mostra a confirmação', async () => {
    mockPost.mockResolvedValue({ data: { message: 'Recebemos o seu pedido! Resposta em até 2 dias úteis.' } });
    render(<ParceirosPage />);
    const form = screen.getByRole('form', { name: 'Quero ser parceiro' });

    fireEvent.change(within(form).getByLabelText(/seu nome/i), { target: { value: 'Maria das Ervas' } });
    fireEvent.click(within(form).getByRole('combobox', { name: /você é/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Loja de artigos religiosos' }));
    fireEvent.change(within(form).getByLabelText(/nome da loja/i), { target: { value: 'Casa Pai Joaquim' } });
    fireEvent.change(within(form).getByLabelText(/^cidade/i), { target: { value: 'Niterói' } });
    fireEvent.click(within(form).getByRole('combobox', { name: /uf/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'RJ' }));
    fireEvent.change(within(form).getByLabelText(/whatsapp/i), { target: { value: '21998765432' } });
    fireEvent.change(within(form).getByLabelText(/e-mail/i), { target: { value: 'maria@exemplo.com' } });
    fireEvent.change(within(form).getByLabelText(/como pretende divulgar/i), { target: { value: 'Display no balcão' } });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: 'Quero ser parceiro' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/public/parceiros/interesse', {
      nome: 'Maria das Ervas',
      tipo: 'loja',
      nome_negocio: 'Casa Pai Joaquim',
      cidade: 'Niterói',
      uf: 'RJ',
      whatsapp: '21998765432',
      email: 'maria@exemplo.com',
      como_divulgar: 'Display no balcão',
      aceite_regulamento: true,
      website: '',
    });
    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    expect(screen.getByText(/Resposta em até 2 dias úteis/)).toBeInTheDocument();
  }, 30000);

  it('o campo isca fica fora da tela e fora do Tab', () => {
    render(<ParceirosPage />);
    const isca = document.getElementById('parceiro-website') as HTMLInputElement;
    expect(isca).toHaveAttribute('tabindex', '-1');
    expect(isca.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('traz o aviso de LGPD', () => {
    render(<ParceirosPage />);
    expect(screen.getByText(/usamos seus dados só para responder sobre a parceria/i)).toBeInTheDocument();
  });
});
