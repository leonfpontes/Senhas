/**
 * Plataforma — layout (Sidebar, perfil real, versão, badge de suporte) e rotas que viraram
 * redirecionamento (observatory, billing, users_global, profile).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/tenants/abc',
  query: {} as Record<string, string>,
  asPath: '/platform/tenants/abc',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ data: { count: 3 } }), post: jest.fn().mockResolvedValue({ data: {} }) },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));

jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { username: 'leo', email: 'leo@girahub.com.br', full_name: 'Leonardo Pontes' }, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 3 }));

describe('PlatformLayout', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
  });
  afterEach(() => localStorage.clear());

  it('renderiza navegação, perfil real, versão e breadcrumb aninhado', async () => {
    const PlatformLayout = require('@/pages/platform/layout').default;
    render(
      <PlatformLayout breadcrumbs={[{ label: 'Terreiros', href: '/platform/tenants' }, { label: 'Casa Alfa' }]}>
        <div data-testid="platform-child">Conteúdo</div>
      </PlatformLayout>,
    );
    expect(await screen.findByTestId('platform-child')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute('href', '/platform');
    expect(screen.getByRole('link', { name: 'Terreiros', current: 'page' })).toHaveAttribute('href', '/platform/tenants');
    expect(screen.getByText('Leonardo Pontes')).toBeInTheDocument();
    expect(screen.getByText('leo@girahub.com.br')).toBeInTheDocument();
    expect(screen.getByText(/GiraHub v\d+\.\d+\.\d+/)).toBeInTheDocument();
    expect(screen.getByLabelText('3 conversas não lidas')).toBeInTheDocument();
    expect(screen.getByText('Casa Alfa')).toBeInTheDocument();
    expect(screen.queryByText('Observatório')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuários Globais')).not.toBeInTheDocument();
  });

  it('alterna o modo escuro pela classe dark na raiz', async () => {
    const PlatformLayout = require('@/pages/platform/layout').default;
    render(<PlatformLayout><div /></PlatformLayout>);
    const toggle = await screen.findByRole('button', { name: 'Modo escuro' });
    toggle.click();
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });
});

describe('Rotas que viraram redirecionamento', () => {
  beforeEach(() => mockRouter.replace.mockClear());

  it.each([
    ['observatory', '/platform'],
    ['billing', '/platform/tenants?tab=assinaturas'],
    ['users_global', '/platform/settings?tab=admins'],
    ['profile', '/platform/settings?tab=conta'],
  ])('/platform/%s → %s', async (page, dest) => {
    const Page = require(`@/pages/platform/${page}`).default;
    render(<Page />);
    expect(screen.getByRole('status')).toHaveTextContent(/Redirecionando/);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(dest));
  });
});
