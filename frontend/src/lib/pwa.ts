/**
 * PWA (P-01): registro do service worker e detecção de instalação.
 *
 * - `public/sw.js` só é registrado em produção e em contexto seguro (HTTPS ou localhost).
 *   Em desenvolvimento qualquer registro antigo é removido, para o SW não servir chunks velhos
 *   por cima do HMR.
 * - A versão do SW (`?v=`) é o buildId do Next: cada deploy gera caches com nome novo e o
 *   `activate` do SW apaga os anteriores.
 */
import { APP_VERSION } from '@/lib/version';

export const SW_URL = '/sw.js';
export const SW_CACHE_PREFIX = 'girahub-';

/** Evento `beforeinstallprompt` (Chrome/Edge/Android) — ainda fora do lib.dom do TypeScript. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

/** buildId do Next (muda a cada build); sem ele, a versão da interface. */
export function swVersion(): string {
  if (typeof window !== 'undefined') {
    const buildId = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__?.buildId;
    if (buildId && buildId !== 'development') return buildId;
  }
  return APP_VERSION;
}

async function unregisterAll(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(SW_CACHE_PREFIX)).map((k) => caches.delete(k)));
    }
  } catch {
    /* sem permissão para mexer no SW — nada a fazer */
  }
}

/**
 * Registra (produção) ou desregistra (dev) o service worker.
 * Retorna o que fez — útil para teste e diagnóstico.
 */
export async function setupServiceWorker(
  env: string | undefined = process.env.NODE_ENV,
): Promise<'registered' | 'unregistered' | 'skipped'> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'skipped';
  if (env !== 'production') {
    await unregisterAll();
    return 'unregistered';
  }
  if (!window.isSecureContext) return 'skipped';
  try {
    await navigator.serviceWorker.register(`${SW_URL}?v=${encodeURIComponent(swVersion())}`, { scope: '/' });
    return 'registered';
  } catch (err) {
    console.warn('Service worker não registrado:', err);
    return 'skipped';
  }
}

/** Aberto como app instalado (tela inicial), e não numa aba do navegador. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let displayStandalone = false;
  try {
    displayStandalone =
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
  } catch {
    displayStandalone = false;
  }
  return iosStandalone || displayStandalone;
}

/** iPhone/iPad (inclusive iPadOS, que se apresenta como Mac com toque). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

// ── Instalação (beforeinstallprompt) ──────────────────────────────────────────
// O Chrome dispara `beforeinstallprompt` uma vez por carregamento, em geral antes de alguém abrir
// a Porta (navegação client-side). Por isso o evento é capturado cedo (ServiceWorkerRegistrar, no
// `_app`) e guardado aqui; a dica da Porta lê daqui e ouve `INSTALL_PROMPT_EVENT`.

export const INSTALL_PROMPT_EVENT = 'girahub:install-prompt';

interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  capturing: boolean;
}

/** Estado no `window` (um por aba), não no módulo: sobrevive a HMR e a cópias do módulo. */
function installState(): InstallState {
  const w = window as unknown as { __girahubInstall?: InstallState };
  if (!w.__girahubInstall) w.__girahubInstall = { prompt: null, capturing: false };
  return w.__girahubInstall;
}

/** Passa a capturar `beforeinstallprompt`/`appinstalled` (idempotente). */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  const state = installState();
  if (state.capturing) return;
  state.capturing = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sem o mini-infobar genérico do Chrome: a Porta oferece a instalação no momento certo.
    event.preventDefault();
    installState().prompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  });
  window.addEventListener('appinstalled', () => {
    installState().prompt = null;
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  });
}

/** Prompt de instalação guardado, se o navegador ofereceu um. */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return typeof window === 'undefined' ? null : installState().prompt;
}

/** Usa o prompt guardado (só pode ser mostrado uma vez). */
export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  const state = installState();
  const prompt = state.prompt;
  state.prompt = null;
  return prompt;
}
