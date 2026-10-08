/**
 * Botão "Escala" de uma gira (AM-18) — no cartão da gira (tela Giras).
 *
 * Aparece com a Área do Médium liberada (`area_medium`), a presença no plano
 * (`atividades_corrente`) e o grupo `escalas:view`. Abre `/admin/atividades/{gira_id}/escala?
 * origem=gira`, que garante a âncora e troca a URL pelo id da atividade. Sem o plano `escalas`
 * (Pro), a tela mostra o `PlanLocked` com o plano mínimo.
 */
import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';

export function escalaDaGiraHref(giraId: string): string {
  return `/admin/atividades/${encodeURIComponent(giraId)}/escala?origem=gira`;
}

export function EscalaDaGiraButton({
  giraId,
  className,
  variant = 'outline',
}: {
  giraId: string;
  className?: string;
  variant?: 'outline' | 'default' | 'ghost';
}) {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  if (!can('area_medium') || !can('atividades_corrente') || !canGroup('escalas', 'view')) return null;
  return (
    <Button asChild variant={variant} className={className}>
      <Link href={escalaDaGiraHref(giraId)}>
        <Users aria-hidden /> Escala
      </Link>
    </Button>
  );
}

export default EscalaDaGiraButton;
