/**
 * Eventos de produto — envia o mesmo evento para GA4 (gtag) e Microsoft
 * Clarity, quando carregados. Nunca lança: analytics não pode quebrar a UI.
 *
 * Use nomes snake_case estáveis (`onboarding_share_whatsapp`); no Clarity o
 * evento vira filtro de gravações ("Custom events") e no GA4 vira evento
 * customizado. Nunca passe dado pessoal (nome, e-mail, CPF) em `params`.
 */
type AnalyticsWindow = {
  gtag?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

function analyticsWindow(): AnalyticsWindow | null {
  return typeof window === 'undefined' ? null : (window as unknown as AnalyticsWindow);
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  const w = analyticsWindow();
  if (!w) return;
  try {
    w.gtag?.('event', name, params ?? {});
  } catch {
    /* ignora */
  }
  try {
    w.clarity?.('event', name);
  } catch {
    /* ignora */
  }
}

/** Tag de sessão no Clarity (filtro de gravações). Sem efeito no GA4. */
export function setAnalyticsTag(key: string, value: string): void {
  const w = analyticsWindow();
  if (!w) return;
  try {
    w.clarity?.('set', key, value);
  } catch {
    /* ignora */
  }
}
