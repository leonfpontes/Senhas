/**
 * /platform/settings — abas por query; edição de admin respeita o `is_active` escolhido;
 * criação exige a regra de senha do app.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/settings',
  query: {} as Record<string, string>,
  asPath: '/platform/settings',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    put: (...a: unknown[]) => mockPut(...a),
    post: (...a: unknown[]) => mockPost(...a),
    delete: jest.fn(),
  },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import SettingsPage from '@/pages/platform/settings';

const ADMINS = [
  { id: 'a1', email: 'leo@girahub.com.br', username: 'leo', role: 'super_admin', is_active: true, created_at: '2026-01-01T00:00:00Z' },
];

describe('Platform — Configurações', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/platform/users') return Promise.resolve({ data: ADMINS });
      if (url === '/api/v1/auth/me') return Promise.resolve({ data: { id: 'a1', email: 'leo@girahub.com.br', username: 'leo', role: 'super_admin', is_active: true, created_at: '2026-01-01T00:00:00Z', full_name: 'Leonardo' } });
      return Promise.resolve({ data: [] });
    });
    mockPut.mockResolvedValue({ data: {} });
    mockPost.mockResolvedValue({ data: {} });
  });
  afterEach(() => localStorage.clear());

  it('aba Conta mostra os dados do super admin logado', async () => {
    mockRouter.query = {};
    render(<SettingsPage />);
    expect(await screen.findByText('Leonardo')).toBeInTheDocument();
    expect(screen.getByText('leo@girahub.com.br')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alterar senha/ })).toBeDisabled();
  });

  it('editar admin envia o is_active desmarcado (não mais sempre true)', async () => {
    mockRouter.query = { tab: 'admins' };
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar leo@girahub.com.br' }));
    const toggle = await screen.findByRole('switch', { name: /Conta ativa/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/api/v1/platform/users/a1', { username: 'leo', is_active: false }));
  });

  it('novo admin exige senha forte antes de habilitar "Criar"', async () => {
    mockRouter.query = { tab: 'admins' };
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo admin/ }));
    fireEvent.change(await screen.findByLabelText(/E-mail/), { target: { value: 'novo@girahub.com.br' } });
    fireEvent.change(screen.getByLabelText(/Usuário/), { target: { value: 'novo' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'fraca' } });
    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'SenhaForte#2026' } });
    expect(screen.getByRole('button', { name: 'Criar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/platform/users', { email: 'novo@girahub.com.br', username: 'novo', password: 'SenhaForte#2026' }));
  });

  it('aba Planos usa os preços da constante', async () => {
    mockRouter.query = { tab: 'planos' };
    render(<SettingsPage />);
    expect(await screen.findByText('R$ 49,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 79,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 99,00')).toBeInTheDocument();
    expect(screen.getByText('Grátis')).toBeInTheDocument();
  });

  it('aba Planos deriva os recursos de FEATURE_MIN_PLAN (mensalidade de médiuns a partir do Pro)', async () => {
    mockRouter.query = { tab: 'planos' };
    render(<SettingsPage />);
    const row = (await screen.findByText('Mensalidade dos médiuns')).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').slice(1); // free, basic, pro, premium
    expect(cells.map((c) => within(c).queryByLabelText('Incluído') !== null)).toEqual([false, false, true, true]);
    const suporte = (await screen.findByText('Suporte prioritário')).closest('tr') as HTMLElement;
    expect(within(suporte).getAllByLabelText('Incluído')).toHaveLength(1);
  });
});
