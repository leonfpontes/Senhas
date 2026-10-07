/** Cartões de plano das páginas de marketing (landing e /planos), gerados de constants/plans.ts. */
import React from 'react';
import Link from 'next/link';
import { Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/landing/Reveal';
import { PLAN_LIST, formatPrice, planHighlights, type PlanDef } from '@/constants/plans';

export function planSignupHref(plan: PlanDef): string {
  return plan.price === 0 ? '/cadastro' : `/cadastro?plan=${plan.key}`;
}

function PlanCard({ plan, index }: { plan: PlanDef; index: number }) {
  const highlight = plan.popular;
  return (
    <Reveal delay={index * 0.06} className="h-full">
      <div
        className={cn(
          'relative flex h-full flex-col rounded-3xl border p-7',
          highlight
            ? 'border-barro-600 bg-cafe-900 text-white shadow-2xl shadow-cafe-900/30'
            : 'border-areia-200 bg-white text-tinta shadow-sm',
        )}
      >
        {highlight && (
          <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ouro-400 px-3 py-1 text-xs font-bold whitespace-nowrap text-cafe-950">
            <Star className="size-3" aria-hidden /> Mais escolhido
          </span>
        )}
        <h3 className="font-display text-2xl font-bold">{plan.label}</h3>
        <p className={cn('mt-1 min-h-10 text-sm', highlight ? 'text-areia-200' : 'text-tinta-suave')}>{plan.tagline}</p>
        <p className="mt-5 flex items-baseline gap-1">
          <span className="font-display text-4xl leading-none font-bold">{formatPrice(plan.price)}</span>
          {plan.price > 0 && <span className={cn('text-sm', highlight ? 'text-areia-300' : 'text-tinta-suave')}>/mês</span>}
        </p>
        <ul className="mt-6 flex flex-1 flex-col gap-2.5">
          {planHighlights(plan.key).map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className={cn('mt-0.5 size-4 shrink-0', highlight ? 'text-ouro-300' : 'text-folha-600')} aria-hidden />
              <span className={highlight ? 'text-areia-100' : 'text-tinta'}>{f}</span>
            </li>
          ))}
        </ul>
        <Button
          asChild
          size="lg"
          variant={highlight ? 'default' : 'outline'}
          className={cn(
            'mt-7 w-full font-bold',
            highlight
              ? 'bg-ouro-400 text-cafe-950 hover:bg-ouro-300'
              : 'border-barro-600 bg-transparent text-barro-700 hover:bg-areia-100 hover:text-barro-700',
          )}
        >
          <Link href={planSignupHref(plan)}>{plan.price === 0 ? 'Começar grátis' : `Assinar ${plan.label}`}</Link>
        </Button>
      </div>
    </Reveal>
  );
}

export function PlanCards({ plans = PLAN_LIST }: { plans?: readonly PlanDef[] }) {
  return (
    <div className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((p, i) => (
        <PlanCard key={p.key} plan={p} index={i} />
      ))}
    </div>
  );
}

export default PlanCards;
