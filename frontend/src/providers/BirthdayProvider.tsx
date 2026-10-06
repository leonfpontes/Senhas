/**
 * BirthdayProvider — fetches today's aniversariantes once per session load
 * and exposes the count via useBirthday(). Gated on can('mediuns') (plano) E
 * canGroup('mediuns', 'view') (grupo) — operador sem acesso a Médiuns não dispara a chamada
 * (que daria 403).
 *
 * Place this inside SubscriptionProvider + PermissionsProvider in _app.tsx.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiClient } from '../services/api_client';
import { useSubscription } from '../hooks/useSubscription';
import { usePermissions } from '../hooks/usePermissions';

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
  const { can: canGroup, loading: permLoading } = usePermissions();
  const allowed = !subLoading && !permLoading && can('mediuns') && canGroup('mediuns', 'view');

  useEffect(() => {
    if (!allowed) return;

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
  }, [allowed]);

  return (
    <BirthdayContext.Provider value={{ birthdayCount }}>
      {children}
    </BirthdayContext.Provider>
  );
}

export function useBirthday(): BirthdayContextValue {
  return useContext(BirthdayContext);
}
