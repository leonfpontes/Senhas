import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks de dependências externas do LoginPage
const mockPost = jest.fn();
jest.mock('../../services/api_client', () => ({
  apiClient: { post: (...args: any[]) => mockPost(...args) },
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
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  it('exibe o checkbox "Lembrar-me" marcado por padrão', () => {
    render(<LoginPage />);
    const checkbox = screen.getByRole('checkbox', { name: /lembrar-me/i }) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(true);
  });

  it('envia remember_me=false quando desmarcado', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /lembrar-me/i }));

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ remember_me: false }),
    );
  });
});
