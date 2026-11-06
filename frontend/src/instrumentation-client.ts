/**
 * Inicialização do Sentry no navegador (@sentry/nextjs 10).
 *
 * Substitui o antigo `sentry.client.config.ts` (deprecado desde o SDK 9 e
 * ignorado com Turbopack): o Next 15.3+ carrega este arquivo, pela convenção
 * `instrumentation-client`, antes do código da aplicação. Fica em `src/` pelo
 * mesmo motivo do `instrumentation.ts`: o Next procura essas convenções na
 * pasta pai do diretório de páginas (`src/pages`); na raiz de `frontend/`
 * seria ignorado.
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Aparelho antigo/fraco (o iPad da casa, iOS 15 com 2 GB): sem `color-mix` no CSS (WebKit < 16.2,
 * Chrome < 111) ou com até 2 GB de memória declarados. Nele o Replay fica desligado: mesmo "só em
 * erros" ele grava cada mudança da tela o tempo todo (guarda o último minuto), e a Porta muda a
 * cada 8 s. Os erros continuam chegando ao Sentry, só sem o vídeo.
 */
function aparelhoAntigo(): boolean {
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
        !CSS.supports('color', 'color-mix(in srgb, red, red)')) {
      return true;
    }
    const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof memoria === 'number' && memoria <= 2;
  } catch {
    return false;
  }
}

const comReplay = !aparelhoAntigo();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',

  // Captura 10% das transações de performance em produção
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Replay de sessão só em erros (sem PII)
  replaysOnErrorSampleRate: comReplay ? 1.0 : 0,
  replaysSessionSampleRate: 0,

  // Não enviar dados sensíveis do usuário (no SDK 10 isso também desliga a
  // inferência de IP pelo backend do Sentry)
  sendDefaultPii: false,

  // Ignorar erros de rede esperados e extensões de browser
  ignoreErrors: [
    'Network Error',
    'ERR_CANCELED',
    'ResizeObserver loop limit exceeded',
    /^chrome-extension:\/\//,
  ],

  integrations: comReplay ? [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })] : [],
});

// Hook de transição de rota do Next. Ele só é chamado pelo App Router; no
// Pages Router (o nosso caso) as navegações continuam instrumentadas
// automaticamente pelo `browserTracingIntegration` via eventos do
// `next/router`. Exportado mesmo assim porque é inócuo, já cobre uma futura
// adoção do App Router e, sem ele, o `withSentryConfig` imprime um aviso
// "ACTION REQUIRED" a cada build.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
