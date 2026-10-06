/**
 * Tests for /admin/users page
 * Focus: ConfirmDialog delete flow, PageHeader, table rendering, loading/error states
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), pathname: '/admin/users',
    query: {}, asPath: '/admin/users',
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

jest.mock('@/services/api_client', () => ({
  apiClient: {
    get:    jest.fn(),
    post:   jest.fn().mockResolvedValue({ data: {} }),
    put:    jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Strip the layout so we only test the page content (avoids provider chain complexity)
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));

const mockCanCreateUser = jest.fn((count: number) => count < 10);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: { max_users: 10, plan: 'pro', status: 'active' },
    can: () => true,
    canCreateUser: (count: number) => mockCanCreateUser(count),
    loading: false,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));

const mockProfile: { role?: string; id?: string } = { role: 'operator' };
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile, loading: false, refresh: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(ui);
}

const MOCK_USERS = [
  { id: 'u1', email: 'alice@test.com', username: 'alice', role: 'admin',    is_active: true,  created_at: '2024-01-01T00:00:00Z' },
  { id: 'u2', email: 'bob@test.com',   username: 'bob',   role: 'operator', is_active: false, created_at: '2024-01-02T00:00:00Z' },
];

describe('Admin Users Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockResolvedValue({ data: { items: MOCK_USERS, total: 2, page: 1, pages: 1 } });
  });

  it('renders without crashing', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    const { container } = wrap(<AdminUsers />);
    expect(container).toBeTruthy();
  });

  it('does not show users while loading', () => {
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockReturnValue(new Promise(() => {})); // never resolves
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    expect(screen.queryByText('alice@test.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar/ })).toBeDisabled();
  });

  it('renders users after load', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
      expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    });
  });

  it('renders role chips with formatted labels', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    // "Perfil de acesso" em português, sem "role"
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(screen.queryByText(/role/i)).not.toBeInTheDocument();
  });

  it('opens ConfirmDialog when delete button is clicked', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    const deleteButtons = screen.getAllByRole('button', { name: 'Excluir usuário' });
    act(() => { fireEvent.click(deleteButtons[0]); });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('calls DELETE API and closes dialog on confirm', async () => {
    const { apiClient } = require('@/services/api_client');
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    const deleteButtons = screen.getAllByRole('button', { name: 'Excluir usuário' });
    act(() => { fireEvent.click(deleteButtons[0]); });

    await waitFor(() => screen.getByRole('alertdialog'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Excluir' })); });

    expect(apiClient.delete).toHaveBeenCalledWith(expect.stringContaining('/users/'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('closes dialog without deleting on cancel', async () => {
    const { apiClient } = require('@/services/api_client');
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));

    const deleteButtons = screen.getAllByRole('button', { name: 'Excluir usuário' });
    act(() => { fireEvent.click(deleteButtons[0]); });

    await waitFor(() => screen.getByRole('alertdialog'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); });

    expect(apiClient.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows PageHeader with title', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    expect(screen.getByRole('heading', { level: 1, name: 'Pessoas e acessos' })).toBeInTheDocument();
  });

  it('validates the password with the backend rule', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    fireEvent.click(screen.getByRole('button', { name: /Nova pessoa/ }));
    const senha = await screen.findByLabelText(/^Senha/);
    fireEvent.change(senha, { target: { value: 'curta' } });
    fireEvent.blur(senha);
    expect(await screen.findByText(/Falta: pelo menos 12 caracteres/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Regras da senha' })).toBeInTheDocument();
  });

  it('moves a new operator into the chosen group and out of the default one', async () => {
    mockProfile.role = 'admin';
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockImplementation((url: string) => {
      if (url.startsWith('/api/v1/admin/permission-groups')) {
        return Promise.resolve({
          data: [
            { id: 'g-default', name: 'Acesso total', is_default: true, members_count: 1 },
            { id: 'g-porta', name: 'Porta', is_default: false, members_count: 0 },
          ],
        });
      }
      return Promise.resolve({ data: MOCK_USERS });
    });
    apiClient.post.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/api/v1/admin/users' ? { id: 'new-user' } : {} }),
    );

    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    fireEvent.click(screen.getByRole('button', { name: /Nova pessoa/ }));

    fireEvent.change(await screen.findByLabelText(/^E-mail/), { target: { value: 'nova@test.com' } });
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Nova' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'SenhaForte#2026' } });

    // "Pode fazer:" com "Acesso total" como padrão
    const select = await screen.findByRole('combobox', { name: 'Pode fazer:' });
    expect(select).toHaveTextContent('Acesso total');
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Porta' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    });

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/permission-groups/g-porta/members', {
        user_id: 'new-user',
      }),
    );
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/admin/permission-groups/g-default/members/new-user');
    mockProfile.role = 'operator';
  });

  it('conta só pessoas ATIVAS no limite do plano', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    // alice ativa, bob inativo → 1 (não 2)
    expect(mockCanCreateUser).toHaveBeenLastCalledWith(1);
  });

  it('o filtro de perfil não muda a contagem do limite', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    const { apiClient } = require('@/services/api_client');
    // a lista vem sempre completa (o filtro é só visual)
    expect(apiClient.get).toHaveBeenCalledWith(expect.not.stringContaining('role_filter'));
  });

  it('admin não vê Excluir na própria linha (nem no último admin ativo)', async () => {
    mockProfile.role = 'admin';
    mockProfile.id = 'u1';
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    // alice (u1) é a própria e a única admin ativa: só bob tem Excluir
    expect(screen.getAllByRole('button', { name: 'Excluir usuário' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Editar usuário' })).toHaveLength(2);
    mockProfile.role = 'operator';
    mockProfile.id = undefined;
  });

  it('operador com permissão de grupo não edita nem exclui administradores', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    expect(screen.getAllByRole('button', { name: 'Excluir usuário' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Editar usuário' })).toHaveLength(1);
  });
});
