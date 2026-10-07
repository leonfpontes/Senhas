/**
 * Consentimento de cookies (LGPD, art. 7º I e 8º) — a escolha da pessoa no banner de cookies.
 *
 * Três categorias, as mesmas da Política de Cookies (/cookies, constants/cookies.ts):
 * - **necessarios**: login, segurança, preferências de tela e a própria escolha. Sempre ativos
 *   (base legal: execução do contrato / legítimo interesse — não dependem de consentimento);
 * - **estatisticas**: Google Analytics 4 e Microsoft Clarity — como o site é usado;
 * - **marketing**: Google Ads e Meta Pixel — medir campanhas e mostrar anúncios do GiraHub.
 *
 * A escolha fica no cookie `girahub_consent` (primário, 180 dias — depois disso o banner volta,
 * como recomenda o guia de cookies da ANPD). Sem escolha registrada, tudo que não é necessário
 * fica desligado. Mudou de ideia? `abrirPreferenciasDeCookies()` reabre o painel (rodapé, /cookies).
 * Ao revogar uma categoria, os cookies dela são apagados na hora.
 */

export type CategoriaOpcional = 'estatisticas' | 'marketing';
export type CategoriaDeCookie = 'necessarios' | CategoriaOpcional;

export interface Consentimento {
  /** Versão da política: subir CONSENT_VERSION faz o banner aparecer de novo para todo mundo. */
  v: number;
  estatisticas: boolean;
  marketing: boolean;
  /** Quando a escolha foi feita (ISO) — prova do consentimento, mostrada em /cookies. */
  em: string;
}

export const CONSENT_COOKIE = 'girahub_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_DIAS = 180;

/** Evento disparado no `window` quando a escolha muda (detail: Consentimento). */
export const EVENTO_CONSENTIMENTO = 'girahub:consentimento';
/** Evento para reabrir o painel de preferências (rodapé, página /cookies). */
export const EVENTO_ABRIR_PREFERENCIAS = 'girahub:abrir-cookies';

/** Prefixos dos cookies de cada categoria opcional — apagados quando ela é revogada. */
export const COOKIES_DA_CATEGORIA: Record<CategoriaOpcional, RegExp> = {
  estatisticas: /^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MUID|SM)(_|$)/,
  marketing: /^(_gcl|_fbp|_fbc|_gac|IDE|test_cookie)(_|$)/,
};

const temDocumento = () => typeof document !== 'undefined';

function lerCookie(nome: string): string | null {
  if (!temDocumento()) return null;
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split(';')) {
    const p = parte.trim();
    if (p.startsWith(alvo)) return p.slice(alvo.length);
  }
  return null;
}

/** A escolha registrada, ou `null` se a pessoa ainda não escolheu (ou a política mudou de versão). */
export function lerConsentimento(): Consentimento | null {
  const bruto = lerCookie(CONSENT_COOKIE);
  if (!bruto) return null;
  try {
    const c = JSON.parse(decodeURIComponent(bruto)) as Partial<Consentimento>;
    if (c?.v !== CONSENT_VERSION) return null;
    return { v: c.v, estatisticas: c.estatisticas === true, marketing: c.marketing === true, em: String(c.em ?? '') };
  } catch {
    return null;
  }
}

/** A categoria está liberada? Necessários sempre; as opcionais só com escolha registrada. */
export function permitido(categoria: CategoriaDeCookie, c: Consentimento | null = lerConsentimento()): boolean {
  if (categoria === 'necessarios') return true;
  return Boolean(c?.[categoria]);
}

/** Domínios onde um cookie de terceiro pode ter sido gravado (host e o domínio pai com ponto). */
function dominiosPossiveis(): (string | undefined)[] {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const partes = host.split('.');
  const dominios: (string | undefined)[] = [undefined, host];
  for (let i = 0; i < partes.length - 1; i++) dominios.push(`.${partes.slice(i).join('.')}`);
  return dominios;
}

/** Apaga os cookies de uma categoria opcional (todas as variações de domínio). */
export function apagarCookiesDaCategoria(categoria: CategoriaOpcional): void {
  if (!temDocumento()) return;
  const padrao = COOKIES_DA_CATEGORIA[categoria];
  const nomes = document.cookie
    .split(';')
    .map((p) => p.trim().split('=')[0])
    .filter((n) => n && padrao.test(n));
  for (const nome of nomes) {
    for (const dominio of dominiosPossiveis()) {
      document.cookie = `${nome}=; Max-Age=0; Path=/${dominio ? `; Domain=${dominio}` : ''}`;
    }
  }
}

/**
 * Apaga cookies opcionais que não têm autorização — ex.: `_ga` de visitas anteriores ao banner,
 * ou de quem recusou em outra aba. Roda na carga de cada página (components/shared/MarketingTags).
 */
export function apagarCookiesSemConsentimento(c: Consentimento | null = lerConsentimento()): void {
  if (!c?.estatisticas) apagarCookiesDaCategoria('estatisticas');
  if (!c?.marketing) apagarCookiesDaCategoria('marketing');
}

/** Grava a escolha, apaga os cookies do que foi recusado e avisa quem está ouvindo. */
export function salvarConsentimento(escolha: { estatisticas: boolean; marketing: boolean }): Consentimento {
  const c: Consentimento = {
    v: CONSENT_VERSION,
    estatisticas: escolha.estatisticas,
    marketing: escolha.marketing,
    em: new Date().toISOString(),
  };
  if (temDocumento()) {
    const seguro = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; Max-Age=${
      CONSENT_MAX_AGE_DIAS * 24 * 60 * 60
    }; Path=/; SameSite=Lax${seguro}`;
    apagarCookiesSemConsentimento(c);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Consentimento>(EVENTO_CONSENTIMENTO, { detail: c }));
  }
  return c;
}

export const aceitarTudo = () => salvarConsentimento({ estatisticas: true, marketing: true });
export const recusarOpcionais = () => salvarConsentimento({ estatisticas: false, marketing: false });

/** Ouve mudanças da escolha; devolve a função que para de ouvir. */
export function aoMudarConsentimento(ouvinte: (c: Consentimento) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => ouvinte((e as CustomEvent<Consentimento>).detail);
  window.addEventListener(EVENTO_CONSENTIMENTO, h);
  return () => window.removeEventListener(EVENTO_CONSENTIMENTO, h);
}

/** Reabre o painel de preferências de cookies (o banner ouve este evento). */
export function abrirPreferenciasDeCookies(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ABRIR_PREFERENCIAS));
}
