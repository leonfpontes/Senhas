/**
 * PasswordRules — a regra de senha visível antes de digitar, com cada item marcado conforme
 * a pessoa escreve. Mesma regra do backend (`constants/passwordPolicy.ts`).
 */
import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PASSWORD_RULES } from '@/constants/passwordPolicy';

export interface PasswordRulesProps {
  value: string;
  className?: string;
}

export function PasswordRules({ value, className }: PasswordRulesProps) {
  return (
    <ul aria-label="Regras da senha" className={cn('grid gap-1 text-xs sm:grid-cols-2', className)}>
      {PASSWORD_RULES.map((rule) => {
        const ok = value.length > 0 && rule.test(value);
        return (
          <li
            key={rule.key}
            data-ok={ok || undefined}
            className={cn('flex items-center gap-1.5', ok ? 'text-success' : 'text-muted-foreground')}
          >
            {ok ? <Check className="size-3.5 shrink-0" aria-hidden /> : <Circle className="size-3 shrink-0" aria-hidden />}
            <span>
              {rule.label}
              {ok && <span className="sr-only"> — ok</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default PasswordRules;
