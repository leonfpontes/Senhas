/**
 * MobileTabBar — barra inferior do celular: Início · Giras · + · Porta · Menu.
 *
 * O "+" abre um Sheet com as ações do dia ("Nova gira", "Sem senha" quando na Porta,
 * "Compartilhar link"); "Menu" abre a Sidebar (Sheet). Respeita `env(safe-area-inset-bottom)`
 * e alvos de 48px. Visível só abaixo de `md` (900px), o mesmo limiar do bloco Sidebar.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CalendarDays, DoorOpen, LayoutDashboard, Menu, Plus, Share2, UserPlus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSidebar } from '@/components/ui/sidebar';

/** Evento disparado pela barra inferior para a Porta abrir o cadastro "Sem senha". */
export const PORTA_WALK_IN_EVENT = 'girahub:porta-sem-senha';

export interface MobileTabBarProps {
  canGiras: boolean;
  canPorta: boolean;
  /** `giras:insert` e plano permitindo criar gira. */
  canCreateGira: boolean;
  /** Na Porta e com `porta:insert`. */
  canWalkIn: boolean;
  onShareLink: () => void;
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.65rem] font-medium',
        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        active ? 'text-brand' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function MobileTabBar({ canGiras, canPorta, canCreateGira, canWalkIn, onShareLink }: MobileTabBarProps) {
  const router = useRouter();
  const pathname = router.pathname;
  const { toggleSidebar } = useSidebar();
  const [plusOpen, setPlusOpen] = useState(false);

  const close = () => setPlusOpen(false);
  const handleWalkIn = () => {
    close();
    window.dispatchEvent(new CustomEvent(PORTA_WALK_IN_EVENT));
  };

  const hasPlusActions = canCreateGira || canWalkIn || canGiras;

  return (
    <>
      <nav
        aria-label="Navegação rápida"
        data-testid="mobile-tab-bar"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="flex h-14 items-stretch px-1">
          <TabLink href="/admin/dashboard" label="Início" icon={LayoutDashboard} active={pathname === '/admin/dashboard'} />
          {canGiras && <TabLink href="/admin/giras" label="Giras" icon={CalendarDays} active={pathname === '/admin/giras'} />}
          {hasPlusActions && (
            <div className="flex flex-1 items-center justify-center">
              <Button
                type="button"
                size="icon-touch"
                className="rounded-full shadow-md"
                aria-label="Ações rápidas"
                aria-haspopup="dialog"
                aria-expanded={plusOpen}
                onClick={() => setPlusOpen(true)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          )}
          {canPorta && <TabLink href="/admin/porta" label="Porta" icon={DoorOpen} active={pathname.startsWith('/admin/porta')} />}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Abrir menu"
            className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.65rem] font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Menu className="size-5" aria-hidden />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      <Sheet open={plusOpen} onOpenChange={setPlusOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />
          <SheetHeader className="pb-0">
            <SheetTitle>O que você quer fazer?</SheetTitle>
            <SheetDescription>Ações rápidas do dia.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            {canCreateGira && (
              <Button asChild size="touch" className="font-semibold">
                <Link href="/admin/giras?nova=1" onClick={close}>
                  Nova gira <Plus aria-hidden />
                </Link>
              </Button>
            )}
            {canWalkIn && (
              <Button type="button" size="touch" variant="outline" className="font-semibold" onClick={handleWalkIn}>
                Sem senha <UserPlus aria-hidden />
              </Button>
            )}
            {canGiras && (
              <Button
                type="button"
                size="touch"
                variant="outline"
                className="font-semibold"
                onClick={() => {
                  close();
                  onShareLink();
                }}
              >
                Compartilhar link <Share2 aria-hidden />
              </Button>
            )}
            {/* J12 v2 · 02: diz por que uma ação pode não estar aqui. */}
            <p className="pt-1 text-xs text-muted-foreground">
              &quot;Sem senha&quot; só aparece na Porta e para quem pode registrar. Nova gira, só com permissão e plano.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileTabBar;
