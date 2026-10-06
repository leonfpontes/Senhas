/**
 * Registra o service worker do PWA (P-01) — montado uma vez no `_app.tsx`. Também passa a
 * capturar o `beforeinstallprompt` (usado pela dica "Instalar a Porta na tela inicial").
 *
 * Produção + contexto seguro: registra `/sw.js?v=<buildId>` depois do `load` da página (não
 * disputa banda com o primeiro carregamento). Desenvolvimento: desregistra qualquer SW antigo.
 * Regras do SW (nunca cachear `/api/*`) em `public/sw.js`.
 */
import { useEffect } from 'react';
import { captureInstallPrompt, setupServiceWorker } from '@/lib/pwa';

interface Props {
  /** Ambiente; padrão `process.env.NODE_ENV` (o Next fixa no build). */
  env?: string;
}

export default function ServiceWorkerRegistrar({ env = process.env.NODE_ENV }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    captureInstallPrompt();
    if (!('serviceWorker' in navigator)) return;
    const run = () => {
      void setupServiceWorker(env);
    };
    if (document.readyState === 'complete') {
      run();
      return;
    }
    window.addEventListener('load', run, { once: true });
    return () => window.removeEventListener('load', run);
  }, [env]);
  return null;
}
