/** Chamada final com foto real de gira ao fundo. */
import React from 'react';
import Link from 'next/link';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/landing/Reveal';
import { Photo } from '@/components/landing/Photo';
import { supportWhatsappLink } from '@/lib/whatsapp';

export function FinalCta({ whatsapp = supportWhatsappLink() }: { whatsapp?: string }) {
  return (
    <section aria-labelledby="cta-final-title" className="relative isolate overflow-hidden bg-cafe-950 py-24 text-white">
      <Photo
        name="maeDeSantoVela"
        decorative
        sizes="100vw"
        className="absolute inset-0 -z-20 h-full w-full object-[center_30%] opacity-60"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-cafe-950 via-cafe-950/80 to-cafe-950/60" />
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <h2 id="cta-final-title" className="font-display text-3xl leading-tight font-bold sm:text-5xl">
            A próxima gira da sua casa já pode ter senha pelo WhatsApp.
          </h2>
          <p className="mt-5 text-lg text-areia-100">Crie a conta, monte a gira e mande o link no grupo. Grátis para começar.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="touch" className="bg-ouro-400 text-base font-bold text-cafe-950 hover:bg-ouro-300">
              <Link href="/cadastro">
                Criar minha primeira gira <ChevronRight aria-hidden />
              </Link>
            </Button>
            {whatsapp && (
              <Button asChild size="touch" className="bg-folha-600 font-bold text-white hover:bg-folha-700">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden /> Tirar dúvidas no WhatsApp
                </a>
              </Button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCta;
