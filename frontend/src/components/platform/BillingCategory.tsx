/**
 * Categoria de cobrança de um terreiro — espelho de `BillingCategory`
 * (backend/src/services/billing_metrics.py). Só "pagante" gera MRR; "em teste" mostra o que
 * passaria a gerar se assinasse.
 */
import React from 'react';
import { ToneBadge, type Tone } from './PlanBadge';

export type BillingCategoryKey =
  | 'pagante'
  | 'em_teste'
  | 'bonificado'
  | 'gratuito'
  | 'suspensa'
  | 'cancelada'
  | 'sem_cobranca'
  | 'excluido';

export const BILLING_CATEGORY_ORDER: BillingCategoryKey[] = [
  'pagante',
  'em_teste',
  'bonificado',
  'sem_cobranca',
  'gratuito',
  'suspensa',
  'cancelada',
  'excluido',
];

export const BILLING_CATEGORY_META: Record<BillingCategoryKey, { label: string; tone: Tone; hint: string }> = {
  pagante: { label: 'Pagante', tone: 'success', hint: 'Assinatura ativa e cobrada no Stripe. Entra no MRR.' },
  em_teste: { label: 'Em teste', tone: 'warning', hint: 'Período de teste. Não é receita até assinar.' },
  bonificado: { label: 'Bonificado', tone: 'info', hint: 'Cliente piloto ou testador. Usa o plano sem pagar.' },
  sem_cobranca: { label: 'Sem cobrança', tone: 'destructive', hint: 'Plano pago ativo, mas sem assinatura no Stripe. Ninguém está cobrando.' },
  gratuito: { label: 'Gratuito', tone: 'muted', hint: 'Plano gratuito.' },
  suspensa: { label: 'Suspensa', tone: 'destructive', hint: 'Assinatura suspensa (pagamento falhou ou suspensão manual).' },
  cancelada: { label: 'Cancelada', tone: 'muted', hint: 'Assinatura cancelada ou expirada.' },
  excluido: { label: 'Excluído', tone: 'muted', hint: 'Terreiro excluído. Fora de todas as contagens.' },
};

export function BillingCategoryBadge({ category }: { category: BillingCategoryKey }) {
  const meta = BILLING_CATEGORY_META[category] ?? BILLING_CATEGORY_META.gratuito;
  return (
    <ToneBadge tone={meta.tone} title={meta.hint}>
      {meta.label}
    </ToneBadge>
  );
}
