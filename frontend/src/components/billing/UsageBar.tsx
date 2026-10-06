/**
 * UsageBar — "7 / 10" com barra; sem barra quando o limite é ilimitado.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { isUnlimited } from '@/constants/plans';

export interface UsageBarProps {
  label: string;
  current: number;
  max: number;
  className?: string;
}

export function UsageBar({ label, current, max, className }: UsageBarProps) {
  const unlimited = isUnlimited(max);
  const pct = unlimited || max <= 0 ? 0 : Math.min((current / max) * 100, 100);
  const tone = pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-warning' : 'text-foreground';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn('font-mono text-xs font-bold', unlimited ? 'text-muted-foreground' : tone)}>
          {unlimited ? `${current} / sem limite` : `${current} / ${max}`}
        </span>
      </div>
      {!unlimited && (
        <Progress
          value={pct}
          aria-label={`${label}: ${current} de ${max}`}
          className={cn('h-1.5', pct >= 90 && '[&>[data-slot=progress-indicator]]:bg-destructive', pct >= 70 && pct < 90 && '[&>[data-slot=progress-indicator]]:bg-warning')}
        />
      )}
    </div>
  );
}

export default UsageBar;
