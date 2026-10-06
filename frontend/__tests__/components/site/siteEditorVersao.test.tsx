/**
 * Meu Site — lock otimista e configurações (jornada 2026-10-06).
 *
 * Bug: publish/unpublish/PUT /sites bumpam `updated_at` no backend, mas o editor não
 * adotava a versão devolvida → o próximo autosave mandava versão velha, levava 409
 * falso e o salvamento automático parava. No primeiro uso, o assistente disparava um
 * PUT /sites (template) em paralelo ao primeiro autosave.
 */
import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() } }),
}));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }),
}));
jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { useSiteEditor } from '@/components/site/editor/useSiteEditor';
import { SettingsSheet } from '@/components/site/editor/SettingsSheet';

const V0 = '2026-10-06T10:00:00+00:00';
const SITE = { id: 'site-1', slug: 'casa-de-oxala', status: 'DRAFT', template: 'moderno', meta_title: 'Casa', meta_description: null, updated_at: V0 };
const SECTIONS = { sections: [{ id: 'sec-hero', section_type: 'HERO', order_index: 0, config: { title: 'Casa de Oxalá' } }], site_updated_at: V0 };

function api() {
  return require('@/services/api_client').apiClient as Record<'get' | 'post' | 'put', jest.Mock>;
}

function mockApi() {
  const a = api();
  a.get.mockImplementation((url: string) => {
    if (url.endsWith('/admin/sites/sections')) return Promise.resolve({ data: SECTIONS });
    if (url.endsWith('/admin/sites')) return Promise.resolve({ data: SITE });
    return Promise.resolve({ data: [] });
  });
}

async function editorPronto() {
  const hook = renderHook(() => useSiteEditor({ enabled: true, canEdit: true }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

async function salvarDepoisDeEditar(hook: Awaited<ReturnType<typeof editorPronto>>) {
  const a = api();
  a.put.mockResolvedValueOnce({ data: SECTIONS });
  act(() => hook.result.current.updateConfig('sec-hero', { title: 'Casa de Oxalá e Caboclos' }));
  await act(async () => {
    await hook.result.current.save({ silent: true });
  });
  const put = a.put.mock.calls.find((c) => c[0] === '/api/v1/admin/sites/sections');
  return put?.[1]?.site_version;
}

describe('useSiteEditor — versão do lock otimista', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi();
  });

  it('depois de publicar, o próximo salvamento manda a versão devolvida pelo publish', async () => {
    const hook = await editorPronto();
    api().post.mockResolvedValueOnce({ data: { ...SITE, status: 'PUBLISHED', updated_at: '2026-10-06T10:05:00+00:00' } });
    await act(async () => {
      await hook.result.current.publish();
    });
    expect(await salvarDepoisDeEditar(hook)).toBe('2026-10-06T10:05:00+00:00');
  });

  it('depois de despublicar, o próximo salvamento manda a versão devolvida pelo unpublish', async () => {
    const hook = await editorPronto();
    api().post.mockResolvedValueOnce({ data: { ...SITE, status: 'UNPUBLISHED', updated_at: '2026-10-06T10:06:00+00:00' } });
    await act(async () => {
      await hook.result.current.unpublish();
    });
    expect(await salvarDepoisDeEditar(hook)).toBe('2026-10-06T10:06:00+00:00');
  });

  it('depois de salvar as configurações, o próximo salvamento manda a versão devolvida pelo PUT /sites', async () => {
    const hook = await editorPronto();
    api().put.mockResolvedValueOnce({ data: { ...SITE, meta_title: null, updated_at: '2026-10-06T10:07:00+00:00' } });
    await act(async () => {
      await hook.result.current.saveSettings({ meta_title: null, meta_description: null });
    });
    expect(await salvarDepoisDeEditar(hook)).toBe('2026-10-06T10:07:00+00:00');
  });
});

describe('SettingsSheet', () => {
  it('endereço é somente leitura, não há seletor de estilo e campo vazio vai como null (limpa)', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(<SettingsSheet open onOpenChange={jest.fn()} site={SITE} onSave={onSave} />);

    const endereco = screen.getByLabelText('Endereço do site') as HTMLInputElement;
    expect(endereco).toHaveAttribute('readonly');
    expect(endereco.value).toMatch(/\/casa-de-oxala$/);
    expect(screen.queryByText('Estilo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Título da página/));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(onSave).toHaveBeenCalledWith({ meta_title: null, meta_description: null });
  });
});
