/**
 * Layout admin v2: Sidebar filtrada por permissão, busca de ações (⌘K), barra inferior do
 * celular e entrada da impersonação pelo fragmento `#token=`.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { APP_VERSION_LABEL } from '@/lib/version';

const mockRouter: any = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/dashboard',
  query: {},
  asPath: '/admin/dashboard',
  isReady: true,
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

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ data: {} }), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() },
}));

const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));

const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: mockPlanCan,
    subscription: { plan: 'pro', is_trial: true },
    planLabel: 'Pro',
    loading: false,
    canCreateGira: () => true,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/components/support/useTenantSupportUnread', () => ({ useTenantSupportUnread: () => 0 }));

function withSidebar(ui: React.ReactElement) {
  return render(<SidebarProvider>{ui}</SidebarProvider>);
}

describe('AdminSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupCan.mockImplementation(() => true);
    mockPlanCan.mockImplementation(() => true);
  });

  it('admin vê os grupos por trabalho, a versão e o plano com "mês grátis"', () => {
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator={false} />);
    const nav = screen.getByTestId('admin-sidebar');
    for (const g of ['Hoje', 'Giras e senhas', 'Corrente', 'Casa', 'Conta']) {
      expect(within(nav).getByText(g)).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: /Plano e assinatura/ })).toHaveAttribute('href', '/admin/billing');
    expect(within(nav).getByRole('link', { name: /Pessoas e acessos/ })).toHaveAttribute('href', '/admin/users');
    expect(within(nav).getByRole('link', { name: /Ajuda/ })).toHaveAttribute('href', '/admin/suporte');
    expect(within(nav).queryByText('Analytics')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Auditoria')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-version')).toHaveTextContent(APP_VERSION_LABEL);
    expect(screen.getByText('Pro · mês grátis')).toBeInTheDocument();
  });

  it('operador só com a Porta liberada não vê Giras, Senhas nem os grupos sem nada liberado', () => {
    mockGroupCan.mockImplementation((feature: string, action: string) => feature === 'porta' && action === 'view');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /Porta/ })).toHaveAttribute('href', '/admin/porta');
    expect(within(nav).queryByRole('link', { name: /^Giras$/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Senhas/ })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Giras e senhas')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Corrente')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Casa')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Plano e assinatura')).not.toBeInTheDocument();
  });

  it('operador com o grupo configuracoes vê Configurações (a tela gateia por grupo)', () => {
    mockGroupCan.mockImplementation((feature: string, action: string) => feature === 'configuracoes' && action === 'view');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /Configurações/ })).toHaveAttribute('href', '/admin/config');
    expect(within(nav).queryByText('Perfis de acesso')).not.toBeInTheDocument();
  });

  it('sem o plano do site, Cursos some (a tela é bloqueada por plano)', () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'site_builder');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator={false} />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).queryByRole('link', { name: /^Cursos$/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Site do terreiro/ })).not.toBeInTheDocument();
  });

  it('sem o plano de estoque, o Estoque some mesmo com permissão de grupo', () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'estoque_controle');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator={false} />);
    expect(screen.queryByText('Estoque')).not.toBeInTheDocument();
  });
});

describe('CommandPalette', () => {
  const groups = () => [
    {
      key: 'giras',
      label: 'Giras e senhas',
      items: [{ kind: 'link', href: '/admin/giras', label: 'Giras', icon: () => null, keywords: ['agenda'] }],
    },
  ];

  beforeEach(() => jest.clearAllMocks());

  it('lista ações e páginas; escolher uma página navega e fecha', () => {
    const { CommandPalette } = require('@/components/admin/CommandPalette');
    const onOpenChange = jest.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        groups={groups()}
        canCreateGira
        canOpenPorta
        canShareLink
        onAction={jest.fn()}
      />,
    );
    expect(screen.getByRole('option', { name: /Criar gira/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Abrir Porta/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /^Giras$/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/admin/giras');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sem permissão, as ações somem', () => {
    const { CommandPalette } = require('@/components/admin/CommandPalette');
    render(
      <CommandPalette
        open
        onOpenChange={jest.fn()}
        groups={groups()}
        canCreateGira={false}
        canOpenPorta={false}
        canShareLink={false}
        onAction={jest.fn()}
      />,
    );
    expect(screen.queryByRole('option', { name: /Criar gira/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Abrir Porta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Compartilhar link/ })).not.toBeInTheDocument();
  });

  it('Ctrl K alterna a paleta', () => {
    const { useCommandPaletteShortcut } = require('@/components/admin/CommandPalette');
    const toggle = jest.fn();
    function Harness() {
      useCommandPaletteShortcut(toggle);
      return null;
    }
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(toggle).toHaveBeenCalledTimes(2);
  });
});

describe('MobileTabBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Início · Giras · + · Porta · Menu; o "+" oferece Nova gira, Sem senha e Compartilhar link', () => {
    const { MobileTabBar, PORTA_WALK_IN_EVENT } = require('@/components/admin/MobileTabBar');
    const onShare = jest.fn();
    const onWalkIn = jest.fn();
    window.addEventListener(PORTA_WALK_IN_EVENT, onWalkIn);
    withSidebar(<MobileTabBar canGiras canPorta canCreateGira canWalkIn onShareLink={onShare} />);
    const bar = screen.getByTestId('mobile-tab-bar');
    expect(within(bar).getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/admin/dashboard');
    expect(within(bar).getByRole('link', { name: /Giras/ })).toHaveAttribute('href', '/admin/giras');
    expect(within(bar).getByRole('link', { name: /Porta/ })).toHaveAttribute('href', '/admin/porta');
    expect(within(bar).getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole('button', { name: 'Ações rápidas' }));
    expect(screen.getByRole('link', { name: /Nova gira/ })).toHaveAttribute('href', '/admin/giras?nova=1');
    fireEvent.click(screen.getByRole('button', { name: /Sem senha/ }));
    expect(onWalkIn).toHaveBeenCalled();
    window.removeEventListener(PORTA_WALK_IN_EVENT, onWalkIn);
  });

  it('sem permissão de giras nem de porta, só Início e Menu', () => {
    const { MobileTabBar } = require('@/components/admin/MobileTabBar');
    withSidebar(<MobileTabBar canGiras={false} canPorta={false} canCreateGira={false} canWalkIn={false} onShareLink={jest.fn()} />);
    const bar = screen.getByTestId('mobile-tab-bar');
    expect(within(bar).queryByRole('link', { name: /Giras/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('link', { name: /Porta/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Ações rápidas' })).not.toBeInTheDocument();
  });
});

describe('impersonate', () => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o));

  it('lê os parâmetros do fragmento, com a query string como alternativa', () => {
    const { readImpersonationParams } = require('@/pages/admin/impersonate');
    expect(readImpersonationParams({}, '#token=abc&user=u&tenant=t')).toEqual({ token: 'abc', user: 'u', tenant: 't' });
    expect(readImpersonationParams({ token: 'q', user: 'u', tenant: 't' }, '')).toEqual({ token: 'q', user: 'u', tenant: 't' });
    expect(readImpersonationParams({ token: 'q', user: 'u', tenant: 't' }, '#token=h')).toEqual({ token: 'h', user: 'u', tenant: 't' });
    expect(readImpersonationParams({}, '#token=abc')).toBeNull();
  });

  it('com #token= grava a sessão de impersonação e vai para o início', async () => {
    const replace = jest.fn();
    const originalLocation = window.location;
    // jsdom não deixa trocar location.replace diretamente.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hash: `#token=tok&user=${b64({ email: 'a@b.c' })}&tenant=${b64({ name: 'Casa' })}`, replace },
    });
    try {
      const Page = require('@/pages/admin/impersonate').default;
      await act(async () => {
        render(<Page />);
      });
      expect(window.sessionStorage.getItem('access_token')).toBe('tok');
      expect(window.sessionStorage.getItem('impersonating')).toBe('true');
      expect(JSON.parse(window.sessionStorage.getItem('impersonate_tenant') as string)).toEqual({ name: 'Casa' });
      expect(replace).toHaveBeenCalledWith('/admin/dashboard');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
      window.sessionStorage.clear();
    }
  });
});
