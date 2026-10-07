/**
 * Liga as tags de medição/marketing (lib/marketingTags.ts) ao consentimento de cookies — montado
 * uma vez no `_app.tsx`, não renderiza nada. Substitui o GA4 que carregava sem perguntar.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { aoMudarConsentimento, apagarCookiesSemConsentimento, lerConsentimento } from '@/lib/consent';
import { aplicarConsentimento, registrarPaginaVista } from '@/lib/marketingTags';

export function MarketingTags() {
  const router = useRouter();

  useEffect(() => {
    const c = lerConsentimento();
    apagarCookiesSemConsentimento(c);
    aplicarConsentimento(c);
    return aoMudarConsentimento(aplicarConsentimento);
  }, []);

  useEffect(() => {
    const events = router.events;
    if (!events) return;
    events.on('routeChangeComplete', registrarPaginaVista);
    return () => events.off('routeChangeComplete', registrarPaginaVista);
  }, [router.events]);

  return null;
}

export default MarketingTags;
