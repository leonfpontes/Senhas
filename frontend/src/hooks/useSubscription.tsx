/**
 * Subscription context — provides plan info and feature gates to all admin pages.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../services/api_client';

export interface PlanFeatures {
  email_transacional: boolean;
  tema_personalizado: boolean;
  analytics_basico: boolean;
  analytics_avancado: boolean;
  associados: boolean;
  export_csv: boolean;
  bulk_operations: boolean;
  auditoria: boolean;
  webhooks: boolean;
  api_access: boolean;
  suporte_prioritario: boolean;
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  current_users: number;
  monthly_price: number;
  is_trial: boolean;
  trial_ends_at: string | null;
  auto_renew: boolean;
  features: PlanFeatures;
}

interface SubscriptionContextValue {
  subscription: SubscriptionInfo | null;
  loading: boolean;
  /** Check if a feature is available on the current plan */
  can: (feature: keyof PlanFeatures) => boolean;
  /** Check if adding one more would exceed the limit */
  canCreateUser: (currentCount: number) => boolean;
  canCreateGira: (currentCount: number) => boolean;
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
  bulk_operations: false,
  auditoria: false,
  webhooks: false,
  api_access: false,
  suporte_prioritario: false,
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium',
  enterprise: 'Enterprise',
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: true,
  can: () => false,
  canCreateUser: () => false,
  canCreateGira: () => false,
  refresh: () => {},
  planLabel: 'Free',
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await apiClient.get<SubscriptionInfo>('/api/v1/admin/subscription');
      setSubscription(res.data);
    } catch {
      // If endpoint fails, assume free plan
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const features = subscription?.features ?? DEFAULT_FEATURES;

  const can = useCallback(
    (feature: keyof PlanFeatures) => features[feature],
    [features],
  );

  const canCreateUser = useCallback(
    (currentCount: number) => {
      if (!subscription) return false;
      return currentCount < subscription.max_users;
    },
    [subscription],
  );

  const canCreateGira = useCallback(
    (currentCount: number) => {
      if (!subscription) return false;
      return currentCount < subscription.max_giras_per_month;
    },
    [subscription],
  );

  const planLabel = PLAN_LABELS[subscription?.plan ?? 'free'] ?? 'Free';

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, can, canCreateUser, canCreateGira, refresh: fetchSubscription, planLabel }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
