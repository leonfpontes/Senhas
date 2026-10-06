import React from 'react';
import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: React.ReactNode;
  /** Linha secundária abaixo do título. */
  sub?: string;
  /** Conteúdo à direita (contador, botão). */
  actions?: React.ReactNode;
  className?: string;
}

/** Título de seção (h2) usado acima de listas e blocos da plataforma. */
export const SectionLabel: React.FC<SectionLabelProps> = ({ children, sub, actions, className }) => (
  <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h2 className="text-sm font-bold tracking-tight text-foreground">{children}</h2>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export default SectionLabel;
