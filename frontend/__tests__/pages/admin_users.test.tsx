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
    // "Tipo de acesso" em português, sem "role"
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

  it('nova pessoa não pede senha: manda convite por e-mail', async () => {
    const { apiClient } = require('@/services/api_client');
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    fireEvent.click(screen.getByRole('button', { name: /Nova pessoa/ }));
    fireEvent.change(await screen.findByLabelText(/^E-mail/), { target: { value: 'nova@test.com' } });
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Nova Pessoa' } });
    expect(screen.queryByLabelText(/Senha/)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    });
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/users/convites', {
      email: 'nova@test.com',
      nome: 'Nova Pessoa',
      role: 'operator',
      group_id: null,
    });
  });

  it('o perfil escolhido vai no convite (aplicado quando a pessoa aceitar)', async () => {
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
      if (url.startsWith('/api/v1/admin/users/convites')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: MOCK_USERS });
    });

    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    fireEvent.click(screen.getByRole('button', { name: /Nova pessoa/ }));

    fireEvent.change(await screen.findByLabelText(/^E-mail/), { target: { value: 'nova@test.com' } });
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Nova' } });

    const select = await screen.findByRole('combobox', { name: 'Pode fazer:' });
    expect(select).toHaveTextContent('Acesso total');
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Porta' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/users/convites', {
      email: 'nova@test.com',
      nome: 'Nova',
      role: 'operator',
      group_id: 'g-porta',
    });
    expect(apiClient.delete).not.toHaveBeenCalled();
    mockProfile.role = 'operator';
  });

  it('mostra o convite pendente na lista e cancela com confirmação', async () => {
    mockProfile.role = 'admin';
    const { apiClient } = require('@/services/api_client');
    apiClient.get.mockImplementation((url: string) => {
      if (url.startsWith('/api/v1/admin/users/convites')) {
        return Promise.resolve({
          data: [
            {
              id: 'c1', email: 'convidada@test.com', nome: 'Convidada', role: 'operator', situacao: 'enviado',
              enviado_em: '2026-11-19T12:00:00Z', expira_em: '2026-11-26T12:00:00Z', created_at: '2026-11-19T12:00:00Z',
            },
          ],
        });
      }
      return Promise.resolve({ data: MOCK_USERS });
    });
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    expect(await screen.findByText('convidada@test.com')).toBeInTheDocument();
    expect(screen.getByText(/Convite enviado · vale até/)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite de convidada@test.com' }));
    });
    await waitFor(() => screen.getByRole('alertdialog'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/admin/users/convites/c1');
    mockProfile.role = 'operator';
  });

  it('usuários ilimitados: "Nova pessoa" sempre habilitado, sem aviso de limite do plano', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    expect(screen.getByRole('button', { name: /Nova pessoa/ })).toBeEnabled();
    expect(screen.queryByText(/Seu plano permite/)).not.toBeInTheDocument();
  });

  it('a lista vem sempre completa (filtro de perfil é só visual)', async () => {
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
    // Clique para editar (04/11/2026): a linha editável é "Editar <usuário>"; sem lápis.
    expect(screen.getAllByRole('row', { name: /^Editar / })).toHaveLength(2);
    mockProfile.role = 'operator';
    mockProfile.id = undefined;
  });

  it('operador com permissão de grupo não edita nem exclui administradores', async () => {
    const AdminUsers = require('@/pages/admin/users').default;
    wrap(<AdminUsers />);
    await waitFor(() => screen.getByText('alice@test.com'));
    expect(screen.getAllByRole('button', { name: 'Excluir usuário' })).toHaveLength(1);
    expect(screen.getAllByRole('row', { name: /^Editar / })).toHaveLength(1);
  });
});
