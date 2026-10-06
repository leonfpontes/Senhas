/**
 * planMeta — mapa único de plano e status de assinatura usado em todas as telas da plataforma
 * (Hoje, Terreiros, Tenant 360, Auditoria, Configurações).
 *
 * Cores saem dos tokens do tema (nunca hex fixo), para seguir claro/escuro. `price` e `limits`
 * vêm de `constants/plans.ts` (espelho único de `PLAN_LIMITS` do backend) — tabela de
 * referência; o valor cobrado de verdade vem da assinatura (`monthly_price`).
 */
import { PLANS, isUnlimited, type PlanLimits } from '@/constants/plans';

export type PlanKey = 'free' | 'basic' | 'pro' | 'premium';
export type SubscriptionStatusKey = 'active' | 'suspended' | 'cancelled' | 'expired';

export interface PlanMeta {
  key: PlanKey;
  label: string;
  /** Preço de tabela (R$/mês). */
  price: number;
  limits: { users: number | null; girasPerMonth: number | null; mediuns: number | null };
  /** Classes Tailwind do Badge (tokens do tema). */
  badgeClass: string;
  /** Cor para gráficos (variável CSS). */
  chartColor: string;
}

export const PLAN_ORDER: PlanKey[] = ['free', 'basic', 'pro', 'premium'];

/** Limites de `constants/plans.ts` com `null` = ilimitado (Premium). */
function metaLimits({ users, girasPerMonth, mediuns }: PlanLimits): PlanMeta['limits'] {
  const v = (n: number) => (isUnlimited(n) ? null : n);
  return { users: v(users), girasPerMonth: v(girasPerMonth), mediuns: v(mediuns) };
}

export const PLAN_META: Record<PlanKey, PlanMeta> = {
  free: {
    key: 'free',
    label: 'Free',
    price: PLANS.free.price,
    limits: metaLimits(PLANS.free.limits),
    badgeClass: 'border-transparent bg-muted text-muted-foreground',
    chartColor: 'var(--muted-foreground)',
  },
  basic: {
    key: 'basic',
    label: 'Basic',
    price: PLANS.basic.price,
    limits: metaLimits(PLANS.basic.limits),
    badgeClass: 'border-transparent bg-info/15 text-info-strong',
    chartColor: 'var(--info)',
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    price: PLANS.pro.price,
    limits: metaLimits(PLANS.pro.limits),
    badgeClass: 'border-transparent bg-primary/15 text-brand',
    chartColor: 'var(--primary)',
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    price: PLANS.premium.price,
    limits: metaLimits(PLANS.premium.limits),
    badgeClass: 'border-transparent bg-warning/15 text-warning-strong',
    chartColor: 'var(--warning)',
  },
};

export const DEFAULT_PLAN_META: PlanMeta = {
  key: 'free',
  label: 'Sem plano',
  price: 0,
  limits: { users: null, girasPerMonth: null, mediuns: null },
  badgeClass: 'border-border bg-transparent text-muted-foreground',
  chartColor: 'var(--muted-foreground)',
};

export function planMeta(plan: string | null | undefined): PlanMeta {
  const key = (plan ?? '').toLowerCase() as PlanKey;
  return PLAN_META[key] ?? DEFAULT_PLAN_META;
}

export function planLabel(plan: string | null | undefined): string {
  return plan ? planMeta(plan).label : '—';
}

export interface StatusMeta {
  label: string;
  badgeClass: string;
}

export const STATUS_META: Record<SubscriptionStatusKey, StatusMeta> = {
  active: { label: 'Ativa', badgeClass: 'border-transparent bg-success/15 text-success-strong' },
  suspended: { label: 'Suspensa', badgeClass: 'border-transparent bg-warning/15 text-warning-strong' },
  cancelled: { label: 'Cancelada', badgeClass: 'border-transparent bg-destructive/10 text-destructive-strong' },
  expired: { label: 'Expirada', badgeClass: 'border-transparent bg-destructive/10 text-destructive-strong' },
};

export function statusMeta(status: string | null | undefined): StatusMeta {
  const key = (status ?? '').toLowerCase() as SubscriptionStatusKey;
  return STATUS_META[key] ?? { label: status || 'Sem assinatura', badgeClass: 'border-border bg-transparent text-muted-foreground' };
}

/** Estado do terreiro (`is_active`) — separado do status da assinatura. */
export const TENANT_ACTIVE_META: Record<'active' | 'inactive', StatusMeta> = {
  active: { label: 'Ativo', badgeClass: 'border-transparent bg-success/15 text-success-strong' },
  inactive: { label: 'Desativado', badgeClass: 'border-transparent bg-destructive/10 text-destructive-strong' },
};

/** Papéis de usuário do terreiro (valores do enum `UserRole`). */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  OPERATOR: 'Operador',
  SUPER_ADMIN: 'Super admin',
  admin: 'Admin',
  operator: 'Operador',
  super_admin: 'Super admin',
};

export function roleLabel(role: string | null | undefined): string {
  return role ? (ROLE_LABELS[role] ?? role) : '—';
}
