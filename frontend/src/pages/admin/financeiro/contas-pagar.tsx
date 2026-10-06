/**
 * /admin/financeiro/contas-pagar → redireciona para Lançamentos (aba Saídas).
 * A tela foi unificada em `lancamentos.tsx` (`?tipo=pagar`).
 */
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '../admin_layout';
import { usePermissions } from '../../../hooks/usePermissions';
import { PermissionDenied } from '@/components/gates';
import { Skeleton } from '@/components/ui/skeleton';

export const LANCAMENTOS_PAGAR_URL = '/admin/financeiro/lancamentos?tipo=pagar';

export default function ContasPagarRedirectPage() {
  const router = useRouter();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('contas_financeiras', 'view');

  useEffect(() => {
    if (!router.isReady || !canView) return;
    router.replace(LANCAMENTOS_PAGAR_URL);
  }, [router, canView]);

  return (
    <AdminLayout title="Contas a Pagar">
      {canView ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Redirecionando para Lançamentos">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <PermissionDenied message="Você não tem permissão para visualizar os lançamentos financeiros." />
      )}
    </AdminLayout>
  );
}
