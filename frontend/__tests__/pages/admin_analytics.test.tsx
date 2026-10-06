/**
 * /admin/analytics — fatias de status com cancelados reais e plano mínimo vindo do catálogo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/analytics', query: {}, isReady: true }),
}));
jest.mock('@/services/api_client', () => ({ apiClient: { get: jest.fn().mockResolvedValue({ data: [] }) } }));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
jest.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ can: () => false, loading: false }) }));
jest.mock('@/components/gates', () => ({
  PermissionDenied: () => <div>Sem permissão</div>,
  PlanLocked: ({ minPlan }: { minPlan: string }) => <div data-testid="plan-locked">{minPlan}</div>,
}));

import AdminAnalyticsPage, { analyticsStatusSlices } from '@/pages/admin/analytics';

describe('Analytics', () => {
  it('Pendentes = emitidos − usados − cancelados − não compareceram', () => {
    const slices = analyticsStatusSlices({ total_emitted: 10, total_used: 4, total_cancelled: 1, total_no_show: 2 });
    expect(Object.fromEntries(slices.map((s) => [s.name, s.value]))).toEqual({
      Utilizados: 4,
      Cancelados: 1,
      'Não compareceram': 2,
      Pendentes: 3,
    });
  });

  it('sem o plano, o cadeado mostra o plano mínimo real (Pro), não "Basic"', () => {
    render(<AdminAnalyticsPage />);
    expect(screen.getByTestId('plan-locked')).toHaveTextContent('Pro');
  });
});
