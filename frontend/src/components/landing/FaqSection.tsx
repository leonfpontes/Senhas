/** V-04 — dúvidas frequentes. O JSON-LD FAQPage sai da mesma constante (landingFaq.ts). */
import React from 'react';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Reveal } from '@/components/landing/Reveal';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { LANDING_FAQ } from '@/constants/landingFaq';

export function FaqSection() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-20 bg-areia-100 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading id="duvidas-title" eyebrow="Dúvidas" title="Perguntas que todo terreiro faz">
          Não achou a sua? Fale com a gente — respondemos rápido.
        </SectionHeading>
        <Reveal className="mt-12">
          <Accordion type="single" collapsible className="rounded-3xl border border-areia-200 bg-white px-5 shadow-sm">
            {LANDING_FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-areia-200">
                <AccordionTrigger className="text-left text-base font-semibold text-tinta hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-tinta-suave">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-6 text-center text-sm text-tinta-suave">
            Leia também a{' '}
            <Link href="/privacidade" className="font-semibold text-barro-700 underline underline-offset-2">
              Política de Privacidade
            </Link>{' '}
            e os{' '}
            <Link href="/termos" className="font-semibold text-barro-700 underline underline-offset-2">
              Termos de uso
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default FaqSection;
