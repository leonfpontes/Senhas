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
  useSidebar,
} from '@/components/ui/sidebar';
import { BrandHeader } from './BrandHeader';
import { NavGroup } from './NavGroup';
import { flattenNav, montarSidebarNav, pathOf, useAdminNav, type NavAction } from './navConfig';
import { ArrowLeftRight, ArrowRight, BookOpen, Building2, LogOut, MessageCircle, Moon, Newspaper, Search, Sun, User } from 'lucide-react';
import { adminLogout, MENU_DA_PESSOA_EVENT, type AcaoDoMenuDaPessoa } from './AdminTopbar';
import { useMinhasContas } from '@/hooks/useMinhasContas';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { switchArea } from '@/lib/areas';
import { contarModulosVisiveis, estaNoMenu, lerPreferencia, gravarPreferencia, marcarUso, moduloDaRota, type PreferenciaDoMenu } from '@/constants/modulos';

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
  /** Abre a busca (⌘K). No celular, o menu mostra "Buscar tela ou ação" no topo (J12 v2 · 03). */
  onOpenCommand?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOperator, onAction, onOpenCommand }) => {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const { isDark, toggleMode } = useAdminTheme();
  const pathname = router.pathname;
  const { profile } = useProfile();
  const { planLabel, subscription, loading: subscriptionLoading } = useSubscription();
  const groups = useAdminNav({ isOperator, tenantId: profile?.tenant_id });
  const { beta, can, subscription: assinatura } = useSubscription();
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
  // "Ver os N módulos": N é o que a página /admin/modulos mostra para esta pessoa (contador com dado real).
  const totalDeModulos = contarModulosVisiveis(new Set(flattenNav(groups).map((l) => pathOf(l.href))), can);
  const modulosAtivo = pathname === '/admin/modulos';
  const impersonating = typeof window !== 'undefined' && Boolean(window.sessionStorage?.getItem('impersonating'));
  const outrasContas = useMinhasContas(profile?.id, isMobile && Boolean(profile?.tenant_id) && !impersonating);
  const pedir = (acao: AcaoDoMenuDaPessoa) => {
    setOpenMobile(false);
    window.dispatchEvent(new CustomEvent<AcaoDoMenuDaPessoa>(MENU_DA_PESSOA_EVENT, { detail: acao }));
  };
  const irPara = (href: string) => {
    setOpenMobile(false);
    void router.push(href);
  };
  const itemDaPessoa =
    'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-[0.9375rem] text-sidebar-foreground hover:bg-sidebar-accent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-[18px] [&_svg]:shrink-0';

  return (
    <Sidebar collapsible="icon" aria-label="Navegação principal" data-testid="admin-sidebar">
      <SidebarHeader className="p-0">
        <BrandHeader
          plano={subscriptionLoading ? null : subscription?.is_trial ? `${planLabel} · mês grátis` : `Plano ${planLabel}`}
        />
        {isMobile && onOpenCommand && (
          <button
            type="button"
            onClick={() => {
              setOpenMobile(false);
              onOpenCommand();
            }}
            className="mx-3 mb-2 flex min-h-11 items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 text-left text-[0.9375rem] text-sidebar-foreground/80 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Search className="size-4" aria-hidden /> Buscar tela ou ação
          </button>
        )}
      </SidebarHeader>
      <SidebarContent>
        {/* Jornada 1 v2: o dia de gira fixo; o resto da casa em "Da casa" e em "Ver os N módulos". */}
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
            {totalDeModulos === 1 ? 'Ver o módulo' : `Ver os ${totalDeModulos} módulos`} <ArrowRight className="size-3.5" aria-hidden />
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
        {/* J12 v2 · 08: no celular, o menu da pessoa (o mesmo do avatar) fecha a lista. */}
        {isMobile && (
          <nav aria-label="Você" className="flex flex-col">
            <p className="-mt-1 mb-1 truncate pl-[2.625rem] text-[0.75rem] text-sidebar-foreground/70">{profile?.email}</p>
            <button type="button" className={itemDaPessoa} onClick={() => irPara('/admin/profile')}>
              <User aria-hidden /> Perfil
            </button>
            <button type="button" className={itemDaPessoa} onClick={() => pedir('primeiros-passos')}>
              <BookOpen aria-hidden /> Mostrar primeiros passos
            </button>
            {profile?.tenant_id && (
              <button type="button" className={itemDaPessoa} onClick={() => pedir('suporte')}>
                <MessageCircle aria-hidden /> Falar com o suporte
              </button>
            )}
            <button type="button" className={itemDaPessoa} onClick={() => pedir('novidades')}>
              <Newspaper aria-hidden /> Novidades da versão
            </button>
            {profile?.areas?.medium && (
              <button type="button" className={itemDaPessoa} onClick={() => irPara(switchArea('medium'))}>
                <ArrowLeftRight aria-hidden /> Trocar de área
              </button>
            )}
            {outrasContas.length > 0 && (
              <button type="button" className={itemDaPessoa} onClick={() => pedir('trocar-terreiro')}>
                <Building2 aria-hidden /> Trocar de terreiro
              </button>
            )}
            <button type="button" className={itemDaPessoa} onClick={toggleMode}>
              {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />} {isDark ? 'Modo claro' : 'Modo escuro'}
            </button>
            <button
              type="button"
              className={itemDaPessoa}
              onClick={() => void adminLogout(router.push, profile?.id)}
            >
              <LogOut aria-hidden className="text-[color:var(--color-barro-500)]" /> Sair
            </button>
          </nav>
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
