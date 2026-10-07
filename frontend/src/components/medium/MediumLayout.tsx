/**
 * MediumLayout — casca da Área do Médium (AM-06). Toda página em `src/pages/medium/` usa este
 * layout (scripts/audit-permission-guards.js exige).
 *
 * Identidade: a do site novo (paleta "terra": areia, tinta, café, ouro e títulos em Fraunces —
 * classe `.medium-terra` em globals.css) com a cor e o logo do terreiro nos detalhes: logo no
 * cabeçalho, linha da marca embaixo dele, botão principal, aba ativa e datas (`applyBrand`, via
 * MediumProvider). Claro/escuro segue o sistema (classe `dark` em <html>, removida ao sair).
 * Celular primeiro: uma coluna, alvos de 48px+, barra inferior Início · Agenda · Avisos ·
 * Mensalidade · Perfil (D-27) com ícone E texto, respeitando a área segura (`z-40`, como a
 * `MobileTabBar`; overlays do Radix ficam por cima com `z-50`).
 *
 * Gate (AM-04): sem sessão → /login; sem Área do Médium mas com painel → painel; sem nenhuma
 * área (ou 403/402 do /medium/me) → aviso neutro, sem oferta de upgrade. Só chama
 * `/api/v1/medium/*` (MediumProvider) — nunca `/api/v1/admin/*`.
 * Primeiro acesso no aparelho: abre o passo "Deixe a Área na tela inicial" (D-23).
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeftRight,
  CalendarDays,
  House,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { fraunces } from '@/components/landing/fonts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { useProfile } from '@/hooks/useProfile';
import {
  AREA_HOME,
  AREA_MEDIUM_INDISPONIVEL,
  hasAdminArea,
  hasMediumArea,
  switchArea,
} from '@/lib/areas';
import { captureInstallPrompt } from '@/lib/pwa';
import { cn } from '@/lib/utils';
import { logout } from '@/services/authSession';
import { useMedium } from './MediumProvider';
import { InstallAreaSheet, installAreaSeen } from './InstallAreaSheet';
import { TerreiroEmblem } from './TerreiroEmblem';

// `modulo`: aba de módulo que a casa liga/desliga (AM-10) — some quando fora de `me.modulos`.
export const MEDIUM_TABS: { href: string; label: string; icon: LucideIcon; modulo?: string }[] = [
  { href: '/medium', label: 'Início', icon: House },
  { href: '/medium/agenda', label: 'Agenda', icon: CalendarDays, modulo: 'agenda' },
  { href: '/medium/avisos', label: 'Avisos', icon: Megaphone },
  { href: '/medium/mensalidade', label: 'Mensalidade', icon: Wallet },
  { href: '/medium/perfil', label: 'Perfil', icon: UserRound },
];

interface MediumShellValue {
  /** Abre o passo "Deixe a Área na tela inicial". */
  openInstall: () => void;
  /** Trocar para o painel (só quem tem as duas áreas). */
  goToPainel: (() => void) | null;
  sair: () => void;
}

const MediumShellContext = createContext<MediumShellValue>({
  openInstall: () => {},
  goToPainel: null,
  sair: () => {},
});

export function useMediumShell(): MediumShellValue {
  return useContext(MediumShellContext);
}

export interface MediumLayoutProps {
  /** Nome da tela (aba do navegador e subtítulo do cabeçalho). */
  title: string;
  children: React.ReactNode;
}

function isImpersonating(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem('impersonating'));
  } catch {
    return false;
  }
}

/** Claro/escuro da Área: segue o sistema; tira a classe ao sair da Área. */
export function useSystemDarkMode(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => root.classList.toggle('dark', mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => {
      mq.removeEventListener?.('change', sync);
      root.classList.remove('dark');
    };
  }, []);
}

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

function TabBar({ pathname, modulos }: { pathname: string; modulos: string[] }) {
  const tabs = MEDIUM_TABS.filter((t) => !t.modulo || modulos.includes(t.modulo));
  return (
    <nav
      aria-label="Menu da Área do Médium"
      data-testid="medium-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className={cn('mx-auto grid max-w-xl', GRID_COLS[tabs.length] ?? 'grid-cols-5')}>
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/medium'
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[62px] flex-col items-center justify-center gap-1 px-0.5 text-xs leading-tight outline-none',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active ? 'font-bold text-brand' : 'font-medium text-muted-foreground',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-[24%] top-0 h-[3px] rounded-b-sm bg-primary"
                  />
                )}
                <Icon className="size-6" aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Shell({
  title,
  terreiro,
  logoUrl,
  menu,
  children,
}: {
  title: string;
  terreiro?: string;
  logoUrl?: string | null;
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="medium-layout"
      className={cn(
        fraunces.variable,
        'medium-terra flex min-h-dvh flex-col bg-background text-foreground',
      )}
    >
      <Head>
        <title>{`${title} · Área do Médium`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <a
        href="#conteudo-medium"
        className="sr-only z-50 rounded-md bg-ouro-300 px-3 py-2 font-bold text-cafe-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b-[3px] border-primary bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-xl items-center gap-3 px-4 py-2.5">
          <TerreiroEmblem nome={terreiro} logoUrl={logoUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[1.06rem] leading-tight font-semibold">
              {terreiro || 'Área do Médium'}
            </p>
            <p className="truncate text-sm text-muted-foreground">{title}</p>
          </div>
          {menu}
        </div>
      </header>
      {children}
    </div>
  );
}

function Carregando() {
  return (
    <div
      className="flex flex-1 items-center justify-center py-24"
      role="status"
      aria-label="Carregando"
    >
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

export function MediumLayout({ title, children }: MediumLayoutProps) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const { me, status } = useMedium();
  const [installOpen, setInstallOpen] = useState(false);
  useSystemDarkMode();

  const temArea = hasMediumArea(profile);
  const temPainel = hasAdminArea(profile);
  const semSessao = !profile && !profileLoading;
  // Sem a Área, mas com o painel: vai para o painel (super admin, para a plataforma).
  const destinoPainel =
    profile?.areas && !temArea && temPainel
      ? profile.role === 'super_admin'
        ? '/platform'
        : AREA_HOME.admin
      : null;

  useEffect(() => {
    if (semSessao) void router.replace('/login');
    else if (destinoPainel) void router.replace(destinoPainel);
  }, [semSessao, destinoPainel, router]);

  // Primeiro acesso neste aparelho: passo guiado do ícone na tela inicial (D-23).
  useEffect(() => {
    if (status !== 'ok' || isImpersonating()) return;
    captureInstallPrompt();
    if (!installAreaSeen()) setInstallOpen(true);
  }, [status]);

  const sair = useCallback(() => void logout((url) => router.push(url)), [router]);
  const goToPainel = useCallback(() => {
    void router.push(switchArea(profile?.id, 'admin'));
  }, [router, profile?.id]);
  const shell: MediumShellValue = {
    openInstall: () => setInstallOpen(true),
    goToPainel: temPainel ? goToPainel : null,
    sair,
  };

  const terreiro = me?.terreiro.nome ?? profile?.tenant_name ?? undefined;
  const logoUrl = me?.marca.logo_url ?? null;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="shrink-0 gap-2 px-3 font-bold"
          data-testid="medium-menu"
        >
          <Menu aria-hidden />
          Menu
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(fraunces.variable, 'medium-terra min-w-60')}>
        {temPainel && (
          <>
            <DropdownMenuItem
              className="min-h-12 text-base"
              onSelect={goToPainel}
              data-testid="medium-trocar-area"
            >
              <ArrowLeftRight aria-hidden /> Trocar de área
              <span className="ml-auto text-xs text-muted-foreground">Painel</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="min-h-12 text-base" onSelect={sair}>
          <LogOut aria-hidden /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Ainda decidindo (perfil chegando, redirecionando).
  if (!profile || destinoPainel || (!profile.areas && profileLoading)) {
    return (
      <Shell title={title}>
        <Carregando />
      </Shell>
    );
  }

  // Sem nenhuma área (terreiro perdeu o plano, a casa desligou a Área ou o vínculo caiu).
  if (!temArea || status === 'indisponivel') {
    return (
      <Shell title="Área do Médium" terreiro={terreiro} menu={menu}>
        <main
          id="conteudo-medium"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10"
        >
          <EmptyState
            icon={<House />}
            title="Área do Médium indisponível"
            description={<span className="text-base">{AREA_MEDIUM_INDISPONIVEL}</span>}
            action={
              temPainel ? (
                <Button type="button" size="touch" className="font-bold" onClick={goToPainel}>
                  Ir para o painel do terreiro
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="font-bold"
                  onClick={sair}
                >
                  Sair
                </Button>
              )
            }
          />
        </main>
      </Shell>
    );
  }

  return (
    <MediumShellContext.Provider value={shell}>
      <Shell title={title} terreiro={terreiro} logoUrl={logoUrl} menu={menu}>
        <Head>
          {/* Ícone na tela inicial abre a Área, não a Porta (D-23). O _document não põe o
              manifesto da Porta nas rotas /medium. */}
          <link rel="manifest" href="/manifest-medium.webmanifest" />
        </Head>
        <main
          id="conteudo-medium"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
        >
          {status === 'ok' ? children : status === 'erro' ? <ErroAoCarregar /> : <Carregando />}
        </main>
        <TabBar pathname={router.pathname} modulos={me?.modulos ?? []} />
        <InstallAreaSheet
          open={installOpen}
          onOpenChange={setInstallOpen}
          terreiroNome={terreiro}
          logoUrl={logoUrl}
        />
      </Shell>
    </MediumShellContext.Provider>
  );
}

function ErroAoCarregar() {
  const { refresh } = useMedium();
  return (
    <EmptyState
      className="flex-1"
      title="Não conseguimos abrir a Área agora"
      description="Confira a internet e tente de novo."
      action={
        <Button type="button" size="touch" className="font-bold" onClick={refresh}>
          Tentar de novo
        </Button>
      }
    />
  );
}

export default MediumLayout;
