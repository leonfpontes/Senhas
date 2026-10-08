/**
 * AM-13 — /confirmar-email/[token]: só confirma no toque (leitor de link não gasta o token),
 * mostra o novo e-mail e "Entrar"; link que não vale mais mostra a mensagem do servidor.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockRouter: any = {
  pathname: '/confirmar-email/[token]',
  asPath: '/confirmar-email/tok123',
  query: { token: 'tok123' },
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

import ConfirmarEmailPage from '@/pages/confirmar-email/[token]';

beforeEach(() => {
  jest.clearAllMocks();
});

it('não chama nada ao abrir; confirma no toque e mostra o novo e-mail', async () => {
  mockPost.mockResolvedValue({ data: { email: 'nova@exemplo.com', terreiro_nome: 'Tenda Luz' } });
  render(<ConfirmarEmailPage />);
  expect(mockPost).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.click(screen.getByTestId('confirmar-email'));
  });
  expect(mockPost).toHaveBeenCalledWith('/api/v1/public/email/confirmar', { token: 'tok123' }, { skipAutoLogout: true });
  expect(await screen.findByText('nova@exemplo.com')).toBeInTheDocument();
  expect(screen.getByText(/em Tenda Luz/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login?email_confirmado=1');
});

it('link que não vale mais', async () => {
  mockPost.mockRejectedValue({
    status: 404,
    response: {
      status: 404,
      data: { detail: { error_code: 'LINK_INVALIDO', message: 'Este link não vale mais. Peça a troca de novo pelo seu perfil.' } },
    },
  });
  render(<ConfirmarEmailPage />);
  await act(async () => {
    fireEvent.click(screen.getByTestId('confirmar-email'));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Este link não vale mais.');
  expect(screen.getByTestId('confirmar-email')).toBeInTheDocument();
});
