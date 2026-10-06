/**
 * Busca TODAS as páginas de um endpoint de listagem `skip`/`limit` do backend.
 *
 * As listagens admin devolvem um array simples e cortam no `limit` padrão
 * (50/100) sem avisar. Telas que calculam KPIs ou filtram no cliente precisam do
 * conjunto inteiro — senão os números ficam errados em silêncio a partir do
 * item 51/101. Usa o `limit` máximo aceito pelo endpoint e para quando uma página
 * volta incompleta. `maxPages` é só uma trava contra laço infinito.
 */
import type { AxiosRequestConfig } from 'axios';

import { apiClient } from './api_client';

export async function fetchAllPages<T>(
  url: string,
  {
    params = {},
    pageSize,
    maxPages = 50,
    config = {},
  }: {
    params?: Record<string, unknown>;
    /** `le=` do `Query(limit)` do endpoint. */
    pageSize: number;
    maxPages?: number;
    config?: AxiosRequestConfig;
  },
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const res = await apiClient.get<T[]>(url, {
      ...config,
      params: { ...params, skip: page * pageSize, limit: pageSize },
    });
    const batch = Array.isArray(res.data) ? res.data : [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}
