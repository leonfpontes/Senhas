/**
 * "Para quem é" — deixa explícito o nicho (terreiros de Umbanda, Candomblé e casas de axé) e
 * quem usa o sistema dentro da casa. Fotos reais de corrente e congá.
 */
import React from 'react';
import { DoorOpen, HeartHandshake, Smartphone, type LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { AUDIENCE, TERREIRO_WORDS } from '@/constants/landingCopy';

const ICONS: LucideIcon[] = [HeartHandshake, DoorOpen, Smartphone];

export function AudienceSection() {
  return (
    <section id="para-quem" aria-labelledby="para-quem-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <SectionHeading
            id="para-quem-title"
            align="left"
            eyebrow="Para quem é"
            title="Feito para a rotina do terreiro, não para escritório"
          >
            O GiraHub nasceu dentro da gira. Fala a língua da casa e respeita o fundamento de cada uma — o sistema
            organiza, a espiritualidade continua com vocês.
          </SectionHeading>
          <Reveal delay={0.05}>
            <ul aria-label="Palavras do dia a dia da casa" className="mt-6 flex flex-wrap gap-2">
              {TERREIRO_WORDS.map((w) => (
                <li key={w} className="rounded-full border border-areia-300 bg-white px-3 py-1 text-sm font-medium text-tinta-suave">
                  {w}
                </li>
              ))}
            </ul>
          </Reveal>
          <ul className="mt-10 grid gap-5">
            {AUDIENCE.map((a, i) => {
              const Icon = ICONS[i];
              return (
                <li key={a.title}>
                  <Reveal delay={0.05 * (i + 1)} className="flex gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-barro-600 text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-tinta">
                        {a.title} <span className="font-normal text-tinta-suave">· {a.who}</span>
                      </h3>
                      <p className="mt-1 text-tinta-suave">{a.desc}</p>
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>

        <Reveal delay={0.1} className="relative">
          <Photo name="corrente" className="aspect-[4/3] w-full rounded-3xl shadow-xl shadow-cafe-900/15" />
          <figure className="absolute -bottom-8 -left-4 hidden w-48 overflow-hidden rounded-2xl border-4 border-areia-50 shadow-lg sm:block md:-left-10">
            <Photo name="conga" sizes="200px" className="aspect-[4/3] w-full" />
          </figure>
          <p className="mt-4 text-right text-sm text-tinta-suave sm:mt-3">
            Umbanda, Candomblé e demais casas de axé
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default AudienceSection;
