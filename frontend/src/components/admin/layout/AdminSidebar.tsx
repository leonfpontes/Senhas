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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { ArrowRight, LogOut } from 'lucide-react';
import { adminLogout } from './AdminTopbar';
import { estaNoMenu, lerPreferencia, gravarPreferencia, marcarUso, moduloDaRota, type PreferenciaDoMenu } from '@/constants/modulos';

/**
 * Largura da sidebar expandida em px (= `--sidebar-width` 16rem do bloco shadcn).
 * Exportado para quem precisa da largura da sidebar em px.
 */
export const DRAWER_WIDTH = 256;

const PAPEL: Record<string, string> = {
  admin: 'Administração',
  super_admin: 'Plataforma',
  operator: 'Equipe',
};

function iniciaisDe(nome: string): string {
  return (
    nome
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

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
  const { beta, subscription: assinatura } = useSubscription();
  const comDado = assinatura?.modulos_com_dado ?? [];
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
  const { fixos, daCasa } = montarSidebarNav(groups, { ajustavel, noMenu: (k) => estaNoMenu(pref, k, comDado) });
  const modulosAtivo = pathname === '/admin/modulos';

  return (
    <Sidebar collapsible="icon" aria-label="Navegação principal" data-testid="admin-sidebar">
      <SidebarHeader className="p-0">
        <BrandHeader
          plano={subscriptionLoading ? null : subscription?.is_trial ? `${planLabel} · mês grátis` : `Plano ${planLabel}`}
        />
      </SidebarHeader>
      <SidebarContent>
        {/* Jornada 1 v2: o dia de gira fixo; o resto da casa em "Da casa" e em "Ver os 12 módulos". */}
        <NavGroup label="Dia de gira" items={fixos} activeHref={router.asPath} onAction={onAction} />
        {daCasa.length > 0 ? (
          <NavGroup label="Da casa" items={daCasa} activeHref={router.asPath} onAction={onAction} />
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
              'flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-semibold text-[color:var(--color-ouro-300)] hover:bg-sidebar-accent',
              modulosAtivo && 'bg-sidebar-accent',
            )}
          >
            Ver os 12 módulos <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-1 px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
        {/* J1 v2 · 11: quem está no painel, com o "sair" ao lado; o plano mora no topo, sob a casa. */}
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-[color:var(--color-barro-600)] text-[0.75rem] font-bold text-white">
              {iniciaisDe(profile?.full_name || profile?.username || '')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{profile?.full_name || profile?.username}</p>
            <p className="truncate text-[0.75rem] text-sidebar-foreground/70">{PAPEL[profile?.role ?? ''] ?? 'Equipe'}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            aria-label="Sair"
            onClick={() => void adminLogout(router.push, profile?.id)}
          >
            <LogOut aria-hidden />
          </Button>
        </div>
        <p className="text-[0.65rem] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" data-testid="sidebar-version">
          {APP_VERSION_LABEL}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

export default AdminSidebar;
