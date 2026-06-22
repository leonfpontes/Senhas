/**
 * usePaginatedFetch — fetch hook for paginated API endpoints.
 * Manages page, limit, optional filters, and provides setPage/setFilters helpers.
 *
 * The backend must return { items: T[], total: number, page: number, pages: number }.
 *
 * Usage:
 *   const { data, loading, page, setPage, refetch } = usePaginatedFetch<User>(
 *     '/api/v1/admin/users',
 *     { limit: 20 },
 *   );
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api_client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

interface UsePaginatedFetchOptions {
  limit?: number;
  initialFilters?: Record<string, unknown>;
}

interface UsePaginatedFetchReturn<T> {
  data: PaginatedResponse<T> | null;
  loading: boolean;
  error: string | null;
  page: number;
  filters: Record<string, unknown>;
  setPage: (p: number) => void;
  setFilters: (f: Record<string, unknown>) => void;
  refetch: () => void;
}

export function usePaginatedFetch<T>(
  url: string | null,
  options: UsePaginatedFetchOptions = {},
): UsePaginatedFetchReturn<T> {
  const { limit = 20, initialFilters = {} } = options;
  const [page, setPageState] = useState(1);
  const [filters, setFiltersState] = useState<Record<string, unknown>>(initialFilters);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<T> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit, ...filters };
      const res = await apiClient.get<PaginatedResponse<T>>(url, { params, signal });
      if (mountedRef.current) {
        const raw = res.data;
        // Normalise: some endpoints return a plain array instead of paginated shape
        if (Array.isArray(raw)) {
          setData({ items: raw as T[], total: (raw as T[]).length, page: 1, pages: 1 });
        } else {
          setData(raw);
        }
        setLoading(false);
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const e = err as { name?: string };
      if (e?.name === 'CanceledError' || e?.name === 'AbortError') return;
      setError((err as { message?: string })?.message ?? 'Erro ao carregar dados');
      setLoading(false);
    }
  }, [url, page, limit, filters]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchData]);

  const setPage = useCallback((p: number) => { setPageState(p); }, []);

  const setFilters = useCallback((f: Record<string, unknown>) => {
    setFiltersState(f);
    setPageState(1); // reset to first page when filters change
  }, []);

  const refetch = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, page, filters, setPage, setFilters, refetch };
}
