/**
 * DataChip — caixinha de data da Agenda (dia grande + mês curto), no tom suave da cor do terreiro
 * (`bg-primary/10 text-brand`, par travado nos testes de contraste). Item que já aconteceu fica
 * neutro (`bg-muted`), sem opacidade (não perde contraste).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { diaMesBr } from './format';

export function DataChip({ iso, passado = false, className }: { iso: string; passado?: boolean; className?: string }) {
  const { dia, mes } = diaMesBr(iso);
  return (
    <span
      aria-hidden
      className={cn(
        'flex w-12 shrink-0 flex-col items-center justify-center self-start rounded-xl py-1.5',
        passado ? 'bg-muted text-foreground' : 'bg-primary/10 text-brand',
        className,
      )}
    >
      <b className="text-xl leading-none font-semibold tabular-nums">{dia}</b>
      <small className="mt-0.5 text-xs font-medium">{mes}</small>
    </span>
  );
}

export default DataChip;
