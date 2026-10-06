/**
 * /admin/plano — plano e assinatura viraram uma tela só em /admin/billing.
 * Esta rota só redireciona (mantém links antigos do menu, do tour e de e-mails).
 * Tela de conta, sem feature de grupo: exceção em scripts/audit-permission-guards.js.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminPlanoRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const plan = typeof router.query.plan === 'string' ? router.query.plan : null;
    router.replace(plan ? `/admin/billing?plan=${encodeURIComponent(plan)}` : '/admin/billing');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6" aria-busy="true" aria-label="Abrindo plano e assinatura">
      <Skeleton className="h-40 w-full max-w-lg" />
    </main>
  );
}
