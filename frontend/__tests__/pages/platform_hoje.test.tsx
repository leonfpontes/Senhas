/**
 * /platform (Hoje) — três colunas, KPIs, alerta de inatividade com a carência real da retenção
 * (retention_grace_days, não "30 dias" fixo), WhatsApp com DDI, impersonação com token só no fragmento
 * e aba aberta antes do await (bloqueador de pop-up).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
jest.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nil = () => null;
  return { ResponsiveContainer: Box, BarChart: Box, Bar: Box, Cell: Nil, CartesianGrid: Nil, XAxis: Nil, YAxis: Nil, Tooltip: Nil };
});

import PlatformHoje from '@/pages/platform/index';

const DASHBOARD = {
  tenants: { total: 5, active: 4, inactive: 1, trial: 2, new_30d: 2 },
  user_count: 50,
  tickets: { total: 200, last_30d: 80, last_7d: 20 },
  mrr: 490,
  mrr_prev_month: 400,
  alerts: { inactive_tenants: 1 },
  plans_distribution: [],
  daily_tickets: [],
  tenant_growth: [],
  top_tenants: [],
};

const OBSERVATORY = {
  retention: [
    { tenant_id: 't-churn', tenant_name: 'Casa Antiga', tenant_slug: 'casa-antiga', plan: 'pro', mrr: 79, last_ticket_at: '2026-08-01T00:00:00Z', never_emitted: false, days_inactive: 65, tickets_30d: 0, tickets_prev_30d: 0, severity: 'critico' },
  ],
  retention_summary: { total_at_risk: 2, mrr_at_risk: 79, critico: 1, risco: 0, atencao: 0 },
  retention_grace_days: 15,
  activation: {
    window_days: 60,
    total: 2,
    by_stage: { sem_gira: 0, sem_senhas: 0, aguardando_senha: 1, recebendo: 0, usou_porta: 0, ativado: 1 },
    tenants: [
      { tenant_id: 't-trial', tenant_name: 'Casa Alfa', slug: 'casa-alfa', created_at: '2026-09-30T00:00:00Z', days_since_signup: 6, inactive: false, plan: 'premium', is_trial: true, trial_ends_at: '2026-10-09T00:00:00Z', trial_days_left: 3, paying: false, stage: 'aguardando_senha', giras: 2, giras_configuradas: 1, next_gira_at: null, public_tickets: 0, door_used: false, principal_dor: null, onboarding_emails: {}, last_activity_at: '2026-10-05T00:00:00Z', days_since_activity: 1, contact: { name: 'André', email: 'andre@example.com', phone: '11987654321' } },
      { tenant_id: 't-ok', tenant_name: 'Casa Beta', slug: 'casa-beta', created_at: '2026-09-20T00:00:00Z', days_since_signup: 16, inactive: false, plan: 'basic', is_trial: false, trial_ends_at: null, trial_days_left: null, paying: true, stage: 'ativado', giras: 3, giras_configuradas: 3, next_gira_at: null, public_tickets: 40, door_used: true, principal_dor: null, onboarding_emails: {}, last_activity_at: '2026-10-06T00:00:00Z', days_since_activity: 0, contact: null },
    ],
  },
  upcoming_giras: [],
  upcoming_cursos: [],
  top_features_by_tenant: [],
  errors_by_tenant: [{ tenant_id: 't-ok', total_erros: 4, top_endpoints: [{ endpoint: 'POST /api/v1/public/tickets', count: 4 }] }],
  error_window_minutes: 60,
  generated_at: '2026-10-06T00:00:00Z',
};

const SUBS = [
  { tenant_id: 't-ok', tenant_name: 'Casa Beta', tenant_slug: 'casa-beta', plan: 'basic', status: 'active', monthly_price: 49, category: 'pagante', mrr: 49, potential_mrr: 0, current_users: 1, max_users: 3, is_trial: false, is_bonus: false, cancel_at_period_end: false, current_period_end: '2026-11-01T00:00:00Z', trial_ends_at: null, stripe_customer_id: 'cus_1' },
  { tenant_id: 't-cancel', tenant_name: 'Casa Gama', tenant_slug: 'casa-gama', plan: 'pro', status: 'cancelled', monthly_price: 0, category: 'cancelada', mrr: 0, potential_mrr: 0, current_users: 2, max_users: 10, is_trial: false, is_bonus: false, cancel_at_period_end: false, current_period_end: '2026-09-30T00:00:00Z', trial_ends_at: null, stripe_customer_id: null },
  { tenant_id: 't-bonus', tenant_name: 'Casa Delta', tenant_slug: 'casa-delta', plan: 'pro', status: 'active', monthly_price: 0, category: 'bonificado', mrr: 0, potential_mrr: 0, current_users: 2, max_users: 10, is_trial: false, is_bonus: true, cancel_at_period_end: false, current_period_end: null, trial_ends_at: null, stripe_customer_id: null },
];

const CONVERSATIONS = [
  { id: 'c1', tenant_id: 't-ok', tenant_name: 'Casa Beta', owner_name_snapshot: 'Maria', status: 'open', last_message_at: '2026-10-06T10:00:00Z', last_message_preview: 'Não consigo emitir', unread: true },
];

function routeGet(url: string) {
  if (url.endsWith('/health')) return { data: { database: { status: 'ok', latency_ms: 12 }, api: { status: 'ok', generated_at: '' } } };
  if (url.endsWith('/dashboard')) return { data: DASHBOARD };
  if (url.endsWith('/tenant-observatory')) return { data: OBSERVATORY };
  if (url.endsWith('/billing/subscriptions')) return { data: SUBS };
  if (url.endsWith('/support-chat/conversations')) return { data: CONVERSATIONS };
  if (url.endsWith('/tenants/t-trial/users')) {
    return { data: [{ id: 'u-op', email: 'op@x.com', username: 'op', role: 'OPERATOR', is_active: true, created_at: '2026-09-30T00:00:00Z' }, { id: 'u-adm', email: 'adm@x.com', username: 'adm', role: 'ADMIN', is_active: true, created_at: '2026-09-30T00:00:00Z' }] };
  }
  return { data: [] };
}

describe('Platform — Hoje', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    mockGet.mockImplementation((url: string) => Promise.resolve(routeGet(url)));
    mockPost.mockResolvedValue({ data: { access_token: 'jwt.token.aqui', user: { id: 'u-adm', email: 'adm@x.com', username: 'adm', role: 'ADMIN' }, tenant: { id: 't-trial', name: 'Casa Alfa', slug: 'casa-alfa' } } });
  });
  afterEach(() => localStorage.clear());

  it('mostra KPIs, alerta com a carência real e as três colunas com dados', async () => {
    render(<PlatformHoje />);
    expect(await screen.findByText('R$ 490,00')).toBeInTheDocument();
    expect(screen.getByText('+22.5% vs. mês anterior')).toBeInTheDocument();
    expect(await screen.findByText('2 terreiros sem emitir senhas há 15 dias ou mais')).toBeInTheDocument();
    expect(screen.getByText('1 terreiro desativado')).toBeInTheDocument();

    const contatar = within(screen.getByTestId('contatar'));
    expect(contatar.getByText('Casa Alfa')).toBeInTheDocument();
    expect(contatar.getByText('Trial termina em 3 dias')).toBeInTheDocument();
    expect(contatar.getByText('Travado: aguardando 1ª senha')).toBeInTheDocument();
    expect(contatar.getByText('Crítico: 65 dias sem emitir senhas')).toBeInTheDocument();
    expect(contatar.queryByText('Casa Beta')).not.toBeInTheDocument();
    expect(contatar.getByRole('link', { name: 'WhatsApp de Casa Alfa' })).toHaveAttribute('href', 'https://wa.me/5511987654321');
    expect(contatar.getByRole('link', { name: 'Mensagem para Casa Alfa' })).toHaveAttribute('href', '/platform/suporte?tenant=t-trial');

    const mudou = within(screen.getByTestId('mudou'));
    expect(mudou.getByText('Casa Gama')).toBeInTheDocument();
    expect(mudou.getByText('Assinatura cancelada')).toBeInTheDocument();
    expect(mudou.getByText('Bônus · Pro')).toBeInTheDocument();

    const quebrou = within(screen.getByTestId('quebrou'));
    expect(quebrou.getByText('12 ms')).toBeInTheDocument();
    expect(quebrou.getByRole('link', { name: 'Casa Beta' })).toHaveAttribute('href', '/platform/tenants/t-ok');
    expect(quebrou.getByText('4 erros')).toBeInTheDocument();
    expect(quebrou.getByText(/Não consigo emitir/)).toBeInTheDocument();
  });

  it('"Entrar como admin" abre a aba no clique e passa o token só no fragmento', async () => {
    const tab = { opener: {}, location: { href: '' }, document: { title: '', body: { textContent: '' } }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<PlatformHoje />);
    const contatar = within(await screen.findByTestId('contatar'));
    fireEvent.click(contatar.getByRole('button', { name: 'Entrar como admin de Casa Alfa' }));
    // A aba é aberta ainda dentro do clique, antes de qualquer resposta da API.
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockPost).not.toHaveBeenCalled();
    expect(tab.opener).toBeNull();
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/platform/impersonate/u-adm'));
    await waitFor(() => expect(tab.location.href).not.toBe(''));
    const url = tab.location.href;
    expect(url.startsWith('/admin/impersonate#')).toBe(true);
    expect(url).not.toContain('?');
    expect(new URLSearchParams(url.split('#')[1]).get('token')).toBe('jwt.token.aqui');
    expect(tab.close).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('pop-up bloqueado: avisa e não chama a API', async () => {
    const { toast } = jest.requireMock('sonner') as { toast: { error: jest.Mock } };
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    render(<PlatformHoje />);
    const contatar = within(await screen.findByTestId('contatar'));
    fireEvent.click(contatar.getByRole('button', { name: 'Entrar como admin de Casa Alfa' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0][0])).toMatch(/bloqueou a nova aba/);
    expect(mockPost).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
