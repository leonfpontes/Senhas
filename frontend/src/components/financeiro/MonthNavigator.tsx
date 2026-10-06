/**
 * MonthNavigator — navegador de mês de referência ("YYYY-MM") com setas, rótulo e atalho
 * para o mês atual. Usado nas telas de mensalidades (médiuns/associados e cursos).
 *
 *   <MonthNavigator value={mes} onChange={setMes} onRefresh={reload} refreshing={loading} />
 */
import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { addMonthsYm, currentMonthBr, monthLabelLong } from '@/lib/dateBr';

export interface MonthNavigatorProps {
  /** Mês de referência "YYYY-MM". */
  value: string;
  onChange: (ym: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Impede navegar para depois deste mês ("YYYY-MM"). */
  max?: string;
  className?: string;
}

export function MonthNavigator({ value, onChange, onRefresh, refreshing, max, className }: MonthNavigatorProps) {
  const current = currentMonthBr();
  const next = addMonthsYm(value, 1);
  const nextDisabled = max ? next > max : false;

  return (
    <div
      data-slot="month-navigator"
      className={cn('flex flex-wrap items-center gap-1 sm:gap-2', className)}
      role="group"
      aria-label="Mês de referência"
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Mês anterior"
        onClick={() => onChange(addMonthsYm(value, -1))}
      >
        <ChevronLeft />
      </Button>
      <span
        className="min-w-[9.5rem] text-center text-base font-semibold capitalize text-foreground"
        aria-live="polite"
      >
        {monthLabelLong(value)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Próximo mês"
        disabled={nextDisabled}
        onClick={() => onChange(next)}
      >
        <ChevronRight />
      </Button>
      {value !== current && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(current)}>
          Mês atual
        </Button>
      )}
      {onRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Atualizar"
          title="Atualizar"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
}

export default MonthNavigator;
