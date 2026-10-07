/**
 * Meu Site — /admin/meu-site
 *
 * Construtor do site público do terreiro (shadcn/Tailwind, sem MUI). A tela é
 * `@/components/site/editor/SiteEditor`; aqui ficam só os gates:
 *   - plano: `site_builder` → `PlanLocked`;
 *   - grupo: `site` ("Site do terreiro", separado de Cursos desde o T-06) → `PermissionDenied`;
 *   - ações de edição/upload só com `edit`/`insert`.
 */
'use client';

import React, { useEffect } from 'react';
import Head from 'next/head';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Skeleton } from '@/components/ui/skeleton';
import { SiteEditor } from '@/components/site/editor/SiteEditor';
import { minPlanFor } from '@/constants/plans';

export { validateSection } from '@/components/site/lib';

const PAGE_TITLE = 'Meu Site · GiraHub';

/**
 * O `AdminLayout` escreve o próprio `<title>` ("… | Senhas Admin") e, como o
 * next/head dá a vitória ao último `<Head>` registrado, ele volta a ganhar a cada
 * re-render do layout. Este hook mantém o título da página enquanto ela está montada.
 */
function usePageTitle(title: string) {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

export default function MeuSitePage() {
  usePageTitle(PAGE_TITLE);
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('site', 'view');
  const canEdit = canGroup('site', 'edit');
  const canInsert = canGroup('site', 'insert');

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
        <PlanLocked feature="Meu Site" minPlan={minPlanFor('site_builder').label} />
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
        <title>{PAGE_TITLE}</title>
      </Head>
      {content}
    </AdminLayout>
  );
}
