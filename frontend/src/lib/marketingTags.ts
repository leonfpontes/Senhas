/**
 * Tags de medição e marketing, todas subordinadas ao consentimento (lib/consent.ts):
 *
 * - **Google (GA4 + Google Ads)** com o Consent Mode v2 do Google: o gtag.js carrega com tudo
 *   NEGADO por padrão — sem cookie nenhum, o Google só recebe sinais sem identificador (que ele usa
 *   para modelar conversões). Quando a pessoa aceita, `consent update` libera `analytics_storage`
 *   (estatísticas) e `ad_storage`/`ad_user_data`/`ad_personalization` (marketing).
 *   `ads_data_redaction` tira identificadores de anúncio enquanto marketing estiver negado.
 * - **Meta Pixel**: só é carregado com marketing aceito; revogar chama `fbq('consent','revoke')`.
 * - **Microsoft Clarity**: carregado por components/shared/ClarityAnalytics, só com estatísticas.
 *
 * IDs públicos, inlined no build (ARG do frontend/Dockerfile): `NEXT_PUBLIC_GA4_ID` (padrão: a
 * propriedade do GiraHub), `NEXT_PUBLIC_GOOGLE_ADS_ID` (AW-…), `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`
 * (rótulo da conversão de cadastro) e `NEXT_PUBLIC_META_PIXEL_ID`. Vazio = a tag não existe.
 */
import type { Consentimento } from '@/lib/consent';

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || 'G-BF9G0RFCDB';
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || '';
export const GOOGLE_ADS_SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL || '';
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: Fbq;
  loaded?: boolean;
  version?: string;
};

type TagsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
  fbq?: Fbq;
  _fbq?: Fbq;
};

const janela = (): TagsWindow | null => (typeof window === 'undefined' ? null : (window as TagsWindow));

type Estado = 'granted' | 'denied';
const estado = (sim: boolean | undefined): Estado => (sim ? 'granted' : 'denied');

/** Sinais do Consent Mode v2 para uma escolha (sem escolha = tudo negado). */
export function sinaisGoogle(c: Consentimento | null) {
  return {
    analytics_storage: estado(c?.estatisticas),
    ad_storage: estado(c?.marketing),
    ad_user_data: estado(c?.marketing),
    ad_personalization: estado(c?.marketing),
  };
}

function injetarScript(src: string, id: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

let googleIniciado = false;
let metaIniciado = false;

/** Só para testes. */
export function _reiniciarTags(): void {
  googleIniciado = false;
  metaIniciado = false;
}

/** Carrega o gtag.js com o consentimento padrão já definido (antes de qualquer `config`). */
export function iniciarGoogle(c: Consentimento | null): void {
  const w = janela();
  if (!w || googleIniciado || (!GA4_ID && !GOOGLE_ADS_ID)) return;
  googleIniciado = true;
  w.dataLayer = w.dataLayer || [];
  // O gtag precisa empurrar o objeto `arguments` (não um array) — é o contrato do dataLayer do Google.
  w.gtag =
    w.gtag ||
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  w.gtag('consent', 'default', {
    ...sinaisGoogle(c),
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });
  w.gtag('set', 'ads_data_redaction', !c?.marketing);
  // Sem cookie de anúncio, o gclid segue na URL entre páginas para não perder a atribuição.
  w.gtag('set', 'url_passthrough', true);
  w.gtag('js', new Date());
  if (GA4_ID) w.gtag('config', GA4_ID);
  if (GOOGLE_ADS_ID) w.gtag('config', GOOGLE_ADS_ID);
  injetarScript(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID || GOOGLE_ADS_ID}`, 'gtag-js');
}

/** Repassa a escolha nova ao Google (sem recarregar a página). */
export function atualizarGoogle(c: Consentimento | null): void {
  const w = janela();
  if (!w?.gtag) return;
  w.gtag('consent', 'update', sinaisGoogle(c));
  w.gtag('set', 'ads_data_redaction', !c?.marketing);
}

/** Meta Pixel — o snippet oficial (fbevents.js), só depois do consentimento de marketing. */
export function iniciarMeta(): void {
  const w = janela();
  if (!w || !META_PIXEL_ID) return;
  if (metaIniciado) {
    w.fbq?.('consent', 'grant');
    return;
  }
  metaIniciado = true;
  if (!w.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    w.fbq = fbq;
    w._fbq = w._fbq || fbq;
  }
  injetarScript('https://connect.facebook.net/en_US/fbevents.js', 'meta-pixel-js');
  w.fbq('consent', 'grant');
  w.fbq('init', META_PIXEL_ID);
  w.fbq('track', 'PageView');
}

export function revogarMeta(): void {
  janela()?.fbq?.('consent', 'revoke');
}

/** Navegação interna (SPA): o GA4 conta sozinho (medição otimizada); o Pixel precisa do aviso. */
export function registrarPaginaVista(): void {
  if (metaIniciado) janela()?.fbq?.('track', 'PageView');
}

/**
 * Eventos de produto que também são conversões de marketing. O evento de produto continua indo
 * como está (services/analytics.ts); aqui saem os nomes que o Google Ads e a Meta entendem.
 */
export function registrarConversao(nome: string): void {
  const w = janela();
  if (!w) return;
  try {
    if (nome === 'signup_completed') {
      w.gtag?.('event', 'sign_up', { method: 'site' });
      if (GOOGLE_ADS_ID && GOOGLE_ADS_SIGNUP_LABEL) {
        w.gtag?.('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SIGNUP_LABEL}` });
      }
      if (metaIniciado) w.fbq?.('track', 'CompleteRegistration');
    } else if (nome === 'whatsapp_click') {
      w.gtag?.('event', 'generate_lead', { method: 'whatsapp' });
      if (metaIniciado) w.fbq?.('track', 'Contact');
    }
  } catch {
    /* medição nunca quebra a tela */
  }
}

/** Aplica uma escolha (inicial ou nova) a todas as tags. */
export function aplicarConsentimento(c: Consentimento | null): void {
  if (!googleIniciado) iniciarGoogle(c);
  else atualizarGoogle(c);
  if (c?.marketing) iniciarMeta();
  else if (metaIniciado) revogarMeta();
}
