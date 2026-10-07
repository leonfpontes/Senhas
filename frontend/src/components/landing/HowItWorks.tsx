/** "Como funciona" em 3 passos, com a foto de quem pega a senha no celular. */
import React from 'react';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { STEPS } from '@/constants/landingCopy';

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20 bg-areia-100 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 md:grid-cols-[1fr_1.15fr]">
        <Reveal className="order-last md:order-first">
          <div className="relative mx-auto max-w-sm">
            <Photo name="consulenteCelular" sizes="(min-width: 900px) 30vw, 80vw" className="aspect-[4/5] w-full rounded-3xl shadow-xl shadow-cafe-900/15" />
            <p className="absolute -right-3 bottom-8 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-tinta shadow-lg sm:-right-8">
              <span className="block text-xs font-bold tracking-widest text-barro-700 uppercase">Senha confirmada</span>
              Nº 24 · Gira de Pretos Velhos
            </p>
          </div>
        </Reveal>

        <div>
          <SectionHeading id="como-funciona-title" align="left" eyebrow="Como funciona" title="Três passos, nenhum papel">
            Sua primeira gira no ar em poucos minutos.
          </SectionHeading>
          <ol className="mt-10 grid gap-7">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 0.08} className="flex gap-5">
                  <span
                    aria-hidden
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-barro-600 font-display text-xl font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-tinta">
                      <span className="sr-only">Passo {i + 1}: </span>
                      {s.title}
                    </h3>
                    <p className="mt-1.5 text-tinta-suave">{s.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
