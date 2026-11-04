/**
 * PageHeader — cabeçalho de página: título (h1), subtítulo e slot de ações.
 * Empilha no celular; título e ações lado a lado a partir de `sm` (600px).
 */
import React from 'react';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { cn } from '@/lib/utils';
import { ContaAbas, ehRotaDaConta } from './ContaAbas';

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

export const PageHeader: React.FC<PageHeaderProps> = (props) => {
  // Nas telas da conta (J10 v2), as abas da conta vêm logo abaixo do cabeçalho.
  // Sem o roteador montado (testes de componente), as abas não aparecem.
  const router = React.useContext(RouterContext);
  const daConta = ehRotaDaConta(router?.pathname ?? '');
  return (
    <>
      <Cabecalho {...props} eyebrow={props.eyebrow ?? (daConta ? 'Conta e plano' : undefined)} />
      {daConta && <ContaAbas />}
    </>
  );
};

const Cabecalho: React.FC<PageHeaderProps> = ({ title, subtitle, eyebrow, acento, actions, className }) => (
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
    {actions && (
      // Jornadas v2: os botões do cabeçalho em 44 px, semibold, com o ícone depois do texto
      // ("Grupos 👥", "Novo +"); botão só de ícone não muda.
      <div className="flex flex-wrap items-center gap-2 [&>[data-slot=button]:not([data-size^=icon])]:h-11 [&>[data-slot=button]:not([data-size^=icon])_svg]:order-last [&>[data-slot=button]:not([data-size^=icon])]:px-4 [&>[data-slot=button]:not([data-size^=icon])]:text-[0.9375rem] [&>[data-slot=button]:not([data-size^=icon])]:font-semibold">
        {actions}
      </div>
    )}
  </header>
);

export default PageHeader;
