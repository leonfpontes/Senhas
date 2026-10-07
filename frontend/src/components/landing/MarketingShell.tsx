/**
 * Moldura das páginas de marketing (landing e /planos — V-08, $-03): cabeçalho com a marca do
 * GiraHub, menu (Sheet no celular), rodapé com créditos das fotos e o botão flutuante de WhatsApp.
 * Paleta "terra" (tokens areia/tinta/barro/café/ouro/folha em globals.css) e serifa Fraunces nos
 * títulos (`font-display`). Páginas de marketing são sempre claras (como as públicas).
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';
import { WhatsAppFab } from '@/components/landing/WhatsAppFab';
import { PHOTO_CREDITS } from '@/constants/landingPhotos';
import { supportWhatsappLink } from '@/lib/whatsapp';
import { fraunces, MARKETING_RESET as RESET } from '@/components/landing/fonts';

export const MARKETING_NAV = [
  { label: 'Para quem é', href: '/#para-quem' },
  { label: 'Como funciona', href: '/#como-funciona' },
  { label: 'Planos', href: '/planos' },
  { label: 'Dúvidas', href: '/#duvidas' },
];

const NAV_LINK =
  'rounded-md text-sm font-medium text-areia-200 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-ouro-300/60';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const whatsapp = supportWhatsappLink();

  return (
    <div
      className={cn(
        fraunces.variable,
        'min-h-screen bg-areia-50 text-tinta [scroll-behavior:smooth] motion-reduce:[scroll-behavior:auto]',
        RESET,
      )}
    >
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-ouro-300 px-3 py-2 font-bold text-cafe-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-cafe-950/95 text-white backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="GiraHub — página inicial"
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300/60"
          >
            <GiraHubLogo className="text-white" />
          </Link>

          <nav aria-label="Seções" className="hidden items-center gap-6 md:flex">
            {MARKETING_NAV.map((n) => (
              <Link key={n.href} href={n.href} className={NAV_LINK}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" className="text-areia-100 hover:bg-white/10 hover:text-white">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild className="bg-ouro-400 font-bold text-cafe-950 hover:bg-ouro-300">
              <Link href="/cadastro">Criar conta grátis</Link>
            </Button>
          </div>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Abrir menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-white/10 bg-cafe-950 text-white">
              <SheetHeader>
                <SheetTitle className="text-white">Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Seções" className="flex flex-col gap-1 px-4">
                {MARKETING_NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-2 py-3 text-base font-medium text-areia-100 outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-ouro-300/60"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <Button asChild variant="outline" size="touch" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild size="touch" className="bg-ouro-400 font-bold text-cafe-950 hover:bg-ouro-300">
                  <Link href="/cadastro">Criar conta grátis</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="conteudo">{children}</main>

      <footer className="bg-cafe-950 py-12 text-areia-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <GiraHubLogo size="sm" className="mb-3 text-white" />
            <p className="max-w-sm text-sm leading-relaxed">
              Senha pelo WhatsApp, Porta e organização da casa para terreiros de Umbanda, Candomblé e demais casas de axé.
              Grátis para começar.
            </p>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ouro-300 hover:text-ouro-400"
              >
                <MessageCircle className="size-4" aria-hidden /> Fale com a gente no WhatsApp
              </a>
            )}
          </div>
          <nav aria-label="Plataforma">
            <p className="mb-3 text-xs font-bold tracking-widest text-areia-100 uppercase">Plataforma</p>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/#como-funciona" className="hover:text-white">Como funciona</Link></li>
              <li><Link href="/planos" className="hover:text-white">Planos e preços</Link></li>
              <li><Link href="/#duvidas" className="hover:text-white">Dúvidas frequentes</Link></li>
              <li><Link href="/cadastro" className="hover:text-white">Criar conta</Link></li>
              <li><Link href="/login" className="hover:text-white">Entrar</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="mb-3 text-xs font-bold tracking-widest text-areia-100 uppercase">Legal</p>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/privacidade" className="hover:text-white">Privacidade</Link></li>
              <li><Link href="/termos" className="hover:text-white">Termos de uso</Link></li>
              <li><Link href="/status" className="hover:text-white">Status do sistema</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-white/10 px-4 pt-6 text-xs sm:px-6">
          <div className="flex flex-wrap justify-between gap-2">
            <span>© {new Date().getFullYear()} GiraHub. Todos os direitos reservados.</span>
            <span>Feito com axé para a comunidade dos terreiros</span>
          </div>
          <p>
            Fotos ilustrativas:{' '}
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              Pexels
            </a>{' '}
            — {PHOTO_CREDITS.join(', ')}.
          </p>
        </div>
      </footer>

      <WhatsAppFab href={whatsapp} />
    </div>
  );
}

export default MarketingShell;
