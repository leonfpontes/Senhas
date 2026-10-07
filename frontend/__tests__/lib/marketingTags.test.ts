/**
 * Tags de marketing sob consentimento: o Google entra com tudo negado (Consent Mode v2) e só é
 * liberado pela escolha; o Meta Pixel nem carrega sem marketing.
 */
type W = Window & { dataLayer?: IArguments[]; gtag?: unknown; fbq?: jest.Mock | ((...a: unknown[]) => void) };

function chamadas() {
  return ((window as W).dataLayer ?? []).map((a) => Array.from(a));
}

async function carregar(env: Record<string, string> = {}) {
  jest.resetModules();
  const antes = { ...process.env };
  Object.assign(process.env, env);
  const mod = await import('@/lib/marketingTags');
  process.env = antes;
  return mod;
}

beforeEach(() => {
  delete (window as W).dataLayer;
  delete (window as W).gtag;
  delete (window as W).fbq;
  document.head.innerHTML = '';
});

describe('lib/marketingTags', () => {
  it('sem escolha: gtag carrega com tudo negado antes do config', async () => {
    const { aplicarConsentimento, GA4_ID } = await carregar();
    aplicarConsentimento(null);
    const c = chamadas();
    expect(c[0]).toEqual([
      'consent',
      'default',
      expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }),
    ]);
    const idxConfig = c.findIndex((x) => x[0] === 'config');
    expect(idxConfig).toBeGreaterThan(0);
    expect(c[idxConfig][1]).toBe(GA4_ID);
    expect(document.getElementById('gtag-js')?.getAttribute('src')).toContain(GA4_ID);
  });

  it('aceitar atualiza o consentimento sem recarregar o script', async () => {
    const { aplicarConsentimento } = await carregar();
    aplicarConsentimento(null);
    aplicarConsentimento({ v: 1, estatisticas: true, marketing: false, em: '' });
    const update = chamadas().find((x) => x[0] === 'consent' && x[1] === 'update');
    expect(update?.[2]).toEqual(expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied' }));
    expect(document.querySelectorAll('#gtag-js')).toHaveLength(1);
  });

  it('Meta Pixel só carrega com marketing e com ID configurado', async () => {
    const { aplicarConsentimento } = await carregar({ NEXT_PUBLIC_META_PIXEL_ID: '123' });
    aplicarConsentimento({ v: 1, estatisticas: true, marketing: false, em: '' });
    expect(document.getElementById('meta-pixel-js')).toBeNull();
    aplicarConsentimento({ v: 1, estatisticas: true, marketing: true, em: '' });
    expect(document.getElementById('meta-pixel-js')).not.toBeNull();
    expect(typeof (window as W).fbq).toBe('function');
  });

  it('cadastro concluído vira sign_up e conversão do Ads', async () => {
    const { aplicarConsentimento, registrarConversao } = await carregar({
      NEXT_PUBLIC_GOOGLE_ADS_ID: 'AW-1',
      NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: 'abc',
    });
    aplicarConsentimento({ v: 1, estatisticas: true, marketing: true, em: '' });
    registrarConversao('signup_completed');
    const eventos = chamadas().filter((x) => x[0] === 'event');
    expect(eventos).toEqual(
      expect.arrayContaining([
        ['event', 'sign_up', { method: 'site' }],
        ['event', 'conversion', { send_to: 'AW-1/abc' }],
      ]),
    );
  });
});
