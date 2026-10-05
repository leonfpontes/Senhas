/**
 * Trial que não pune: o fim do teste não esconde médiuns já cadastrados e,
 * durante o teste, o plano em teste pode ser assinado na tela de assinatura.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
let mockFeatures: Record<string, boolean> = {};
let mockSub: Record<string, unknown> = {};

jest.mock('../../pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => ({
    can: (f: string) => !!mockFeatures[f],
    loading: false,
    subscription: mockSub,
    canCreateMedium: () => true,
    refresh: jest.fn(),
  }),
}));
jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));
jest.mock('@/providers/AdminThemeProvider', () => ({ useAdminTheme: () => ({ isDark: false }) }));
jest.mock('next/router', () => ({ useRouter: () => ({ query: {}, replace: jest.fn(), push: jest.fn() }) }));

import AdminMediunsPage from '../../pages/admin/mediuns';
import AdminBilling from '../../pages/admin/billing';

const medium = { id: 'm1', nome: 'Pai Antônio', tipo: 'medium', ativo: true, created_at: '2026-09-01T00:00:00Z' };

beforeEach(() => {
  mockGet.mockReset();
  mockFeatures = {};
  mockSub = { plan: 'free', max_mediuns: 0, current_mediuns: 0 };
});

describe('Médiuns fora do plano', () => {
  it('mostra os já cadastrados só para consulta, sem botão de criar', async () => {
    mockSub = { plan: 'free', max_mediuns: 0, current_mediuns: 1 };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.startsWith('/api/v1/admin/mediuns?') ? [medium] : [] }),
    );

    render(<AdminMediunsPage />);

    expect(await screen.findByText('Pai Antônio')).toBeInTheDocument();
    expect(screen.getByTestId('mediuns-somente-leitura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ações/i)).not.toBeInTheDocument();
  });

  it('sem nenhum médium cadastrado, mantém o convite de upgrade', async () => {
    mockGet.mockResolvedValue({ data: [] });

    render(<AdminMediunsPage />);

    await waitFor(() => expect(screen.queryByTestId('mediuns-somente-leitura')).not.toBeInTheDocument());
    expect(screen.queryByText('Pai Antônio')).not.toBeInTheDocument();
  });

  it('com plano, não mostra o aviso de somente leitura', async () => {
    mockFeatures = { mediuns: true };
    mockSub = { plan: 'basic', max_mediuns: 15, current_mediuns: 1 };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.startsWith('/api/v1/admin/mediuns?') ? [medium] : [] }),
    );

    render(<AdminMediunsPage />);

    expect(await screen.findByText('Pai Antônio')).toBeInTheDocument();
    expect(screen.queryByTestId('mediuns-somente-leitura')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /novo/i })).toBeInTheDocument();
  });
});

const billingBase = {
  status: 'active',
  is_bonus: false,
  stripe_subscription_id: null,
  stripe_customer_id: null,
  current_period_end: null,
  cancel_at_period_end: false,
  monthly_price: 0,
  currency: 'brl',
};

describe('Assinatura durante o trial', () => {
  it('o plano em teste pode ser assinado', async () => {
    mockGet.mockResolvedValue({
      data: { ...billingBase, plan: 'premium', is_trial: true, trial_ends_at: '2026-10-24T12:00:00Z' },
    });

    render(<AdminBilling />);

    expect(await screen.findByRole('button', { name: 'Continuar neste plano' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Plano atual' })).not.toBeInTheDocument();
    expect(screen.getByText('Teste grátis até 24/10')).toBeInTheDocument();
  });

  it('com assinatura paga, o plano atual continua desabilitado', async () => {
    mockGet.mockResolvedValue({
      data: { ...billingBase, plan: 'premium', is_trial: false, stripe_subscription_id: 'sub_1' },
    });

    render(<AdminBilling />);

    expect(await screen.findByRole('button', { name: 'Plano atual' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continuar neste plano' })).not.toBeInTheDocument();
  });
});
