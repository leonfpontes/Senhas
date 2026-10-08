/**
 * AM-05 — mesmo e-mail em mais de um terreiro: passo "Em qual terreiro você quer entrar?".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockPost = jest.fn();
jest.mock('../../services/api_client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
  endImpersonation: jest.fn(),
  extractApiErrorMessage: (err: unknown, fallback: string) => {
    const d = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
    return typeof d?.message === 'string' ? d.message : fallback;
  },
}));
const mockCompleteLogin = jest.fn();
jest.mock('../../services/authSession', () => {
  const actual = jest.requireActual('../../services/authSession');
  return { ...actual, completeLogin: (...args: unknown[]) => mockCompleteLogin(...args) };
});
jest.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn() }),
}));

import LoginPage from '../../pages/login';
import { areasHint } from '../../components/auth/AccountChoiceList';
import { isAccountChoice } from '../../services/authSession';

const CHOICE = {
  choose_account: true,
  selection_token: 'sel-token',
  options: [
    { user_id: 'u-casa', terreiro_nome: 'Casa da Ana', terreiro_slug: 'casa', logo_url: null, areas: { admin: true, medium: true } },
    { user_id: 'u-tenda', terreiro_nome: 'Tenda Vizinha', terreiro_slug: 'tenda', logo_url: null, areas: { admin: false, medium: true } },
  ],
};

function login(password = 'Senha-forte-123') {
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
}

describe('Login — escolha do terreiro (AM-05)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockCompleteLogin.mockReset();
  });

  it('com choose_account mostra os terreiros com o lembrete das áreas, sem concluir o login', async () => {
    mockPost.mockResolvedValueOnce({ data: CHOICE });
    render(<LoginPage />);
    login();

    expect(await screen.findByRole('heading', { name: /em qual terreiro você quer entrar/i })).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: /terreiros/i });
    expect(within(lista).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /casa da ana — painel e área do médium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tenda vizinha — área do médium/i })).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(mockCompleteLogin).not.toHaveBeenCalled();
  });

  it('tocar num terreiro chama /auth/login/select (sem auto-logout) e segue o completeLogin com as áreas', async () => {
    const areas = { admin: false, medium: { medium_id: 'm1', nome: 'Ana' } };
    mockPost
      .mockResolvedValueOnce({ data: CHOICE })
      .mockResolvedValueOnce({ data: { user: { id: 'u-tenda', role: 'medium' }, areas } });
    render(<LoginPage />);
    login();

    fireEvent.click(await screen.findByRole('button', { name: /tenda vizinha/i }));

    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalledWith({ id: 'u-tenda', role: 'medium', areas }));
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/v1/auth/login/select',
      { selection_token: 'sel-token', user_id: 'u-tenda' },
      expect.objectContaining({ skipAutoLogout: true }),
    );
  });

  it('escolha expirada volta ao e-mail e senha com o motivo e a senha limpa', async () => {
    mockPost.mockResolvedValueOnce({ data: CHOICE }).mockRejectedValueOnce({
      response: {
        status: 401,
        data: { detail: { error_code: 'SELECTION_INVALID', message: 'O tempo para escolher o terreiro acabou. Entre de novo com seu e-mail e senha.' } },
      },
    });
    render(<LoginPage />);
    login();
    fireEvent.click(await screen.findByRole('button', { name: /casa da ana/i }));

    expect(await screen.findByText(/o tempo para escolher o terreiro acabou/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /em qual terreiro/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue('ana@example.com');
    expect(screen.getByLabelText(/^senha/i)).toHaveValue('');
    expect(mockCompleteLogin).not.toHaveBeenCalled();
  });

  it('falha de rede fica no passo e deixa tentar de novo', async () => {
    mockPost
      .mockResolvedValueOnce({ data: CHOICE })
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { user: { id: 'u-casa', role: 'admin' }, areas: { admin: true, medium: null } } });
    render(<LoginPage />);
    login();
    fireEvent.click(await screen.findByRole('button', { name: /casa da ana/i }));

    expect(await screen.findByText(/não foi possível entrar agora/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /em qual terreiro/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /casa da ana/i }));
    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalled());
  });

  it('"Entrar com outro e-mail" volta ao formulário', async () => {
    mockPost.mockResolvedValueOnce({ data: CHOICE });
    render(<LoginPage />);
    login();
    fireEvent.click(await screen.findByRole('button', { name: /entrar com outro e-mail/i }));

    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^senha/i)).toHaveValue('');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('login de conta única continua direto (sem passo de escolha)', async () => {
    mockPost.mockResolvedValueOnce({ data: { user: { id: 'u1', role: 'admin' }, areas: { admin: true, medium: null } } });
    render(<LoginPage />);
    login();
    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /em qual terreiro/i })).not.toBeInTheDocument();
  });
});

describe('helpers do AM-05', () => {
  it('areasHint resume as áreas da conta', () => {
    expect(areasHint({ admin: true, medium: true })).toBe('Painel e Área do Médium');
    expect(areasHint({ admin: true, medium: false })).toBe('Painel do terreiro');
    expect(areasHint({ admin: false, medium: true })).toBe('Área do Médium');
    expect(areasHint({ admin: false, medium: false })).toBe('Entrar neste terreiro');
  });

  it('isAccountChoice só reconhece a resposta de escolha', () => {
    expect(isAccountChoice(CHOICE)).toBe(true);
    expect(isAccountChoice({ user: { id: 'u1' }, access_token: 'x' })).toBe(false);
    expect(isAccountChoice({ choose_account: true })).toBe(false);
    expect(isAccountChoice(null)).toBe(false);
  });
});
