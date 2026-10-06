import React from 'react';
import { cn } from '@/lib/utils';

interface StatusDotProps {
  ok: boolean;
  label: string;
  className?: string;
}

/** Indicador de saúde (verde = ok, vermelho = erro) com rótulo. Cores dos tokens do tema. */
export const StatusDot: React.FC<StatusDotProps> = ({ ok, label, className }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground', className)}>
    <span
      aria-hidden
      className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-destructive')}
    />
    <span className="sr-only">{ok ? 'Operacional:' : 'Com problema:'}</span>
    {label}
  </span>
);

export default StatusDot;
