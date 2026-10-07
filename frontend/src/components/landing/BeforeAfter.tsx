/** V-07 — antes × depois do GiraHub, com as perguntas que a casa faz toda gira. */
import React from 'react';
import { Check, X } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { AFTER, BEFORE, TERREIRO_QUESTIONS } from '@/constants/landingCopy';

export function BeforeAfter() {
  return (
    <section id="antes-depois" aria-labelledby="antes-depois-title" className="relative isolate overflow-hidden bg-cafe-900 py-20 text-white md:py-28">
      <Photo name="assistencia" decorative sizes="100vw" className="absolute inset-0 -z-20 h-full w-full opacity-30" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-cafe-900/90 via-cafe-900/95 to-cafe-900" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="antes-depois-title" eyebrow="Antes e depois" tone="dark" title="Da fila no portão à gira em paz">
          O que muda na primeira gira com senha pelo celular.
        </SectionHeading>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Reveal className="rounded-3xl border border-white/10 bg-cafe-950/60 p-7">
            <h3 className="mb-5 text-sm font-bold tracking-widest text-areia-300 uppercase">Sem o GiraHub</h3>
            <ul className="grid gap-4">
              {BEFORE.map((b) => (
                <li key={b} className="flex gap-3 text-areia-200">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <X className="size-3.5 text-areia-300" aria-hidden />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="rounded-3xl border border-ouro-300/30 bg-areia-50 p-7 text-tinta shadow-2xl shadow-cafe-950/40">
            <h3 className="mb-5 text-sm font-bold tracking-widest text-barro-700 uppercase">Com o GiraHub</h3>
            <ul className="grid gap-4">
              {AFTER.map((a) => (
                <li key={a} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-folha-600">
                    <Check className="size-3.5 text-white" aria-hidden />
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal className="mt-14">
          <h3 className="text-center font-display text-2xl font-bold text-white">As perguntas de toda gira, respondidas</h3>
          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            {TERREIRO_QUESTIONS.map((q) => (
              <div key={q.q} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <dt className="font-display text-lg font-bold text-ouro-300">“{q.q}”</dt>
                <dd className="mt-2 text-areia-200">{q.a}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

export default BeforeAfter;
