/**
 * Topo da landing (V-08 + V-06): foto real de gira ao fundo, promessa clara para terreiros,
 * CTA principal e WhatsApp como CTA secundário (só com o número configurado).
 */
import React from 'react';
import Link from 'next/link';
import { Check, ChevronRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { BilheteMock } from '@/components/landing/BilheteMock';
import { HERO } from '@/constants/landingCopy';
import { supportWhatsappLink } from '@/lib/whatsapp';
import { trackEvent } from '@/services/analytics';

export function Hero({ whatsapp = supportWhatsappLink() }: { whatsapp?: string }) {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-cafe-950 text-white">
      <Photo
        name="giraVelas"
        priority
        decorative
        sizes="100vw"
        className="absolute inset-0 -z-20 h-full w-full object-[60%_center] opacity-90"
      />
      {/* Escurece da esquerda (onde fica o texto) para a direita, mantendo a foto visível. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-cafe-950 via-cafe-950/80 to-cafe-950/15" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-cafe-950/80 to-transparent" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.25fr_1fr] md:pt-24 md:pb-28">
        <Reveal>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-ouro-300/30 bg-cafe-900/70 px-3 py-1 text-sm font-semibold text-ouro-300">
            {HERO.eyebrow}
          </p>
          <h1 id="hero-title" className="font-display text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl md:text-6xl">
            {HERO.title}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-areia-100 sm:text-xl">{HERO.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="touch" className="bg-ouro-400 text-base font-bold text-cafe-950 hover:bg-ouro-300">
              <Link href="/cadastro">
                Criar minha primeira gira <ChevronRight aria-hidden />
              </Link>
            </Button>
            {whatsapp ? (
              <Button
                asChild
                variant="outline"
                size="touch"
                className="border-white/40 bg-cafe-950/40 text-white hover:bg-white/10 hover:text-white"
              >
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('whatsapp_click', { origem: 'hero' })}
                >
                  <MessageCircle aria-hidden /> Falar no WhatsApp
                </a>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                size="touch"
                className="border-white/40 bg-cafe-950/40 text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#como-funciona">Ver como funciona</a>
              </Button>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-areia-200">
            {HERO.proof.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="size-4 text-ouro-300" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.12} className="flex justify-center md:justify-end">
          <BilheteMock />
        </Reveal>
      </div>
    </section>
  );
}

export default Hero;
