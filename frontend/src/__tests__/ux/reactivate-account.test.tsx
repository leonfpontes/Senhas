import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  useRouter: () => ({ query: { email: 'dono@example.com' }, isReady: true, push: jest.fn(), replace: jest.fn() }),
}));

import ReactivateAccountPage from '../../pages/reactivate-account';

describe('Reativar conta', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockCompleteLogin.mockReset();
  });

  it('chega com o e-mail preenchido e, ao reativar, já entra', async () => {
    mockPost.mockResolvedValueOnce({ data: { user: { id: 'u1', role: 'admin' } } });
    render(<ReactivateAccountPage />);
    expect(await screen.findByDisplayValue('dono@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'Senha-forte-123' } });
    fireEvent.click(screen.getByRole('button', { name: /reativar conta/i }));

    await waitFor(() => expect(mockCompleteLogin).toHaveBeenCalledWith({ id: 'u1', role: 'admin' }));
  });

  it('senha errada mostra o erro em vez de "Conta reativada"', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { message: 'Credenciais inválidas' } } });
    render(<ReactivateAccountPage />);
    await screen.findByDisplayValue('dono@example.com');
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: /reativar conta/i }));

    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument();
    expect(screen.queryByText(/reativada/i)).not.toBeInTheDocument();
    expect(mockCompleteLogin).not.toHaveBeenCalled();
  });
});
