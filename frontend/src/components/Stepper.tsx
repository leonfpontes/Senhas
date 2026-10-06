/**
 * Stepper — indicador de etapas para cadastro e fichas (horizontal; vertical com `orientation`).
 *
 *   <Stepper steps={[{ label: 'Dados' }, { label: 'Endereço' }, { label: 'Confirmação' }]} active={1} />
 *
 * Acessível: lista ordenada com `aria-current="step"` na etapa ativa e estado (concluída/atual/
 * pendente) anunciado para leitores de tela. `onStepClick` torna as etapas já concluídas clicáveis.
 */
import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperStep {
  label: string;
  description?: string;
  /** Marca a etapa como opcional no rótulo. */
  optional?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Índice (0-based) da etapa atual. */
  active: number;
  orientation?: 'horizontal' | 'vertical';
  /** Permite voltar para etapas concluídas. */
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, active, orientation = 'horizontal', onStepClick, className }: StepperProps) {
  const horizontal = orientation === 'horizontal';

  return (
    <ol
      data-slot="stepper"
      aria-label="Etapas"
      className={cn('flex', horizontal ? 'w-full items-start' : 'flex-col gap-4', className)}
    >
      {steps.map((step, index) => {
        const status = index < active ? 'complete' : index === active ? 'current' : 'upcoming';
        const clickable = Boolean(onStepClick) && status === 'complete';
        const statusLabel =
          status === 'complete' ? 'concluída' : status === 'current' ? 'etapa atual' : 'pendente';

        const marker = (
          <span
            aria-hidden
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
              status === 'complete' && 'border-primary bg-primary text-primary-foreground',
              status === 'current' && 'border-primary bg-background text-primary',
              status === 'upcoming' && 'border-border bg-background text-muted-foreground',
            )}
          >
            {status === 'complete' ? <Check className="size-4" /> : index + 1}
          </span>
        );

        const text = (
          <span className={cn('flex min-w-0 flex-col', horizontal ? 'items-center text-center' : 'items-start')}>
            <span
              className={cn(
                'text-sm font-medium',
                status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {step.label}
              {step.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>}
            </span>
            {step.description && <span className="text-xs text-muted-foreground">{step.description}</span>}
            <span className="sr-only">, {statusLabel}</span>
          </span>
        );

        return (
          <li
            key={index}
            data-status={status}
            aria-current={status === 'current' ? 'step' : undefined}
            className={cn('relative flex', horizontal ? 'flex-1 flex-col items-center gap-2' : 'items-start gap-3')}
          >
            {/* Conector até a próxima etapa */}
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute bg-border',
                  horizontal
                    ? 'top-4 left-[calc(50%+1.25rem)] h-0.5 w-[calc(100%-2.5rem)]'
                    : 'top-9 left-4 h-[calc(100%-1.75rem)] w-0.5 -translate-x-1/2',
                  index < active && 'bg-primary',
                )}
              />
            )}
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                className={cn(
                  'flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  horizontal ? 'flex-col items-center gap-2' : 'items-start gap-3',
                )}
              >
                {marker}
                {text}
              </button>
            ) : (
              <>
                {marker}
                {text}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
