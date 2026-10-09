/**
 * Seletor de gira do topo: aparece só no Início. Senhas e Porta têm o próprio seletor (o mesmo
 * estado do GiraContext) — dois selects iguais lado a lado confundiam o porteiro.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

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
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { id: 'u1', email: 'a@b.c', role: 'admin', is_admin: true }, loading: false, refresh: jest.fn() }),
}));

const amanha = new Date(Date.now() + 86400000).toISOString();
const depois = new Date(Date.now() + 3 * 86400000).toISOString();
const GIRAS = [
  { id: 'g1', nome: 'Gira de Pretos Velhos', data_inicio: amanha, is_active: true },
  { id: 'g2', nome: 'Gira de Caboclos', data_inicio: depois, is_active: true },
];
const mockGet = jest.fn((url: string) =>
  Promise.resolve({ data: url.startsWith('/api/v1/admin/giras') ? GIRAS : [] }),
);
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (url: string) => mockGet(url), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  endImpersonation: jest.fn(),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, permissions: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: () => true,
    subscription: { plan: 'premium' },
    planLabel: 'Premium',
    loading: false,
    canCreateGira: () => true,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/components/support/useTenantSupportUnread', () => ({ useTenantSupportUnread: () => 0 }));

function renderEm(pathname: string) {
  mockRouter.pathname = pathname;
  mockRouter.asPath = pathname;
  const AdminLayout = require('@/pages/admin/admin_layout').default;
  return render(
    <AdminLayout title="Tela">
      <div>conteúdo</div>
    </AdminLayout>,
  );
}

beforeEach(() => {
  mockGet.mockClear();
  window.sessionStorage.clear();
});

it('no Início o topo mostra o seletor de gira', async () => {
  renderEm('/admin/dashboard');
  expect(await screen.findByTestId('topbar-gira-select')).toBeInTheDocument();
});

it.each(['/admin/porta', '/admin/tickets'])('em %s o topo não repete o seletor da tela', async (rota) => {
  renderEm(rota);
  // A gira compartilhada continua sendo carregada (a tela usa o mesmo estado)...
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/giras'));
  // ...mas o select do topo não aparece.
  expect(screen.queryByTestId('topbar-gira-select')).not.toBeInTheDocument();
});
