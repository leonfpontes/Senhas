/**
 * Planos — fonte única do frontend (landing, /admin/billing e o redirecionamento de /admin/plano).
 *
 * Espelha o backend: limites e preço vêm de `PLAN_LIMITS` em
 * `backend/src/repositories/subscription_repo.py`; a hierarquia e o plano mínimo de cada
 * recurso vêm de `_FEATURE_MIN_TIER` em `backend/src/services/plan_features.py`.
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
    limits: { users: UNLIMITED_THRESHOLD, girasPerMonth: 2, mediuns: 0 },
    tagline: 'Para começar a tirar senha pelo WhatsApp hoje.',
    popular: false,
    color: '#64748b',
  },
  basic: {
    key: 'basic',
    label: 'Basic',
    price: 49,
    limits: { users: UNLIMITED_THRESHOLD, girasPerMonth: 3, mediuns: 15 },
    tagline: 'Corrente cadastrada, mensalidade dos médiuns e relatório de cada gira.',
    popular: false,
    color: '#3b82f6',
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    price: 79,
    limits: { users: UNLIMITED_THRESHOLD, girasPerMonth: 4, mediuns: 30 },
    tagline: 'Site do terreiro, e-mail da senha, relatórios e personalização da plataforma.',
    popular: true,
    color: '#8b5cf6',
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    price: 99,
    limits: { users: UNLIMITED_THRESHOLD, girasPerMonth: 999999, mediuns: 9999999 },
    tagline: 'Tudo liberado e sem limites: financeiro, estoque, associados e fila de espera.',
    popular: false,
    color: '#f59e0b',
  },
};

export const PLAN_LIST: readonly PlanDef[] = PLAN_ORDER.map((k) => PLANS[k]);
export const PAID_PLANS: readonly PlanDef[] = PLAN_LIST.filter((p) => p.price > 0);

/**
 * O que todo plano inclui, inclusive o gratuito (base do comparativo). Ações em lote também valem
 * em todos os planos, mas não aparecem no quadro (não é diferencial — ver HIDDEN_FEATURES).
 */
export const BASE_FEATURES: readonly string[] = [
  'Link de senhas para enviar via WhatsApp',
  'Porta: chamada da fila ao vivo',
  'Painel com as próximas giras',
];

/**
 * Usuários ilimitados em todos os planos, inclusive o Gratuito (out/2026): quem opera a plataforma
 * — muitas vezes um filho da casa, não o dirigente que assinou — é quem sente falta dos recursos
 * novos; mais usuários = mais promotores internos do upgrade. No comparativo vira a linha
 * "Usuários no painel" = Ilimitado; no card do Gratuito, um item da lista.
 */
export const UNLIMITED_USERS_LABEL = 'Usuários ilimitados';

/**
 * Plano mínimo de cada recurso (= `_FEATURE_MIN_TIER` em plan_features.py).
 * Reestruturação de out/2026: associados (e a mensalidade deles), estoque, fila de espera,
 * horário marcado e o financeiro (contas a pagar/receber, caixa) são só Premium. A mensalidade dos
 * médiuns é a partir do Basic: o 1º gatilho de upgrade é giras/mês, o 2º é o número de médiuns —
 * com a mensalidade já no Basic (limite de 15 médiuns), o dirigente sobe de plano para continuar
 * controlando a mensalidade de todo mundo.
 */
export const FEATURE_MIN_PLAN: Record<PlanFeatureKey, PlanKey> = {
  // Ações em lote valem em todos os planos (não é recurso vendido — fica em BASE_FEATURES).
  bulk_operations: 'free',
  mediuns: 'basic',
  relatorio_gira: 'basic',
  mensalidade_mediun: 'basic',
  // Área do Médium (AM-02, decisão D-01 de 2026-10-07): a partir do Basic.
  area_medium: 'basic',
  // Atividades da casa (AM-08, D-10): no Basic a casa marca quem veio; escalas (D-02) no Pro.
  atividades_corrente: 'basic',
  escalas: 'pro',
  // Estudos e documentos da casa (AM-21, D-02): Pro, como as escalas.
  biblioteca_medium: 'pro',
  // Ficha espiritual do médium (F-05/AM-19): campos por tradição, consentimento e caminhada.
  ficha_espiritual: 'pro',
  // Mensalidade com baixa automática (F-02/AM-22, decisão de 09/10): Pro.
  mensalidade_automatica: 'pro',
  email_transacional: 'pro',
  tema_personalizado: 'pro',
  analytics_basico: 'pro',
  analytics_avancado: 'pro',
  export_csv: 'pro',
  auditoria: 'pro',
  site_builder: 'pro',
  associados: 'premium',
  mensalidade_associado: 'premium',
  estoque_controle: 'premium',
  contas_financeiras: 'premium',
  fila_espera: 'premium',
  agendamento_por_horario: 'premium',
  suporte_prioritario: 'premium',
};

export interface FeatureCatalogItem {
  key: PlanFeatureKey;
  label: string;
  group: string;
}

/**
 * Recursos de `PlanFeatures` que NÃO aparecem no quadro de planos (cards, comparativo, landing,
 * tabela da plataforma). Só exibição — gate e funcionamento continuam iguais:
 * - `bulk_operations` (ações em lote): vale em todos os planos, mas não é diferencial;
 * - `export_csv` (exportar listagens — PDF das senhas, CSV do estoque): segue no Pro+, mas não vende;
 * - `analytics_avancado` e `suporte_prioritario`: nada implementado por trás;
 * - `area_medium` (Área do Médium, Basic+): fora do quadro do painel; no comparativo público
 *   (`PlanComparisonTable`) entra só com a chave de divulgação `AREA_MEDIUM_DIVULGADA` (AM-24);
 * - `atividades_corrente` (Basic+), `escalas` e `biblioteca_medium` (Pro+), da Área do Médium
 *   (AM-08/AM-25/AM-21): fora do quadro enquanto a Área está em piloto.
 * Os campos continuam no backend (catálogo de `PlanFeatures`).
 */
export const UNSOLD_FEATURES: readonly PlanFeatureKey[] = [
  'bulk_operations',
  'export_csv',
  'analytics_avancado',
  'suporte_prioritario',
  'area_medium',
  'atividades_corrente',
  'escalas',
  'biblioteca_medium',
];

/** Ordem e rótulos (sem jargão) do comparativo e dos cards. */
export const FEATURE_CATALOG: readonly FeatureCatalogItem[] = [
  { key: 'relatorio_gira', label: 'Relatório da gira (PDF)', group: 'Giras e senhas' },
  { key: 'fila_espera', label: 'Fila de espera quando a gira lota', group: 'Giras e senhas' },
  { key: 'agendamento_por_horario', label: 'Senha com horário marcado', group: 'Giras e senhas' },
  { key: 'mediuns', label: 'Cadastro de médiuns e cambones', group: 'Pessoas' },
  { key: 'mensalidade_mediun', label: 'Mensalidade dos médiuns', group: 'Pessoas' },
  { key: 'ficha_espiritual', label: 'Ficha espiritual e caminhada dos médiuns', group: 'Pessoas' },
  { key: 'mensalidade_automatica', label: 'Mensalidade com baixa automática (PIX/boleto)', group: 'Pessoas' },
  { key: 'associados', label: 'Associados', group: 'Pessoas' },
  { key: 'mensalidade_associado', label: 'Mensalidade dos associados', group: 'Pessoas' },
  { key: 'contas_financeiras', label: 'Contas a pagar e a receber, fluxo de caixa e contas bancárias', group: 'Financeiro e estoque' },
  { key: 'estoque_controle', label: 'Estoque de materiais', group: 'Financeiro e estoque' },
  { key: 'email_transacional', label: 'E-mail de confirmação da senha', group: 'Comunicação e site' },
  { key: 'tema_personalizado', label: 'Personalização da plataforma', group: 'Comunicação e site' },
  { key: 'site_builder', label: 'Site do terreiro e cursos', group: 'Comunicação e site' },
  { key: 'analytics_basico', label: 'Relatórios de atendimento', group: 'Relatórios' },
  { key: 'auditoria', label: 'Histórico de alterações', group: 'Relatórios' },
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

/** "a partir do Pro" / "só no Premium" — o último plano não tem "a partir". */
export function minPlanPhrase(feature: PlanFeatureKey): string {
  const plan = minPlanFor(feature);
  return plan.key === PLAN_ORDER[PLAN_ORDER.length - 1] ? `só no ${plan.label}` : `a partir do ${plan.label}`;
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
    out.push(...BASE_FEATURES, UNLIMITED_USERS_LABEL);
  } else {
    out.push(`Tudo do ${PLANS[PLAN_ORDER[tier - 1]].label}`);
  }
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
  /** Só exibição: usuários não têm limite em nenhum plano (não pesa na recomendação). */
  users?: number;
}

/**
 * Plano recomendado pelo uso: o mais barato cujos limites comportam o que o terreiro já faz.
 * Quem cadastrou médiuns ou passou das giras do gratuito precisa de um plano pago. Usuários não
 * entram: são ilimitados em todos os planos.
 */
export function recommendPlan(usage: UsageSnapshot): PlanKey {
  for (const key of PLAN_ORDER) {
    const { limits } = PLANS[key];
    const fitsMediuns = usage.mediuns <= 0 ? true : limits.mediuns > 0 && usage.mediuns <= limits.mediuns;
    const fitsGiras = usage.girasPerMonth <= limits.girasPerMonth;
    if (fitsMediuns && fitsGiras) return key;
  }
  return 'premium';
}

/** O que o terreiro perde ao cair para o gratuito depois do teste do Premium. */
export function lostOnFree(usage: UsageSnapshot): string[] {
  const out: string[] = [];
  const free = PLANS.free.limits;
  if (usage.mediuns > 0) out.push(`Cadastro de médiuns (${usage.mediuns} ${usage.mediuns === 1 ? 'cadastrado' : 'cadastrados'})`);
  if (usage.girasPerMonth > free.girasPerMonth) out.push(`Mais de ${free.girasPerMonth} giras por mês`);
  return out;
}

/**
 * Classe de TEXTO do nome de cada plano. `PlanDef.color` é só para enfeite (faixa e borda):
 * como texto, o âmbar do Premium (2,2:1) e o azul do Basic (3,7:1) não liam no branco.
 */
export const PLAN_TEXT_CLASS: Record<PlanKey, string> = {
  free: 'text-muted-foreground',
  basic: 'text-info-strong',
  pro: 'text-brand',
  premium: 'text-warning-strong',
};
