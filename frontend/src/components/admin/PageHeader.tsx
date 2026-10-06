/**
 * PageHeader — cabeçalho de página: título (h1), subtítulo e slot de ações.
 * Empilha no celular; título e ações lado a lado a partir de `sm` (600px).
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  actions?:  React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className }) => (
  <header
    data-slot="page-header"
    className={cn(
      'mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center',
      className,
    )}
  >
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default PageHeader;
