/**
 * CartaoClicavel — o padrão "clique para editar" em cartões e linhas de lista (decisão do Leonardo, 04/11/2026).
 *
 * O cartão (ou a linha da lista) que abre a gaveta de edição não tem lápis: clicar ou tocar em qualquer parte dele
 * abre a edição. As outras ações (arquivar, excluir, menu ⋮…) continuam como botões e não abrem a edição.
 *
 * Acessível sem botão dentro de botão: a edição é um <button> de verdade ("Editar G1") esticado por baixo de todo o
 * cartão (CamadaDeAbrir); o conteúdo fica por cima sem receber clique, menos os controles (botões, links, caixas),
 * que continuam clicáveis. Tab chega no "Editar", Enter e Espaço abrem, o foco é visível.
 *
 * Na web: cartão sobe levemente, com sombra suave e a borda na cor da casa; linha ganha fundo suave; cursor de mão.
 * Tudo por token. Sem `aoAbrir` (sem permissão de editar): elemento comum, sem clique e sem hover.
 */
import React from 'react';
import { cn } from '@/lib/utils';

/** O botão de abrir, esticado por baixo de todo o elemento (que precisa ser `relative`). */
export function CamadaDeAbrir({ rotulo, aoAbrir }: { rotulo: string; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      data-camada-de-abrir=""
      aria-label={rotulo}
      onClick={aoAbrir}
      className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

/**
 * Classes do elemento clicável: o conteúdo fica por cima da camada sem pegar o clique (vai para "Editar"), e os
 * controles dentro dele voltam a receber clique.
 */
export const CLASSE_CONTEUDO_SOBRE_A_CAMADA = cn(
  'relative',
  '[&>*:not([data-camada-de-abrir])]:pointer-events-none [&>*:not([data-camada-de-abrir])]:relative [&>*:not([data-camada-de-abrir])]:z-[1]',
  '[&_a]:pointer-events-auto [&_button:not([data-camada-de-abrir])]:pointer-events-auto [&_input]:pointer-events-auto [&_label]:pointer-events-auto [&_[role=checkbox]]:pointer-events-auto [&_[role=switch]]:pointer-events-auto',
);

const HOVER = {
  cartao:
    'cursor-pointer transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  linha: 'cursor-pointer hover:bg-muted/60 has-[[data-camada-de-abrir]:focus-visible]:bg-muted/60',
} as const;

export interface CartaoClicavelProps extends React.HTMLAttributes<HTMLElement> {
  /** Abre a edição. Sem ele, o elemento não é clicável (sem permissão de editar). */
  aoAbrir?: () => void;
  /** Nome do botão de edição, ex.: "Editar grupo G1". */
  rotulo?: string;
  /** `cartao` (padrão: moldura, sobe no hover) ou `linha` (item de lista: fundo suave no hover). */
  variante?: 'cartao' | 'linha';
  /** Elemento: `div` (padrão) ou `li`, para itens de lista. */
  as?: 'div' | 'li';
  children: React.ReactNode;
}

export function CartaoClicavel({ aoAbrir, rotulo, variante = 'cartao', as: Tag = 'div', className, children, ...rest }: CartaoClicavelProps) {
  const clicavel = Boolean(aoAbrir);
  return (
    <Tag
      data-slot="cartao-clicavel"
      {...rest}
      className={cn(
        variante === 'cartao' && 'rounded-xl border bg-card text-card-foreground',
        clicavel && [CLASSE_CONTEUDO_SOBRE_A_CAMADA, HOVER[variante]],
        className,
      )}
    >
      {clicavel && <CamadaDeAbrir rotulo={rotulo ?? 'Editar'} aoAbrir={aoAbrir!} />}
      {children}
    </Tag>
  );
}

export default CartaoClicavel;
