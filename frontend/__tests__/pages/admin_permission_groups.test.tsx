/**
 * /admin/permission-groups — lista de grupos (shadcn).
 * Foco: só admin, chip "Padrão" sem excluir, aviso de operadores sem grupo, sem jargão.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), pathname: '/admin/permission-groups', query: {}, isReady: true }),
}));

jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockProfile: { role: string } = { role: 'admin' };
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const GROUPS = [
  { id: 'g1', tenant_id: 't', name: 'Acesso total', description: '', version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', members_count: 1, features_configured_count: 14, is_default: true },
  { id: 'g2', tenant_id: 't', name: 'Porta', description: 'Só a porta', version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', members_count: 0, features_configured_count: 0, is_default: false },
];

function mockApi() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/permission-groups') return Promise.resolve({ data: GROUPS });
    if (url.endsWith('/g1/members')) return Promise.resolve({ data: [{ id: 'u1', email: 'a@x', username: 'ana' }] });
    if (url.endsWith('/members')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/v1/admin/users')) {
      return Promise.resolve({
        data: [
          { id: 'u1', email: 'a@x', username: 'ana', role: 'operator' },
          { id: 'u2', email: 'b@x', username: 'bia', role: 'operator' },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Page = () => React.createElement(require('@/pages/admin/permission-groups').default);

describe('Grupos de permissão', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile.role = 'admin';
    mockApi();
  });

  it('shows the default chip and no delete button for the default group', async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Acesso total')).toBeInTheDocument());
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir grupo Acesso total' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir grupo Porta' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum')).toBeInTheDocument();
  });

  it('warns about operators without group, in plain language', async () => {
    render(<Page />);
    expect(await screen.findByText('1 operador sem grupo')).toBeInTheDocument();
    expect(screen.getByText('bia')).toBeInTheDocument();
    expect(screen.getByText(/Operadores sem grupo não acessam nenhum módulo/)).toBeInTheDocument();
    expect(screen.queryByText(/RBAC|features|\bOR\b/)).not.toBeInTheDocument();
  });

  it('blocks non-admins', () => {
    mockProfile.role = 'operator';
    render(<Page />);
    expect(screen.getByText('Só administradores mudam os grupos de permissão.')).toBeInTheDocument();
  });
});
