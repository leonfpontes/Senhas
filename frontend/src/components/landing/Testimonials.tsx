/**
 * V-03 — depoimentos reais de dirigentes (constants/testimonials.ts). Sem nenhum depoimento
 * autorizado, a seção não aparece: nunca preencher com texto inventado.
 * Um depoimento só → destaque (foto grande + citação); dois ou mais → carrossel/grade.
 */
import React from 'react';
import Image from 'next/image';
import { Quote } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Reveal } from '@/components/landing/Reveal';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { TESTIMONIALS, instagramUrl, testimonialPlace, type Testimonial } from '@/constants/testimonials';

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function Author({ t, avatar = true }: { t: Testimonial; avatar?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {avatar && (
        <Avatar className="size-12">
          {t.foto && <AvatarImage src={t.foto} alt={`Foto de ${t.nome}`} className="object-cover" />}
          <AvatarFallback className="bg-areia-200 font-bold text-barro-700">{initials(t.nome)}</AvatarFallback>
        </Avatar>
      )}
      <div className="text-sm">
        <p className="font-bold text-tinta">{t.nome}</p>
        <p className="text-tinta-suave">{testimonialPlace(t)}</p>
        {t.instagram && (
          <a href={instagramUrl(t.instagram)} target="_blank" rel="noopener noreferrer" className="font-semibold text-barro-700 hover:underline">
            @{t.instagram.replace(/^@/, '')}
          </a>
        )}
      </div>
    </div>
  );
}

function Featured({ t }: { t: Testimonial }) {
  return (
    <Reveal className="mx-auto mt-12 grid max-w-5xl items-center gap-8 overflow-hidden rounded-3xl border border-areia-200 bg-white shadow-sm md:grid-cols-[2fr_3fr]">
      {t.foto ? (
        <Image
          src={t.foto}
          alt={`Foto de ${t.nome}`}
          width={720}
          height={960}
          unoptimized
          className="h-full max-h-[28rem] w-full object-cover object-top md:max-h-none"
        />
      ) : (
        <div aria-hidden className="flex h-full min-h-48 items-center justify-center bg-areia-100">
          <span className="font-display text-6xl font-bold text-barro-700">{initials(t.nome)}</span>
        </div>
      )}
      <figure className="p-7 md:p-10 md:pl-0">
        <Quote className="size-10 text-ouro-500" aria-hidden />
        <blockquote className="mt-4 text-lg leading-relaxed text-tinta sm:text-xl">“{t.texto}”</blockquote>
        <figcaption className="mt-6">
          <Author t={t} avatar={false} />
        </figcaption>
      </figure>
    </Reveal>
  );
}

export function Testimonials({ items = TESTIMONIALS }: { items?: readonly Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section id="depoimentos" aria-labelledby="depoimentos-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="depoimentos-title" eyebrow="Quem já usa" title="A palavra de quem cuida da casa" />
        {items.length === 1 ? (
          <Featured t={items[0]!} />
        ) : (
          // Celular: carrossel com rolagem lateral; a partir de md: grade.
          <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {items.map((t, i) => (
              <li key={`${t.nome}-${t.casa}`} className="w-[85%] shrink-0 snap-center md:w-auto">
                <Reveal delay={i * 0.06} className="flex h-full flex-col rounded-3xl border border-areia-200 bg-white p-7 shadow-sm">
                  <Quote className="size-8 text-ouro-500" aria-hidden />
                  <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-tinta">“{t.texto}”</blockquote>
                  <div className="mt-6">
                    <Author t={t} />
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default Testimonials;
