/**
 * Meu Site — /admin/meu-site
 *
 * Construtor do site público do terreiro (shadcn/Tailwind, sem MUI). A tela é
 * `@/components/site/editor/SiteEditor`; aqui ficam só os gates:
 *   - plano: `site_builder` → `PlanLocked`;
 *   - grupo: `cursos_presenciais` (convenção do projeto para Sites) → `PermissionDenied`;
 *   - ações de edição/upload só com `edit`/`insert`.
 */
'use client';

import React from 'react';
import Head from 'next/head';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Skeleton } from '@/components/ui/skeleton';
import { SiteEditor } from '@/components/site/editor/SiteEditor';

export { validateSection } from '@/components/site/lib';

export default function MeuSitePage() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('cursos_presenciais', 'view');
  const canEdit = canGroup('cursos_presenciais', 'edit');
  const canInsert = canGroup('cursos_presenciais', 'insert');

  let content: React.ReactNode;
  if (subLoading) {
    content = (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (!can('site_builder')) {
    content = (
      <div className="p-4">
        <PlanLocked feature="Meu Site" minPlan="Pro" />
      </div>
    );
  } else if (!canView) {
    content = (
      <div className="p-4">
        <PermissionDenied message="Você não tem permissão para visualizar o Meu Site. Contate o administrador do terreiro." />
      </div>
    );
  } else {
    content = <SiteEditor canEdit={canEdit} canInsert={canInsert} />;
  }

  return (
    <AdminLayout title="Meu Site" noPadding>
      <Head>
        <title>Meu Site · GiraHub</title>
      </Head>
      {content}
    </AdminLayout>
  );
}
