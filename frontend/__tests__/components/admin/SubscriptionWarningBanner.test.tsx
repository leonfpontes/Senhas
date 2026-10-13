/**
 * Aviso de assinatura no topo do admin: trial só quando é trial LOCAL (sem Stripe, sem
 * cortesia), com o nome real do plano, e nunca para operador (/admin/billing é só de admin).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/admin/dashboard' }) }));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);

const mockSubscription: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: mockSubscription.current }),
}));
const mockProfile: { current: { role: string } | null } = { current: { role: 'admin' } };
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: mockProfile.current }) }));
jest.mock('@/services/api_client', () => ({
  apiClient: { post: jest.fn() },
  extractApiErrorMessage: (err: { message?: string }, fallback: string) => err?.message ?? fallback,
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient } = require('@/services/api_client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toast } = require('sonner');

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
  it('PIX mês a mês: faltando até 7 dias, "pago até DD/MM (PIX)" e o link para pagar o próximo mês', () => {
    const paidUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const short = new Date(paidUntil).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    mockSubscription.current = sub({
      plan: 'pro', is_trial: false, trial_ends_at: null, collection_method: 'pix_mensal', current_period_end: paidUntil,
    });
    render(<SubscriptionWarningBanner />);
    expect(screen.getByText(/Seu plano está pago até/)).toHaveTextContent(`Seu plano está pago até ${short} (PIX).`);
    expect(screen.getByRole('link', { name: 'Pagar o próximo mês' })).toHaveAttribute('href', '/admin/billing');
  });

  it('PIX mês a mês com mais de 7 dias pela frente: sem aviso', () => {
    mockSubscription.current = sub({
      plan: 'pro', is_trial: false, trial_ends_at: null, collection_method: 'pix_mensal',
      current_period_end: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const { container } = render(<SubscriptionWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('cartão recusado (tolerância)', () => {
    const cartao = (overrides: Record<string, unknown> = {}) =>
      sub({
        plan: 'pro', status: 'active', is_trial: false, trial_ends_at: null, has_stripe_subscription: true,
        collection_method: 'charge_automatically', ...overrides,
      });

    beforeEach(() => {
      jest.clearAllMocks();
      delete (window as unknown as { location?: unknown }).location;
      (window as unknown as { location: { href: string } }).location = { href: '' };
    });

    it('pendente: "Pagamento pendente desde DD/MM", plano segue ativo e "Atualizar cartão" abre o portal', async () => {
      const desde = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const short = new Date(desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      mockSubscription.current = cartao({ payment_pending_since: desde });
      apiClient.post.mockResolvedValue({ data: { portal_url: 'https://billing.stripe.com/p/session/x' } });

      render(<SubscriptionWarningBanner />);

      expect(screen.getByTestId('aviso-pagamento-pendente')).toHaveTextContent(
        `Pagamento pendente desde ${short} — o plano continua ativo enquanto tentamos de novo.`,
      );
      fireEvent.click(screen.getByRole('button', { name: /Atualizar cartão/ }));
      await waitFor(() => expect(window.location.href).toBe('https://billing.stripe.com/p/session/x'));
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/billing/portal');
    });

    it('portal não configurado: mostra a mensagem do backend e não sai da tela', async () => {
      mockSubscription.current = cartao({ payment_pending_since: new Date().toISOString() });
      apiClient.post.mockRejectedValue({ message: 'A troca de cartão pelo painel ainda não está disponível.' });

      render(<SubscriptionWarningBanner />);
      fireEvent.click(screen.getByRole('button', { name: /Atualizar cartão/ }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('A troca de cartão pelo painel ainda não está disponível.'),
      );
      expect(window.location.href).toBe('');
      expect(screen.getByRole('button', { name: /Atualizar cartão/ })).not.toBeDisabled();
    });

    it('suspenso por falta de pagamento: aviso vermelho com "Atualizar cartão e reativar"', () => {
      mockSubscription.current = cartao({ status: 'suspended' });
      render(<SubscriptionWarningBanner />);
      expect(screen.getByTestId('aviso-plano-suspenso')).toHaveTextContent('Plano suspenso por falta de pagamento.');
      expect(screen.getByRole('button', { name: /Atualizar cartão e reativar/ })).toBeInTheDocument();
    });

    it('boleto suspenso ou operador: sem botão de cartão', () => {
      mockSubscription.current = cartao({ status: 'suspended', collection_method: 'send_invoice' });
      const { container, unmount } = render(<SubscriptionWarningBanner />);
      expect(container).toBeEmptyDOMElement();
      unmount();

      mockProfile.current = { role: 'operator' };
      mockSubscription.current = cartao({ payment_pending_since: new Date().toISOString() });
      const { container: c2 } = render(<SubscriptionWarningBanner />);
      expect(c2).toBeEmptyDOMElement();
    });
  });
});
