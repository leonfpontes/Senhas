/**
 * AM-04 — "Trocar de área" no menu do perfil do painel (só para quem também tem a Área do
 * Médium) e o painel mandando conta sem painel (médium puro) para a Área.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouter: any = {
  pathname: '/admin/dashboard',
  asPath: '/admin/dashboard',
  query: {},
  isReady: true,
  push: jest.fn(() => Promise.resolve(true)),
  replace: jest.fn(() => Promise.resolve(true)),
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));

let mockProfile: unknown = null;
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile, loading: false, refresh: jest.fn() }),
}));

const mockGet = jest.fn((..._a: unknown[]) => Promise.resolve({ data: [] }));
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  endImpersonation: jest.fn(),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    permissions: null,
    loading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: () => true,
    subscription: { plan: 'basic' },
    planLabel: 'Basic',
    loading: false,
    canCreateGira: () => true,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/components/support/useTenantSupportUnread', () => ({
  useTenantSupportUnread: () => 0,
}));

const AMBAS = { admin: true, medium: { medium_id: 'm1', nome: 'Ana' } };

function renderLayout() {
  const AdminLayout = require('@/pages/admin/admin_layout').default;
  return render(
    <AdminLayout title="Início">
      <div data-testid="conteudo-painel">painel</div>
    </AdminLayout>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('AdminTopbar — Trocar de área', () => {
  it('quem tem as duas áreas vê "Trocar de área", que leva à Área e atualiza a escolha lembrada', async () => {
    mockProfile = { id: 'u1', role: 'operator', email: 'ana@x.com', tenant_id: 't1', areas: AMBAS };
    localStorage.setItem('girahub:area:u1', 'admin');
    renderLayout();
    await userEvent.click(screen.getByTestId('topbar-user-menu'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Trocar de área/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/medium');
    expect(localStorage.getItem('girahub:area:u1')).toBe('medium');
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'medium',
      lembrada: true,
      origem: 'troca',
    });
  });

  it('quem só tem o painel não vê "Trocar de área"', async () => {
    mockProfile = {
      id: 'u2',
      role: 'admin',
      email: 'adm@x.com',
      tenant_id: 't1',
      areas: { admin: true, medium: null },
    };
    renderLayout();
    await userEvent.click(screen.getByTestId('topbar-user-menu'));
    expect(await screen.findByRole('menuitem', { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Trocar de área/ })).not.toBeInTheDocument();
  });
});

describe('AdminLayout — conta sem painel', () => {
  it('médium puro vai para a Área do Médium e o painel não é montado', async () => {
    mockProfile = {
      id: 'u3',
      role: 'medium',
      email: 'm@x.com',
      tenant_id: 't1',
      areas: { admin: false, medium: AMBAS.medium },
    };
    renderLayout();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/medium'));
    expect(screen.queryByTestId('conteudo-painel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-user-menu')).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
