'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Clock, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSubscription } from '@/hooks/useSubscription';

/**
 * Aviso persistente em todas as páginas admin (menos /admin/billing) quando a assinatura está
 * marcada para cancelar ou o tenant está no trial Premium — para o cliente não perder a data de
 * acesso/fim do trial só por navegar para fora da tela de cobrança. Fase 1: sobre o Alert do kit.
 */
export function SubscriptionWarningBanner() {
  const router = useRouter();
  const { subscription } = useSubscription();

  if (!subscription) return null;
  if (router.pathname.startsWith('/admin/billing')) return null; // já aparece lá

  if (subscription.cancel_at_period_end) {
    const until = subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
      : null;

    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertDescription className="block text-warning">
            Sua assinatura foi cancelada
            {until ? <> e você tem acesso aos recursos pagos até <strong>{until}</strong></> : null}.{' '}
            <Link href="/admin/billing" className="font-semibold underline underline-offset-4">
              Ver detalhes ou reativar
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (subscription.is_trial && subscription.trial_ends_at) {
    const msRemaining = new Date(subscription.trial_ends_at).getTime() - Date.now();
    const diasRestantes = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const diasLabel = diasRestantes === 1 ? '1 dia' : `${diasRestantes} dias`;

    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="info">
          <Clock aria-hidden />
          <AlertDescription className="block text-info">
            Você está no trial gratuito do plano Premium — faltam <strong>{diasLabel}</strong> para o fim.{' '}
            <Link href="/admin/billing" className="font-semibold underline underline-offset-4">
              Adicionar cartão e continuar no Premium
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}

export default SubscriptionWarningBanner;
