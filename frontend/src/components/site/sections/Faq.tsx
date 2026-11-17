/**
 * Faq — perguntas frequentes em sanfona (beta "Novo construtor do site"). As respostas
 * ficam no HTML (`<details>`, sem JavaScript) e o site público leva o JSON-LD FAQPage,
 * por causa de SEO/GEO (decisão do dono, 04/11/2026).
 */
import React from 'react';
import Head from 'next/head';
import { ChevronDown } from 'lucide-react';
import type { SectionConfig, SectionContext } from '../types';
import { SectionShell } from './SectionShell';
import { InlineText } from './InlineText';
import { EmptyHint, TitleAndIntro, listOf, patchItem } from './shared';

interface Pergunta extends Record<string, unknown> {
  pergunta?: string;
  resposta?: string;
}

export function faqJsonLd(items: Pergunta[]): string | null {
  const validos = items.filter((p) => String(p.pergunta || '').trim() && String(p.resposta || '').trim());
  if (validos.length === 0) return null;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: validos.map((p) => ({
      '@type': 'Question',
      name: String(p.pergunta).trim(),
      acceptedAnswer: { '@type': 'Answer', text: String(p.resposta).trim() },
    })),
  }).replace(/</g, '\\u003c');
}

export function Faq({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const items = listOf<Pergunta>(config);
  const jsonLd = ctx.mode === 'public' ? faqJsonLd(items) : null;
  const set = (i: number, field: string) => (t: string) => ctx.edit?.patch(patchItem(config, i, field, t));

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Perguntas frequentes" data-section="faq">
      {jsonLd && (
        <Head>
          <script key="faq-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        </Head>
      )}
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Perguntas frequentes" />
      {items.length === 0 ? (
        <EmptyHint ctx={ctx}>Adicione perguntas no painel ao lado. Há sugestões prontas para começar.</EmptyHint>
      ) : (
        <div className="flex flex-col divide-y divide-[rgba(127,127,127,0.3)] border-y border-[rgba(127,127,127,0.3)]">
          {items.map((p, i) =>
            ctx.edit ? (
              <div key={i} className="py-4">
                <InlineText as="p" className="font-semibold" value={String(p.pergunta || '')} field="pergunta" edit={ctx.edit} placeholder="Pergunta" onText={set(i, 'pergunta')} />
                <InlineText as="p" multiline className="mt-2 leading-relaxed opacity-85" value={String(p.resposta || '')} field="resposta" edit={ctx.edit} placeholder="Resposta da casa" onText={set(i, 'resposta')} />
              </div>
            ) : (
              <details key={i} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {String(p.pergunta || '')}
                  <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="m-0 pb-4 leading-relaxed whitespace-pre-line opacity-85">{String(p.resposta || '')}</p>
              </details>
            ),
          )}
        </div>
      )}
    </SectionShell>
  );
}

export default Faq;
