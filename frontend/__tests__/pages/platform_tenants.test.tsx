/**
 * /platform/tenants — paginação no servidor (skip/limit), facetas no cliente e aba Assinaturas.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/tenants',
  query: {} as Record<string, string>,
  asPath: '/platform/tenants',
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

import TenantsPage, { PAGE_SIZE } from '@/pages/platform/tenants';

function tenant(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `t${i}`,
    slug: `casa-${i}`,
    name: `Casa ${i}`,
    description: null,
    is_active: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    plan: i % 2 === 0 ? 'pro' : 'basic',
    subscription_status: 'active',
    is_bonus: false,
    ...over,
  };
}

const ALL = Array.from({ length: 25 }, (_, i) => tenant(i + 1));
const SUBS = ALL.map((t) => ({
  tenant_id: t.id, tenant_name: t.name, tenant_slug: t.slug, plan: t.plan, status: 'active', monthly_price: t.plan === 'pro' ? 79 : 49,
  current_users: 1, max_users: 10, is_trial: t.id === 't3', is_bonus: false, cancel_at_period_end: false,
  current_period_end: '2026-11-01T12:00:00Z', trial_ends_at: t.id === 't3' ? '2026-10-20T12:00:00Z' : null, stripe_customer_id: null,
}));

function install() {
  mockGet.mockImplementation((url: string, cfg?: { params?: Record<string, unknown> }) => {
    const p = cfg?.params ?? {};
    if (url === '/api/v1/platform/tenants') {
      const skip = Number(p.skip ?? 0);
      const limit = Number(p.limit ?? 100);
      return Promise.resolve({ data: ALL.slice(skip, skip + limit) });
    }
    if (url.endsWith('/billing/subscriptions')) return Promise.resolve({ data: SUBS });
    if (url.endsWith('/billing/statistics/summary')) return Promise.resolve({ data: { active_tenants: 25, trial_tenants: 1, suspended_tenants: 0, mrr: 1600, plan_distribution: { basic: 13, pro: 12 } } });
    if (url.endsWith('/tenant-observatory')) return Promise.resolve({ data: { activation: { tenants: [] }, retention: [] } });
    return Promise.resolve({ data: [] });
  });
}

const tenantCalls = () => mockGet.mock.calls.filter((c) => c[0] === '/api/v1/platform/tenants').map((c) => c[1]?.params);

describe('Platform — Terreiros', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = {};
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    install();
  });
  afterEach(() => localStorage.clear());

  it('pagina no servidor com skip/limit e avança para a próxima página', async () => {
    render(<TenantsPage />);
    expect(await screen.findByText('Casa 1')).toBeInTheDocument();
    expect(tenantCalls()[0]).toEqual({ skip: 0, limit: PAGE_SIZE + 1 });
    expect(screen.getByText('Casa 20')).toBeInTheDocument();
    expect(screen.queryByText('Casa 21')).not.toBeInTheDocument();
    expect(screen.getAllByText('R$ 79,00', { selector: 'td' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Casa 21')).toBeInTheDocument();
    expect(tenantCalls().at(-1)).toEqual({ skip: PAGE_SIZE, limit: PAGE_SIZE + 1 });
    expect(screen.getByText('Casa 25')).toBeInTheDocument();
    expect(screen.queryByText('Casa 1')).not.toBeInTheDocument();
  });

  it('faceta de plano carrega a lista completa e filtra no cliente', async () => {
    mockRouter.query = { plan: 'pro' };
    render(<TenantsPage />);
    expect(await screen.findByText('Casa 2')).toBeInTheDocument();
    await waitFor(() => expect(tenantCalls().some((p) => p?.limit === 1000)).toBe(true));
    expect(screen.queryByText('Casa 1')).not.toBeInTheDocument();
    expect(screen.getByText('Casa 24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Limpar filtros/ })).toBeInTheDocument();
  });

  it('status "inativo" vai como is_active=false para o servidor', async () => {
    mockRouter.query = { status: 'inativo' };
    render(<TenantsPage />);
    await waitFor(() => expect(tenantCalls().some((p) => p?.is_active === false)).toBe(true));
  });

  it('linha clicável abre o 360 e a aba Assinaturas lista as assinaturas', async () => {
    render(<TenantsPage />);
    fireEvent.click(await screen.findByText('Casa 1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/platform/tenants/t1');

    mockRouter.query = { tab: 'assinaturas' };
    render(<TenantsPage />);
    expect(await screen.findByText('R$ 1.600,00')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Trial termina/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Renova em/ })).toBeInTheDocument();
    expect(screen.getByText('20/10/2026')).toBeInTheDocument();
  });
});
