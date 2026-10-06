/**
 * AdminSidebar — navegação do admin sobre o bloco `Sidebar` do shadcn (recolhível em ícones no
 * desktop, `Sheet` no celular). Os grupos vêm de `useAdminNav()` já filtrados por plano e por
 * grupo de permissão; um grupo some quando nada dentro dele está liberado.
 */
import React from 'react';
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
import { useAdminNav, type NavAction } from './navConfig';

/**
 * Largura da sidebar expandida em px (= `--sidebar-width` 16rem do bloco shadcn).
 * Mantido porque o chat de suporte posiciona o botão flutuante a partir dela.
 */
export const DRAWER_WIDTH = 256;

const PLAN_BADGE_CLASS: Record<string, string> = {
  premium: 'bg-[#f59e0b] text-white',
  pro: 'bg-[#8b5cf6] text-white',
  basic: 'bg-[#3b82f6] text-white',
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

  return (
    <Sidebar collapsible="icon" aria-label="Navegação principal" data-testid="admin-sidebar">
      <SidebarHeader className="p-0">
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <NavGroup key={group.key} label={group.label} items={group.items} activeHref={pathname} onAction={onAction} />
        ))}
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
              {planLabel}
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
