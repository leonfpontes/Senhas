/**
 * UpgradePrompt — exibido quando um recurso está bloqueado pelo plano atual.
 * Mesma API da versão MUI; o CTA leva para `/admin/billing?plan=<minPlan em minúsculas>`.
 * Passe `minPlan={minPlanFor('<feature>').label}` (constants/plans.ts), nunca o nome fixo.
 * Desenho (J10 v2 · 08): o cadeado num círculo areia, a frase em Fraunces e um botão só.
 */
import React from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
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
    <Card className="w-full text-center">
      <CardContent className="flex flex-col items-center px-6 py-10">
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <h2 className="mb-2 font-display text-2xl tracking-tight text-balance">
          <strong className="font-normal">{feature}</strong> não está incluso no plano <strong className="font-normal">{planLabel}</strong>.
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          {isTopPlan ? 'Disponível apenas no plano ' : 'Disponível a partir do plano '}
          <strong className="font-normal">{minPlan}</strong>.
        </p>
        <Button asChild size="lg" className="font-semibold">
          <Link href={href}>
            Ver planos <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
