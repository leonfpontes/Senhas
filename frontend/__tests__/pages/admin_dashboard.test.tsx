/**
 * Início: só o checklist até o terreiro ativar; depois, gira de hoje + números.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

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
jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() },
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSub = { loading: false };
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: () => !mockSub.loading,
    subscription: null,
    loading: mockSub.loading,
    canCreateGira: () => true,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/tours/welcomeTour', () => ({ useWelcomeTour: jest.fn() }));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));
jest.mock('recharts', () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  const Null = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: Null,
    CartesianGrid: Null,
    XAxis: Null,
    YAxis: Null,
    Tooltip: Null,
    Legend: Null,
  };
});

const hoje = new Date();
hoje.setHours(23, 0, 0, 0);

function summary(onboarding: Record<string, unknown>) {
  return {
    upcoming_giras: [
      { id: 'g1', nome: 'Gira de Exu', data_inicio: hoje.toISOString(), max_tickets: 50, current_count: 12, sponsor_count: 0, is_open: true },
    ],
    ticket_stats: { total_emitted: 120, total_used: 80, total_cancelled: 2, usage_rate: 66.7, emitted_today: 5, used_today: 3, walk_in_total: 7 },
    daily_distribution: [{ date: '2026-10-05', total: 10, common: 8, sponsor: 1, walk_in: 1 }],
    peak_hours: [{ hour: 19, count: 12 }],
    estoque_alerts: [],
    estoque_summary: null,
    plan: { name: 'pro', label: 'Pro', status: 'active' },
    onboarding: { has_gira: true, public_tickets: 0, door_used: false, public_link: 'https://x/l', completed: false, ...onboarding },
  };
}

function mockApi(data: unknown) {
  const { apiClient } = require('@/services/api_client');
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/dashboard-summary') return Promise.resolve({ data });
    return Promise.resolve({ data: [] });
  });
}

describe('Início', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockRouter.query = {};
    mockSub.loading = false;
    mockGroupCan.mockImplementation(() => true);
  });

  const ANIVERSARIANTES = '/api/v1/admin/mediuns/aniversariantes?dias=7';
  const chamouAniversariantes = () => {
    const { apiClient } = require('@/services/api_client');
    return apiClient.get.mock.calls.some(([url]: [string]) => url === ANIVERSARIANTES);
  };

  it('reload direto: busca aniversariantes quando a assinatura termina de carregar', async () => {
    mockApi(summary({ public_tickets: 30, door_used: true, completed: true }));
    mockSub.loading = true; // no primeiro render can('mediuns') ainda é false
    const Page = require('@/pages/admin/dashboard').default;
    const { rerender } = render(<Page />);
    await waitFor(() => expect(screen.getByTestId('gira-de-hoje')).toBeInTheDocument());
    expect(chamouAniversariantes()).toBe(false);

    mockSub.loading = false;
    rerender(<Page />);
    await waitFor(() => expect(chamouAniversariantes()).toBe(true));
  });

  it('operador sem Médiuns:view não chama aniversariantes', async () => {
    mockGroupCan.mockImplementation((f: string) => f !== 'mediuns');
    mockApi(summary({ public_tickets: 30, door_used: true, completed: true }));
    const Page = require('@/pages/admin/dashboard').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId('gira-de-hoje')).toBeInTheDocument());
    expect(chamouAniversariantes()).toBe(false);
  });

  it('terreiro ainda não ativado: só os primeiros passos, sem números', async () => {
    mockApi(summary({}));
    const Page = require('@/pages/admin/dashboard').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId('first-gira-checklist')).toBeInTheDocument());
    expect(screen.queryByText('Senhas emitidas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gira-de-hoje')).not.toBeInTheDocument();
  });

  it('terreiro ativado: gira de hoje, números e vocabulário sem "Walk-in"/"emis."', async () => {
    mockApi(summary({ public_tickets: 30, door_used: true, completed: true }));
    const Page = require('@/pages/admin/dashboard').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId('gira-de-hoje')).toBeInTheDocument());
    expect(screen.getByText('Gira de hoje')).toBeInTheDocument();
    expect(within(screen.getByTestId('gira-de-hoje')).getByRole('link', { name: /Abrir Porta/ })).toHaveAttribute(
      'href',
      '/admin/porta?gira=g1',
    );
    expect(screen.getByText('Senhas emitidas')).toBeInTheDocument();
    expect(screen.getByText('Chegaram sem senha')).toBeInTheDocument();
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
    expect(screen.queryByText(/Walk-in|emis\./)).not.toBeInTheDocument();
  });

  it('?passos=1 reabre o checklist que tinha sido ocultado', async () => {
    window.localStorage.setItem('girahub:first-gira-checklist:dismissed:unknown', '1');
    mockRouter.query = { passos: '1' };
    mockApi(summary({}));
    const Page = require('@/pages/admin/dashboard').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId('first-gira-checklist')).toBeInTheDocument());
    expect(mockRouter.replace).toHaveBeenCalled();
  });
});
