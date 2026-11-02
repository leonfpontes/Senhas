/**
 * AdminSidebar — navegação do admin sobre o bloco `Sidebar` do shadcn (recolhível em ícones no
 * desktop, `Sheet` no celular). Os grupos vêm de `useAdminNav()` já filtrados por plano e por
 * grupo de permissão; um grupo some quando nada dentro dele está liberado.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSubscription } from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useProfile';
import { APP_VERSION_LABEL } from '@/lib/version';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { BrandHeader } from './BrandHeader';
import { NavGroup } from './NavGroup';
import { montarSidebarNav, useAdminNav, type NavAction } from './navConfig';
import { ArrowRight } from 'lucide-react';
import { estaNoMenu, lerPreferencia, gravarPreferencia, marcarUso, moduloDaRota, type PreferenciaDoMenu } from '@/constants/modulos';

/**
 * Largura da sidebar expandida em px (= `--sidebar-width` 16rem do bloco shadcn).
 * Exportado para quem precisa da largura da sidebar em px.
 */
export const DRAWER_WIDTH = 256;

const PLAN_BADGE_CLASS: Record<string, string> = {
  premium: 'bg-[#b45309] text-white',
  pro: 'bg-[#7c3aed] text-white',
  basic: 'bg-[#2563eb] text-white',
};

export interface AdminSidebarProps {
  isOperator: boolean;
  onAction?: (action: NavAction) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOperator, onAction }) => {
  const router = useRouter();
  const pathname = router.pathname;
  const { profile } = useProfile();
  const { planLabel, subscription, loading: subscriptionLoading } = useSubscription();
  const groups = useAdminNav({ isOperator, tenantId: profile?.tenant_id });
  const { beta } = useSubscription();
  const ajustavel = Boolean(beta?.('beta_menu_ajustavel'));
  const tenantId = profile?.tenant_id;
  const [pref, setPref] = useState<PreferenciaDoMenu>(() => lerPreferencia(tenantId));
  useEffect(() => {
    const reler = () => setPref(lerPreferencia(tenantId));
    reler();
    window.addEventListener('girahub:menu', reler);
    return () => window.removeEventListener('girahub:menu', reler);
  }, [tenantId]);
  // Beta "Menu que se ajusta ao uso": abrir um módulo o sobe para "Da casa".
  useEffect(() => {
    if (!ajustavel) return;
    const m = moduloDaRota(pathname);
    if (!m) return;
    const atual = lerPreferencia(tenantId);
    const novo = marcarUso(atual, m.key);
    if (novo !== atual) gravarPreferencia(tenantId, novo);
  }, [ajustavel, pathname, tenantId]);
  const { fixos, daCasa } = montarSidebarNav(groups, { ajustavel, noMenu: (k) => estaNoMenu(pref, k) });
  const modulosAtivo = pathname === '/admin/modulos';

  return (
    <Sidebar collapsible="icon" aria-label="Navegação principal" data-testid="admin-sidebar">
      <SidebarHeader className="p-0">
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        {/* Jornada 1 v2: o dia de gira fixo; o resto da casa em "Da casa" e em "Ver os 12 módulos". */}
        <NavGroup label="Dia de gira" items={fixos} activeHref={pathname} onAction={onAction} />
        {daCasa.length > 0 ? (
          <NavGroup label="Da casa" items={daCasa} activeHref={pathname} onAction={onAction} />
        ) : (
          <div className="mx-3 mt-2 border-t border-sidebar-border pt-3 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium text-sidebar-foreground/60">Quando a casa precisar</p>
            <p className="mt-1 text-[0.8125rem] text-sidebar-foreground/80">Corrente, mensalidades, avisos, site, financeiro e estoque.</p>
          </div>
        )}
        <div className="px-2 group-data-[collapsible=icon]:hidden">
          <Link
            href="/admin/modulos"
            aria-current={modulosAtivo ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-semibold text-sidebar-primary hover:bg-sidebar-accent',
              modulosAtivo && 'bg-sidebar-accent',
            )}
          >
            Ver os 12 módulos <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-1 px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
        {subscriptionLoading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : (
          <Badge
            asChild
            className={cn(
              'cursor-pointer text-[0.65rem] font-bold tracking-wide uppercase',
              PLAN_BADGE_CLASS[subscription?.plan ?? ''] ?? 'bg-muted text-muted-foreground',
            )}
          >
            <Link href="/admin/billing" aria-label={`Plano ${planLabel} — ver assinatura`}>
              {subscription?.is_trial ? `${planLabel} · mês grátis` : planLabel}
            </Link>
          </Badge>
        )}
        <p className="text-[0.65rem] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" data-testid="sidebar-version">
          {APP_VERSION_LABEL}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

export default AdminSidebar;
