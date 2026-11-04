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

  it('barra enxuta (J1 v2): dia de gira fixo, "Da casa", "Ver os N módulos"; Conta sai da barra', () => {
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator={false} />);
    const nav = screen.getByTestId('admin-sidebar');
    for (const g of ['Dia de gira', 'Da casa']) {
      expect(within(nav).getByText(g)).toBeInTheDocument();
    }
    for (const [nome, href] of [
      ['Início', '/admin/dashboard'],
      ['Giras', '/admin/giras'],
      ['Porta', '/admin/porta'],
      ['Senhas', '/admin/tickets'],
    ]) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${nome}`) })).toHaveAttribute('href', href);
    }
    const { MODULOS } = require('@/constants/modulos');
    expect(within(nav).getByRole('link', { name: new RegExp(`Ver os ${MODULOS.length} módulos`) })).toHaveAttribute('href', '/admin/modulos');
    // Sem a beta do menu ajustável, "Da casa" tem tudo o que o plano e o perfil liberam.
    expect(within(nav).getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/admin/analytics');
    expect(within(nav).getByRole('link', { name: /Médiuns/ })).toHaveAttribute('href', '/admin/mediuns');
    // Conta e plano mora no menu do avatar.
    expect(within(nav).queryByRole('link', { name: /Plano e assinatura/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Auditoria/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-version')).toHaveTextContent(APP_VERSION_LABEL);
    expect(screen.getByText('Pro · mês grátis')).toBeInTheDocument();
  });

  it('Área do Médium não tem item na barra: a configuração fica só em Configurações (Leonardo, 04/11/2026)', () => {
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator={false} />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).queryByRole('link', { name: /Área do Médium/ })).not.toBeInTheDocument();
    const { MODULOS } = require('@/constants/modulos');
    expect(MODULOS.some((m: { nome: string }) => m.nome === 'Área do Médium')).toBe(false);
  });

  it('montarSidebarNav: a conta inteira vai para o avatar, sem perder item', () => {
    const { montarSidebarNav } = require('@/components/admin/layout/navConfig');
    const L = (href: string, label: string) => ({ kind: 'link', href, label, icon: () => null });
    const groups = [
      { key: 'hoje', label: 'Hoje', items: [L('/admin/dashboard', 'Início'), L('/admin/porta', 'Porta')] },
      { key: 'giras', label: 'Giras', items: [L('/admin/giras', 'Giras'), L('/admin/tickets', 'Senhas'), L('/admin/analytics', 'Analytics')] },
      { key: 'conta', label: 'Conta', items: [L('/admin/billing', 'Plano e assinatura'), L('/admin/config', 'Configurações')] },
    ];
    const todos = montarSidebarNav(groups, { ajustavel: false, noMenu: () => false });
    expect(todos.fixos.map((e: { label: string }) => e.label)).toEqual(['Início', 'Giras', 'Porta', 'Senhas']);
    expect(todos.daCasa.map((e: { label: string }) => e.label)).toEqual(['Analytics']);
    expect(todos.conta.map((e: { label: string }) => e.label)).toEqual(['Plano e assinatura', 'Configurações']);
    // Com a beta, só o que a casa usa (ou a pessoa pôs) sobe para "Da casa".
    const ajustado = montarSidebarNav(groups, { ajustavel: true, noMenu: () => false });
    expect(ajustado.daCasa).toEqual([]);
    expect(montarSidebarNav(groups, { ajustavel: true, noMenu: (k: string) => k === 'relatorio' }).daCasa).toHaveLength(1);
  });

  it('operador só com a Porta liberada não vê Giras, Senhas nem os grupos sem nada liberado', () => {
    mockGroupCan.mockImplementation((feature: string, action: string) => feature === 'porta' && action === 'view');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /Porta/ })).toHaveAttribute('href', '/admin/porta');
    expect(within(nav).queryByRole('link', { name: /^Giras( |$)/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Senhas/ })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Giras e senhas')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Corrente')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Casa')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Plano e assinatura')).not.toBeInTheDocument();
  });

  it('Analytics e Auditoria seguem plano e grupo', () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'auditoria');
    mockGroupCan.mockImplementation((f: string) => f === 'analytics');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /Analytics/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Auditoria/ })).not.toBeInTheDocument();
  });

  it('operador só com contas_financeiras vê Lançamentos e Configuração financeira, não Mensalidades', () => {
    mockGroupCan.mockImplementation((f: string, a: string) => f === 'contas_financeiras' && a === 'view');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    fireEvent.click(within(nav).getByRole('button', { name: /Financeiro/ }));
    expect(within(nav).getByRole('link', { name: /Lançamentos/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Configuração financeira/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Mensalidades/ })).not.toBeInTheDocument();
  });

  it('operador com financeiro:view vê Mensalidades (dentro de Financeiro) e a Configuração financeira (antes: escondidas por !isOperator)', () => {
    mockGroupCan.mockImplementation((f: string, a: string) => f === 'financeiro' && a === 'view');
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(<AdminSidebar isOperator />);
    const nav = screen.getByTestId('admin-sidebar');
    fireEvent.click(within(nav).getByRole('button', { name: /Financeiro/ }));
    expect(within(nav).getByRole('link', { name: /Mensalidades/ })).toHaveAttribute('href', '/admin/financeiro/mensalidades');
    expect(within(nav).getByRole('link', { name: /Configuração financeira/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Lançamentos/ })).not.toBeInTheDocument();
  });

  it('operador com o grupo configuracoes vê Configurações no menu do avatar (a tela gateia por grupo)', () => {
    mockGroupCan.mockImplementation((feature: string, action: string) => feature === 'configuracoes' && action === 'view');
    const { useAdminNav, montarSidebarNav } = require('@/components/admin/layout/navConfig');
    let conta: { label: string; href: string }[] = [];
    function Sonda() {
      conta = montarSidebarNav(useAdminNav({ isOperator: true }), { ajustavel: false, noMenu: () => false }).conta;
      return null;
    }
    render(<Sonda />);
    expect(conta.find((l) => l.label === 'Configurações')?.href).toBe('/admin/config');
    expect(conta.find((l) => l.label === 'Perfis de acesso')).toBeUndefined();
  });

  it('"Site do terreiro" segue o grupo site e "Cursos" o grupo cursos_presenciais (T-06)', () => {
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    mockGroupCan.mockImplementation((f: string, a: string) => f === 'site' && a === 'view');
    const { unmount } = withSidebar(<AdminSidebar isOperator />);
    let nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /Site do terreiro/ })).toHaveAttribute('href', '/admin/meu-site');
    expect(within(nav).queryByRole('link', { name: /^Cursos$/ })).not.toBeInTheDocument();
    unmount();

    mockGroupCan.mockImplementation((f: string, a: string) => f === 'cursos_presenciais' && a === 'view');
    withSidebar(<AdminSidebar isOperator />);
    nav = screen.getByTestId('admin-sidebar');
    expect(within(nav).getByRole('link', { name: /^Cursos$/ })).toHaveAttribute('href', '/admin/cursos-presenciais');
    expect(within(nav).queryByRole('link', { name: /Site do terreiro/ })).not.toBeInTheDocument();
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

describe('getFeatureForPath', () => {
  it('rotas do financeiro exigem a mesma feature da tela e do backend', () => {
    const { getFeatureForPath } = require('@/pages/admin/admin_layout');
    expect(getFeatureForPath('/admin/financeiro/lancamentos')).toBe('contas_financeiras');
    expect(getFeatureForPath('/admin/financeiro/contas-pagar')).toBe('contas_financeiras');
    expect(getFeatureForPath('/admin/financeiro/contas-receber')).toBe('contas_financeiras');
    expect(getFeatureForPath('/admin/financeiro/fluxo-de-caixa')).toBe('contas_financeiras');
    expect(getFeatureForPath('/admin/financeiro/mensalidades')).toBe('financeiro');
    expect(getFeatureForPath('/admin/financeiro/config')).toBeNull();
    expect(getFeatureForPath('/admin/analytics')).toBe('analytics');
    expect(getFeatureForPath('/admin/audit-trail')).toBe('auditoria');
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
    fireEvent.click(screen.getByRole('option', { name: /^Giras( |$)/ }));
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

  it('lê os parâmetros só do fragmento — query string não vale (pentest L1)', () => {
    const { readImpersonationParams } = require('@/pages/admin/impersonate');
    expect(readImpersonationParams('#token=abc&user=u&tenant=t')).toEqual({ token: 'abc', user: 'u', tenant: 't' });
    expect(readImpersonationParams('')).toBeNull();
    expect(readImpersonationParams('#token=abc')).toBeNull();
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
