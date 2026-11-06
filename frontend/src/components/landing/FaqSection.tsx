/**
 * V-04 — dúvidas frequentes. O JSON-LD FAQPage sai da mesma lista (`visibleFaq`, landingFaq.ts).
 *
 * J1 v2 · 21 (decisão do Leonardo, 04/11/2026, por SEO e GEO): sanfona com +/−, a primeira aberta.
 * Feita com `details`/`summary`: as respostas estão no HTML desde o carregamento (buscadores e IAs
 * leem tudo, nada é buscado ao clicar), o teclado e o leitor de tela já sabem usar, e funciona
 * sem JavaScript.
 */
import React from 'react';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { visibleFaq } from '@/constants/landingFaq';

export function FaqSection() {
  const itens = visibleFaq();
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-20 bg-areia-100 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] md:gap-16">
        <SectionHeading id="duvidas-title" align="left" eyebrow="Dúvidas" title="Perguntas que todo terreiro faz">
          Não achou a sua? Fale com a gente — respondemos rápido.
        </SectionHeading>
        <Reveal>
          <div className="border-b border-areia-300">
            {itens.map((f, i) => (
              <details key={f.q} open={i === 0} className="group border-t border-areia-300">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[1.0625rem] font-semibold text-tinta outline-none focus-visible:ring-[3px] focus-visible:ring-barro-600/40 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus className="size-5 shrink-0 text-tinta-suave group-open:hidden" aria-hidden />
                  <Minus className="hidden size-5 shrink-0 text-tinta-suave group-open:block" aria-hidden />
                </summary>
                <p className="m-0 pb-5 text-base leading-relaxed text-tinta-suave">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-tinta-suave">
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
