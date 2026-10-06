/**
 * Componentes da área da plataforma (super admin) — barrel.
 *
 *   import { KpiCard, PlanBadge, StatusDot } from "@/components/platform";
 */

export { ChartTooltip } from './ChartTooltip';
export { KpiCard } from './KpiCard';
export type { KpiCardProps } from './KpiCard';
export { SectionLabel } from './SectionLabel';
export { StatusDot } from './StatusDot';
export { PlanBadge, BonusStar, SubscriptionStatusBadge, TenantActiveBadge, ToneBadge } from './PlanBadge';
export type { Tone } from './PlanBadge';
export { BillingCategoryBadge, BILLING_CATEGORY_META, BILLING_CATEGORY_ORDER } from './BillingCategory';
export type { BillingCategoryKey } from './BillingCategory';
export { default as ActivationSection, STAGE_META, STAGE_ORDER } from './ActivationSection';
export type { ActivationData, ActivationTenant, ActivationStage } from './ActivationSection';

export {
  PLAN_META,
  PLAN_ORDER,
  DEFAULT_PLAN_META,
  STATUS_META,
  TENANT_ACTIVE_META,
  ROLE_LABELS,
  planMeta,
  planLabel,
  statusMeta,
  roleLabel,
} from './planMeta';
export type { PlanKey, PlanMeta, StatusMeta, SubscriptionStatusKey } from './planMeta';

export { impersonateUser, impersonateTenantAdmin, buildImpersonateUrl, pickTenantAdmin } from './impersonate';
export type { ImpersonateResponse } from './impersonate';
export * from './format';
