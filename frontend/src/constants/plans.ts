/**
 * Planos — fonte única do frontend (landing, /admin/billing e o redirecionamento de /admin/plano).
 *
 * Espelha o backend: limites e preço vêm de `PLAN_LIMITS` em
 * `backend/src/repositories/subscription_repo.py`; a hierarquia e o plano mínimo de cada
 * recurso vêm de `_get_plan_features` em `backend/src/services/plan_features.py`.
 * Mudou lá, mude aqui — o teste `__tests__/constants/plans.test.ts` confere os valores.
 */
import type { PlanFeatures } from '@/hooks/useSubscription';

export type PlanKey = 'free' | 'basic' | 'pro' | 'premium';
export type PlanFeatureKey = keyof PlanFeatures;

export const PLAN_ORDER: readonly PlanKey[] = ['free', 'basic', 'pro', 'premium'] as const;

/** Sentinela de "ilimitado" do backend (Premium usa números grandes, não -1). */
export const UNLIMITED_THRESHOLD = 99999;

export interface PlanLimits {
  users: number;
  girasPerMonth: number;
  mediuns: number;
}

export interface PlanDef {
  key: PlanKey;
  label: string;
  /** Preço mensal em reais (0 = grátis). */
  price: number;
  limits: PlanLimits;
  /** Frase curta para o card. */
  tagline: string;
  popular: boolean;
  /** Cor de destaque do card (hex). */
  color: string;
}

export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    label: 'Gratuito',
    price: 0,
    limits: { users: 1, girasPerMonth: 4, mediuns: 0 },
    tagline: 'Para começar a tirar senha pelo WhatsApp hoje.',
    popular: false,
    color: '#64748b',
  },
  basic: {
    key: 'basic',
    label: 'Basic',
    price: 49,
    limits: { users: 3, girasPerMonth: 10, mediuns: 50 },
    tagline: 'Para quem tem corrente e quer o relatório de cada gira.',
    popular: false,
    color: '#3b82f6',
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    price: 79,
    limits: { users: 10, girasPerMonth: 15, mediuns: 150 },
    tagline: 'Financeiro, estoque, site e associados num lugar só.',
    popular: true,
    color: '#8b5cf6',
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    price: 99,
    limits: { users: UNLIMITED_THRESHOLD, girasPerMonth: 999999, mediuns: 9999999 },
    tagline: 'Sem limites, com suporte prioritário.',
    popular: false,
    color: '#f59e0b',
  },
};

export const PLAN_LIST: readonly PlanDef[] = PLAN_ORDER.map((k) => PLANS[k]);
export const PAID_PLANS: readonly PlanDef[] = PLAN_LIST.filter((p) => p.price > 0);

/** O que todo plano inclui, inclusive o gratuito. */
export const BASE_FEATURES: readonly string[] = [
  'Senha pelo WhatsApp (link público)',
  'Porta: chamada da fila ao vivo',
  'Painel com as próximas giras',
];

/** Plano mínimo de cada recurso (= `tier >= n` em plan_features.py). */
export const FEATURE_MIN_PLAN: Record<PlanFeatureKey, PlanKey> = {
  bulk_operations: 'basic',
  mediuns: 'basic',
  relatorio_gira: 'basic',
  email_transacional: 'pro',
  tema_personalizado: 'pro',
  analytics_basico: 'pro',
  analytics_avancado: 'pro',
  associados: 'pro',
  export_csv: 'pro',
  auditoria: 'pro',
  estoque_controle: 'pro',
  mensalidade_mediun: 'pro',
  mensalidade_associado: 'pro',
  site_builder: 'pro',
  contas_financeiras: 'pro',
  fila_espera: 'pro',
  agendamento_por_horario: 'pro',
  api_access: 'premium',
  suporte_prioritario: 'premium',
};

export interface FeatureCatalogItem {
  key: PlanFeatureKey;
  label: string;
  group: string;
}

/** Ordem e rótulos (sem jargão) do comparativo e dos cards. */
export const FEATURE_CATALOG: readonly FeatureCatalogItem[] = [
  { key: 'relatorio_gira', label: 'Relatório da gira (PDF)', group: 'Giras e senhas' },
  { key: 'bulk_operations', label: 'Ações em lote nas senhas', group: 'Giras e senhas' },
  { key: 'fila_espera', label: 'Fila de espera quando a gira lota', group: 'Giras e senhas' },
  { key: 'agendamento_por_horario', label: 'Senha com horário marcado', group: 'Giras e senhas' },
  { key: 'mediuns', label: 'Cadastro de médiuns e cambones', group: 'Pessoas' },
  { key: 'mensalidade_mediun', label: 'Mensalidade dos médiuns', group: 'Pessoas' },
  { key: 'associados', label: 'Associados', group: 'Pessoas' },
  { key: 'mensalidade_associado', label: 'Mensalidade dos associados', group: 'Pessoas' },
  { key: 'contas_financeiras', label: 'Contas a pagar, a receber e caixa', group: 'Financeiro e estoque' },
  { key: 'estoque_controle', label: 'Estoque de materiais', group: 'Financeiro e estoque' },
  { key: 'email_transacional', label: 'E-mail de confirmação da senha', group: 'Comunicação e site' },
  { key: 'tema_personalizado', label: 'Cores e logo do terreiro', group: 'Comunicação e site' },
  { key: 'site_builder', label: 'Site do terreiro e cursos', group: 'Comunicação e site' },
  { key: 'analytics_basico', label: 'Relatórios de atendimento', group: 'Relatórios' },
  { key: 'analytics_avancado', label: 'Relatórios avançados', group: 'Relatórios' },
  { key: 'export_csv', label: 'Exportar planilhas (CSV)', group: 'Relatórios' },
  { key: 'auditoria', label: 'Histórico de alterações', group: 'Relatórios' },
  { key: 'api_access', label: 'Acesso à API', group: 'Suporte' },
  { key: 'suporte_prioritario', label: 'Suporte prioritário', group: 'Suporte' },
];

export const FEATURE_GROUPS: readonly string[] = Array.from(new Set(FEATURE_CATALOG.map((f) => f.group)));

/** Status da assinatura em português (valores de `SubscriptionStatus` no backend). */
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

export function planTier(key: PlanKey | string | null | undefined): number {
  const idx = PLAN_ORDER.indexOf((key ?? 'free') as PlanKey);
  return idx < 0 ? 0 : idx;
}

export function normalizePlanKey(value: unknown): PlanKey | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return (PLAN_ORDER as readonly string[]).includes(v) ? (v as PlanKey) : null;
}

export function getPlan(key: PlanKey | string | null | undefined): PlanDef {
  return PLANS[normalizePlanKey(key) ?? 'free'];
}

export function planLabel(key: PlanKey | string | null | undefined): string {
  return getPlan(key).label;
}

export function isUnlimited(n: number): boolean {
  return n < 0 || n >= UNLIMITED_THRESHOLD;
}

export function formatLimit(n: number): string {
  return isUnlimited(n) ? 'Ilimitado' : String(n);
}

export function formatPrice(price: number): string {
  return price === 0 ? 'Grátis' : `R$ ${price}`;
}

export function formatPricePerMonth(price: number): string {
  return price === 0 ? 'Grátis' : `R$ ${price}/mês`;
}

export function planIncludes(plan: PlanKey | string | null | undefined, feature: PlanFeatureKey): boolean {
  return planTier(plan) >= planTier(FEATURE_MIN_PLAN[feature]);
}

export function minPlanFor(feature: PlanFeatureKey): PlanDef {
  return PLANS[FEATURE_MIN_PLAN[feature]];
}

export function featureLabel(feature: PlanFeatureKey): string {
  return FEATURE_CATALOG.find((f) => f.key === feature)?.label ?? feature;
}

/** Recursos que passam a existir exatamente neste plano (não nos anteriores). */
export function featuresUnlockedAt(plan: PlanKey): FeatureCatalogItem[] {
  return FEATURE_CATALOG.filter((f) => FEATURE_MIN_PLAN[f.key] === plan);
}

/** Recursos pagos de um plano (inclusive os herdados dos planos anteriores). */
export function featuresIncludedIn(plan: PlanKey): FeatureCatalogItem[] {
  return FEATURE_CATALOG.filter((f) => planIncludes(plan, f.key));
}

/**
 * Lista curta para o card de cada plano: limites + o que entra de novo no plano.
 * O primeiro plano pago repete a base; os seguintes dizem "Tudo do <anterior>".
 */
export function planHighlights(plan: PlanKey): string[] {
  const def = PLANS[plan];
  const tier = planTier(plan);
  const out: string[] = [];
  if (tier === 0) {
    out.push(...BASE_FEATURES);
  } else {
    out.push(`Tudo do ${PLANS[PLAN_ORDER[tier - 1]].label}`);
  }
  out.push(isUnlimited(def.limits.users) ? 'Usuários ilimitados' : `${def.limits.users} ${def.limits.users === 1 ? 'usuário' : 'usuários'}`);
  out.push(isUnlimited(def.limits.girasPerMonth) ? 'Giras ilimitadas' : `${def.limits.girasPerMonth} giras por mês`);
  if (def.limits.mediuns > 0) {
    out.push(isUnlimited(def.limits.mediuns) ? 'Médiuns ilimitados' : `Até ${def.limits.mediuns} médiuns`);
  }
  out.push(...featuresUnlockedAt(plan).map((f) => f.label));
  return out;
}

export interface UsageSnapshot {
  mediuns: number;
  girasPerMonth: number;
  users?: number;
}

/**
 * Plano recomendado pelo uso: o mais barato cujos limites comportam o que o terreiro já faz.
 * Quem cadastrou médiuns ou passou das giras do gratuito precisa de um plano pago.
 */
export function recommendPlan(usage: UsageSnapshot): PlanKey {
  const users = usage.users ?? 1;
  for (const key of PLAN_ORDER) {
    const { limits } = PLANS[key];
    const fitsMediuns = usage.mediuns <= 0 ? true : limits.mediuns > 0 && usage.mediuns <= limits.mediuns;
    const fitsGiras = usage.girasPerMonth <= limits.girasPerMonth;
    const fitsUsers = users <= limits.users;
    if (fitsMediuns && fitsGiras && fitsUsers) return key;
  }
  return 'premium';
}

/** O que o terreiro perde ao cair para o gratuito depois do teste do Premium. */
export function lostOnFree(usage: UsageSnapshot): string[] {
  const out: string[] = [];
  const free = PLANS.free.limits;
  if (usage.mediuns > 0) out.push(`Cadastro de médiuns (${usage.mediuns} ${usage.mediuns === 1 ? 'cadastrado' : 'cadastrados'})`);
  if (usage.girasPerMonth > free.girasPerMonth) out.push(`Mais de ${free.girasPerMonth} giras por mês`);
  if ((usage.users ?? 1) > free.users) out.push('Mais de um usuário no painel');
  return out;
}
