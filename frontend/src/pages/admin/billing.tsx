/**
 * /admin/billing — plano e assinatura num lugar só (o antigo /admin/plano redireciona para cá).
 * Abas "Assinatura" (status, uso, teste do Premium, ações da Stripe) e "Comparar planos"
 * (cards + comparativo). Planos, limites e rótulos vêm de `constants/plans.ts`.
 * Tela de conta (sem feature de grupo): exceção registrada em scripts/audit-permission-guards.js.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  CircleAlert,
  CircleCheck,
  CreditCard,
  ExternalLink,
  Info,
  MessageCircle,
  Receipt,
  RefreshCw,
  Star,
  XCircle,
} from 'lucide-react';
import AdminLayout from './admin_layout';
import { PageHeader, ConfirmDialog } from '@/components/admin';
import {
  PaymentMethodPicker,
  PlanCard,
  PlanComparison,
  TrialSummaryCard,
  UsageBar,
  invoiceMethodLabel,
  type PaymentMethodChoice,
} from '@/components/billing';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSubscription } from '@/hooks/useSubscription';
import {
  PLAN_LIST,
  PLANS,
  getPlan,
  normalizePlanKey,
  planLabel,
  recommendPlan,
  subscriptionStatusLabel,
  type PlanDef,
  type PlanKey,
} from '@/constants/plans';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BillingInfo {
  plan: string;
  status: string;
  is_bonus: boolean;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  monthly_price: number;
  currency: string;
  is_trial?: boolean;
  trial_ends_at?: string | null;
  // $-04 — cobrança por fatura (boleto)
  collection_method?: string | null;
  awaiting_first_payment?: boolean;
  pending_invoice_url?: string | null;
  pending_invoice_due_at?: string | null;
  invoice_payment_methods?: string[];
  invoice_days_until_due?: number;
}

interface SubscribeInvoiceResult {
  status: 'pending' | 'trialing';
  hosted_invoice_url?: string | null;
  due_at?: string | null;
  trial_ends_at?: string | null;
  detail: string;
}

interface DashboardSummaryLite {
  ticket_stats?: { total_emitted?: number };
}

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Classes estáticas: o Tailwind não enxerga nomes montados em tempo de execução.
function statusToneClass(status: string): string {
  if (status === 'active') return 'border-success/40 text-success';
  if (status === 'suspended') return 'border-destructive/40 text-destructive';
  return 'border-warning/50 text-warning';
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminBilling() {
  return (
    <AdminLayout title="Plano e assinatura">
      <BillingContent />
    </AdminLayout>
  );
}

function BillingContent() {
  const router = useRouter();
  const { subscription, refresh: refreshSubscription } = useSubscription();

  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [reactivateDialog, setReactivateDialog] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<PlanKey | null>(null);
  const [cancelPendingDialog, setCancelPendingDialog] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethodChoice>('card');
  const [tab, setTab] = useState<'assinatura' | 'planos'>('assinatura');

  const queryPlan = normalizePlanKey(router.query.plan);

  const fetchBilling = useCallback(async () => {
    try {
      const res = await apiClient.get<BillingInfo>('/api/v1/admin/billing');
      setBilling(res.data);
    } catch {
      // Sem os dados, a tela trataria qualquer um como plano gratuito ("Assinar agora"
      // para quem já paga): com `billing` nulo ela mostra o estado de erro abaixo.
      setError('Não foi possível carregar os dados da assinatura.');
    } finally {
      setLoading(false);
    }
  }, []);

  const retryBilling = () => {
    setError(null);
    setLoading(true);
    void fetchBilling();
  };

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // `?plan=` abre a aba de comparação e destaca o card — menos para cortesia, cuja aba
  // "Comparar planos" fica desabilitada (abriria uma aba travada).
  const billingLoaded = billing !== null;
  const isBonus = !!billing?.is_bonus;
  useEffect(() => {
    if (!router.isReady || !billingLoaded) return;
    if (queryPlan && !isBonus) setTab('planos');
  }, [router.isReady, queryPlan, billingLoaded, isBonus]);

  // Rola até o card destacado quando ele monta (a aba "Comparar planos" só monta o conteúdo
  // depois de ativada — um efeito no pai rodaria antes do card existir).
  const scrollToHighlighted = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ block: 'center' });
  }, []);

  // Volta da Stripe
  useEffect(() => {
    const { status } = router.query;
    if (status === 'success') {
      setSuccess('Assinatura confirmada! Seu plano é atualizado em instantes.');
      // O webhook da Stripe chega em paralelo ao redirect: tenta algumas vezes.
      [2000, 4000, 8000].forEach((delay) => {
        setTimeout(() => {
          fetchBilling();
          refreshSubscription();
        }, delay);
      });
    } else if (status === 'cancelled') {
      setError('Pagamento cancelado. Nenhuma cobrança foi feita.');
    } else if (status === 'checkout_error') {
      setError('Não conseguimos abrir o pagamento automaticamente. Escolha o plano abaixo para tentar de novo.');
    }
    if (status) router.replace('/admin/billing', undefined, { shallow: true });
  }, [router.query.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFreePlan = !billing?.stripe_subscription_id;
  const currentPlanKey = normalizePlanKey(billing?.plan) ?? 'free';
  const currentPlan = PLANS[currentPlanKey];
  // Teste local, sem assinatura na Stripe: o plano do teste ainda não é "atual" no sentido pago.
  const inLocalTrial = !!billing?.is_trial && isFreePlan && !billing?.is_bonus;
  const trialEndShort = billing?.trial_ends_at
    ? new Date(billing.trial_ends_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;
  // $-04: pedido de assinatura por boleto emitido e ainda não pago (plano não liberado).
  const awaitingFirstPayment = !!billing?.awaiting_first_payment;
  const invoiceLabel = invoiceMethodLabel(billing?.invoice_payment_methods);
  const paysByInvoice = billing?.collection_method === 'send_invoice';
  // Escolha de forma de pagamento só faz sentido antes de existir assinatura na Stripe.
  const showPaymentPicker = isFreePlan && !billing?.is_bonus && !awaitingFirstPayment;

  // Resumo do painel só importa no teste (senhas emitidas); se falhar, omite.
  useEffect(() => {
    if (!inLocalTrial) return;
    let cancelled = false;
    apiClient
      .get<DashboardSummaryLite>('/api/v1/admin/dashboard-summary')
      .then((res) => {
        if (!cancelled && res.data && typeof res.data === 'object') setSummary(res.data);
      })
      .catch(() => {
        /* opcional */
      });
    return () => {
      cancelled = true;
    };
  }, [inLocalTrial]);

  const usage = useMemo(
    () => ({
      mediuns: subscription?.current_mediuns ?? 0,
      girasPerMonth: subscription?.current_giras_this_month ?? 0,
      users: subscription?.current_users ?? 1,
      senhas: typeof summary?.ticket_stats?.total_emitted === 'number' ? summary.ticket_stats.total_emitted : null,
    }),
    [subscription, summary],
  );
  const recommended = PLANS[recommendPlan(usage)];

  // ── ações ──
  /** $-04: assina por fatura (boleto). Sem redirecionar: o painel mostra o "Pagar agora". */
  const handleSubscribeInvoice = async (plan: PlanKey) => {
    setActionLoading(plan);
    setError(null);
    try {
      const res = await apiClient.post<SubscribeInvoiceResult>('/api/v1/admin/billing/subscribe-invoice', { plan });
      setSuccess(
        res.data.status === 'trialing'
          ? `Assinatura do ${planLabel(plan)} registrada. Os dias de teste continuam grátis; a primeira fatura chega por e-mail no fim do teste.`
          : `Fatura do ${planLabel(plan)} emitida e enviada por e-mail. Use "Pagar agora" — o plano é liberado assim que o pagamento for confirmado.`,
      );
      setTab('assinatura');
      await fetchBilling();
      refreshSubscription();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível emitir a fatura.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckout = async (plan: PlanKey) => {
    if (payMethod === 'invoice') {
      await handleSubscribeInvoice(plan);
      return;
    }
    setActionLoading(plan);
    setError(null);
    try {
      const res = await apiClient.post('/api/v1/admin/billing/checkout', { plan });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível abrir o pagamento.'));
      setActionLoading(null);
    }
  };

  const handleCancelPending = async () => {
    setCancelPendingDialog(false);
    setActionLoading('cancel-pending');
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/cancel');
      setSuccess('Pedido cancelado. Nenhuma cobrança foi feita — você pode escolher outra forma de pagamento.');
      await fetchBilling();
      refreshSubscription();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível cancelar o pedido.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangePlan = async (plan: PlanKey) => {
    setActionLoading(plan);
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/change-plan', { plan });
      setSuccess(`Plano alterado para ${planLabel(plan)}.`);
      await fetchBilling();
      refreshSubscription();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível trocar o plano.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelDialog(false);
    setActionLoading('cancel');
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/cancel');
      setSuccess('A assinatura será encerrada no fim do período atual. Até lá, tudo continua liberado.');
      await fetchBilling();
      refreshSubscription();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível cancelar a assinatura.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setReactivateDialog(false);
    setActionLoading('reactivate');
    setError(null);
    try {
      await apiClient.post('/api/v1/admin/billing/reactivate');
      setSuccess('Assinatura reativada. As cobranças seguem normalmente.');
      await fetchBilling();
      refreshSubscription();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível reativar a assinatura.'));
    } finally {
      setActionLoading(null);
    }
  };

  /** Ação do card de um plano na aba de comparação. */
  const actionFor = (plan: PlanDef) => {
    const isCurrent = plan.key === currentPlanKey && !inLocalTrial;
    const isTrialPlan = plan.key === currentPlanKey && inLocalTrial;
    const isLoading = actionLoading === plan.key;
    if (plan.price === 0) {
      return isCurrent ? { label: 'Plano atual', disabled: true, variant: 'outline' as const } : null;
    }
    if (isCurrent) return { label: 'Plano atual', disabled: true, variant: 'outline' as const };
    if (awaitingFirstPayment) return { label: 'Aguardando pagamento', disabled: true, variant: 'outline' as const };
    if (isFreePlan) {
      return {
        label: isTrialPlan ? 'Continuar neste plano' : 'Assinar agora',
        onClick: () => handleCheckout(plan.key),
        disabled: !!actionLoading && !isLoading,
        loading: isLoading,
      };
    }
    return {
      label: 'Mudar para este plano',
      onClick: () => setChangePlanTarget(plan.key),
      disabled: (!!actionLoading && !isLoading) || !!billing?.cancel_at_period_end,
      loading: isLoading,
      variant: plan.popular ? ('default' as const) : ('outline' as const),
    };
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando assinatura">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div data-slot="page" className="flex flex-col gap-5">
        <PageHeader title="Plano e assinatura" subtitle="Seu plano, o uso do mês e a cobrança, num lugar só." />
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Não foi possível carregar os dados da assinatura. Nada foi alterado no seu plano.</span>
            <Button type="button" size="sm" variant="outline" onClick={retryBilling}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div data-slot="page" className="flex flex-col gap-5">
      <PageHeader title="Plano e assinatura" subtitle="Seu plano, o uso do mês e a cobrança, num lugar só." />

      {success && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>{success}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => setSuccess(null)}>
              Fechar
            </button>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => setError(null)}>
              Fechar
            </button>
          </AlertDescription>
        </Alert>
      )}

      {billing?.is_bonus && (
        <Alert variant="info">
          <Star aria-hidden />
          <AlertDescription className="block">
            Seu acesso é <strong>cortesia</strong>: você tem o plano <strong>{currentPlan.label}</strong> sem custo. Para
            mudar algo, fale com o suporte.
          </AlertDescription>
        </Alert>
      )}

      {(billing.pending_invoice_url || awaitingFirstPayment) && (
        <Alert variant="warning" role="status" data-tour="billing-aguardando-pagamento">
          <Receipt aria-hidden />
          <AlertDescription className="flex flex-col gap-3">
            <span>
              <strong>Aguardando pagamento da fatura ({invoiceLabel.toLowerCase()}).</strong>{' '}
              {billing.pending_invoice_due_at ? (
                <>
                  Vence em <strong>{formatDate(billing.pending_invoice_due_at)}</strong>.{' '}
                </>
              ) : null}
              {awaitingFirstPayment
                ? 'O plano é liberado assim que o pagamento for confirmado (boleto leva até 1 dia útil). A fatura também foi enviada por e-mail.'
                : 'A fatura também foi enviada por e-mail. Depois do vencimento sem pagamento, o acesso fica suspenso até a confirmação.'}
            </span>
            <span className="flex flex-wrap gap-2">
              {billing.pending_invoice_url && (
                <Button asChild size="sm">
                  <a href={billing.pending_invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden /> Pagar agora
                  </a>
                </Button>
              )}
              {awaitingFirstPayment && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionLoading === 'cancel-pending'}
                  onClick={() => setCancelPendingDialog(true)}
                >
                  {actionLoading === 'cancel-pending' ? 'Cancelando…' : 'Cancelar pedido'}
                </Button>
              )}
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'assinatura' | 'planos')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          <TabsTrigger value="planos" disabled={billing?.is_bonus}>
            Comparar planos
          </TabsTrigger>
        </TabsList>

        {/* ══ Assinatura ══ */}
        <TabsContent value="assinatura" className="mt-4 flex flex-col gap-5">
          {billing && (
            <Card data-tour="billing-status">
              <CardContent className="flex flex-col gap-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand">
                      <CreditCard className="size-6" aria-hidden />
                    </span>
                    <div>
                      <p className="text-base font-bold">Plano {currentPlan.label}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={statusToneClass(billing.status)}>
                          {subscriptionStatusLabel(billing.status)}
                        </Badge>
                        {inLocalTrial && <Badge variant="outline">{trialEndShort ? `Teste grátis até ${trialEndShort}` : 'Teste grátis'}</Badge>}
                        {billing.is_bonus && <Badge variant="outline">Cortesia</Badge>}
                        {billing.cancel_at_period_end && <Badge variant="destructive">Cancelamento agendado</Badge>}
                      </div>
                    </div>
                  </div>

                  {!billing.is_bonus && billing.stripe_subscription_id && (
                    <div className="flex shrink-0 gap-2">
                      {!billing.cancel_at_period_end ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={actionLoading === 'cancel'}
                          onClick={() => setCancelDialog(true)}
                        >
                          <XCircle aria-hidden /> {actionLoading === 'cancel' ? 'Cancelando…' : 'Cancelar assinatura'}
                        </Button>
                      ) : (
                        <Button size="sm" disabled={actionLoading === 'reactivate'} onClick={() => setReactivateDialog(true)}>
                          <RefreshCw aria-hidden /> {actionLoading === 'reactivate' ? 'Reativando…' : 'Reativar assinatura'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {billing.stripe_subscription_id && (
                  <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Valor mensal</p>
                      <p className="mt-0.5 text-sm font-bold">{billing.monthly_price === 0 ? 'Grátis' : `R$ ${billing.monthly_price.toFixed(2)}`}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {billing.cancel_at_period_end ? 'Acesso até' : 'Próxima cobrança'}
                      </p>
                      <p className="mt-0.5 text-sm font-bold">{formatDate(billing.current_period_end)}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Forma de pagamento</p>
                      <p className="mt-0.5 text-sm font-bold">
                        {paysByInvoice ? `${invoiceLabel} (fatura por e-mail)` : 'Cartão de crédito'}
                      </p>
                    </div>
                    {billing.cancel_at_period_end && (
                      <Alert variant="warning" className="sm:col-span-3">
                        <Info aria-hidden />
                        <AlertDescription className="block">
                          Seu acesso ao plano {currentPlan.label} termina em <strong>{formatDate(billing.current_period_end)}</strong>.
                          Reative para continuar.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {subscription && (
                  <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                    <UsageBar label="Usuários no painel" current={subscription.current_users} max={subscription.max_users} />
                    <UsageBar label="Giras este mês" current={subscription.current_giras_this_month} max={subscription.max_giras_per_month} />
                    <UsageBar label="Médiuns cadastrados" current={subscription.current_mediuns} max={subscription.max_mediuns} />
                  </div>
                )}

                {currentPlanKey === 'free' && !billing.is_bonus && !inLocalTrial && (
                  <Alert variant="info">
                    <Info aria-hidden />
                    <AlertDescription className="block">
                      Você está no plano gratuito.{' '}
                      <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setTab('planos')}>
                        Compare os planos
                      </button>{' '}
                      para liberar médiuns, relatório da gira e os outros módulos.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {showPaymentPicker && (inLocalTrial || currentPlanKey === 'free') && (
            <PaymentMethodPicker
              value={payMethod}
              onChange={setPayMethod}
              invoiceMethods={billing.invoice_payment_methods}
              daysUntilDue={billing.invoice_days_until_due}
              disabled={!!actionLoading}
            />
          )}

          {inLocalTrial && billing && (
            <TrialSummaryCard
              data-tour="billing-trial"
              plan={currentPlan}
              trialEndsAt={billing.trial_ends_at ?? null}
              usage={usage}
              recommended={recommended}
              onKeep={(p) => handleCheckout(p.key)}
              loading={actionLoading === recommended.key}
              disabled={!!actionLoading || awaitingFirstPayment}
            />
          )}

          {!billing?.is_bonus && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
              <PlanCard
                data-tour={`billing-plano-${currentPlan.key}`}
                plan={currentPlan}
                state={inLocalTrial ? 'trial' : 'current'}
                action={
                  inLocalTrial
                    ? {
                        label: 'Continuar neste plano',
                        onClick: () => handleCheckout(currentPlan.key),
                        disabled: (!!actionLoading && actionLoading !== currentPlan.key) || awaitingFirstPayment,
                        loading: actionLoading === currentPlan.key,
                      }
                    : { label: 'Plano atual', disabled: true, variant: 'outline' }
                }
              />
              <Card className="flex items-center">
                <CardContent className="flex flex-col gap-3 p-5">
                  <p className="text-base font-bold">Quer mais ou menos?</p>
                  <p className="text-sm text-muted-foreground">
                    Veja lado a lado o que cada plano libera e troque quando quiser. A diferença é cobrada ou devolvida de
                    forma proporcional na próxima fatura.
                  </p>
                  <Button variant="outline" className="w-fit" onClick={() => setTab('planos')}>
                    Comparar planos
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          <SupportCard />
        </TabsContent>

        {/* ══ Comparar planos ══ */}
        <TabsContent value="planos" className="mt-4 flex flex-col gap-6">
          <div data-tour="billing-planos">
            <p className="text-base font-bold">{isFreePlan ? 'Escolha seu plano' : 'Trocar de plano'}</p>
            <p className="text-sm text-muted-foreground">
              Todos os planos incluem senha pelo WhatsApp, Porta e painel.
              {inLocalTrial ? ' Durante o teste, os dias que faltam continuam grátis depois de assinar.' : ''}
            </p>
          </div>

          {showPaymentPicker && (
            <PaymentMethodPicker
              value={payMethod}
              onChange={setPayMethod}
              invoiceMethods={billing.invoice_payment_methods}
              daysUntilDue={billing.invoice_days_until_due}
              disabled={!!actionLoading}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PLAN_LIST.map((plan) => {
              const isHighlight = plan.key === queryPlan;
              const state = plan.key === currentPlanKey ? (inLocalTrial ? 'trial' : 'current') : 'none';
              return (
                <div key={plan.key} ref={isHighlight ? scrollToHighlighted : undefined}>
                  <PlanCard
                    data-tour={`billing-plano-${plan.key}`}
                    plan={plan}
                    state={state}
                    highlighted={isHighlight}
                    recommended={inLocalTrial && plan.key === recommended.key && plan.price > 0}
                    action={actionFor(plan)}
                    note={plan.price === 0 && state === 'none' ? 'Para voltar ao gratuito, cancele a assinatura.' : undefined}
                  />
                </div>
              );
            })}
          </div>

          <div data-tour="billing-comparativo">
            <p className="mb-3 text-base font-bold">Comparativo completo</p>
            <PlanComparison currentPlan={currentPlanKey} highlightPlan={queryPlan} />
          </div>

          <SupportCard />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={cancelDialog}
        title="Cancelar assinatura?"
        message={
          <>
            Sua assinatura termina no fim do período atual — <strong>{formatDate(billing?.current_period_end)}</strong>. Até lá
            você continua no plano <strong>{currentPlan.label}</strong>; depois a conta volta ao gratuito.
          </>
        }
        confirmText="Confirmar cancelamento"
        cancelText="Manter assinatura"
        destructive
        onConfirm={handleCancel}
        onCancel={() => setCancelDialog(false)}
      />

      <ConfirmDialog
        open={cancelPendingDialog}
        title="Cancelar o pedido de assinatura?"
        message="A fatura em aberto é anulada e nada é cobrado. Depois você pode assinar de novo, com cartão ou com outra fatura."
        confirmText="Cancelar pedido"
        cancelText="Voltar"
        destructive
        onConfirm={handleCancelPending}
        onCancel={() => setCancelPendingDialog(false)}
      />

      <ConfirmDialog
        open={reactivateDialog}
        title="Reativar assinatura?"
        message={
          <>
            O cancelamento agendado é desfeito e as cobranças seguem normalmente a partir de{' '}
            <strong>{formatDate(billing?.current_period_end)}</strong>.
          </>
        }
        confirmText="Confirmar reativação"
        cancelText="Voltar"
        onConfirm={handleReactivate}
        onCancel={() => setReactivateDialog(false)}
      />

      <ConfirmDialog
        open={!!changePlanTarget}
        title={`Trocar para o plano ${changePlanTarget ? getPlan(changePlanTarget).label : ''}?`}
        message="A troca vale na hora. A diferença entre os planos é cobrada ou devolvida na próxima fatura, proporcional aos dias que faltam do período atual."
        confirmText="Confirmar troca"
        onConfirm={() => {
          const plan = changePlanTarget!;
          setChangePlanTarget(null);
          handleChangePlan(plan);
        }}
        onCancel={() => setChangePlanTarget(null)}
      />
    </div>
  );
}

function SupportCard() {
  return (
    <Card data-tour="billing-suporte">
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Dúvida sobre os planos?</p>
          <p className="text-sm text-muted-foreground">
            {SUPPORT_WHATSAPP
              ? 'Chame no WhatsApp ou use o chat de suporte aqui no painel.'
              : 'Use "Falar com o suporte" no menu do seu perfil — a conversa fica salva.'}
          </p>
        </div>
        {SUPPORT_WHATSAPP && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden /> Falar no WhatsApp
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href="/admin/suporte">Ver conversas de suporte</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
