/**
 * DataChip — caixinha de data da Agenda (dia grande + mês curto), no tom suave da cor do terreiro
 * (`bg-primary/10 text-brand`, par travado nos testes de contraste). Item que já aconteceu fica
 * neutro (`bg-muted`), sem opacidade (não perde contraste).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { diaMesBr } from './format';

export function DataChip({ iso, passado = false, className }: { iso: string; passado?: boolean; className?: string }) {
  const { dia } = diaMesBr(iso);
  // J6 v2 · 03 (CartaoDeAgenda): o dia da semana em cima ("SÁB") e o dia com dois dígitos ("07").
  const d = new Date(iso);
  const semana = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return (
    <span
      aria-hidden
      className={cn(
        'flex w-12 shrink-0 flex-col items-center justify-center self-start rounded-xl py-1.5',
        passado ? 'bg-muted text-foreground' : 'bg-primary/10 text-brand',
        className,
      )}
    >
      <small className="text-[0.6875rem] font-semibold tracking-wide">{semana.toLocaleUpperCase('pt-BR')}</small>
      <b className="mt-0.5 font-display text-xl leading-none font-semibold tabular-nums">{String(dia).padStart(2, '0')}</b>
    </span>
  );
}

export default DataChip;
