/**
 * Instrumentation hook do Next.js — inicializa o Sentry no servidor.
 *
 * Desde o Next 15 / @sentry/nextjs 8, `sentry.server.config.ts` e
 * `sentry.edge.config.ts` NÃO são mais carregados automaticamente: o
 * `Sentry.init` precisa rodar dentro de `register()`. Até 2026-10-05 o
 * Sentry do lado servidor do frontend (getServerSideProps, API routes do
 * Next) não inicializava — só o do navegador (`sentry.client.config.ts`,
 * que continua sendo carregado normalmente pelo SDK 8).
 *
 * O arquivo fica em `src/` porque o Next procura o hook na pasta pai do
 * diretório de páginas (`src/pages`); na raiz de `frontend/` seria ignorado.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Captura erros de renderização/requests no servidor (Next 15+).
export const onRequestError = Sentry.captureRequestError;
