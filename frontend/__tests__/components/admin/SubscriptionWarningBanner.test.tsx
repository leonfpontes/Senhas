/**
 * Aviso de assinatura no topo do admin: trial só quando é trial LOCAL (sem Stripe, sem
 * cortesia), com o nome real do plano, e nunca para operador (/admin/billing é só de admin).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/admin/dashboard' }) }));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockSubscription: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: mockSubscription.current }),
}));
const mockProfile: { current: { role: string } | null } = { current: { role: 'admin' } };
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: mockProfile.current }) }));

import { SubscriptionWarningBanner } from '@/components/admin/SubscriptionWarningBanner';

const inFiveDays = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

function sub(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'premium',
    is_trial: true,
    trial_ends_at: inFiveDays(),
    cancel_at_period_end: false,
    current_period_end: null,
    has_stripe_subscription: false,
    is_bonus: false,
    ...overrides,
  };
}

describe('SubscriptionWarningBanner', () => {
  beforeEach(() => {
    mockProfile.current = { role: 'admin' };
  });

  it('trial local: mostra o plano real e o link para assinar', () => {
    mockSubscription.current = sub({ plan: 'pro' });
    render(<SubscriptionWarningBanner />);
    expect(screen.getByText(/teste grátis do plano Pro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Assinar e continuar no Pro/ })).toHaveAttribute('href', '/admin/billing');
  });

  it('trial da Stripe (cartão já cadastrado): não pede cartão', () => {
    mockSubscription.current = sub({ has_stripe_subscription: true });
    const { container } = render(<SubscriptionWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('cortesia (bônus): sem aviso de trial', () => {
    mockSubscription.current = sub({ is_bonus: true });
    const { container } = render(<SubscriptionWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('operador não vê o aviso (o link é de tela só de admin)', () => {
    mockProfile.current = { role: 'operator' };
    mockSubscription.current = sub();
    const { container } = render(<SubscriptionWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
