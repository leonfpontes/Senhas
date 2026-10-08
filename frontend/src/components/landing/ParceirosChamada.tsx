/**
 * Chamada do Programa de Parceiros na landing (C-06). Só aparece com a chave PARCEIROS_PUBLICADO
 * ligada — desligada, não renderiza nada (e nada aponta para /parceiros).
 */
import React from 'react';
import Link from 'next/link';
import { ChevronRight, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/landing/Reveal';
import { COMISSAO_PCT, DESCONTO_PCT, PARCEIROS_PATH, PARCEIROS_PUBLICADO } from '@/constants/parceiros';

export function ParceirosChamada() {
  if (!PARCEIROS_PUBLICADO) return null;
  return (
    <section aria-labelledby="parceiros-chamada-title" className="bg-areia-50 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="flex flex-col gap-6 rounded-3xl border border-areia-200 bg-white p-6 shadow-sm sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-barro-600 text-white">
              <HandCoins className="size-6" aria-hidden />
            </span>
            <div>
              <h2 id="parceiros-chamada-title" className="font-display text-2xl font-bold text-tinta">
                Tem loja de artigos religiosos ou fala com muitos terreiros?
              </h2>
              <p className="mt-2 text-tinta-suave">
                Seja parceiro do GiraHub: o terreiro ganha {DESCONTO_PCT}% de desconto com o seu cupom e você recebe{' '}
                {COMISSAO_PCT}% de comissão todo mês, por PIX.
              </p>
            </div>
          </div>
          <Button asChild size="touch" className="shrink-0 bg-barro-600 text-base font-bold text-white hover:bg-barro-700">
            <Link href={PARCEIROS_PATH}>
              Seja parceiro <ChevronRight aria-hidden />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

export default ParceirosChamada;
