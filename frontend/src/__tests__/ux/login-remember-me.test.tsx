import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks de dependências externas do LoginPage
const mockPost = jest.fn();
jest.mock('../../services/api_client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));
jest.mock('../../providers/ThemeProvider', () => ({
  dispatchTenantBrandingUpdated: jest.fn(),
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn() }),
}));

import LoginPage from '../../pages/login';

describe('Login — Lembrar-me', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { user: { role: 'admin' } } });
    // jsdom não implementa navigation; evita erro ao redirecionar
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
  });

  it('exibe o checkbox "Lembrar-me" marcado por padrão', () => {
    render(<LoginPage />);
    const checkbox = screen.getByRole('checkbox', { name: /lembrar-me/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('envia remember_me=false quando desmarcado', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /lembrar-me/i }));

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ remember_me: false }),
    );
  });

  it('"Reative aqui" só aparece no erro TENANT_DEACTIVATED', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: { error_code: 'TENANT_DEACTIVATED', message: 'Terreiro desativado.' } } },
    });
    render(<LoginPage />);
    expect(screen.queryByRole('link', { name: /reative aqui/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    const link = await screen.findByRole('link', { name: /reative aqui/i });
    expect(link.getAttribute('href')).toContain('/reactivate-account');
  });

  it('erro comum não oferece reativação', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { detail: 'E-mail ou senha incorretos.' } } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /reative aqui/i })).not.toBeInTheDocument();
  });
});
