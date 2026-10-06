/**
 * LegalPageLayout — casca das páginas institucionais da plataforma (/termos, /privacidade):
 * cabeçalho fixo escuro com menu (Sheet no celular), faixa de título, texto corrido em
 * seções e rodapé em grade. Só troca de componentes em relação às versões MUI; o texto
 * das seções vem de cada página.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Menu, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalPageLayoutProps {
  /** `<title>` completo. */
  pageTitle: string;
  description: string;
  /** Título da faixa (h1). */
  heading: string;
  updatedAt: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}

const NAV = [
  { label: 'Funcionalidades', href: '/#funcionalidades' },
  { label: 'Como Funciona', href: '/#como-funciona' },
  { label: 'Contato', href: '/#contato' },
];

const CONTACT_EMAIL = 'leonfpontes@gmail.com';
const CONTACT_PHONE = '(16) 99109-1234';

/** Renderiza `**negrito**` dentro de um parágrafo (as seções usam essa marcação). */
export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Quebra o corpo em parágrafos e listas (linhas iniciadas por "•"). */
export function renderBody(body: string): React.ReactNode {
  const blocks = body.split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((l) => l.startsWith('•'));
    if (isList) {
      return (
        <ul key={bi} className="my-3 list-disc space-y-1.5 pl-5">
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^•\s*/, ''))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="my-3">
        {lines.map((l, li) => (
          <React.Fragment key={li}>
            {renderInline(l)}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function LegalPageLayout({ pageTitle, description, heading, updatedAt, intro, sections }: LegalPageLayoutProps) {
  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
      </Head>

      <div className="min-h-screen bg-background text-base text-foreground">
        {/* Cabeçalho fixo */}
        <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0f0d2e]/95 text-white backdrop-blur">
          <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white no-underline">
              <Ticket aria-hidden className="size-8 text-amber-400" />
              Girahub
            </Link>

            <nav aria-label="Principal" className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="text-[0.95rem] font-medium text-white/80 hover:text-white">
                  {n.label}
                </a>
              ))}
              <Button asChild className="bg-amber-400 font-semibold text-black hover:bg-amber-500">
                <Link href="/login">Entrar</Link>
              </Button>
            </nav>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-touch" className="text-white hover:bg-white/10 hover:text-white md:hidden" aria-label="Abrir menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[260px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Ticket aria-hidden className="size-5 text-amber-500" /> Girahub
                  </SheetTitle>
                  <SheetDescription className="sr-only">Menu de navegação</SheetDescription>
                </SheetHeader>
                <Separator />
                <nav aria-label="Menu" className="flex flex-col gap-1 px-4">
                  {NAV.map((n) => (
                    <a key={n.href} href={n.href} className="rounded-md px-2 py-3 text-base hover:bg-accent">
                      {n.label}
                    </a>
                  ))}
                  <Separator className="my-2" />
                  <Button asChild size="touch" className="w-full bg-amber-400 font-semibold text-black hover:bg-amber-500">
                    <Link href="/login">Entrar</Link>
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Faixa de título */}
        <section className="bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_50%,#4f46e5_100%)] pt-32 pb-16 text-white">
          <div className="mx-auto max-w-3xl px-4">
            <h1 className="text-[2rem] font-extrabold leading-tight md:text-[2.8rem]">{heading}</h1>
            <p className="mt-2 text-lg text-white/70">Última atualização: {updatedAt}</p>
          </div>
        </section>

        {/* Conteúdo */}
        <main className="bg-card py-12 md:py-20">
          <div className="mx-auto max-w-3xl px-4 leading-[1.8] text-muted-foreground">
            <p className="mb-10 text-[1.05rem]">{intro}</p>

            {sections.map((s) => (
              <section key={s.title} className="mb-10">
                <h2 className="mb-3 text-[1.3rem] font-bold text-foreground">{s.title}</h2>
                <div className="text-[0.98rem]">{renderBody(s.body)}</div>
              </section>
            ))}
          </div>
        </main>

        {/* Rodapé */}
        <footer className="bg-[#0f0d2e] pt-16 pb-8 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-12">
              <div className="col-span-2 md:col-span-4">
                <p className="mb-3 flex items-center gap-2 text-lg font-bold">
                  <Ticket aria-hidden className="size-6 text-amber-400" /> Girahub
                </p>
                <p className="text-[0.9rem] leading-relaxed text-slate-400">
                  Plataforma moderna para gestão de senhas e giras em terreiros de Umbanda.
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="mb-3 text-[0.85rem] font-semibold tracking-wider text-slate-400 uppercase">Plataforma</p>
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="mb-2 block text-[0.9rem] text-white/70 hover:text-white">
                    {n.label}
                  </a>
                ))}
              </div>
              <div className="md:col-span-2">
                <p className="mb-3 text-[0.85rem] font-semibold tracking-wider text-slate-400 uppercase">Legal</p>
                <Link href="/privacidade" className="mb-2 block text-[0.9rem] text-white/70 hover:text-white">
                  Política de Privacidade
                </Link>
                <Link href="/termos" className="mb-2 block text-[0.9rem] text-white/70 hover:text-white">
                  Termos de Uso
                </Link>
              </div>
              <div className="col-span-2 md:col-span-4">
                <p className="mb-3 text-[0.85rem] font-semibold tracking-wider text-slate-400 uppercase">Contato</p>
                <p className="mb-2 text-[0.9rem] text-white/70">{CONTACT_EMAIL}</p>
                <p className="text-[0.9rem] text-white/70">{CONTACT_PHONE}</p>
              </div>
            </div>
            <Separator className="my-8 bg-white/10" />
            <p className="text-center text-[0.8rem] text-slate-400">© {new Date().getFullYear()} Girahub. Todos os direitos reservados.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default LegalPageLayout;
