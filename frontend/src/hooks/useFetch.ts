/**
 * useFetch — thin wrapper over the API client for data fetching with
 * loading/error/data state. Supports manual refetch and AbortController cleanup.
 *
 * For paginated endpoints use usePaginatedFetch instead.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFetch<MyType>('/api/v1/admin/something');
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api_client';

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseFetchReturn<T> extends UseFetchState<T> {
  refetch: () => void;
}

export function useFetch<T>(
  url: string | null,
  deps: unknown[] = [],
): UseFetchReturn<T> {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: !!url,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiClient.get<T>(url, { signal });
      if (mountedRef.current) setState({ data: res.data, loading: false, error: null });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const e = err as { name?: string; message?: string };
      if (e?.name === 'CanceledError' || e?.name === 'AbortError') return;
      const msg = (err as { message?: string })?.message ?? 'Erro ao carregar dados';
      setState(s => ({ ...s, loading: false, error: msg }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchData]);

  const refetch = useCallback(() => { fetchData(); }, [fetchData]);

  return { ...state, refetch };
}
