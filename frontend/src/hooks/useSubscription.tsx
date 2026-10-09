/**
 * Subscription context — provides plan info and feature gates to all admin pages.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAdminDataEnabled } from '@/hooks/useAdminDataEnabled';
import { apiClient } from '../services/api_client';
import { planLabel as planDisplayLabel } from '@/constants/plans';

export interface PlanFeatures {
  email_transacional: boolean;
  tema_personalizado: boolean;
  analytics_basico: boolean;
  analytics_avancado: boolean;
  associados: boolean;
  export_csv: boolean;
  bulk_operations: boolean;
  auditoria: boolean;
  suporte_prioritario: boolean;
  mensalidade_mediun: boolean;
  mensalidade_associado: boolean;
  estoque_controle: boolean;
  contas_financeiras: boolean;
  mediuns: boolean;
  relatorio_gira: boolean;
  site_builder: boolean;
  fila_espera: boolean;
  agendamento_por_horario: boolean;
  /** Área do Médium (AM-02): login do médium e /api/v1/medium/*. */
  area_medium: boolean;
  /** Atividades da casa (AM-08): tipos, atividades internas, presença. Basic+. */
  atividades_corrente: boolean;
  /** Escalas (faxina por grupos, escala de gira por função). Pro+. */
  escalas: boolean;
  /** Estudos e documentos da casa (AM-21): biblioteca da corrente. Pro+. */
  biblioteca_medium: boolean;
  /** Ficha espiritual do médium (F-05/AM-19, Pro). */
  ficha_espiritual: boolean;
  /** Mensalidade com baixa automática — Stripe ou Mercado Pago (F-02/AM-22, Pro). */
  mensalidade_automatica: boolean;
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  max_mediuns: number;
  current_users: number;
  current_giras_this_month: number;
  current_mediuns: number;
  monthly_price: number;
  is_trial: boolean;
  trial_ends_at: string | null;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  /** Já tem assinatura na Stripe (cartão cadastrado) — trial "trialing" não é trial local. */
  has_stripe_subscription?: boolean;
  /** Cortesia concedida pela plataforma (sem cobrança). */
  is_bonus?: boolean;
  features: PlanFeatures;
}

interface SubscriptionContextValue {
  subscription: SubscriptionInfo | null;
  loading: boolean;
  /** Check if a feature is available on the current plan */
  can: (feature: keyof PlanFeatures) => boolean;
  /** Check if the monthly gira limit allows creating another gira */
  canCreateGira: () => boolean;
  /** Check if the médium limit allows creating another médium */
  canCreateMedium: (currentCount: number) => boolean;
  /** Re-fetch subscription data */
  refresh: () => void;
  /** Friendly plan display name */
  planLabel: string;
}

const DEFAULT_FEATURES: PlanFeatures = {
  email_transacional: false,
  tema_personalizado: false,
  analytics_basico: false,
  analytics_avancado: false,
  associados: false,
  export_csv: false,
  bulk_operations: true,
  auditoria: false,
  suporte_prioritario: false,
  mensalidade_mediun: false,
  mensalidade_associado: false,
  estoque_controle: false,
  contas_financeiras: false,
  mediuns: false,
  relatorio_gira: false,
  site_builder: false,
  fila_espera: false,
  agendamento_por_horario: false,
  area_medium: false,
  atividades_corrente: false,
  escalas: false,
  biblioteca_medium: false,
  ficha_espiritual: false,
  mensalidade_automatica: false,
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: true,
  can: () => false,
  canCreateGira: () => false,
  canCreateMedium: () => false,
  refresh: () => {},
  planLabel: planDisplayLabel('free'),
});

const hasAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(sessionStorage.getItem('access_token')) ||
    document.cookie.includes('auth_state=1') ||
    Boolean(localStorage.getItem('user'))
  );
};

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // Só no painel (/admin/*) e para quem tem o painel (AM-04): a Área do Médium não chama /admin.
  const enabled = useAdminDataEnabled();

  const fetchSubscription = useCallback(async () => {
    // Skip the fetch on public pages (no token) to avoid unnecessary 401s.
    if (!enabled || !hasAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get<SubscriptionInfo>('/api/v1/admin/subscription');
      setSubscription(res.data);
    } catch {
      // On transient errors (e.g. 503), preserve the last known subscription so
      // features that belong to the tenant's plan remain accessible.
      // Only the initial load (subscription still null) will leave it as null.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Re-fetch whenever a new token is stored (e.g. after signup or login via
  // client-side navigation). ThemeProvider dispatches this event immediately
  // after the token is written to localStorage, so hasAuthToken() will be true.
  useEffect(() => {
    const handleAuthChange = () => {
      fetchSubscription();
    };
    window.addEventListener('tenant-branding-updated', handleAuthChange);
    return () => {
      window.removeEventListener('tenant-branding-updated', handleAuthChange);
    };
  }, [fetchSubscription]);

  const features = subscription?.features ?? DEFAULT_FEATURES;

  const can = useCallback(
    (feature: keyof PlanFeatures) => features[feature],
    [features],
  );

  const canCreateGira = useCallback(
    () => {
      if (!subscription) return false;
      if (subscription.max_giras_per_month < 0) return true;
      return subscription.current_giras_this_month < subscription.max_giras_per_month;
    },
    [subscription],
  );

  const canCreateMedium = useCallback(
    (currentCount: number) => {
      if (!subscription) return false;
      if (subscription.max_mediuns < 0) return true;
      return currentCount < subscription.max_mediuns;
    },
    [subscription],
  );

  // Rótulo único dos planos (constants/plans.ts) — "Gratuito", não "Free".
  const planLabel = planDisplayLabel(subscription?.plan ?? 'free');

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, can, canCreateGira, canCreateMedium, refresh: fetchSubscription, planLabel }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
