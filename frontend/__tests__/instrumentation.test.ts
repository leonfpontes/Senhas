/**
 * Tests for src/instrumentation.ts — hook que inicializa o Sentry no servidor.
 * Desde o Next 15 os sentry.(server|edge).config.ts só rodam se importados
 * aqui; sem isso o Sentry do lado servidor do frontend fica desligado.
 */
const loaded: string[] = [];

jest.mock('../sentry.server.config', () => {
  loaded.push('server');
  return {};
});
jest.mock('../sentry.edge.config', () => {
  loaded.push('edge');
  return {};
});

describe('instrumentation register()', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    loaded.length = 0;
    jest.resetModules();
  });

  afterAll(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
  });

  it('runtime nodejs carrega só o config de servidor', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const { register } = await import('@/instrumentation');
    await register();
    expect(loaded).toEqual(['server']);
  });

  it('runtime edge carrega só o config de edge', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { register } = await import('@/instrumentation');
    await register();
    expect(loaded).toEqual(['edge']);
  });

  it('sem runtime (ex.: build) não inicializa nada', async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import('@/instrumentation');
    await register();
    expect(loaded).toEqual([]);
  });

  it('onRequestError delega para Sentry.captureRequestError', async () => {
    const mod = await import('@/instrumentation');
    const Sentry = await import('@sentry/nextjs');
    expect(mod.onRequestError).toBe(Sentry.captureRequestError);
  });
});
