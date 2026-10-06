/**
 * public/sw.js (P-01): roda o service worker num sandbox com `caches`/`fetch` falsos e confere
 * as regras — nunca interceptar `/api/*` (nem POST, nem outra origem), navegação com fallback
 * para /offline sem guardar HTML, `/_next/static` em cache-first e limpeza de versões antigas.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ORIGIN = 'https://girahub.com.br';
const SW_SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');

type Listener = (event: any) => void;

function fakeResponse(body = '', headers: Record<string, string> = {}) {
  const res: any = {
    ok: true,
    status: 200,
    type: 'basic',
    body,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    text: async () => body,
    clone: () => res,
  };
  return res;
}

function setup(version = 'build-2') {
  const stores = new Map<string, Map<string, any>>();
  const keyOf = (req: any) => {
    const url = typeof req === 'string' ? req : req.url;
    return new URL(url, ORIGIN).pathname + (new URL(url, ORIGIN).search || '');
  };
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        addAll: async (reqs: any[]) => {
          for (const r of reqs) store.set(keyOf(r), fakeResponse(keyOf(r) === '/offline' ? '<link href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script>' : 'x'));
        },
        match: async (req: any, opts?: { ignoreSearch?: boolean }) => {
          const k = keyOf(req);
          return store.get(opts?.ignoreSearch ? k.split('?')[0] : k);
        },
        put: async (req: any, res: any) => {
          store.set(keyOf(req), res);
        },
      };
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
  };
  const fetchMock = jest.fn(async (_req: any, _opts?: any) => fakeResponse('network'));
  const listeners: Record<string, Listener> = {};
  const self: any = {
    location: { href: `${ORIGIN}/sw.js?v=${version}`, origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: jest.fn(() => Promise.resolve()),
    clients: { claim: jest.fn(() => Promise.resolve()) },
    registration: { navigationPreload: { enable: jest.fn(() => Promise.resolve()) } },
  };
  class FakeRequest {
    url: string;
    constructor(url: string) {
      this.url = new URL(url, ORIGIN).href;
    }
  }
  vm.runInNewContext(SW_SOURCE, {
    self,
    caches,
    fetch: fetchMock,
    URL,
    Request: FakeRequest,
    Response: { error: () => ({ type: 'error' }) },
    Promise,
    Set,
    Array,
  });

  async function dispatchFetch(url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) {
    const respondWith = jest.fn();
    const waits: Promise<unknown>[] = [];
    const headers = init.headers ?? {};
    listeners.fetch({
      request: {
        url: new URL(url, ORIGIN).href,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
        headers: { has: (k: string) => k in headers },
      },
      preloadResponse: Promise.resolve(undefined),
      respondWith,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = respondWith.mock.calls[0] ? await respondWith.mock.calls[0][0] : undefined;
    await Promise.all(waits);
    return { respondWith, response };
  }

  async function lifecycle(type: 'install' | 'activate') {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }

  return { stores, fetchMock, self, dispatchFetch, lifecycle };
}

describe('service worker', () => {
  it('nunca intercepta /api/*, POST, outra origem, dados do Next nem requisição com Authorization', async () => {
    const sw = setup();
    for (const [url, init] of [
      ['/api/v1/admin/giras/g1/door/queue', {}],
      ['/api/v1/auth/me', { mode: 'navigate' }],
      ['/admin/porta', { method: 'POST', mode: 'navigate' }],
      ['https://www.googletagmanager.com/gtag/js', {}],
      ['/_next/data/abc/admin/porta.json', {}],
      ['/ws/porta', {}],
      ['/_next/static/chunks/main.js', { headers: { Authorization: 'Bearer x' } }],
    ] as const) {
      const { respondWith } = await sw.dispatchFetch(url, init as any);
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it('instala guardando /offline, ícones, manifest e os chunks que a página offline usa', async () => {
    const sw = setup('build-2');
    await sw.lifecycle('install');
    const shell = sw.stores.get('girahub-shell-build-2')!;
    expect(shell.has('/offline')).toBe(true);
    expect(shell.has('/manifest.webmanifest')).toBe(true);
    expect(shell.has('/icons/icon-maskable-512.png')).toBe(true);
    expect(shell.has('/_next/static/css/app.css')).toBe(true);
    expect(shell.has('/_next/static/chunks/main.js')).toBe(true);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('navegação vai à rede e não guarda o HTML; sem rede devolve /offline', async () => {
    const sw = setup('build-2');
    await sw.lifecycle('install');
    const shell = sw.stores.get('girahub-shell-build-2')!;

    const ok = await sw.dispatchFetch('/admin/porta?source=pwa', { mode: 'navigate' });
    expect(ok.response.body).toBe('network');
    expect(shell.has('/admin/porta?source=pwa')).toBe(false);

    sw.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offline = await sw.dispatchFetch('/admin/porta', { mode: 'navigate' });
    expect(offline.response).toBe(shell.get('/offline'));
  });

  it('/_next/static vem do cache primeiro; respostas no-store/private não são guardadas', async () => {
    const sw = setup('build-2');
    await sw.lifecycle('install');
    sw.fetchMock.mockClear();

    await sw.dispatchFetch('/_next/static/chunks/main.js');
    expect(sw.fetchMock).not.toHaveBeenCalled();

    await sw.dispatchFetch('/_next/static/chunks/novo.js');
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(sw.stores.get('girahub-shell-build-2')!.has('/_next/static/chunks/novo.js')).toBe(true);

    sw.fetchMock.mockResolvedValueOnce(fakeResponse('segredo', { 'Cache-Control': 'private, no-store' }));
    await sw.dispatchFetch('/_next/static/chunks/privado.js');
    expect(sw.stores.get('girahub-shell-build-2')!.has('/_next/static/chunks/privado.js')).toBe(false);
  });

  it('no activate apaga caches girahub-* de versões anteriores e mantém o atual', async () => {
    const old = setup('build-1');
    await old.lifecycle('install');
    const sw = setup('build-2');
    // Mesmo CacheStorage: copia o cache da versão antiga e um de outra origem de código.
    sw.stores.set('girahub-shell-build-1', old.stores.get('girahub-shell-build-1')!);
    sw.stores.set('outro-cache', new Map());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(Array.from(sw.stores.keys()).sort()).toEqual(['girahub-shell-build-2', 'outro-cache']);
    expect(sw.self.clients.claim).toHaveBeenCalled();
    expect(sw.self.registration.navigationPreload.enable).toHaveBeenCalled();
  });
});
