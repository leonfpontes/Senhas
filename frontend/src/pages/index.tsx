/**
 * Landing do GiraHub — um trabalho só: senha pelo WhatsApp, fila sem tumulto.
 * Hero com CTA acima da dobra no celular e um mock estático da Porta; "Como funciona" em
 * 3 passos; planos vindos de `constants/plans.ts`; módulos extras num Accordion.
 * Animações respeitam `prefers-reduced-motion`. Contato só por `NEXT_PUBLIC_SUPPORT_WHATSAPP`.
 */
'use client';

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarPlus,
  Check,
  ChevronRight,
  DoorOpen,
  Menu,
  MessageCircle,
  Send,
  Sparkles,
  Star,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  PLAN_LIST,
  formatPrice,
  planHighlights,
  minPlanFor,
  type PlanDef,
  type PlanFeatureKey,
} from '@/constants/plans';

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');

const NAV = [
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Planos', href: '#planos' },
  { label: 'E ainda tem', href: '#modulos' },
  { label: 'Contato', href: '#contato' },
];

interface Step {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    icon: CalendarPlus,
    title: 'Crie a gira',
    desc: 'Nome, data e quantas senhas. Leva um minuto e já sai com um link.',
  },
  {
    icon: Send,
    title: 'Mande o link no WhatsApp',
    desc: 'O consulente abre no celular, pega a senha e recebe a confirmação. Sem app, sem cadastro.',
  },
  {
    icon: DoorOpen,
    title: 'Chame pela Porta',
    desc: 'No dia, a Porta mostra quem chegou e chama na ordem. Pode espelhar na TV da recepção.',
  },
];

interface ModuleItem {
  title: string;
  desc: string;
  feature: PlanFeatureKey;
}

const MODULES: ModuleItem[] = [
  { title: 'Médiuns e cambones', desc: 'Cadastro da corrente, presença nas giras e aniversários da semana.', feature: 'mediuns' },
  { title: 'Relatório da gira', desc: 'Quantas senhas, quem compareceu e horários de pico — em PDF.', feature: 'relatorio_gira' },
  { title: 'Financeiro', desc: 'Mensalidades, contas a pagar e a receber e o caixa do terreiro.', feature: 'contas_financeiras' },
  { title: 'Estoque de materiais', desc: 'Velas, ervas, bebidas: entradas, saídas e aviso quando está acabando.', feature: 'estoque_controle' },
  { title: 'Site do terreiro e cursos', desc: 'Página pública com endereço, próximas giras e inscrição em cursos.', feature: 'site_builder' },
  { title: 'Associados', desc: 'Quem é da casa, com mensalidade e prioridade na fila se você quiser.', feature: 'associados' },
];

/** Aparece suave ao entrar na tela; sem movimento quando o sistema pede menos animação. */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Mock estático da Porta com dados de exemplo. */
function PortaMock() {
  const fila = [
    { senha: 24, nome: 'João P.', status: 'Chegou' },
    { senha: 25, nome: 'Ana Lúcia', status: 'Chegou' },
    { senha: 26, nome: 'Carlos M.', status: 'A caminho' },
    { senha: 27, nome: 'Dona Rosa', status: 'Chegou' },
  ];
  return (
    <div
      aria-label="Exemplo da tela da Porta"
      role="img"
      className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141233] p-4 text-white shadow-2xl shadow-indigo-950/40"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DoorOpen className="size-4 text-amber-300" aria-hidden />
          <span className="text-sm font-semibold">Porta · Gira de Caboclos</span>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Aberta</span>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-center">
        <p className="text-[11px] uppercase tracking-widest text-indigo-100/80">Chamando agora</p>
        <p className="text-5xl font-black leading-none">23</p>
        <p className="mt-1 text-sm font-medium text-indigo-50">Maria da Silva</p>
      </div>
      <ul className="mt-3 divide-y divide-white/5">
        {fila.map((f) => (
          <li key={f.senha} className="flex items-center justify-between py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-7 rounded-md bg-white/10 text-center font-mono text-xs font-bold">{f.senha}</span>
              <span className="text-slate-100">{f.nome}</span>
            </span>
            <span className={cn('text-[11px] font-medium', f.status === 'Chegou' ? 'text-emerald-300' : 'text-slate-400')}>
              {f.status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-300">
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-base font-bold text-white">72</div>
          senhas
        </div>
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-base font-bold text-white">41</div>
          chegaram
        </div>
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-base font-bold text-white">23</div>
          atendidas
        </div>
      </div>
    </div>
  );
}

function planHref(plan: PlanDef): string {
  return plan.price === 0 ? '/cadastro' : `/cadastro?plan=${plan.key}`;
}

function PlanCard({ plan, index }: { plan: PlanDef; index: number }) {
  const highlight = plan.popular;
  return (
    <Reveal delay={index * 0.06} className="h-full">
      <div
        className={cn(
          'relative flex h-full flex-col rounded-2xl border p-6',
          highlight
            ? 'border-indigo-500 bg-gradient-to-br from-[#1e1b4b] to-[#312e81] text-white shadow-xl shadow-indigo-500/20'
            : 'border-slate-200 bg-white text-slate-900 shadow-sm',
        )}
      >
        {highlight && (
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 bg-amber-400 text-slate-900 hover:bg-amber-400">
            <Star className="size-3" aria-hidden /> Mais escolhido
          </Badge>
        )}
        <h3 className="text-lg font-extrabold">{plan.label}</h3>
        <p className={cn('mt-1 text-sm', highlight ? 'text-indigo-100' : 'text-slate-600')}>{plan.tagline}</p>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-4xl font-black leading-none">{formatPrice(plan.price)}</span>
          {plan.price > 0 && <span className={cn('text-sm', highlight ? 'text-indigo-200' : 'text-slate-500')}>/mês</span>}
        </div>
        <ul className="mt-5 flex flex-1 flex-col gap-2">
          {planHighlights(plan.key).map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className={cn('mt-0.5 size-4 shrink-0', highlight ? 'text-amber-300' : 'text-emerald-600')} aria-hidden />
              <span className={highlight ? 'text-indigo-50' : 'text-slate-700'}>{f}</span>
            </li>
          ))}
        </ul>
        <Button
          asChild
          size="lg"
          variant={highlight ? 'default' : 'outline'}
          className={cn(
            'mt-6 w-full font-bold',
            highlight
              ? 'bg-amber-400 text-slate-900 hover:bg-amber-500'
              : 'border-indigo-600 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800',
          )}
        >
          <Link href={planHref(plan)}>{plan.price === 0 ? 'Começar grátis' : `Assinar ${plan.label}`}</Link>
        </Button>
      </div>
    </Reveal>
  );
}

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GiraHub',
    applicationCategory: 'BusinessApplication',
    description:
      'Senha pelo WhatsApp e fila sem tumulto para giras de terreiros de umbanda e candomblé. Primeira gira no ar em 3 minutos.',
    operatingSystem: 'Web',
    offers: PLAN_LIST.map((p) => ({ '@type': 'Offer', name: p.label, price: String(p.price), priceCurrency: 'BRL' })),
  };

  return (
    <>
      <Head>
        <title>GiraHub — Senha pelo WhatsApp, fila sem tumulto</title>
        <meta
          name="description"
          content="Crie a gira, mande o link no WhatsApp e chame pela Porta. Sua primeira gira no ar em 3 minutos. Grátis para começar; 1 mês de Premium para novos terreiros."
        />
        <meta property="og:title" content="GiraHub — Senha pelo WhatsApp, fila sem tumulto" />
        <meta
          property="og:description"
          content="Crie a gira, mande o link no WhatsApp e chame pela Porta. Sua primeira gira no ar em 3 minutos."
        />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="GiraHub" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://girahub.com.br" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      {/* Links fora de componentes do kit ficam com o estilo do navegador (o reset de globals.css
          só vale dentro de [data-slot]); este reset tem especificidade 0,0,1 e perde para qualquer classe. */}
      <div className="min-h-screen bg-white text-slate-900 [scroll-behavior:smooth] motion-reduce:[scroll-behavior:auto] [:where(&)_a]:[color:inherit] [:where(&)_a]:[text-decoration:inherit]">
        {/* ── Cabeçalho ── */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0f0d2e]/95 text-white backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 rounded-md font-extrabold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-white/50">
              <Ticket className="size-6 text-amber-400" aria-hidden />
              <span className="text-lg">GiraHub</span>
            </Link>

            <nav aria-label="Seções" className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="rounded-md text-sm font-medium text-slate-300 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/50">
                  {n.label}
                </a>
              ))}
            </nav>

            <div className="hidden items-center gap-2 md:flex">
              <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild className="bg-amber-400 font-bold text-slate-900 hover:bg-amber-500">
                <Link href="/cadastro">Criar conta grátis</Link>
              </Button>
            </div>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white md:hidden" aria-label="Abrir menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-[#0f0d2e] text-white">
                <SheetHeader>
                  <SheetTitle className="text-white">Menu</SheetTitle>
                </SheetHeader>
                <nav aria-label="Seções" className="flex flex-col gap-1 px-4">
                  {NAV.map((n) => (
                    <a
                      key={n.href}
                      href={n.href}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-md px-2 py-3 text-base font-medium text-slate-200 outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/50"
                    >
                      {n.label}
                    </a>
                  ))}
                </nav>
                <div className="mt-auto flex flex-col gap-2 p-4">
                  <Button asChild variant="outline" size="touch" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                    <Link href="/login">Entrar</Link>
                  </Button>
                  <Button asChild size="touch" className="bg-amber-400 font-bold text-slate-900 hover:bg-amber-500">
                    <Link href="/cadastro">Criar conta grátis</Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main>
          {/* ── Hero ── */}
          <section id="hero" className="bg-[#0f0d2e] text-white">
            <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-2 md:pb-24 md:pt-20">
              <Reveal>
                <Badge className="mb-4 gap-1 bg-white/10 text-amber-200 hover:bg-white/10">
                  <Sparkles className="size-3" aria-hidden /> 1 mês de Premium grátis para novos terreiros
                </Badge>
                <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                  Senha pelo WhatsApp, fila sem tumulto.
                </h1>
                <p className="mt-4 max-w-xl text-lg text-slate-300 sm:text-xl">
                  Sua primeira gira no ar em 3 minutos. O consulente pega a senha no celular e você chama pela Porta.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="touch" className="bg-amber-400 text-base font-bold text-slate-900 hover:bg-amber-500">
                    <Link href="/cadastro">
                      Criar minha primeira gira <ChevronRight aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="touch" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                    <Link href="/login">Já tenho conta</Link>
                  </Button>
                </div>
                <p className="mt-4 text-sm text-slate-400">Sem cartão. Sem app para o consulente instalar.</p>
              </Reveal>
              <Reveal delay={0.1} className="flex justify-center md:justify-end">
                <PortaMock />
              </Reveal>
            </div>
          </section>

          {/* ── Como funciona ── */}
          <section id="como-funciona" className="scroll-mt-20 bg-slate-50 py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal className="mb-12 text-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Como funciona</p>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Três passos, nenhum papel</h2>
              </Reveal>
              <ol className="grid gap-6 md:grid-cols-3">
                {STEPS.map((s, i) => (
                  <li key={s.title}>
                    <Reveal delay={i * 0.08} className="h-full">
                      <Card className="h-full border-slate-200 shadow-sm">
                        <CardContent className="p-6">
                          <div className="mb-4 flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                              <s.icon className="size-5" aria-hidden />
                            </span>
                            <span className="text-sm font-bold text-indigo-600">Passo {i + 1}</span>
                          </div>
                          <h3 className="text-lg font-bold">{s.title}</h3>
                          <p className="mt-1.5 text-sm text-slate-600">{s.desc}</p>
                        </CardContent>
                      </Card>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ── Planos ── */}
          <section id="planos" className="scroll-mt-20 py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal className="mb-12 text-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Planos</p>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Comece grátis, cresça quando precisar</h2>
                <p className="mt-3 text-slate-600">Sem contrato. Cancele quando quiser. Novos terreiros testam o Premium por 1 mês, sem cartão.</p>
              </Reveal>
              <div className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {PLAN_LIST.map((p, i) => (
                  <PlanCard key={p.key} plan={p} index={i} />
                ))}
              </div>
            </div>
          </section>

          {/* ── E ainda tem ── */}
          <section id="modulos" className="scroll-mt-20 bg-slate-50 py-16 md:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6">
              <Reveal className="mb-8 text-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">E ainda tem</p>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Quando a senha estiver resolvida</h2>
                <p className="mt-3 text-slate-600">Cada módulo entra quando você quiser. Nada disso é obrigatório para a primeira gira.</p>
              </Reveal>
              <Reveal>
                <Accordion type="single" collapsible className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
                  {MODULES.map((m) => {
                    const min = minPlanFor(m.feature);
                    return (
                      <AccordionItem key={m.title} value={m.title}>
                        <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                          <span className="flex flex-1 items-center justify-between gap-3 pr-2">
                            {m.title}
                            <Badge variant="outline" className="shrink-0 font-medium text-slate-600">
                              a partir do {min.label}
                            </Badge>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="text-slate-600">{m.desc}</AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </Reveal>
            </div>
          </section>

          {/* ── Contato ── */}
          <section id="contato" className="scroll-mt-20 py-16 md:py-24">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
              <Reveal>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Contato</p>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ficou com dúvida?</h2>
                <p className="mt-3 text-slate-600">
                  {SUPPORT_WHATSAPP
                    ? 'Chame no WhatsApp — respondemos no mesmo dia.'
                    : 'Crie a conta grátis e fale com a gente pelo chat de suporte dentro do painel.'}
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  {SUPPORT_WHATSAPP && (
                    <Button asChild size="touch" className="bg-emerald-600 font-bold text-white hover:bg-emerald-700">
                      <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle aria-hidden /> Falar no WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button asChild size="touch" variant={SUPPORT_WHATSAPP ? 'outline' : 'default'} className="font-bold">
                    <Link href="/cadastro">Criar conta grátis</Link>
                  </Button>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ── CTA final ── */}
          <section className="bg-gradient-to-br from-indigo-700 to-violet-800 py-16 text-white">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
              <Reveal>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">A próxima gira já pode ter senha pelo WhatsApp.</h2>
                <p className="mt-3 text-indigo-100">Crie a conta, monte a gira e mande o link no grupo. Três minutos.</p>
                <Button asChild size="touch" className="mt-8 bg-amber-400 font-bold text-slate-900 hover:bg-amber-500">
                  <Link href="/cadastro">
                    Criar minha primeira gira <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </Reveal>
            </div>
          </section>
        </main>

        {/* ── Rodapé ── */}
        <footer className="border-t border-white/10 bg-[#0f0d2e] py-12 text-slate-400">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-white">
                <Ticket className="size-5 text-amber-400" aria-hidden />
                <span className="text-lg font-extrabold">GiraHub</span>
              </div>
              <p className="max-w-sm text-sm leading-relaxed">
                Senha pelo WhatsApp e fila sem tumulto para terreiros de umbanda e candomblé. Grátis para começar.
              </p>
            </div>
            <nav aria-label="Plataforma">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-300">Plataforma</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li><a href="#como-funciona" className="hover:text-white">Como funciona</a></li>
                <li><a href="#planos" className="hover:text-white">Planos</a></li>
                <li><Link href="/cadastro" className="hover:text-white">Criar conta</Link></li>
                <li><Link href="/login" className="hover:text-white">Entrar</Link></li>
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-300">Legal</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li><Link href="/privacidade" className="hover:text-white">Privacidade</Link></li>
                <li><Link href="/termos" className="hover:text-white">Termos de uso</Link></li>
              </ul>
            </nav>
          </div>
          <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-between gap-2 border-t border-white/10 px-4 pt-6 text-xs sm:px-6">
            <span>© {new Date().getFullYear()} GiraHub. Todos os direitos reservados.</span>
            <span>Feito para a comunidade dos terreiros</span>
          </div>
        </footer>
      </div>
    </>
  );
}
