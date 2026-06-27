import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',

  // Captura 10% das transações de performance em produção
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Replay de sessão só em erros (sem PII)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  // Não enviar dados sensíveis do usuário
  sendDefaultPii: false,

  // Ignorar erros de rede esperados e extensões de browser
  ignoreErrors: [
    'Network Error',
    'ERR_CANCELED',
    'ResizeObserver loop limit exceeded',
    /^chrome-extension:\/\//,
  ],

  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
});
