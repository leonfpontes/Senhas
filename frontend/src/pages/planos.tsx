/**
 * /planos — planos e preços ($-03): cartões + comparativo completo, tudo gerado de
 * constants/plans.ts (fonte única, testada contra o backend). Página estática (sem fetch).
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { PlanCards } from '@/components/landing/PlanCards';
import { PlanComparisonTable } from '@/components/landing/PlanComparisonTable';
import { Manchete, Picote } from '@/components/landing/v2';
import { FaqSection } from '@/components/landing/FaqSection';
import { PLAN_LIST } from '@/constants/plans';
import { faqJsonLd } from '@/constants/landingFaq';
import { jsonLd } from '@/lib/jsonLd';

const TITLE = 'Planos e preços do GiraHub — sistema para terreiros';
const DESCRIPTION =
  'Compare os planos do GiraHub para terreiros de Umbanda e Candomblé. Plano Gratuito para sempre e 30 dias de Premium sem cartão para testar.';

export default function PlanosPage() {
  const offers = jsonLd({
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
        <meta name="theme-color" content="#FAF6EF" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <link rel="canonical" href="https://girahub.com.br/planos" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: offers }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      </Head>

      <MarketingShell>
        {/* Jornada 1 v2 · 03: manchete, os cartões que levam ao cadastro e a tabela honesta, sem selo de "Mais escolhido".
            Valores sempre de constants/plans.ts. O assistente de plano é proposta (beta da plataforma) e ainda não entra. */}
        <section aria-labelledby="planos-title" className="bg-areia-50 pt-10 pb-12 md:pt-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-end md:justify-between md:gap-12">
            <Manchete
              as="h1"
              id="planos-title"
              antes={
                <>
                  <span className="block">Pague pelo tamanho</span>{' '}
                  da casa, não por{' '}
                </>
              }
              acento="pessoa."
              className="text-4xl leading-[1.05] sm:text-6xl lg:text-[4.5rem]"
            />
            <p className="max-w-sm text-lg text-tinta-suave">
              Todos os planos têm usuários ilimitados. Toda casa nova começa com 30 dias do Premium, sem cartão, e escolhe depois.
            </p>
          </div>
        </section>

        <section aria-label="Planos" className="pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PlanCards />
          </div>
        </section>

        <section id="comparativo" aria-labelledby="comparativo-title" className="scroll-mt-20 pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Picote />
            <Manchete
              id="comparativo-title"
              antes="O que vem em cada "
              acento="plano."
              className="mt-10 text-3xl leading-tight sm:text-[3.25rem]"
            />
            <p className="mt-2 text-tinta-suave">Cada plano inclui tudo do anterior.</p>
            <div className="mt-10">
              <PlanComparisonTable />
            </div>
            <div className="mt-10 flex justify-center">
              <Button asChild size="touch" className="h-14 rounded-[10px] bg-cafe-950 px-6 text-base font-semibold text-areia-50 hover:bg-cafe-900">
                <Link href="/cadastro">
                  Começar com 30 dias grátis <ArrowRight aria-hidden />
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
