/**
 * PlanLocked — gate de plano (feature de assinatura). Envolve o UpgradePrompt para que as telas
 * usem um só nome ao lado de PermissionDenied/ReadOnlyNotice:
 *
 *   if (!can('estoque')) return <PlanLocked feature="Estoque" minPlan="Pro" />;
 */
import React from 'react';
import UpgradePrompt from '@/components/UpgradePrompt';

export interface PlanLockedProps {
  feature: string;
  minPlan: string;
}

export function PlanLocked({ feature, minPlan }: PlanLockedProps) {
  return <UpgradePrompt feature={feature} minPlan={minPlan} />;
}

export default PlanLocked;
