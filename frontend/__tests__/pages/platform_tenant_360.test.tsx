/**
 * /platform/tenants/[id] — Tenant 360: cabeçalho, abas por query e estado 404.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/tenants/[id]',
  query: { id: 't1' } as Record<string, string>,
  asPath: '/platform/tenants/t1',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import TenantDetailPage from '@/pages/platform/tenants/[id]';

const TENANT = { id: 't1', slug: 'casa-alfa', name: 'Casa Alfa', description: 'Terreiro de teste', is_active: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', plan: 'pro', subscription_status: 'active', is_bonus: true };
const USERS = [
  { id: 'u1', email: 'adm@casa.com', username: 'adm', role: 'ADMIN', is_active: true, created_at: '2026-09-01T00:00:00Z' },
  { id: 'u2', email: 'op@casa.com', username: 'op', role: 'OPERATOR', is_active: false, created_at: '2026-09-01T00:00:00Z' },
];
const SUB = { plan: 'pro', status: 'active', max_users: 10, max_giras_per_month: 15, current_users: 2, monthly_price: 79, is_trial: true, trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), is_bonus: true };

function install(notFound = false) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/platform/tenants/t1') {
      return notFound ? Promise.reject({ response: { status: 404 } }) : Promise.resolve({ data: TENANT });
    }
    if (url === '/api/v1/platform/tenants/t1/users') return Promise.resolve({ data: USERS });
    if (url === '/api/v1/platform/subscriptions/t1') return Promise.resolve({ data: SUB });
    if (url.endsWith('/tenant-observatory')) return Promise.resolve({ data: { activation: { tenants: [] }, upcoming_giras: [], retention: [], errors_by_tenant: [] } });
    if (url.endsWith('/support-chat/conversations')) return Promise.resolve({ data: [] });
    if (url.endsWith('/audit-logs/feed')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

describe('Platform — Tenant 360', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = { id: 't1' };
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    install();
  });
  afterEach(() => localStorage.clear());

  it('mostra cabeçalho com plano, bônus, trial, MRR, ações e as seis abas', async () => {
    render(<TenantDetailPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Casa Alfa' })).toBeInTheDocument();
    expect(screen.getByText('casa-alfa', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('Trial: 5 dias restantes')).toBeInTheDocument();
    expect(screen.getByText('R$ 79,00', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Acesso bonificado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mensagem/ })).toHaveAttribute('href', '/platform/suporte?tenant=t1');
    expect(screen.getByRole('button', { name: /Entrar como admin/ })).toBeInTheDocument();
    for (const tab of ['Visão geral', 'Usuários', 'Giras', 'Suporte', 'Auditoria', 'Assinatura']) {
      expect(screen.getByRole('tab', { name: new RegExp(tab) })).toBeInTheDocument();
    }
    expect(screen.getByText('Terreiro de teste')).toBeInTheDocument();
  });

  it('aba Usuários vem da query e lista redefinir senha / impersonar', async () => {
    mockRouter.query = { id: 't1', tab: 'usuarios' };
    render(<TenantDetailPage />);
    expect(await screen.findByText('adm@casa.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redefinir senha de adm@casa.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Impersonar adm@casa.com' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Impersonar op@casa.com' })).toBeDisabled();
    expect(screen.getByText('Operador')).toBeInTheDocument();
  });

  it('trocar de aba atualiza a query (shallow)', async () => {
    render(<TenantDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Casa Alfa' });
    const tab = screen.getByRole('tab', { name: /Auditoria/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/platform/tenants/[id]', query: { id: 't1', tab: 'auditoria' } }, undefined, { shallow: true }),
    );
  });

  it('404 mostra "Terreiro não encontrado" com volta para a lista', async () => {
    install(true);
    render(<TenantDetailPage />);
    expect(await screen.findByText('Terreiro não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Terreiros/ })).toHaveAttribute('href', '/platform/tenants');
  });
});
