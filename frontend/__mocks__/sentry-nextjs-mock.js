/* eslint-env jest */
/**
 * No-op mock for @sentry/nextjs in Jest.
 *
 * The real package's client entry (browserTracingIntegration -> pagesRouterRoutingInstrumentation)
 * reads `router.events` at import time, which is undefined in jsdom (there's no real Next.js
 * router in tests). Any page/component that imports @sentry/nextjs — even just to call
 * Sentry.setUser() — crashes the whole test file at collection time. Sentry initialization
 * and error reporting isn't something unit tests need to exercise anyway.
 */
const noop = () => {};

module.exports = {
  // jest.fn() para que __tests__/instrumentation-client.test.ts possa assertar
  // as opções passadas ao init do navegador.
  init: jest.fn(),
  setUser: noop,
  setTag: noop,
  setTags: noop,
  setContext: noop,
  setExtra: noop,
  // jest.fn() (não noop) para que os testes possam assertar que erros foram
  // reportados; em runtime comporta-se como noop. jest.clearAllMocks() limpa
  // as chamadas entre os testes.
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  // Usado como `onRequestError` em src/instrumentation.ts.
  captureRequestError: jest.fn(),
  // Usado como `onRouterTransitionStart` em src/instrumentation-client.ts.
  captureRouterTransitionStart: jest.fn(),
  getClient: () => undefined,
  withScope: (callback) => callback({ setTag: noop, setUser: noop, setContext: noop, setExtra: noop }),
  browserTracingIntegration: () => ({}),
  replayIntegration: (options) => ({ name: 'Replay', options }),
};
