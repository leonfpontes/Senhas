/**
 * ChoiceCards — escolha única em cartões do mesmo tamanho (radio-card), no lugar de "pílulas" de
 * larguras diferentes. Semântica de `radiogroup` do Radix (setas trocam a opção, Tab entra e sai do
 * grupo), cartão inteiro clicável, alvo ≥ 56px, estado escolhido com borda, fundo e marcador em
 * barro (AA sobre o branco). Grade: 1 coluna no celular e 2 a partir de `sm` (`columns="2"` deixa
 * 2 colunas sempre — para rótulos curtos). Todas as linhas com a mesma altura (`auto-rows-fr`).
 */
import React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChoiceCardOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export interface ChoiceCardsProps {
  /** Pergunta (legenda do grupo). */
  label: string;
  options: ReadonlyArray<ChoiceCardOption>;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  columns?: 'responsive' | '2';
  /** Recebe um objeto com `focus()` (para o react-hook-form levar o foco ao grupo com erro). */
  focusRef?: (instance: { focus: () => void } | null) => void;
  required?: boolean;
  className?: string;
}

export function ChoiceCards({
  label,
  options,
  value,
  onChange,
  error,
  columns = 'responsive',
  focusRef,
  required,
  className,
}: ChoiceCardsProps) {
  const id = React.useId();
  const labelId = `${id}-rotulo`;
  const errorId = `${id}-erro`;

  const setRoot = React.useCallback(
    (el: HTMLDivElement | null) => {
      focusRef?.(
        el
          ? {
              focus: () =>
                (el.querySelector<HTMLElement>('[data-state="checked"]') ?? el.querySelector<HTMLElement>('button'))?.focus(),
            }
          : null,
      );
    },
    [focusRef],
  );

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <p id={labelId} className={cn('text-sm font-semibold', error ? 'text-destructive' : 'text-tinta')}>
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-destructive">
            *
          </span>
        )}
      </p>
      <RadioGroupPrimitive.Root
        ref={setRoot}
        value={value || ''}
        onValueChange={onChange}
        aria-labelledby={labelId}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn('grid auto-rows-fr gap-2.5', columns === '2' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}
      >
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <RadioGroupPrimitive.Item
              key={o.value}
              value={o.value}
              className={cn(
                'group flex h-full min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left text-sm text-tinta outline-none transition-colors',
                'border-areia-300 hover:border-barro-500 hover:bg-areia-50',
                'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'data-[state=checked]:border-barro-600 data-[state=checked]:bg-barro-600/10 data-[state=checked]:font-semibold data-[state=checked]:text-barro-700',
                error && 'border-destructive/60',
              )}
            >
              {Icon && (
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-areia-100 text-barro-700 transition-colors group-data-[state=checked]:bg-barro-600 group-data-[state=checked]:text-white"
                >
                  <Icon className="size-4.5" />
                </span>
              )}
              <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-areia-300 bg-white transition-colors group-data-[state=checked]:border-barro-600"
              >
                <span className="size-2.5 scale-0 rounded-full bg-barro-600 transition-transform group-data-[state=checked]:scale-100 motion-reduce:transition-none" />
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default ChoiceCards;
