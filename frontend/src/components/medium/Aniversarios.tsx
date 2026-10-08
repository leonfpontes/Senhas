/**
 * Aniversários no Início da Área (AM-20).
 *
 * - `MeuAniversarioCard`: no dia do aniversário do médium, a mensagem da casa (só ele vê; não
 *   depende do opt-in). O texto vem pronto do servidor (`meu_aniversario.mensagem`).
 * - `AniversariantesDaSemana`: quem aceitou mostrar ("Mostrar meu aniversário para a corrente",
 *   no Perfil) e faz aniversário nesta semana (segunda a domingo). Só primeiro nome, dia e mês —
 *   o servidor nunca manda o ano. Lista vazia → o cartão some.
 */
import React from 'react';
import { Cake, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Aniversariante {
  primeiro_nome: string;
  dia: number;
  mes: number;
  hoje: boolean;
  sou_eu: boolean;
}

/** 12 e 10 → "12/10". */
export function diaMes(dia: number, mes: number): string {
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

const SECTION_TITLE = 'text-xs font-extrabold tracking-[0.16em] text-brand uppercase';

export function MeuAniversarioCard({ mensagem }: { mensagem: string }) {
  return (
    <article
      className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 shadow-sm"
      data-testid="meu-aniversario"
      aria-label="Feliz aniversário"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <PartyPopper className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold tracking-[0.16em] text-brand uppercase">Feliz aniversário!</p>
        <p className="mt-1 font-display text-lg leading-snug font-semibold whitespace-pre-line">{mensagem}</p>
      </div>
    </article>
  );
}

export function AniversariantesDaSemana({ lista }: { lista: Aniversariante[] }) {
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="titulo-aniversariantes" data-testid="aniversariantes-semana">
      <h2 id="titulo-aniversariantes" className={SECTION_TITLE}>
        Aniversariantes da semana
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        {lista.map((a, i) => (
          <li
            key={`${a.primeiro_nome}-${a.dia}-${a.mes}-${i}`}
            className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
            data-testid="aniversariante"
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl',
                a.hoje ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-brand',
              )}
            >
              <Cake className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-base font-bold">
              {a.primeiro_nome}
              {a.sou_eu && <span className="font-normal text-muted-foreground"> (você)</span>}
            </span>
            <span className={cn('text-sm tabular-nums', a.hoje ? 'font-bold text-brand' : 'text-muted-foreground')}>
              {a.hoje ? 'Hoje' : diaMes(a.dia, a.mes)}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-1 text-sm text-muted-foreground">
        Só aparece quem escolheu mostrar o aniversário, no Perfil.
      </p>
    </section>
  );
}
