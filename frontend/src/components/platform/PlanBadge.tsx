/**
 * Badges de plano/status da plataforma — único lugar que desenha isso (dados em `planMeta.ts`).
 * A estrela é exclusiva do bônus.
 */
import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { planMeta, statusMeta, TENANT_ACTIVE_META } from './planMeta';

export function PlanBadge({ plan, bonus, className }: { plan: string | null | undefined; bonus?: boolean | null; className?: string }) {
  const meta = planMeta(plan);
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Badge variant="outline" className={cn('font-semibold', meta.badgeClass)}>
        {plan ? meta.label : '—'}
      </Badge>
      {bonus && <BonusStar />}
    </span>
  );
}

export function BonusStar({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex text-warning', className)} aria-label="Acesso bonificado" role="img">
          <Star className="size-3.5 fill-current" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>Acesso bonificado (sem cobrança)</TooltipContent>
    </Tooltip>
  );
}

export function SubscriptionStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge variant="outline" className={cn('font-semibold', meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  );
}

export function TenantActiveBadge({ active, className }: { active: boolean; className?: string }) {
  const meta = TENANT_ACTIVE_META[active ? 'active' : 'inactive'];
  return (
    <Badge variant="outline" className={cn('font-semibold', meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  );
}

/** Badge "soft" genérico com cor por token (`success | warning | info | destructive | muted | primary`). */
export type Tone = 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'primary';

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  info: 'border-transparent bg-info/15 text-info',
  destructive: 'border-transparent bg-destructive/10 text-destructive',
  muted: 'border-transparent bg-muted text-muted-foreground',
  primary: 'border-transparent bg-primary/15 text-primary',
};

export function ToneBadge({
  tone = 'muted',
  title,
  className,
  children,
}: {
  tone?: Tone;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <Badge variant="outline" className={cn('font-semibold', TONE_CLASS[tone], className)}>
      {children}
    </Badge>
  );
  if (!title) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
