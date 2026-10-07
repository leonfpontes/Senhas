/**
 * Consentimento de cookies: sem escolha nada opcional liga, a escolha fica no cookie com versão,
 * revogar apaga os cookies da categoria e avisa quem ouve.
 */
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  aceitarTudo,
  aoMudarConsentimento,
  lerConsentimento,
  permitido,
  recusarOpcionais,
  salvarConsentimento,
} from '@/lib/consent';

function limparCookies() {
  for (const c of document.cookie.split(';')) {
    const nome = c.trim().split('=')[0];
    if (nome) document.cookie = `${nome}=; Max-Age=0; Path=/`;
  }
}

beforeEach(limparCookies);

describe('lib/consent', () => {
  it('sem escolha: só os necessários', () => {
    expect(lerConsentimento()).toBeNull();
    expect(permitido('necessarios')).toBe(true);
    expect(permitido('estatisticas')).toBe(false);
    expect(permitido('marketing')).toBe(false);
  });

  it('grava a escolha no cookie, com versão e data', () => {
    salvarConsentimento({ estatisticas: true, marketing: false });
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
    const c = lerConsentimento();
    expect(c).toMatchObject({ v: CONSENT_VERSION, estatisticas: true, marketing: false });
    expect(Number.isNaN(Date.parse(c!.em))).toBe(false);
    expect(permitido('estatisticas')).toBe(true);
    expect(permitido('marketing')).toBe(false);
  });

  it('escolha de outra versão da política não vale (o banner volta)', () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 0, estatisticas: true, marketing: true }))}; Path=/`;
    expect(lerConsentimento()).toBeNull();
  });

  it('cookie corrompido é ignorado', () => {
    document.cookie = `${CONSENT_COOKIE}=%7Bquebrado; Path=/`;
    expect(lerConsentimento()).toBeNull();
  });

  it('recusar apaga os cookies de estatística e marketing já gravados', () => {
    aceitarTudo();
    document.cookie = '_ga=GA1.1.123; Path=/';
    document.cookie = '_ga_ABC=GS1; Path=/';
    document.cookie = '_fbp=fb.1.2; Path=/';
    document.cookie = '_gcl_au=1.1; Path=/';
    document.cookie = 'sidebar_state=true; Path=/';
    recusarOpcionais();
    expect(document.cookie).not.toMatch(/_ga=|_ga_ABC|_fbp|_gcl_au/);
    expect(document.cookie).toContain('sidebar_state=true');
    expect(lerConsentimento()).toMatchObject({ estatisticas: false, marketing: false });
  });

  it('avisa quem está ouvindo e para de avisar ao cancelar', () => {
    const ouvinte = jest.fn();
    const parar = aoMudarConsentimento(ouvinte);
    aceitarTudo();
    expect(ouvinte).toHaveBeenCalledWith(expect.objectContaining({ estatisticas: true, marketing: true }));
    parar();
    recusarOpcionais();
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});

describe('apagarCookiesSemConsentimento', () => {
  it('limpa _ga antigos de quem ainda não escolheu', async () => {
    const { apagarCookiesSemConsentimento } = await import('@/lib/consent');
    document.cookie = '_ga=GA1.1.1; Path=/';
    apagarCookiesSemConsentimento(null);
    expect(document.cookie).not.toContain('_ga=');
  });
});
