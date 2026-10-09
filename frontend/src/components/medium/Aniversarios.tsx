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
import { MediumList, MediumListItem, MediumSection } from './ui';

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

export function MeuAniversarioCard({ mensagem }: { mensagem: string }) {
  return (
    <article
      className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-xs"
      data-testid="meu-aniversario"
      aria-label="Feliz aniversário"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <PartyPopper className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand">Feliz aniversário!</p>
        <p className="mt-0.5 text-base leading-snug font-medium whitespace-pre-line">{mensagem}</p>
      </div>
    </article>
  );
}

export function AniversariantesDaSemana({ lista }: { lista: Aniversariante[] }) {
  if (!lista.length) return null;
  return (
    <MediumSection id="titulo-aniversariantes" title="Aniversariantes da semana" data-testid="aniversariantes-semana">
      <MediumList>
        {lista.map((a, i) => (
          <MediumListItem
            key={`${a.primeiro_nome}-${a.dia}-${a.mes}-${i}`}
            data-testid="aniversariante"
            icon={Cake}
            className="min-h-14 py-2.5"
            title={
              <span>
                {a.primeiro_nome}
                {a.sou_eu && <span className="font-normal text-muted-foreground"> (você)</span>}
              </span>
            }
            trailing={
              <span className={cn('text-sm tabular-nums', a.hoje ? 'font-semibold text-brand' : 'text-muted-foreground')}>
                {a.hoje ? 'Hoje' : diaMes(a.dia, a.mes)}
              </span>
            }
          />
        ))}
      </MediumList>
      <p className="px-1 text-sm text-muted-foreground">
        Só aparece quem escolheu mostrar o aniversário, no Perfil.
      </p>
    </MediumSection>
  );
}
