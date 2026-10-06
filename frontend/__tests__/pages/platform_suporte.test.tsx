/**
 * /platform/suporte — `?conversation=` fora da lista carregada busca a conversa por id (antes
 * buscava de novo as mesmas 200 e não achava) e a conversa aberta é marcada como lida quando chega
 * mensagem nova do terreiro.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  pathname: '/platform/suporte',
  query: {} as Record<string, string>,
  asPath: '/platform/suporte',
  isReady: true,
  events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }) }));
jest.mock('@/components/support/usePlatformSupportUnread', () => ({ usePlatformSupportUnread: () => 0 }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import PlatformSuportePage from '@/pages/platform/suporte';

const LISTED = { id: 'c1', tenant_id: 't1', tenant_name: 'Casa Alfa', owner_name_snapshot: 'Maria', status: 'open', last_message_at: '2026-10-06T10:00:00Z', last_message_preview: 'Oi', unread: true };
const OLD = { id: 'c-old', tenant_id: 't9', tenant_name: 'Casa Antiga', owner_name_snapshot: 'João', status: 'resolved', last_message_at: '2026-01-01T10:00:00Z', last_message_preview: 'Obrigado', unread: false };
const msg = (id: string, body: string, fromSupport = false) => ({ id, body, is_from_support: fromSupport, sender_name_snapshot: fromSupport ? 'Suporte' : 'Maria', created_at: '2026-10-06T10:00:00Z' });

let messages = [msg('m1', 'Oi')];

function install() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/platform/support-chat/conversations') return Promise.resolve({ data: [LISTED] });
    if (url === '/api/v1/platform/support-chat/conversations/c-old') return Promise.resolve({ data: OLD });
    if (url.endsWith('/messages')) return Promise.resolve({ data: messages });
    return Promise.resolve({ data: [] });
  });
  mockPost.mockResolvedValue({});
}

describe('Platform — Suporte', () => {
  const intervals: Array<() => void> = [];
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    intervals.length = 0;
    messages = [msg('m1', 'Oi')];
    mockRouter.query = {};
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    // Polling controlado pelo teste: guarda os callbacks em vez de esperar 8s.
    setIntervalSpy = jest.spyOn(window, 'setInterval').mockImplementation(((fn: () => void) => {
      intervals.push(fn);
      return 0;
    }) as unknown as typeof setInterval);
    install();
  });
  afterEach(() => {
    setIntervalSpy.mockRestore();
    localStorage.clear();
  });

  it('?conversation= fora da lista busca a conversa por id', async () => {
    mockRouter.query = { conversation: 'c-old' };
    render(<PlatformSuportePage />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/platform/support-chat/conversations/c-old'));
    expect(await screen.findByRole('link', { name: 'Casa Antiga' })).toHaveAttribute('href', '/platform/tenants/t9');
    // Nenhuma segunda busca da lista sem filtro só para procurar a conversa.
    const listCalls = mockGet.mock.calls.filter(([u]) => u === '/api/v1/platform/support-chat/conversations');
    expect(listCalls.every(([, cfg]) => cfg?.params?.status === 'open')).toBe(true);
  });

  it('marca como lida ao abrir e de novo quando chega mensagem do terreiro com a conversa aberta', async () => {
    mockRouter.query = { conversation: 'c1' };
    render(<PlatformSuportePage />);
    expect(await screen.findByText('Oi', { selector: 'p, div, span' })).toBeInTheDocument();
    const readCalls = () => mockPost.mock.calls.filter(([u]) => u === '/api/v1/platform/support-chat/conversations/c1/read').length;
    await waitFor(() => expect(readCalls()).toBe(1));

    // Poll sem mensagem nova: não marca de novo.
    await act(async () => { intervals.forEach((fn) => fn()); });
    await waitFor(() => expect(mockGet.mock.calls.filter(([u]) => String(u).endsWith('/c1/messages')).length).toBeGreaterThanOrEqual(2));
    expect(readCalls()).toBe(1);

    // Chega mensagem do terreiro enquanto a conversa está aberta.
    messages = [msg('m1', 'Oi'), msg('m2', 'Ainda não consegui')];
    await act(async () => { intervals.forEach((fn) => fn()); });
    await waitFor(() => expect(readCalls()).toBe(2));
  });
});
