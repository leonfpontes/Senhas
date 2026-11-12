/**
 * Menu do celular (J12 v2 · 03 e 08): busca no topo e, no fim da lista, o menu da pessoa, que
 * pede ao topo do painel as ações que abrem diálogo.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

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
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
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

describe('AdminSidebar no celular', () => {
  function abrirMenu(onOpenCommand = jest.fn()) {
    const { AdminSidebar } = require('@/components/admin/layout/AdminSidebar');
    withSidebar(
      <>
        <SidebarTrigger aria-label="Abrir menu" />
        <AdminSidebar isOperator={false} onOpenCommand={onOpenCommand} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    return onOpenCommand;
  }

  it('"Buscar tela ou ação" abre a busca', () => {
    const onOpenCommand = abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: /Buscar tela ou ação/ }));
    expect(onOpenCommand).toHaveBeenCalled();
  });

  it('o fim da lista tem o menu da pessoa, e "Novidades da versão" pede o diálogo ao topo', () => {
    abrirMenu();
    const voce = screen.getByRole('navigation', { name: 'Você' });
    for (const nome of [/Perfil/, /Mostrar primeiros passos/, /Novidades da versão/, /Modo escuro|Modo claro/, /Sair/]) {
      expect(within(voce).getByRole('button', { name: nome })).toBeInTheDocument();
    }
    const ouvinte = jest.fn();
    const { MENU_DA_PESSOA_EVENT } = require('@/components/admin/layout/AdminTopbar');
    window.addEventListener(MENU_DA_PESSOA_EVENT, ouvinte);
    act(() => {
      fireEvent.click(within(voce).getByRole('button', { name: /Novidades da versão/ }));
    });
    expect(ouvinte).toHaveBeenCalledWith(expect.objectContaining({ detail: 'novidades' }));
    window.removeEventListener(MENU_DA_PESSOA_EVENT, ouvinte);
  });

  it('o menu da pessoa rola junto com a lista, sem espremer a navegação', () => {
    abrirMenu();
    const voce = screen.getByRole('navigation', { name: 'Você' });
    const conteudo = voce.closest('[data-sidebar="content"]');
    expect(conteudo).not.toBeNull();
    // A área que rola tem a navegação e o menu da pessoa juntos; nada fica preso embaixo.
    expect(within(conteudo as HTMLElement).getByRole('link', { name: /Ver o(s \d+)? módulos?/ })).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="footer"]')?.closest('[data-sidebar="content"]')).toBe(conteudo);
  });
});
