/**
 * /admin/estoque/relatorio → redireciona para Itens.
 * A posição de estoque (status, filtro "Críticos" e exportação CSV) foi absorvida por
 * `itens.tsx`. `?criticos=1` é repassado.
 */
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '../admin_layout';
import { usePermissions } from '../../../hooks/usePermissions';
import { PermissionDenied } from '@/components/gates';
import { Skeleton } from '@/components/ui/skeleton';

export const ESTOQUE_ITENS_URL = '/admin/estoque/itens';

export default function EstoqueRelatorioRedirectPage() {
  const router = useRouter();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('estoque', 'view');

  useEffect(() => {
    if (!router.isReady || !canView) return;
    const criticos = router.query.criticos === '1';
    router.replace(criticos ? `${ESTOQUE_ITENS_URL}?criticos=1` : ESTOQUE_ITENS_URL);
  }, [router, canView]);

  return (
    <AdminLayout title="Relatório de Estoque">
      {canView ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Redirecionando para Itens">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <PermissionDenied message="Você não tem permissão para visualizar o estoque." />
      )}
    </AdminLayout>
  );
}
