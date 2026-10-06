/**
 * /platform/billing — virou a aba "Assinaturas" de /platform/tenants. Redirecionamento para
 * links antigos.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { RedirectNotice } from '@/components/platform/RedirectNotice';

export default function PlatformBillingRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    router.replace('/platform/tenants?tab=assinaturas');
  }, [router]);
  return <RedirectNotice to="Terreiros · Assinaturas" />;
}
