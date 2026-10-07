/**
 * V-03 — depoimentos reais de dirigentes (constants/testimonials.ts). Sem nenhum depoimento
 * autorizado, a seção não aparece: nunca preencher com texto inventado.
 */
import React from 'react';
import { Quote } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Reveal } from '@/components/landing/Reveal';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { TESTIMONIALS, instagramUrl, type Testimonial } from '@/constants/testimonials';

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Testimonials({ items = TESTIMONIALS }: { items?: readonly Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section id="depoimentos" aria-labelledby="depoimentos-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="depoimentos-title" eyebrow="Quem já usa" title="A palavra de quem cuida da casa" />
        {/* Celular: carrossel com rolagem lateral; a partir de md: grade. */}
        <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {items.map((t, i) => (
            <li key={`${t.nome}-${t.casa}`} className="w-[85%] shrink-0 snap-center md:w-auto">
              <Reveal delay={i * 0.06} className="flex h-full flex-col rounded-3xl border border-areia-200 bg-white p-7 shadow-sm">
                <Quote className="size-8 text-ouro-500" aria-hidden />
                <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-tinta">“{t.texto}”</blockquote>
                <div className="mt-6 flex items-center gap-3">
                  <Avatar className="size-12">
                    {t.foto && <AvatarImage src={t.foto} alt={`Foto de ${t.nome}`} className="object-cover" />}
                    <AvatarFallback className="bg-areia-200 font-bold text-barro-700">{initials(t.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <p className="font-bold text-tinta">{t.nome}</p>
                    <p className="text-tinta-suave">
                      {t.casa} · {t.cidade}/{t.uf}
                    </p>
                    {t.instagram && (
                      <a
                        href={instagramUrl(t.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-barro-700 hover:underline"
                      >
                        @{t.instagram.replace(/^@/, '')}
                      </a>
                    )}
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default Testimonials;
