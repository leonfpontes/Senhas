/**
 * UpgradePrompt — exibido quando um recurso está bloqueado pelo plano atual.
 * Mesma API da versão MUI; o CTA leva para `/admin/billing?plan=<minPlan em minúsculas>`.
 * Passe `minPlan={minPlanFor('<feature>').label}` (constants/plans.ts), nunca o nome fixo.
 */
import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSubscription } from '@/hooks/useSubscription';

export interface UpgradePromptProps {
  feature: string;
  minPlan: string;
}

export default function UpgradePrompt({ feature, minPlan }: UpgradePromptProps) {
  const { planLabel } = useSubscription();
  const href = `/admin/billing?plan=${encodeURIComponent(minPlan.trim().toLowerCase())}`;
  // Premium é o último plano: "a partir do" não faz sentido.
  const isTopPlan = minPlan.trim().toLowerCase() === 'premium';

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Card className="max-w-[480px] text-center">
        <CardContent className="flex flex-col items-center px-10 py-10">
          <Lock className="mb-4 size-14 text-ghost" aria-hidden />
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Recurso indisponível</h2>
          <p className="mb-1 text-muted-foreground">
            <strong>{feature}</strong> não está incluso no plano <strong>{planLabel}</strong>.
          </p>
          <p className="mb-6 text-muted-foreground">
            {isTopPlan ? 'Disponível apenas no plano ' : 'Disponível a partir do plano '}
            <strong>{minPlan}</strong>.
          </p>
          <Button asChild size="lg" className="px-8 font-semibold">
            <Link href={href}>Ver Planos</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
