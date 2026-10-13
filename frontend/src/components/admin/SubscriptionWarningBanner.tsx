'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CircleAlert, Clock, CreditCard, QrCode, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UpdateCardButton } from '@/components/billing/UpdateCardButton';
import { useSubscription } from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useProfile';
import { planLabel } from '@/constants/plans';

/**
 * Aviso persistente em todas as páginas admin (menos /admin/billing) quando a assinatura está
 * marcada para cancelar ou o tenant está no trial Premium — para o cliente não perder a data de
 * acesso/fim do trial só por navegar para fora da tela de cobrança. Fase 1: sobre o Alert do kit.
 *
 * Só para administradores: os links levam a /admin/billing, que é só de admin.
 * O aviso de trial segue a mesma regra do `inLocalTrial` de billing.tsx: trial LOCAL (sem
 * assinatura Stripe e sem cortesia). Depois do checkout a Stripe fica em "trialing" e o webhook
 * mantém is_trial=True — aí o cartão já está cadastrado e "Adicionar cartão" não faz sentido.
 *
 * PIX mês a mês ($-04): faltando até 7 dias para o "pago até" (ou já vencido, na tolerância), avisa
 * "Seu plano está pago até DD/MM (PIX)" com o link para pagar o próximo mês. Depois da tolerância
 * o backend rebaixa para o gratuito e o aviso some (collection_method volta a null).
 *
 * Cartão recusado (tolerância, migração 094): com `payment_pending_since` o plano continua ativo
 * enquanto a Stripe tenta cobrar de novo — "Pagamento pendente desde DD/MM" + "Atualizar cartão"
 * (Portal do Cliente da Stripe). Se a Stripe desistir, o plano fica suspenso: "Plano suspenso por
 * falta de pagamento" com o mesmo botão (pagar reativa na hora). Esses dois vêm antes dos outros.
 */
const PIX_AVISO_DIAS = 7;

export function SubscriptionWarningBanner() {
  const router = useRouter();
  const { subscription } = useSubscription();
  const { profile } = useProfile();

  if (!subscription) return null;
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null;
  if (router.pathname.startsWith('/admin/billing')) return null; // já aparece lá

  const paysByCard =
    !!subscription.has_stripe_subscription &&
    !subscription.is_bonus &&
    subscription.collection_method !== 'send_invoice' &&
    subscription.collection_method !== 'pix_mensal';

  if (paysByCard && subscription.payment_pending_since && subscription.status === 'active') {
    const desde = new Date(subscription.payment_pending_since).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="warning" role="status" data-testid="aviso-pagamento-pendente">
          <CreditCard aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>Pagamento pendente</strong> desde <strong>{desde}</strong> — o plano continua ativo enquanto
              tentamos de novo.
            </span>
            <UpdateCardButton />
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (paysByCard && subscription.status === 'suspended') {
    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="destructive" role="alert" data-testid="aviso-plano-suspenso">
          <CircleAlert aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>Plano suspenso por falta de pagamento.</strong> Atualize o cartão para reativar — assim que o
              pagamento passar, tudo volta a funcionar.
            </span>
            <UpdateCardButton label="Atualizar cartão e reativar" />
          </AlertDescription>
        </Alert>
      </div>
    );
  }

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

  if (
    subscription.collection_method === 'pix_mensal' &&
    !subscription.has_stripe_subscription &&
    !subscription.is_bonus &&
    subscription.current_period_end
  ) {
    const msLeft = new Date(subscription.current_period_end).getTime() - Date.now();
    const dias = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (dias <= PIX_AVISO_DIAS) {
      const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const ate = fmt(subscription.current_period_end);
      return (
        <div className="px-4 pt-4 sm:px-6">
          <Alert variant="warning">
            <QrCode aria-hidden />
            <AlertDescription className="block text-warning">
              {msLeft > 0 ? (
                <>
                  Seu plano está pago até <strong>{ate}</strong> (PIX).{' '}
                </>
              ) : (
                <>
                  O mês pago por PIX venceu em <strong>{ate}</strong>
                  {subscription.pix_grace_until ? (
                    <>
                      {' '}— pague até <strong>{fmt(subscription.pix_grace_until)}</strong> para não voltar ao plano gratuito
                    </>
                  ) : null}
                  .{' '}
                </>
              )}
              <Link href="/admin/billing" className="font-semibold underline underline-offset-4">
                Pagar o próximo mês
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      );
    }
  }

  const inLocalTrial = subscription.is_trial && !subscription.has_stripe_subscription && !subscription.is_bonus;
  if (inLocalTrial && subscription.trial_ends_at) {
    const plano = planLabel(subscription.plan);
    const msRemaining = new Date(subscription.trial_ends_at).getTime() - Date.now();
    const diasRestantes = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const diasLabel = diasRestantes === 1 ? '1 dia' : `${diasRestantes} dias`;

    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="info">
          <Clock aria-hidden />
          <AlertDescription className="block text-info">
            Você está no teste grátis do plano {plano} — faltam <strong>{diasLabel}</strong> para o fim.{' '}
            <Link href="/admin/billing" className="font-semibold underline underline-offset-4">
              Assinar e continuar no {plano}
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}

export default SubscriptionWarningBanner;
