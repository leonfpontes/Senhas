/** "E ainda tem" — módulos da casa além da senha, com o plano mínimo vindo de constants/plans.ts. */
import React from 'react';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { MODULES } from '@/constants/landingCopy';
import { minPlanPhrase } from '@/constants/plans';

export function ModulesSection() {
  return (
    <section id="modulos" aria-labelledby="modulos-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="modulos-title" eyebrow="E ainda tem" title="Quando a senha estiver resolvida, a casa inteira cabe aqui">
          Cada módulo entra quando você quiser. Nada disso é obrigatório para a primeira gira.
        </SectionHeading>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <li key={m.title}>
              <Reveal delay={(i % 3) * 0.06} className="group h-full overflow-hidden rounded-3xl border border-areia-200 bg-white shadow-sm">
                <div className="overflow-hidden">
                  <Photo
                    name={m.photo}
                    decorative
                    sizes="(min-width: 1200px) 380px, (min-width: 600px) 50vw, 100vw"
                    className="aspect-[16/10] w-full transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>
                <div className="p-6">
                  <p className="mb-2 inline-block rounded-full bg-areia-100 px-2.5 py-0.5 text-xs font-semibold text-barro-700">
                    {minPlanPhrase(m.feature)}
                  </p>
                  <h3 className="text-lg font-bold text-tinta">{m.title}</h3>
                  <p className="mt-1.5 text-tinta-suave">{m.desc}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default ModulesSection;
