/**
 * EmptyState — estado vazio padrão (lista sem registros, filtro sem resultado).
 *
 *   <EmptyState icon={<Inbox />} title="Nenhum item" description="Cadastre o primeiro."
 *               action={<Button onClick={openCreate}>Novo item</Button>} />
 *
 * `compact` reduz o respiro para uso dentro de tabelas/cards pequenos.
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-muted text-muted-foreground',
            compact ? 'size-10 [&_svg]:size-5' : 'size-14 [&_svg]:size-7',
          )}
        >
          {icon}
        </span>
      )}
      <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      )}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
