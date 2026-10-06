/**
 * ServiceWorkerRegistrar (P-01): registra o SW só em produção e em contexto seguro;
 * em desenvolvimento desregistra qualquer SW antigo.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import ServiceWorkerRegistrar from '@/components/shared/ServiceWorkerRegistrar';
import { setupServiceWorker, swVersion } from '@/lib/pwa';

const register = jest.fn(() => Promise.resolve({}));
const unregister = jest.fn(() => Promise.resolve(true));
const getRegistrations = jest.fn(() => Promise.resolve([{ unregister }]));

function mockServiceWorker() {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  });
}

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
}

describe('ServiceWorkerRegistrar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceWorker();
    setSecureContext(true);
    (window as any).__NEXT_DATA__ = { buildId: 'abc123' };
  });

  afterEach(() => {
    delete (window.navigator as any).serviceWorker;
    delete (window as any).__NEXT_DATA__;
  });

  it('não registra em desenvolvimento e remove registros antigos', async () => {
    render(<ServiceWorkerRegistrar env="development" />);
    await waitFor(() => expect(unregister).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
  });

  it('em produção registra /sw.js com a versão do build e escopo raiz', async () => {
    render(<ServiceWorkerRegistrar env="production" />);
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js?v=abc123', { scope: '/' }));
    expect(unregister).not.toHaveBeenCalled();
  });

  it('em produção fora de contexto seguro (HTTP) não registra', async () => {
    setSecureContext(false);
    await expect(setupServiceWorker('production')).resolves.toBe('skipped');
    expect(register).not.toHaveBeenCalled();
  });

  it('sem suporte a service worker não faz nada', async () => {
    delete (window.navigator as any).serviceWorker;
    await expect(setupServiceWorker('production')).resolves.toBe('skipped');
  });

  it('versão: buildId do Next, ou a versão da interface como fallback', () => {
    expect(swVersion()).toBe('abc123');
    delete (window as any).__NEXT_DATA__;
    expect(swVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
