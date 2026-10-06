/**
 * /platform/users_global — virou a aba "Admins da plataforma" de /platform/settings.
 * Redirecionamento para links antigos.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { RedirectNotice } from '@/components/platform/RedirectNotice';

export default function PlatformUsersGlobalRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    router.replace('/platform/settings?tab=admins');
  }, [router]);
  return <RedirectNotice to="Configurações · Admins da plataforma" />;
}
