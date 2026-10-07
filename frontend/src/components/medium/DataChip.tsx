/**
 * DataChip — caixinha de data da Agenda (dia grande + mês curto), na cor do terreiro
 * (`bg-primary`/`text-primary-foreground`, contraste calculado pelo `applyBrand`). Item que já
 * aconteceu fica neutro (`bg-muted`), sem opacidade (não perde contraste).
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
        'flex w-14 shrink-0 flex-col items-center rounded-2xl py-1.5',
        passado ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <b className="font-display text-2xl leading-none">{dia}</b>
      <small className="text-xs font-extrabold tracking-wider uppercase">{mes}</small>
    </span>
  );
}

export default DataChip;
