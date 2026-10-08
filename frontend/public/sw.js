/* eslint-disable no-restricted-globals */
/**
 * Service worker do GiraHub (P-01 — PWA da Porta). Escrito à mão, sem workbox.
 *
 * O que faz:
 * - Shell estático: `/_next/static/*` (nome com hash, imutável) em cache-first; ícones e manifest
 *   em stale-while-revalidate.
 * - Navegação (HTML): sempre rede. Se a rede falhar, mostra a página `/offline` guardada na
 *   instalação. O HTML das páginas NÃO é guardado.
 *
 * O que NUNCA faz:
 * - Cachear `/api/*`, `/ws/*` ou qualquer coisa fora da origem, nem requisições que não sejam GET,
 *   nem respostas autenticadas/privadas. As requisições à API passam direto para a rede.
 * - Sincronizar emissão de senhas offline (fora do escopo desta fase).
 *
 * Notificação no celular da Área do Médium (AM-16, Web Push): `push` mostra a notificação com o
 * ícone da Área (título, texto curto e `url` vindos do servidor — nada sensível) e
 * `notificationclick` foca uma janela aberta do GiraHub e leva à `url`, ou abre uma nova. Só
 * caminhos da própria origem: `url` de fora vira `/medium`.
 *
 * Versão: o registro passa `?v=<buildId>` (ServiceWorkerRegistrar). Cada build gera caches com
 * nome novo; o `activate` apaga os caches `girahub-*` de versões anteriores.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const PREFIX = 'girahub-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];
const STATIC_ASSETS = new Set(PRECACHE_URLS.filter((u) => u !== OFFLINE_URL));

/** Guarda a página offline e os chunks `/_next/static` que ela referencia (CSS/JS). */
async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
  try {
    const res = await cache.match(OFFLINE_URL);
    const html = res ? await res.text() : '';
    const assets = Array.from(new Set(html.match(/\/_next\/static\/[^"'\s)<>]+/g) || []));
    await Promise.all(
      assets.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((r) => (isCacheable(r) ? cache.put(url, r) : undefined))
          .catch(() => undefined),
      ),
    );
  } catch {
    /* sem os chunks a página offline ainda aparece (HTML pré-renderizado) */
  }
}

function isCacheable(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      // Navigation preload: a requisição da página sai junto com o boot do SW (sem atraso extra).
      .then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable() : undefined))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  return response || Response.error();
}

async function networkFirstNavigation(event) {
  try {
    // Sem cache do HTML: páginas do painel dependem da sessão.
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API, WebSocket, HMR e dados de página do Next: sempre direto para a rede, nunca em cache.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/_next/webpack-hmr')
  ) {
    return;
  }
  if (request.headers.has('Authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (STATIC_ASSETS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

// ── Notificação no celular (AM-16) ────────────────────────────────────────────
const PUSH_ICON = '/icons/icon-192.png';
const PUSH_URL_PADRAO = '/medium';

/** Só caminho da própria origem (nunca abre site de fora a partir de uma notificação). */
function urlDaArea(url) {
  try {
    const alvo = new URL(url || PUSH_URL_PADRAO, self.location.origin);
    if (alvo.origin !== self.location.origin) return PUSH_URL_PADRAO;
    return alvo.pathname + alvo.search;
  } catch {
    return PUSH_URL_PADRAO;
  }
}

function dadosDoPush(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const dados = dadosDoPush(event);
  const title = typeof dados.title === 'string' && dados.title ? dados.title : 'Área do Médium';
  const options = {
    body: typeof dados.body === 'string' ? dados.body : '',
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    lang: 'pt-BR',
    data: { url: urlDaArea(dados.url) },
  };
  if (typeof dados.tag === 'string' && dados.tag) {
    options.tag = dados.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = urlDaArea(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((c) => {
        try {
          return new URL(c.url).origin === self.location.origin && 'focus' in c;
        } catch {
          return false;
        }
      });
      if (aberta) {
        return aberta.focus().then((c) => {
          const janela = c || aberta;
          return 'navigate' in janela ? janela.navigate(url) : undefined;
        });
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
