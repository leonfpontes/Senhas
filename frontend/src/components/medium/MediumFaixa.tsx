/**
 * MediumFaixa — faixa de abertura das telas da Área do Médium (Início "Olá, <nome>", Perfil,
 * escolha de área). Clara, no tom da landing: creme (`bg-muted` = areia-100 no `.medium-terra`)
 * com um véu leve da cor do terreiro, título em `text-foreground` (tinta, Fraunces na página),
 * apoio em `text-muted-foreground`, rótulo em `text-brand` e o fio da marca embaixo
 * (`from-primary to-ouro-400`). Antes era uma faixa café escura — o dono achou a Área "muito
 * escura" (out/2026). Tela nova da Área com faixa de abertura usa este componente, nunca
 * `bg-cafe-*` (o teste `__tests__/styles/colorUsage.test.ts` barra).
 *
 * Contraste: o véu é no máximo 8% da cor do terreiro sobre areia-100; tinta, tinta-suave e o
 * `text-brand` calculado por `applyTerraBrandText` são travados até 10% em
 * `__tests__/styles/marketingContrast.test.ts` (8 cores de terreiro difíceis).
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
      className={cn(
        'relative overflow-hidden bg-muted px-4 pt-6 pb-7 text-foreground',
        'bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_8%,var(--muted))_0%,var(--muted)_65%)]',
        className,
      )}
      {...rest}
    >
      {children}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary to-ouro-400"
      />
    </section>
  );
}

/** Rótulo pequeno em caixa-alta acima do título da faixa (cor do terreiro). */
export function MediumFaixaRotulo({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs font-extrabold tracking-[0.18em] text-brand uppercase', className)}
      {...rest}
    />
  );
}

export default MediumFaixa;
