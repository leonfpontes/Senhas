/**
 * AM-15 — /descadastro/[token]: abrir só consulta (leitor de link não desliga nada); "Desligar"
 * desliga o tipo do link (ou todos); já desligado mostra "Pronto!"; link que não vale mais mostra
 * a mensagem do servidor.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/descadastro/[token]',
  asPath: '/descadastro/tok123?tipo=mensalidade',
  query: { token: 'tok123', tipo: 'mensalidade' },
  isReady: true,
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(() => Promise.resolve()),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/compat/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'font-fraunces', className: 'font-fraunces' }),
}));

const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a), get: jest.fn() },
}));

import DescadastroPage from '@/pages/descadastro/[token]';

const TODOS = { mensalidade: true, escalas: true, confirmacao: true, faltas: true, avisos: true };
const PUBLICO = { skipAutoLogout: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.query = { token: 'tok123', tipo: 'mensalidade' };
});

it('abrir só consulta; desliga a mensalidade no toque', async () => {
  mockPost.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        terreiro_nome: 'Tenda Luz',
        preferencias: url.endsWith('/desligar') ? { ...TODOS, mensalidade: false } : TODOS,
      },
    }),
  );
  render(<DescadastroPage />);
  expect(await screen.findByText(/Desligar os e-mails de “Mensalidade” de Tenda Luz\?/)).toBeInTheDocument();
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost).toHaveBeenCalledWith('/api/v1/public/avisos-email/consultar', { token: 'tok123' }, PUBLICO);

  await act(async () => {
    fireEvent.click(screen.getByTestId('descadastro-desligar'));
  });
  expect(mockPost).toHaveBeenLastCalledWith(
    '/api/v1/public/avisos-email/desligar',
    { token: 'tok123', tipo: 'mensalidade' },
    PUBLICO,
  );
  expect(await screen.findByText('Pronto!')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Você não recebe mais os e-mails de “Mensalidade” de Tenda Luz');
  expect(screen.queryByTestId('descadastro-desligar')).not.toBeInTheDocument();
});

it('tipo desconhecido vira "todos"', async () => {
  mockRouter.query = { token: 'tok123', tipo: 'qualquer' };
  mockPost.mockResolvedValue({ data: { terreiro_nome: null, preferencias: TODOS } });
  render(<DescadastroPage />);
  expect(await screen.findByText(/Desligar todos os e-mails da Área do Médium\?/)).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByTestId('descadastro-desligar'));
  });
  expect(mockPost).toHaveBeenLastCalledWith('/api/v1/public/avisos-email/desligar', { token: 'tok123', tipo: 'todos' }, PUBLICO);
});

it('já desligado: "Pronto!" sem botão', async () => {
  mockPost.mockResolvedValue({ data: { terreiro_nome: 'Tenda Luz', preferencias: { ...TODOS, mensalidade: false } } });
  render(<DescadastroPage />);
  expect(await screen.findByText('Pronto!')).toBeInTheDocument();
  expect(screen.queryByTestId('descadastro-desligar')).not.toBeInTheDocument();
});

it('link que não vale mais', async () => {
  mockPost.mockRejectedValue({
    status: 404,
    response: {
      status: 404,
      data: { detail: { error_code: 'LINK_INVALIDO', message: 'Este link não vale mais. Você pode mudar os avisos por e-mail no Perfil da Área.' } },
    },
  });
  render(<DescadastroPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Este link não vale mais.');
  expect(screen.queryByTestId('descadastro-desligar')).not.toBeInTheDocument();
});
