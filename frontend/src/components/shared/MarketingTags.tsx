/**
 * Liga as tags de medição/marketing (lib/marketingTags.ts) ao consentimento de cookies — montado
 * uma vez no `_app.tsx`, não renderiza nada. Substitui o GA4 que carregava sem perguntar.
 *
 * Rotas com segredo na URL (`rotaComSegredo`) não ligam as tags (pentest M5): se a pessoa abre
 * o link do e-mail direto nelas, as tags só começam na primeira navegação para uma rota comum.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { aoMudarConsentimento, apagarCookiesSemConsentimento, lerConsentimento } from '@/lib/consent';
import { aplicarConsentimento, registrarPaginaVista, rotaComSegredo } from '@/lib/marketingTags';

export function MarketingTags() {
  const router = useRouter();
  const ligadas = useRef(false);

  useEffect(() => {
    const c = lerConsentimento();
    apagarCookiesSemConsentimento(c);
    const ligar = () => {
      if (ligadas.current) return;
      ligadas.current = true;
      aplicarConsentimento(lerConsentimento());
    };
    if (!rotaComSegredo(window.location.pathname)) ligar();

    const events = router.events;
    const aoNavegar = (url: string) => {
      if (rotaComSegredo(url)) return;
      ligar();
    };
    events?.on('routeChangeComplete', aoNavegar);
    const pararConsentimento = aoMudarConsentimento((novo) => {
      if (ligadas.current) aplicarConsentimento(novo);
    });
    return () => {
      events?.off('routeChangeComplete', aoNavegar);
      pararConsentimento();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
