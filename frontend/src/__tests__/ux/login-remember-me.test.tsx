import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks de dependências externas do LoginPage
const mockPost = jest.fn();
jest.mock('../../services/api_client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
  extractApiErrorMessage: (err: unknown, fallback: string) => {
    const d = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
    return typeof d?.message === 'string' ? d.message : fallback;
  },
}));
const mockCompleteLogin = jest.fn();
jest.mock('../../services/authSession', () => ({
  completeLogin: (...args: unknown[]) => mockCompleteLogin(...args),
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn() }),
}));

import LoginPage from '../../pages/login';

function fillAndSubmit(password = 'secret123') {
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
}

const DEACTIVATED = {
  response: { data: { detail: { error_code: 'TENANT_DEACTIVATED', message: 'Esta conta está desativada. Deseja reativá-la?' } } },
};

describe('Login — Lembrar-me', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockCompleteLogin.mockReset();
    mockPost.mockResolvedValue({ data: { user: { id: 'u1', role: 'admin' } } });
  });

  it('exibe o checkbox "Lembrar-me" marcado por padrão', () => {
    render(<LoginPage />);
    const checkbox = screen.getByRole('checkbox', { name: /lembrar-me/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('envia remember_me=false quando desmarcado e conclui o login', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: /lembrar-me/i }));
    fillAndSubmit();

    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalledWith({ id: 'u1', role: 'admin' }));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ remember_me: false }));
  });

  it('conta desativada: "Reativar e entrar" usa a senha já digitada e entra direto', async () => {
    mockPost.mockRejectedValueOnce(DEACTIVATED);
    mockPost.mockResolvedValueOnce({ data: { user: { id: 'u1', role: 'admin' } } });
    render(<LoginPage />);
    expect(screen.queryByRole('button', { name: /reativar e entrar/i })).not.toBeInTheDocument();
    fillAndSubmit();

    fireEvent.click(await screen.findByRole('button', { name: /reativar e entrar/i }));
    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalled());
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/v1/auth/reactivate-account',
      { email: 'a@b.com', password: 'secret123', remember_me: true },
      expect.objectContaining({ skipAutoLogout: true }),
    );
  });

  it('reativação recusada mostra o motivo real', async () => {
    mockPost.mockRejectedValueOnce(DEACTIVATED);
    mockPost.mockRejectedValueOnce({ response: { data: { message: 'Credenciais inválidas' } } });
    render(<LoginPage />);
    fillAndSubmit();

    fireEvent.click(await screen.findByRole('button', { name: /reativar e entrar/i }));
    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument();
    expect(mockCompleteLogin).not.toHaveBeenCalled();
  });

  it('passa as áreas da resposta do login para decidir a rota (AM-04)', async () => {
    const areas = { admin: false, medium: { medium_id: 'm1', nome: 'Ana' } };
    mockPost.mockResolvedValue({ data: { user: { id: 'u1', role: 'medium' }, areas } });
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalledWith({ id: 'u1', role: 'medium', areas }));
  });

  it('"Recebi um convite da casa" explica que o primeiro acesso é pelo link da casa (AM-04)', () => {
    render(<LoginPage />);
    const botao = screen.getByRole('button', { name: /recebi um convite da casa/i });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/o primeiro acesso começa pelo link da casa/i)).not.toBeInTheDocument();
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/o primeiro acesso começa pelo link da casa/i)).toBeInTheDocument();
    expect(screen.getByText(/whatsapp ou no e-mail/i)).toBeInTheDocument();
  });

  it('erro comum não oferece reativação', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { detail: 'E-mail ou senha incorretos.' } } });
    render(<LoginPage />);
    fillAndSubmit('x');
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reativar e entrar/i })).not.toBeInTheDocument();
  });
});
