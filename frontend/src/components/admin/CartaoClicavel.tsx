/**
 * CartaoClicavel — o padrão "clique para editar" em cartões (decisão do Leonardo, 04/11/2026).
 *
 * O cartão que abre a gaveta de edição não tem lápis: clicar (ou tocar) em qualquer parte dele abre a edição.
 * Na web, hover com a borda na cor da casa, o cartão sobe levemente com sombra suave e o cursor vira mão (só por
 * token). Acessível: recebe foco (Tab), Enter e Espaço abrem, foco visível, e o nome é o `rotulo` ("Editar G1").
 * As outras ações do cartão (arquivar, excluir…) continuam como botões: clique nelas não abre a edição.
 * Sem `aoAbrir` (sem permissão de editar), é um cartão comum, sem clique e sem hover.
 *
 * Mesma regra da linha clicável do DataTable (`onRowClick` + `rowLabel`).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { cliqueEmControle } from '@/components/admin/DataTable';

export interface CartaoClicavelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Abre a edição. Sem ele, o cartão não é clicável (sem permissão de editar). */
  aoAbrir?: () => void;
  /** Nome acessível do cartão clicável, ex.: "Editar grupo G1". */
  rotulo?: string;
  children: React.ReactNode;
}

export function CartaoClicavel({ aoAbrir, rotulo, className, children, ...rest }: CartaoClicavelProps) {
  const clicavel = Boolean(aoAbrir);
  return (
    <div
      data-slot="cartao-clicavel"
      {...rest}
      {...(clicavel
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': rotulo,
            onClick: (e: React.MouseEvent<HTMLDivElement>) => {
              if (!cliqueEmControle(e)) aoAbrir?.();
            },
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                aoAbrir?.();
              }
            },
          }
        : {})}
      className={cn(
        'rounded-xl border bg-card text-card-foreground',
        clicavel &&
          'cursor-pointer outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default CartaoClicavel;
