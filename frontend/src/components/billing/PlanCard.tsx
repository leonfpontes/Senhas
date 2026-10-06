/**
 * PlanCard — card de um plano em /admin/billing: preço, lista curta e a ação certa para o
 * estado do terreiro (atual, em teste, recomendado). Dados de `constants/plans.ts`.
 */
import React from 'react';
import Link from 'next/link';
import { Check, Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PLAN_TEXT_CLASS, formatPrice, planHighlights, type PlanDef } from '@/constants/plans';

export type PlanCardState = 'current' | 'trial' | 'none';

export interface PlanCardAction {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'outline' | 'secondary';
}

export interface PlanCardProps {
  plan: PlanDef;
  state?: PlanCardState;
  recommended?: boolean;
  /** Destacado por `?plan=` na URL. */
  highlighted?: boolean;
  action?: PlanCardAction | null;
  /** Texto curto no lugar da ação (ex.: "Volte ao gratuito cancelando a assinatura"). */
  note?: React.ReactNode;
  className?: string;
  'data-tour'?: string;
}

export function PlanCard({ plan, state = 'none', recommended, highlighted, action, note, className, ...rest }: PlanCardProps) {
  const accent = plan.color;
  const emphasized = state === 'current' || state === 'trial' || highlighted;

  return (
    <Card
      data-tour={rest['data-tour']}
      data-plan={plan.key}
      data-highlighted={highlighted || undefined}
      className={cn(
        'relative flex h-full flex-col overflow-hidden border-2 py-0 transition-shadow',
        emphasized ? 'shadow-md' : 'border-border',
        highlighted && 'ring-2 ring-primary/40',
        className,
      )}
      style={emphasized ? { borderColor: accent } : undefined}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} aria-hidden />
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className={cn('text-lg font-extrabold', PLAN_TEXT_CLASS[plan.key])}>
            {plan.label}
          </h3>
          <div className="flex flex-wrap gap-1">
            {state === 'current' && <Badge variant="outline">Atual</Badge>}
            {state === 'trial' && <Badge variant="outline">Em teste</Badge>}
            {recommended && (
              <Badge className="gap-1">
                <Star className="size-3" aria-hidden /> Recomendado
              </Badge>
            )}
            {plan.popular && state === 'none' && !recommended && <Badge variant="secondary">Mais escolhido</Badge>}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{plan.tagline}</p>

        <div className="my-4 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold leading-none">{formatPrice(plan.price)}</span>
          {plan.price > 0 && <span className="text-sm text-muted-foreground">/mês</span>}
        </div>

        <ul className="mb-5 flex flex-1 flex-col gap-1.5">
          {planHighlights(plan.key).map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: accent }} aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {action ? (
          action.href ? (
            <Button asChild variant={action.variant ?? 'default'} className="w-full font-semibold" disabled={action.disabled}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button
              variant={action.variant ?? 'default'}
              className="w-full font-semibold"
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
            >
              {action.loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {action.label}
            </Button>
          )
        ) : note ? (
          <p className="text-center text-xs text-muted-foreground">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default PlanCard;
