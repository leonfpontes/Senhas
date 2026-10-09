/**
 * MediumFaixa — faixa de abertura de tela fora da casca da Área do Médium (escolha de área): fundo
 * de cartão (branco) com um fio embaixo, título em `text-foreground` e apoio em
 * `text-muted-foreground`. Sem gradiente, véu da marca nem rótulo em caixa-alta desde o redesenho
 * de out/2026 (o dono achou a Área "com cara de IA"); dentro da casca, as telas usam
 * `MediumPageHeader` (`./ui`). Nunca `bg-cafe-*` (o teste `__tests__/styles/colorUsage.test.ts` barra).
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface MediumFaixaProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function MediumFaixa({ className, children, ...rest }: MediumFaixaProps) {
  return (
    <section
      data-slot="medium-faixa"
      className={cn('border-b border-border bg-card px-4 pt-6 pb-7 text-foreground', className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export default MediumFaixa;
