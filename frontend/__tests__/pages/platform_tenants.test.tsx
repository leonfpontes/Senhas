/**
 * /platform/tenants — paginação no servidor (skip/limit), facetas no cliente e aba Assinaturas.
 */
import React from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';

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
const SUBS = ALL.map((t) => {
  const price = t.plan === 'pro' ? 79 : 49;
  const category = t.id === 't3' ? 'em_teste' : t.id === 't4' ? 'bonificado' : t.id === 't5' ? 'excluido' : 'pagante';
  return {
  tenant_id: t.id, tenant_name: t.name, tenant_slug: t.slug, plan: t.plan, status: 'active', monthly_price: price,
  category, mrr: category === 'pagante' ? price : 0, potential_mrr: category === 'em_teste' ? price : 0, tenant_deleted: category === 'excluido',
  current_users: 1, max_users: 10, is_trial: t.id === 't3', is_bonus: false, cancel_at_period_end: false,
  current_period_end: '2026-11-01T12:00:00Z', trial_ends_at: t.id === 't3' ? '2026-10-20T12:00:00Z' : null, stripe_customer_id: null,
  };
});

function install() {
  mockGet.mockImplementation((url: string, cfg?: { params?: Record<string, unknown> }) => {
    const p = cfg?.params ?? {};
    if (url === '/api/v1/platform/tenants') {
      const skip = Number(p.skip ?? 0);
      const limit = Number(p.limit ?? 100);
      return Promise.resolve({ data: ALL.slice(skip, skip + limit) });
    }
    if (url.endsWith('/billing/subscriptions')) return Promise.resolve({ data: SUBS });
    if (url.endsWith('/billing/statistics/summary')) return Promise.resolve({ data: { mrr: 1600, paying_tenants: 22, trial_tenants: 1, trial_potential_mrr: 79, bonus_tenants: 1, free_tenants: 0, suspended_tenants: 0, unbilled_tenants: 0, deleted_tenants: 1, active_tenants: 24, plan_distribution: { basic: 12, pro: 12 } } });
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
    fireEvent.click(screen.getByRole('button', { name: /Em teste/ }));
    expect(screen.getByText('20/10/2026')).toBeInTheDocument();
  });

  it('Assinaturas separa pagantes de teste, bônus e excluídos', async () => {
    mockRouter.query = { tab: 'assinaturas' };
    render(<TenantsPage />);
    expect(await screen.findByText('22 pagantes no Stripe')).toBeInTheDocument();
    expect(screen.getByText('+R$ 79,00/mês se assinarem')).toBeInTheDocument();
    const table = within(screen.getByTestId('subscriptions-table'));
    // Excluído fica escondido por padrão; em teste mostra o potencial, não receita.
    expect(table.queryByText('Casa 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Em teste/ }));
    expect(table.getByText('Casa 3')).toBeInTheDocument();
    expect(table.getByText(/se assinar/)).toHaveTextContent('49,00 se assinar');

    fireEvent.click(screen.getByRole('button', { name: /Bonificado/ }));
    expect(table.getByText('Casa 4')).toBeInTheDocument();
    expect(table.queryByText('Casa 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Todas/ }));
    expect(screen.queryByRole('button', { name: /Excluído/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Mostrar excluídos/));
    fireEvent.click(await screen.findByRole('button', { name: /Excluído/ }));
    expect(table.getByText('Casa 5')).toBeInTheDocument();
  });
});
