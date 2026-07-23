'use client';

import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { useRouter } from 'next/router';
import { useSubscription } from '../../hooks/useSubscription';

/**
 * Persistent warning shown on every admin page (not just /admin/billing) when
 * the tenant's subscription is scheduled for cancellation, or is on the
 * 1-month Premium trial — so the client doesn't lose track of the
 * access-until / trial-ends date just by navigating away from the billing
 * screen.
 */
export function SubscriptionWarningBanner() {
  const router = useRouter();
  const { subscription } = useSubscription();

  if (!subscription) return null;
  if (router.pathname.startsWith('/admin/billing')) return null; // already shown there

  if (subscription.cancel_at_period_end) {
    const until = subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
      : null;

    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Alert severity="warning" variant="outlined">
          Sua assinatura foi cancelada
          {until ? <> e você tem acesso aos recursos pagos até <strong>{until}</strong></> : null}.{' '}
          <Link component="button" onClick={() => router.push('/admin/billing')} sx={{ fontWeight: 600 }}>
            Ver detalhes ou reativar
          </Link>
        </Alert>
      </Box>
    );
  }

  if (subscription.is_trial && subscription.trial_ends_at) {
    const msRemaining = new Date(subscription.trial_ends_at).getTime() - Date.now();
    const diasRestantes = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const diasLabel = diasRestantes === 1 ? '1 dia' : `${diasRestantes} dias`;

    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Alert severity="info" variant="outlined">
          Você está no trial gratuito do plano Premium — faltam <strong>{diasLabel}</strong> para o fim.{' '}
          <Link component="button" onClick={() => router.push('/admin/billing')} sx={{ fontWeight: 600 }}>
            Adicionar cartão e continuar no Premium
          </Link>
        </Alert>
      </Box>
    );
  }

  return null;
}
