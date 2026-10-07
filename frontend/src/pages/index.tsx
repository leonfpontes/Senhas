/**
 * Landing do GiraHub (V-08, out/2026): para terreiros de Umbanda, Candomblé e casas de axé.
 * Paleta "terra" + fotos reais de gira (constants/landingPhotos.ts) + serifa Fraunces nos títulos,
 * tudo dentro do MarketingShell (cabeçalho, rodapé, WhatsApp flutuante). A marca do GiraHub não muda.
 *
 * Ordem: topo → para quem é → antes × depois → como funciona → telas reais (V-05) → números (V-02)
 * → depoimentos (V-03, só com depoimento real) → planos → módulos → dúvidas (V-04) → chamada final.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { Hero } from '@/components/landing/Hero';
import { AudienceSection } from '@/components/landing/AudienceSection';
import { BeforeAfter } from '@/components/landing/BeforeAfter';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Testimonials } from '@/components/landing/Testimonials';
import { StatsBand } from '@/components/landing/StatsBand';
import { ScreensCarousel } from '@/components/landing/ScreensCarousel';
import { PlanCards } from '@/components/landing/PlanCards';
import { ModulesSection } from '@/components/landing/ModulesSection';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { faqJsonLd } from '@/constants/landingFaq';
import { PLAN_LIST } from '@/constants/plans';

const TITLE = 'GiraHub — Senha pelo WhatsApp para a gira do seu terreiro';
const DESCRIPTION =
  'Sistema para terreiros de Umbanda e Candomblé: o consulente pega a senha da gira pelo WhatsApp e a casa chama pela Porta, até na TV. Grátis para começar.';

function softwareJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GiraHub',
    applicationCategory: 'BusinessApplication',
    description: DESCRIPTION,
    operatingSystem: 'Web',
    audience: { '@type': 'Audience', audienceType: 'Terreiros de Umbanda, Candomblé e casas de axé' },
    offers: PLAN_LIST.map((p) => ({ '@type': 'Offer', name: p.label, price: String(p.price), priceCurrency: 'BRL' })),
  }).replace(/</g, '\\u003c');
}

export default function HomePage() {
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
        <meta property="og:site_name" content="GiraHub" />
        <meta property="og:image" content="https://girahub.com.br/landing/fotos/gira-velas.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://girahub.com.br" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: softwareJsonLd() }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      </Head>

      <MarketingShell>
        <Hero />
        <AudienceSection />
        <BeforeAfter />
        <HowItWorks />
        <ScreensCarousel />
        <StatsBand />
        <Testimonials />

        <section id="planos" aria-labelledby="planos-title" className="scroll-mt-20 bg-areia-100 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="planos-title" eyebrow="Planos" title="Comece grátis, cresça quando a casa pedir">
              Sem contrato e sem multa. Todo terreiro novo testa o Premium por 30 dias, sem cartão.
            </SectionHeading>
            <div className="mt-12">
              <PlanCards />
            </div>
            <p className="mt-10 text-center">
              <Link
                href="/planos"
                className="inline-flex items-center gap-2 font-semibold text-barro-700 underline-offset-4 hover:underline"
              >
                Comparar tudo o que vem em cada plano <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          </div>
        </section>

        <ModulesSection />
        <FaqSection />
        <FinalCta />
      </MarketingShell>
    </>
  );
}
