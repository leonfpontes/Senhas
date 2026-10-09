/**
 * Layout da plataforma (super admin) — casca de todas as páginas /platform.
 *
 *   1. Guarda de acesso: só `role === "super_admin"` (localStorage `user`); os demais são
 *      redirecionados para /admin/dashboard ou /login.
 *   2. `PlatformThemeProvider` (claro/escuro pela classe `dark` na raiz).
 *   3. Bloco `Sidebar` do kit (recolhível em ícones), cabeçalho com Breadcrumb, busca de
 *      comandos (⌘K) e alternância de tema. O padding do conteúdo é aplicado uma vez aqui.
 *
 * Páginas aninhadas passam `breadcrumbs` para o cabeçalho (ex.: Terreiros › Casa de Pai João).
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import * as Sentry from '@sentry/nextjs';
import { Building2, Handshake, LayoutDashboard, LifeBuoy, Loader2, LogOut, Moon, ScrollText, Search, Settings, Sun } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { APP_VERSION } from '@/lib/version';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PlatformThemeProvider, usePlatformTheme } from '@/providers/PlatformThemeProvider';
import { useProfile } from '@/hooks/useProfile';
import { usePlatformSupportUnread } from '@/components/support/usePlatformSupportUnread';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CommandPalette, useCommandPalette } from '@/components/platform/CommandPalette';
import { initials } from '@/components/platform/format';

// ─── Navegação — fonte única ─────────────────────────────────────────────────

export const PLATFORM_NAV = [
  { label: 'Hoje', href: '/platform', icon: LayoutDashboard, exact: true },
  { label: 'Terreiros', href: '/platform/tenants', icon: Building2, exact: false },
  { label: 'Suporte', href: '/platform/suporte', icon: LifeBuoy, exact: false },
  { label: 'Parceiros', href: '/platform/parceiros', icon: Handshake, exact: false },
  { label: 'Auditoria', href: '/platform/audit_consolidated', icon: ScrollText, exact: false },
  { label: 'Configurações', href: '/platform/settings', icon: Settings, exact: false },
] as const;

export function isNavActive(pathname: string, item: { href: string; exact: boolean }): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface BreadcrumbEntry {
  label: string;
  href?: string;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function PlatformSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const { profile } = useProfile();
  const unread = usePlatformSupportUnread();

  const displayName = profile?.full_name || profile?.username || 'Super admin';
  const email = profile?.email ?? '';

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      /* não crítico */
    }
    localStorage.removeItem('user');
    Sentry.setUser(null);
    router.push('/login');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <Link
          href="/platform"
          onClick={closeOnMobile}
          className="flex items-center gap-2.5 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label="GiraHub — Hoje"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={28} height={28} className="size-7 shrink-0 rounded-md" />
          <span className="truncate text-sm font-bold tracking-tight group-data-[collapsible=icon]:hidden">
            GiraHub
            <span className="ml-1.5 text-[0.6rem] font-bold tracking-[0.18em] text-brand uppercase">Plataforma</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_NAV.map((item) => {
                const active = isNavActive(router.pathname, item);
                const badge = item.href === '/platform/suporte' && unread > 0 ? unread : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href} onClick={closeOnMobile} aria-current={active ? 'page' : undefined}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 && (
                      <SidebarMenuBadge
                        className="bg-destructive text-destructive-foreground"
                        aria-label={`${badge} conversas não lidas`}
                      >
                        {badge > 9 ? '9+' : badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={displayName}>
              <Link href="/platform/settings?tab=conta" onClick={closeOnMobile}>
                <Avatar className="size-7">
                  {profile?.profile_photo_url && <AvatarImage src={profile.profile_photo_url} alt="" />}
                  <AvatarFallback className="bg-sidebar-primary text-[0.65rem] font-bold text-sidebar-primary-foreground">
                    {initials(displayName, 'SA')}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xs font-semibold">{displayName}</span>
                  {email && <span className="truncate text-[0.68rem] text-muted-foreground">{email}</span>}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Sair" className="text-muted-foreground hover:text-destructive">
              <LogOut aria-hidden />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="px-2 pb-1 text-center text-[0.62rem] font-semibold tracking-[0.08em] text-muted-foreground group-data-[collapsible=icon]:hidden">
          GiraHub v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── Cabeçalho ───────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggleMode } = usePlatformTheme();
  const label = isDark ? 'Modo claro' : 'Modo escuro';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" onClick={toggleMode} aria-label={label} aria-pressed={isDark}>
          {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function HeaderBreadcrumb({ entries }: { entries: BreadcrumbEntry[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {entries.map((entry, i) => {
          const last = i === entries.length - 1;
          return (
            <React.Fragment key={`${entry.label}-${i}`}>
              <BreadcrumbItem className={cn(!last && 'hidden sm:inline-flex')}>
                {last || !entry.href ? (
                  <BreadcrumbPage className="max-w-[40vw] truncate font-semibold">{entry.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={entry.href}>{entry.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator className="hidden sm:block" />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function defaultBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  const item = PLATFORM_NAV.find((n) => isNavActive(pathname, n));
  if (!item) return [{ label: 'Plataforma' }];
  const nested = pathname !== item.href;
  return nested ? [{ label: item.label, href: item.href }, { label: 'Detalhe' }] : [{ label: item.label }];
}

// ─── Casca ───────────────────────────────────────────────────────────────────

interface PlatformShellProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbEntry[];
}

function PlatformShell({ children, breadcrumbs }: PlatformShellProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      const user = raw ? JSON.parse(raw) : null;
      if (!user || user.role !== 'super_admin') {
        window.location.replace(user ? '/admin/dashboard' : '/login');
        return;
      }
      setAuthorized(true);
    } catch {
      window.location.replace('/login');
    }
  }, []);

  if (!authorized) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-brand" aria-hidden />
        <span className="sr-only">Verificando acesso…</span>
      </div>
    );
  }

  const entries = breadcrumbs ?? defaultBreadcrumbs(router.pathname);

  return (
    <SidebarProvider>
      <PlatformSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1" aria-label="Abrir ou recolher o menu" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <div className="min-w-0 flex-1">
            <HeaderBreadcrumb entries={entries} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setPaletteOpen(true)}
            aria-label="Buscar terreiro ou comando (⌘K)"
            aria-keyshortcuts="Meta+K Control+K"
          >
            <Search aria-hidden />
            <span className="hidden sm:inline">Buscar…</span>
            <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[0.65rem] font-medium sm:inline-flex">
              ⌘K
            </kbd>
          </Button>
          <ThemeToggle />
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}

// ─── Exportação pública ──────────────────────────────────────────────────────

export interface PlatformLayoutProps {
  children: React.ReactNode;
  /** Título da aba do navegador (prefixo "GiraHub ·"). */
  title?: string;
  /** Trilha do cabeçalho; padrão: item de navegação ativo. */
  breadcrumbs?: BreadcrumbEntry[];
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ children, title, breadcrumbs }) => (
  <PlatformThemeProvider>
    <Head>
      <title>{title ? `GiraHub · ${title}` : 'GiraHub · Plataforma'}</title>
    </Head>
    <PlatformShell breadcrumbs={breadcrumbs}>{children}</PlatformShell>
  </PlatformThemeProvider>
);

export default PlatformLayout;
