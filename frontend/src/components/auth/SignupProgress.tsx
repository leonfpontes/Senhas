/**
 * SignupProgress — progresso do cadastro em passos: "Passo X de N · Rótulo" + barra segmentada
 * (sempre), e a lista dos passos embaixo a partir de `sm`, com os já concluídos clicáveis para
 * voltar. Cores da paleta terra (barro sobre branco, AA).
 */
import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SignupProgressProps {
  steps: ReadonlyArray<{ key: string; label: string }>;
  /** Índice (0-based) do passo atual. */
  active: number;
  /** Volta para um passo já concluído. */
  onStepClick?: (index: number) => void;
  className?: string;
}

export function SignupProgress({ steps, active, onStepClick, className }: SignupProgressProps) {
  const total = steps.length;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm text-tinta-suave" aria-live="polite">
        <span className="font-bold text-barro-700">
          Passo {active + 1} de {total}
        </span>
        <span aria-hidden> · </span>
        <span className="sr-only">: </span>
        <span className="font-medium text-tinta">{steps[active]?.label}</span>
      </p>

      <div
        role="progressbar"
        aria-label="Progresso do cadastro"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={active + 1}
        aria-valuetext={`Passo ${active + 1} de ${total}`}
        className="flex gap-1.5"
      >
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none',
              i <= active ? 'bg-barro-600' : 'bg-areia-200',
            )}
          />
        ))}
      </div>

      <ol aria-label="Passos do cadastro" className="hidden gap-1.5 sm:flex">
        {steps.map((s, i) => {
          const done = i < active;
          const current = i === active;
          const content = (
            <>
              {done && <Check className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{s.label}</span>
              <span className="sr-only">{done ? ', concluído' : current ? ', passo atual' : ', pendente'}</span>
            </>
          );
          return (
            <li key={s.key} aria-current={current ? 'step' : undefined} className="min-w-0 flex-1">
              {done && onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  className="flex min-h-8 max-w-full items-center gap-1 rounded-md text-xs font-semibold text-barro-700 underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {content}
                </button>
              ) : (
                <span
                  className={cn(
                    'flex min-h-8 items-center gap-1 text-xs',
                    current ? 'font-bold text-tinta' : 'text-tinta-suave',
                  )}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default SignupProgress;
