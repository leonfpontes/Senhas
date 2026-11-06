/**
 * Tests for src/instrumentation-client.ts — init do Sentry no navegador
 * (@sentry/nextjs 10, substitui o antigo sentry.client.config.ts). Garante que
 * as opções de privacidade/replay foram preservadas na migração.
 */
import * as Sentry from '@sentry/nextjs';

describe('instrumentation-client', () => {
  beforeEach(() => {
    jest.resetModules();
    (Sentry.init as jest.Mock).mockClear();
  });

  it('inicializa o Sentry com replay só em erro e sem PII', async () => {
    await import('@/instrumentation-client');
    const SentryMock = await import('@sentry/nextjs');

    expect(SentryMock.init).toHaveBeenCalledTimes(1);
    const options = (SentryMock.init as jest.Mock).mock.calls[0][0];
    expect(options).toEqual(
      expect.objectContaining({
        replaysOnErrorSampleRate: 1.0,
        replaysSessionSampleRate: 0,
        sendDefaultPii: false,
      })
    );
    expect(options.ignoreErrors).toEqual([
      'Network Error',
      'ERR_CANCELED',
      'ResizeObserver loop limit exceeded',
      /^chrome-extension:\/\//,
    ]);
    expect(options.integrations).toEqual([
      { name: 'Replay', options: { maskAllText: true, blockAllMedia: true } },
    ]);
  });

  it('no aparelho antigo (sem color-mix, iPad no iOS 15) desliga o Replay', async () => {
    const original = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { supports: () => false };
    try {
      await import('@/instrumentation-client');
      const SentryMock = await import('@sentry/nextjs');
      const options = (SentryMock.init as jest.Mock).mock.calls[0][0];
      expect(options.replaysOnErrorSampleRate).toBe(0);
      expect(options.integrations).toEqual([]);
      expect(options.sendDefaultPii).toBe(false);
    } finally {
      (globalThis as { CSS?: unknown }).CSS = original;
    }
  });

  it('exporta onRouterTransitionStart = Sentry.captureRouterTransitionStart', async () => {
    const mod = await import('@/instrumentation-client');
    const SentryMock = await import('@sentry/nextjs');
    expect(mod.onRouterTransitionStart).toBe(SentryMock.captureRouterTransitionStart);
  });
});
