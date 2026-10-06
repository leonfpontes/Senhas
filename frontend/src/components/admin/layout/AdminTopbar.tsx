/**
 * AdminTopbar — barra superior do admin: gatilho da sidebar, breadcrumb, nome do terreiro,
 * seletor da gira de hoje (quando há várias), busca de ações (⌘K), guia da tela, modo
 * claro/escuro e menu do usuário (Perfil, versão, primeiros passos, Sair).
 */
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useTour } from '@reactour/tour';
import * as Sentry from '@sentry/nextjs';
import { BookOpen, CircleHelp, LogOut, MessageCircle, Moon, Search, Sparkles, Sun, User } from 'lucide-react';
import { apiClient, endImpersonation } from '@/services/api_client';
import { useTenant } from '@/providers/ThemeProvider';
import { useProfile } from '@/hooks/useProfile';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { getAdminTourSteps } from '@/tours/adminTourSteps';
import { routeLabel } from '@/constants/routes';
import { APP_VERSION } from '@/lib/version';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';
import { ReleaseNotesDialog, clearReleaseNotesSession, useReleaseNotesAutoOpen } from '@/components/admin/ReleaseNotesDialog';
import { giraLabel, useGiraContext } from '@/components/admin/GiraContext';
import { resetChecklistDismissed } from '@/components/admin/FirstGiraChecklist';

/**
 * Rotas em que a gira de hoje faz sentido como contexto compartilhado — e que seguem o seletor
 * do topo. Giras lista a agenda inteira, então não mostra o seletor (não teria efeito).
 */
export const GIRA_CONTEXT_ROUTES = ['/admin/dashboard', '/admin/tickets', '/admin/porta'];

export interface AdminTopbarProps {
  title: string;
  onOpenCommand?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({ title, onOpenCommand }) => {
  const router = useRouter();
  const { tenantName } = useTenant();
  const { profile } = useProfile();
  const { isDark, toggleMode } = useAdminTheme();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(false);
  // Impersonação: o superadmin entra e sai de vários terreiros — o modal de novidades não abre sozinho.
  const impersonating = typeof window !== 'undefined' && Boolean(safeSessionItem('impersonating'));
  const [notesOpen, setNotesOpen] = useReleaseNotesAutoOpen(profile?.id, Boolean(profile?.id) && !impersonating);

  const showGiraSelector = GIRA_CONTEXT_ROUTES.includes(router.pathname);
  const { giras, selectedGiraId, setSelectedGiraId, loaded } = useGiraContext({ load: showGiraSelector });

  const avatarText = (profile?.full_name || profile?.username || profile?.email || 'A').charAt(0).toUpperCase();

  // Breadcrumb a partir da rota (sem querystring); só a partir do 3º nível (/admin/x/y).
  const segments = router.asPath.split('?')[0].split('#')[0].split('/').filter(Boolean);
  const crumbs = segments.map((seg, idx) => ({
    label: routeLabel(seg),
    href: '/' + segments.slice(0, idx + 1).join('/'),
    isLast: idx === segments.length - 1,
  }));
  const showBreadcrumbs = segments.length > 2;

  const { setSteps, setIsOpen, setCurrentStep } = useTour();
  const tourSteps = getAdminTourSteps(router.pathname);
  const handleOpenTour = () => {
    setSteps?.(tourSteps);
    setCurrentStep(0);
    setIsOpen(true);
  };

  const handleLogout = () => adminLogout((url) => router.push(url), profile?.id);

  const handleShowOnboarding = () => {
    resetChecklistDismissed(profile?.tenant_id);
    router.push('/admin/dashboard?passos=1');
  };

  const selectableGiras = [...giras].sort(
    (a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime(),
  );

  return (
    <header
      data-slot="admin-topbar"
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4"
    >
      <SidebarTrigger className="-ml-1" aria-label="Abrir menu" />

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-bold text-foreground sm:text-base">{title}</h2>
          {tenantName && (
            <span className="hidden truncate text-xs text-muted-foreground md:inline" data-testid="topbar-tenant">
              · {tenantName}
            </span>
          )}
        </div>
        {showBreadcrumbs && (
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList className="text-[0.72rem]">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.href}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {c.isLast ? (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <button type="button" onClick={() => router.push(c.href)} className="hover:text-foreground">
                          {c.label}
                        </button>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      {showGiraSelector && loaded && selectableGiras.length > 1 && (
        <Select value={selectedGiraId ?? undefined} onValueChange={(v) => setSelectedGiraId(v)}>
          <SelectTrigger
            size="sm"
            className="hidden max-w-[260px] sm:flex"
            aria-label="Gira de hoje"
            data-testid="topbar-gira-select"
          >
            <SelectValue placeholder="Escolher gira" />
          </SelectTrigger>
          <SelectContent align="end">
            {selectableGiras.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {giraLabel(g)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {onOpenCommand && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden gap-2 text-muted-foreground md:inline-flex"
              onClick={onOpenCommand}
              aria-label="Buscar ações (Ctrl K)"
              data-testid="topbar-command"
            >
              <Search aria-hidden />
              <span className="text-xs">Buscar…</span>
              <kbd className="pointer-events-none rounded border bg-muted px-1 font-mono text-[0.65rem]">⌘K</kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Buscar páginas e ações (⌘K / Ctrl K)</TooltipContent>
        </Tooltip>
      )}

      {tourSteps.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Abrir guia da tela"
              data-tour="topbar-help"
              onClick={handleOpenTour}
            >
              <CircleHelp aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Guia desta tela</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            onClick={toggleMode}
          >
            {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDark ? 'Modo claro' : 'Modo escuro'}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative rounded-full"
            aria-label={supportUnread ? "Menu do usuário — nova resposta do suporte" : "Menu do usuário"}
            data-testid="topbar-user-menu"
          >
            <Avatar className="size-8 border">
              {profile?.profile_photo_url && !avatarFailed && (
                <AvatarImage src={profile.profile_photo_url} alt="" onError={() => setAvatarFailed(true)} />
              )}
              <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{avatarText}</AvatarFallback>
            </Avatar>
              {supportUnread && (
                <span className="absolute top-0.5 right-0.5 flex size-2.5" aria-hidden data-testid="support-unread-dot">
                  <span className="absolute inline-flex size-full rounded-full bg-warning opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-warning ring-2 ring-background" />
                </span>
              )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate text-sm font-semibold">{profile?.full_name || profile?.username || 'Usuário'}</span>
            {profile?.email && <span className="truncate text-xs font-normal text-muted-foreground">{profile.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push('/admin/profile')}>
            <User aria-hidden /> Perfil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleShowOnboarding}>
            <BookOpen aria-hidden /> Mostrar primeiros passos
          </DropdownMenuItem>
          {profile?.tenant_id && (
            <DropdownMenuItem onSelect={() => setSupportOpen(true)} data-testid="menu-support">
              <MessageCircle aria-hidden /> Falar com o suporte
              {supportUnread && <span className="ml-auto rounded-full bg-warning px-1.5 text-[10px] font-bold text-warning-foreground">nova</span>}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setNotesOpen(true)} data-testid="menu-version">
            <Sparkles aria-hidden /> Novidades da versão
            <span className="ml-auto text-xs text-muted-foreground">v{APP_VERSION}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleLogout()} variant="destructive">
            <LogOut aria-hidden /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Aparece também durante impersonação: o token vira o do usuário impersonado (ver
          CLAUDE.md), então as mensagens ficam atribuídas a ele — e o superadmin reproduz o
          fluxo de suporte exatamente como esse usuário vê. */}
      <SupportChatWidget
        enabled={Boolean(profile?.tenant_id)}
        open={supportOpen}
        onOpenChange={setSupportOpen}
        onUnreadChange={setSupportUnread}
      />
      <ReleaseNotesDialog open={notesOpen} onOpenChange={setNotesOpen} userId={profile?.id} />
    </header>
  );
};

/**
 * "Sair" do menu do usuário.
 *
 * Impersonação: os cookies deste navegador são do SUPER-ADMIN — o /auth/logout
 * revogaria e apagaria a sessão dele na plataforma. Sair aqui = encerrar só a
 * impersonação (limpa o sessionStorage desta aba e fecha/volta ao login).
 */
export async function adminLogout(push: (url: string) => unknown, profileId?: string): Promise<void> {
  if (safeSessionItem('impersonating')) {
    endImpersonation();
    return;
  }
  try {
    await apiClient.post('/api/v1/auth/logout');
  } catch {
    /* non-critical */
  }
  localStorage.removeItem('user');
  clearReleaseNotesSession(profileId);
  Sentry.setUser(null);
  push('/login');
}

function safeSessionItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export default AdminTopbar;
