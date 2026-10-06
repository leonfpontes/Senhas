/**
 * fetchAllPages — listagens admin cortavam em 50/100 sem avisar (Estoque e Cursos):
 * KPIs e filtros do cliente ficavam errados a partir do item 101.
 */
jest.mock('@/services/api_client', () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from '@/services/api_client';
import { fetchAllPages } from '@/services/fetchAllPages';

const get = apiClient.get as jest.Mock;

describe('fetchAllPages', () => {
  beforeEach(() => get.mockReset());

  it('segue pedindo páginas até uma vir incompleta e junta tudo, preservando os filtros', async () => {
    get
      .mockResolvedValueOnce({ data: [1, 2] })
      .mockResolvedValueOnce({ data: [3, 4] })
      .mockResolvedValueOnce({ data: [5] });

    const all = await fetchAllPages<number>('/api/v1/admin/estoque/itens', { params: { grupo_id: 'g1' }, pageSize: 2 });

    expect(all).toEqual([1, 2, 3, 4, 5]);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[0][1].params).toEqual({ grupo_id: 'g1', skip: 0, limit: 2 });
    expect(get.mock.calls[2][1].params).toEqual({ grupo_id: 'g1', skip: 4, limit: 2 });
  });

  it('página exata no tamanho pede mais uma e para na vazia', async () => {
    get.mockResolvedValueOnce({ data: [1, 2] }).mockResolvedValueOnce({ data: [] });
    expect(await fetchAllPages<number>('/x', { pageSize: 2 })).toEqual([1, 2]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('respeita a trava de páginas', async () => {
    get.mockResolvedValue({ data: [1] });
    expect(await fetchAllPages<number>('/x', { pageSize: 1, maxPages: 3 })).toEqual([1, 1, 1]);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
