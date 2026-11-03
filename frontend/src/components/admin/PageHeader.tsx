/**
 * PageHeader — cabeçalho de página: título (h1), subtítulo e slot de ações.
 * Empilha no celular; título e ações lado a lado a partir de `sm` (600px).
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  /** Rótulo pequeno acima do título (J5–J14 v2: "Corrente", "Casa · plano Pro"…), sem caixa-alta. */
  eyebrow?:  React.ReactNode;
  /** Palavra em itálico barro depois do título ("86 pessoas *atendidas.*", jornadas v2). */
  acento?:   string;
  actions?:  React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, eyebrow, acento, actions, className }) => (
  <header
    data-slot="page-header"
    className={cn(
      'mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end',
      className,
    )}
  >
    <div className="min-w-0">
      {eyebrow && <p className="mb-1.5 text-[0.9375rem] font-medium text-muted-foreground">{eyebrow}</p>}
      <h1 className="font-display text-[2rem] leading-tight font-normal tracking-[-0.02em] text-foreground sm:text-[3rem]">
        {title}
        {acento && (
          <>
            {' '}
            <em className="text-[color:var(--color-barro-600)]">{acento}</em>
          </>
        )}
      </h1>
      {subtitle && <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default PageHeader;
