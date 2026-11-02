/**
 * Landing do GiraHub (V-08, out/2026): para terreiros de Umbanda, Candomblé e casas de axé.
 * Paleta "terra" + fotos reais de gira (constants/landingPhotos.ts) + serifa Fraunces nos títulos,
 * tudo dentro do MarketingShell (cabeçalho, rodapé, WhatsApp flutuante). A marca do GiraHub não muda.
 *
 * Ordem: topo → para quem é → antes × depois → como funciona → telas reais (V-05) → números (V-02)
 * → depoimentos (V-03, só com depoimento real) → planos (cartões + comparativo completo) → módulos
 * → dúvidas (V-04) → chamada do Programa de Parceiros (C-06, só com PARCEIROS_PUBLICADO) → chamada final.
 */
import React from 'react';
import Head from 'next/head';
import { AberturaV2, ComoFuncionaV2, DepoimentosV2, FechoV2, PerguntasV2 } from '@/components/landing/v2';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { ParceirosChamada } from '@/components/landing/ParceirosChamada';
import { faqJsonLd } from '@/constants/landingFaq';
import { PLAN_LIST } from '@/constants/plans';
import { jsonLd } from '@/lib/jsonLd';

const TITLE = 'GiraHub — Senha pelo WhatsApp para a gira do seu terreiro';
const DESCRIPTION =
  'Sistema para terreiros de Umbanda e Candomblé: o consulente pega a senha da gira pelo WhatsApp e a casa chama pela Porta, até na TV. Grátis para começar.';

function softwareJsonLd(): string {
  return jsonLd({
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
        <meta name="theme-color" content="#FAF6EF" />
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
        {/* Jornada 1 v2 (pen.dev 01 e 02): abertura, um sábado de gira, o resto da casa, depoimentos,
            perguntas abertas e o fecho. Planos ficam em /planos. */}
        <AberturaV2 />
        <ComoFuncionaV2 />
        <DepoimentosV2 />
        <PerguntasV2 />
        <ParceirosChamada />
        <FechoV2 />
      </MarketingShell>
    </>
  );
}
