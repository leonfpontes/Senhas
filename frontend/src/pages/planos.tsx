/**
 * /planos — planos e preços ($-03): cartões + comparativo completo, tudo gerado de
 * constants/plans.ts (fonte única, testada contra o backend). Página estática (sem fetch).
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight, Gift, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { PlanCards } from '@/components/landing/PlanCards';
import { PlanComparisonTable } from '@/components/landing/PlanComparisonTable';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { FaqSection } from '@/components/landing/FaqSection';
import { Reveal } from '@/components/landing/Reveal';
import { PLAN_LIST } from '@/constants/plans';
import { faqJsonLd } from '@/constants/landingFaq';

const TITLE = 'Planos e preços do GiraHub — sistema para terreiros';
const DESCRIPTION =
  'Compare os planos do GiraHub para terreiros de Umbanda e Candomblé. Plano Gratuito para sempre e 30 dias de Premium sem cartão para testar.';

const PROMISES = [
  { icon: Gift, title: 'Plano Gratuito de verdade', desc: 'Senha pelo WhatsApp e Porta sem pagar nada, sem prazo para acabar.' },
  { icon: ShieldCheck, title: '30 dias de Premium', desc: 'Todo terreiro novo testa tudo liberado, sem cartão de crédito.' },
  { icon: Smartphone, title: 'Sem fidelidade', desc: 'Mude de plano ou cancele quando quiser, direto pelo painel.' },
];

export default function PlanosPage() {
  const offers = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'GiraHub',
    description: DESCRIPTION,
    offers: PLAN_LIST.map((p) => ({ '@type': 'Offer', name: p.label, price: String(p.price), priceCurrency: 'BRL' })),
  }).replace(/</g, '\\u003c');

  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content="#180e09" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <link rel="canonical" href="https://girahub.com.br/planos" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: offers }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      </Head>

      <MarketingShell>
        <section aria-labelledby="planos-title" className="bg-cafe-950 pt-16 pb-28 text-white md:pt-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Reveal>
              <p className="mb-4 text-xs font-bold tracking-[0.2em] text-ouro-300 uppercase">Planos e preços</p>
              <h1 id="planos-title" className="font-display text-4xl leading-tight font-bold sm:text-5xl">
                Comece grátis. Cresça quando a casa pedir.
              </h1>
              <p className="mt-5 text-lg text-areia-200">
                Um plano para cada momento do terreiro — da primeira gira com senha pelo celular até a casa inteira organizada.
              </p>
            </Reveal>
          </div>
        </section>

        <section aria-label="Planos" className="-mt-20 pb-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PlanCards />
            <ul className="mt-12 grid gap-6 sm:grid-cols-3">
              {PROMISES.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-barro-600 text-white">
                    <p.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-bold text-tinta">{p.title}</span>
                    <span className="text-sm text-tinta-suave">{p.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="comparativo" aria-labelledby="comparativo-title" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="comparativo-title" eyebrow="Comparativo" title="Tudo o que vem em cada plano">
              Cada plano inclui tudo do anterior.
            </SectionHeading>
            <div className="mt-12">
              <PlanComparisonTable />
            </div>
            <div className="mt-10 flex justify-center">
              <Button asChild size="touch" className="bg-barro-600 text-base font-bold text-white hover:bg-barro-700">
                <Link href="/cadastro">
                  Começar grátis <ChevronRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <FaqSection />
      </MarketingShell>
    </>
  );
}
