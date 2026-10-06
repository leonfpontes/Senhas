/**
 * /admin/billing — plano e assinatura unificados.
 * Foco: cartão do teste do Premium com plano recomendado pelo uso, "Continuar neste plano"
 * no teste local (inLocalTrial), status em português e ?plan= abrindo o comparativo.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/admin/billing',
  query: {} as Record<string, string>,
  isReady: true,
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>);
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockSubscription = {
  plan: 'premium',
  status: 'active',
  max_users: 99999,
  max_giras_per_month: 999999,
  max_mediuns: 9999999,
  current_users: 1,
  current_giras_this_month: 3,
  current_mediuns: 30,
};
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: mockSubscription, refresh: jest.fn(), can: () => true, loading: false }),
}));

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient } = require('@/services/api_client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Billing = require('@/pages/admin/billing').default;

const TRIAL_BILLING = {
  plan: 'premium',
  status: 'active',
  is_bonus: false,
  stripe_subscription_id: null,
  stripe_customer_id: null,
  current_period_end: null,
  cancel_at_period_end: false,
  monthly_price: 0,
  currency: 'brl',
  is_trial: true,
  trial_ends_at: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
};

function mockApi(billing: Record<string, unknown>) {
  apiClient.get.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/billing') return Promise.resolve({ data: billing });
    if (url === '/api/v1/admin/dashboard-summary') return Promise.resolve({ data: { ticket_stats: { total_emitted: 87 } } });
    return Promise.reject(new Error('unexpected ' + url));
  });
  apiClient.post.mockResolvedValue({ data: { checkout_url: 'https://pagamento/x' } });
}

describe('/admin/billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.query = {};
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it('no teste local mostra "Seu mês no Premium", o que trava e o plano recomendado pelo uso', async () => {
    mockApi(TRIAL_BILLING);
    render(<Billing />);
    expect(await screen.findByText(/Seu mês no Premium/)).toBeInTheDocument();
    expect(screen.getByText(/Faltam 10 dias de teste/)).toBeInTheDocument();
    // 30 médiuns e 3 giras → Basic (até 50 médiuns, 10 giras)
    expect(screen.getByText('Basic — R$ 49/mês')).toBeInTheDocument();
    expect(screen.getByText(/Cadastro de médiuns \(30 cadastrados\)/)).toBeInTheDocument();
    // senhas emitidas vêm do resumo do painel
    expect(await screen.findByText('87')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Manter tudo por R$ 49/mês' }));
    });
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/billing/checkout', { plan: 'basic' });
    await waitFor(() => expect(window.location.href).toBe('https://pagamento/x'));
  });

  it('no teste local o card do plano em teste oferece "Continuar neste plano"', async () => {
    mockApi(TRIAL_BILLING);
    render(<Billing />);
    const btn = (await screen.findAllByRole('button', { name: 'Continuar neste plano' }))[0];
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/billing/checkout', { plan: 'premium' });
  });

  it('assinante pago não vê o cartão de teste e vê o valor e a próxima cobrança', async () => {
    mockApi({
      ...TRIAL_BILLING,
      plan: 'pro',
      is_trial: false,
      trial_ends_at: null,
      stripe_subscription_id: 'sub_1',
      monthly_price: 79,
      current_period_end: '2026-11-06T00:00:00Z',
    });
    render(<Billing />);
    expect(await screen.findByText('Plano Pro')).toBeInTheDocument();
    expect(screen.queryByText(/Seu mês no/)).not.toBeInTheDocument();
    expect(screen.getByText('R$ 79.00')).toBeInTheDocument();
    expect(screen.getByText('Próxima cobrança')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelar assinatura/ })).toBeInTheDocument();
  });

  it('status da assinatura em português', async () => {
    mockApi({ ...TRIAL_BILLING, is_trial: false, plan: 'free', status: 'suspended' });
    render(<Billing />);
    expect(await screen.findByText('Suspensa')).toBeInTheDocument();
  });

  it('?plan=pro abre "Comparar planos" e destaca o card do Pro', async () => {
    mockRouter.query = { plan: 'pro' };
    mockApi({ ...TRIAL_BILLING, is_trial: false, trial_ends_at: null, plan: 'free' });
    render(<Billing />);
    const tab = await screen.findByRole('tab', { name: 'Comparar planos' });
    await waitFor(() => expect(tab).toHaveAttribute('data-state', 'active'));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByText('Pro').length).toBeGreaterThan(0);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
