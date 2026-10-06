/**
 * /platform/profile — virou a aba "Conta" de /platform/settings. Redirecionamento para links
 * antigos.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { RedirectNotice } from '@/components/platform/RedirectNotice';

export default function PlatformProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    router.replace('/platform/settings?tab=conta');
  }, [router]);
  return <RedirectNotice to="Configurações · Conta" />;
}
