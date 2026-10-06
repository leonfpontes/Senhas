/**
 * Busca de comandos (⌘K): pular para terreiro por nome/slug e ações sobre o melhor resultado.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { push: jest.fn(), replace: jest.fn(), pathname: '/platform', query: {}, asPath: '/platform', isReady: true, events: { on: jest.fn(), off: jest.fn() } };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette, filterTenants } from '@/components/platform/CommandPalette';
import PlatformLayout from '@/pages/platform/layout';

const TENANTS = [
  { id: 't1', slug: 'casa-alfa', name: 'Casa Alfa', is_active: true, plan: 'pro', is_bonus: false },
  { id: 't2', slug: 'tenda-sao-jorge', name: 'Tenda São Jorge', is_active: true, plan: 'basic', is_bonus: false },
];

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: TENANTS });
  });

  it('filterTenants busca por nome/slug sem acento', () => {
    expect(filterTenants(TENANTS, 'sao jorge').map((t) => t.id)).toEqual(['t2']);
    expect(filterTenants(TENANTS, 'casa-al').map((t) => t.id)).toEqual(['t1']);
    expect(filterTenants(TENANTS, '')).toHaveLength(2);
  });

  it('lista terreiros e oferece as três ações para o melhor resultado', async () => {
    const onOpenChange = jest.fn();
    render(
      <TooltipProvider>
        <CommandPalette open onOpenChange={onOpenChange} />
      </TooltipProvider>,
    );
    expect(await screen.findByText('Casa Alfa')).toBeInTheDocument();
    expect(screen.getByText('Tenda São Jorge')).toBeInTheDocument();
    expect(screen.getByText('Navegação')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar terreiro' }), { target: { value: 'são jorge' } });
    expect(await screen.findByText('Entrar como admin de Tenda São Jorge')).toBeInTheDocument();
    expect(screen.getByText('Abrir conversa de Tenda São Jorge')).toBeInTheDocument();
    expect(screen.getByText('Dar bônus a Tenda São Jorge')).toBeInTheDocument();
    expect(screen.queryByText('Casa Alfa')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Abrir conversa de Tenda São Jorge'));
    expect(mockRouter.push).toHaveBeenCalledWith('/platform/suporte?tenant=t2');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByText('Dar bônus a Tenda São Jorge'));
    expect(mockRouter.push).toHaveBeenCalledWith('/platform/tenants/t2?tab=assinatura&bonus=1');
  });

  it('abre pelo atalho Ctrl+K no layout', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    render(<PlatformLayout><div>x</div></PlatformLayout>);
    await screen.findByRole('button', { name: /Buscar terreiro ou comando/ });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Buscar terreiro' })).toBeInTheDocument());
    localStorage.clear();
  });
});
