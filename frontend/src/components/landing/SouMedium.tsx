/**
 * "Sou médium / Recebi um convite" (AM-24): explica, em linguagem de terreiro, que o acesso à Área
 * do Médium vem da casa — a direção manda o convite, o médium cria o login e depois só entra.
 * `SouMediumPassos` é o texto (reusado no /login); `SouMediumDialog` é o link do topo da landing.
 * Tudo atrás da chave `AREA_MEDIUM_DIVULGADA` (constants/areaMedium.ts) — quem usa confere a chave.
 */
import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { fraunces, MARKETING_RESET } from '@/components/landing/fonts';
import { SOU_MEDIUM_LABEL } from '@/constants/areaMedium';

export const SOU_MEDIUM_PASSOS: readonly string[] = [
  'A direção do seu terreiro manda o convite: um link, quase sempre pelo WhatsApp.',
  'Você abre o link no celular e cria o seu login, com e-mail e senha.',
  'Pronto: na Área do Médium você acompanha a agenda das giras, os avisos da casa, a sua mensalidade, a escala e a sua presença.',
];

/** Passos numerados + "ainda não recebeu?". `entrar` diz o que fazer quando já tem acesso. */
export function SouMediumPassos({ entrar }: { entrar: React.ReactNode }) {
  return (
    <div className="text-sm text-tinta">
      <p className="font-bold">O acesso à Área do Médium vem da sua casa.</p>
      <ol className="mt-3 grid gap-2">
        {SOU_MEDIUM_PASSOS.map((passo, i) => (
          <li key={passo} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-barro-700 text-xs font-bold text-white"
            >
              {i + 1}
            </span>
            <span className="text-tinta-suave">{passo}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-tinta-suave">
        Ainda não recebeu? Peça o convite à direção do seu terreiro — só a casa libera o acesso.
      </p>
      <div className="mt-2 text-tinta-suave">{entrar}</div>
    </div>
  );
}

/** Link do topo da landing: abre a explicação num diálogo, com o botão "Entrar". */
export function SouMediumDialog({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300/60',
            className,
          )}
        >
          <Users className="size-4 shrink-0" aria-hidden />
          {SOU_MEDIUM_LABEL}
        </button>
      </DialogTrigger>
      <DialogContent className={cn(fraunces.variable, MARKETING_RESET, 'border-areia-200 bg-areia-50 text-tinta sm:max-w-md')}>
        <DialogTitle className="pr-6 font-display text-2xl font-bold text-tinta">Sou médium: como eu entro?</DialogTitle>
        <DialogDescription className="text-tinta-suave">
          A Área do Médium é o espaço da corrente no GiraHub, direto no celular.
        </DialogDescription>
        <SouMediumPassos entrar="Já criou o seu login? É só entrar com o seu e-mail e senha." />
        <Button asChild size="touch" className="w-full bg-barro-600 font-bold text-white hover:bg-barro-700">
          <Link href="/login">Entrar</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
