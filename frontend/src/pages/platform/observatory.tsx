/**
 * /platform/observatory — absorvido pela tela "Hoje" (/platform). Mantido como redirecionamento
 * para links antigos (inclusive `#retencao`, que vira a coluna "Contatar").
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { RedirectNotice } from '@/components/platform/RedirectNotice';

export default function PlatformObservatoryRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const hash = typeof window !== 'undefined' && window.location.hash === '#retencao' ? '#contatar' : '';
    router.replace(`/platform${hash}`);
  }, [router]);
  return <RedirectNotice to="Hoje" />;
}
