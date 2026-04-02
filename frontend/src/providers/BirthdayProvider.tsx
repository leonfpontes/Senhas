/**
 * BirthdayProvider — fetches today's aniversariantes once per session load
 * and exposes the count via useBirthday(). Gated on can('mediuns').
 *
 * Place this inside SubscriptionProvider in _app.tsx so can() is available.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiClient } from '../services/api_client';
import { useSubscription } from '../hooks/useSubscription';

interface BirthdayContextValue {
  /** Number of médiuns with birthday today (dias=0). */
  birthdayCount: number;
}

const BirthdayContext = createContext<BirthdayContextValue>({
  birthdayCount: 0,
});

export function BirthdayProvider({ children }: { children: React.ReactNode }) {
  const [birthdayCount, setBirthdayCount] = useState(0);
  const { can, loading: subLoading } = useSubscription();

  useEffect(() => {
    if (subLoading) return;
    if (!can('mediuns')) return;

    const controller = new AbortController();

    apiClient
      .get<{ id: string }[]>(
        '/api/v1/admin/mediuns/aniversariantes?dias=0',
        { signal: controller.signal }
      )
      .then((res) => setBirthdayCount(Array.isArray(res.data) ? res.data.length : 0))
      .catch(() => {
        /* silently ignore — badge is non-critical */
      });

    return () => controller.abort();
  }, [subLoading, can]);

  return (
    <BirthdayContext.Provider value={{ birthdayCount }}>
      {children}
    </BirthdayContext.Provider>
  );
}

export function useBirthday(): BirthdayContextValue {
  return useContext(BirthdayContext);
}
