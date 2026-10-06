/**
 * constants/plans.ts — fonte única de planos do frontend. Os números abaixo são cópia de
 * `PLAN_LIMITS` (backend/src/repositories/subscription_repo.py) e de `_FEATURE_MIN_TIER`
 * (backend/src/services/plan_features.py). Se este teste quebrar porque o
 * backend mudou, atualize os dois lados juntos.
 */
import {
  BASE_FEATURES,
  FEATURE_CATALOG,
  UNSOLD_FEATURES,
  FEATURE_MIN_PLAN,
  PLANS,
  formatLimit,
  formatPricePerMonth,
  lostOnFree,
  minPlanFor,
  minPlanPhrase,
  normalizePlanKey,
  planHighlights,
  planIncludes,
  recommendPlan,
  subscriptionStatusLabel,
} from '@/constants/plans';

describe('plans — espelho do backend', () => {
  it.each([
    ['free', 1, 2, 0, 0],
    ['basic', 3, 3, 15, 49],
    ['pro', 10, 4, 30, 79],
    ['premium', 99999, 999999, 9999999, 99],
  ] as const)('%s: usuários, giras/mês, médiuns e preço iguais a PLAN_LIMITS', (key, users, giras, mediuns, price) => {
    expect(PLANS[key].limits).toEqual({ users, girasPerMonth: giras, mediuns });
    expect(PLANS[key].price).toBe(price);
  });

  it('plano mínimo de cada recurso igual aos tiers de plan_features.py', () => {
    // bulk_operations vale em todos os planos (plan_features.py: nível FREE).
    const tier0 = ['bulk_operations'];
    const tier1 = ['mediuns', 'relatorio_gira'];
    // Reestruturação de out/2026: associados, estoque, fila, horário e financeiro → Premium.
    const tier3 = [
      'suporte_prioritario',
      'associados',
      'mensalidade_associado',
      'estoque_controle',
      'contas_financeiras',
      'fila_espera',
      'agendamento_por_horario',
    ];
    Object.entries(FEATURE_MIN_PLAN).forEach(([feature, plan]) => {
      const expected = tier0.includes(feature)
        ? 'free'
        : tier1.includes(feature)
          ? 'basic'
          : tier3.includes(feature)
            ? 'premium'
            : 'pro';
      expect([feature, plan]).toEqual([feature, expected]);
    });
    expect(Object.keys(FEATURE_MIN_PLAN)).toHaveLength(18);
  });

  it('todo recurso vendido tem rótulo no catálogo; o que é grátis ou não existe fica fora', () => {
    const sold = Object.keys(FEATURE_MIN_PLAN).filter((k) => !UNSOLD_FEATURES.includes(k as never));
    expect(FEATURE_CATALOG.map((f) => f.key).sort()).toEqual(sold.sort());
    for (const k of ['bulk_operations', 'analytics_avancado', 'suporte_prioritario']) {
      expect(FEATURE_CATALOG.some((f) => f.key === k)).toBe(false);
    }
    expect(BASE_FEATURES).toContain('Ações em lote nas senhas');
    expect(FEATURE_CATALOG.some((f) => /analytics|csv export|feature/i.test(f.label))).toBe(false);
  });
});

describe('plans — helpers', () => {
  it('normaliza ?plan= e rótulos', () => {
    expect(normalizePlanKey(' PRO ')).toBe('pro');
    expect(normalizePlanKey('enterprise')).toBeNull();
    expect(normalizePlanKey(undefined)).toBeNull();
    expect(formatPricePerMonth(79)).toBe('R$ 79/mês');
    expect(formatPricePerMonth(0)).toBe('Grátis');
    expect(formatLimit(99999)).toBe('Ilimitado');
    expect(subscriptionStatusLabel('active')).toBe('Ativa');
    expect(subscriptionStatusLabel('suspended')).toBe('Suspensa');
  });

  it('planIncludes e minPlanFor seguem a hierarquia', () => {
    expect(planIncludes('basic', 'mediuns')).toBe(true);
    expect(planIncludes('basic', 'estoque_controle')).toBe(false);
    expect(planIncludes('pro', 'estoque_controle')).toBe(false);
    expect(planIncludes('premium', 'estoque_controle')).toBe(true);
    expect(planIncludes('pro', 'mensalidade_mediun')).toBe(true);
    expect(planIncludes('pro', 'mensalidade_associado')).toBe(false);
    expect(minPlanFor('site_builder').key).toBe('pro');
    expect(minPlanFor('contas_financeiras').key).toBe('premium');
    expect(minPlanPhrase('site_builder')).toBe('a partir do Pro');
    expect(minPlanPhrase('fila_espera')).toBe('só no Premium');
  });

  it('destaques do card: limites e o que entra de novo', () => {
    expect(planHighlights('basic')).toEqual(expect.arrayContaining(['Tudo do Gratuito', '3 usuários', '3 giras por mês', 'Até 15 médiuns']));
    expect(planHighlights('pro')).toEqual(expect.arrayContaining(['4 giras por mês', 'Até 30 médiuns', 'Mensalidade dos médiuns']));
    expect(planHighlights('pro')).not.toEqual(expect.arrayContaining(['Estoque de materiais']));
    expect(planHighlights('premium')).toEqual(expect.arrayContaining(['Estoque de materiais', 'Associados', 'Fila de espera quando a gira lota']));
    expect(planHighlights('premium')).toEqual(expect.arrayContaining(['Usuários ilimitados', 'Giras ilimitadas']));
  });

  it.each([
    [{ mediuns: 0, girasPerMonth: 2 }, 'free'],
    [{ mediuns: 0, girasPerMonth: 3 }, 'basic'],
    [{ mediuns: 15, girasPerMonth: 3 }, 'basic'],
    [{ mediuns: 16, girasPerMonth: 3 }, 'pro'],
    [{ mediuns: 10, girasPerMonth: 4 }, 'pro'],
    [{ mediuns: 10, girasPerMonth: 5 }, 'premium'],
    [{ mediuns: 31, girasPerMonth: 3 }, 'premium'],
    [{ mediuns: 0, girasPerMonth: 2, users: 4 }, 'pro'],
  ] as const)('recomenda o plano mais barato que comporta o uso %#', (usage, expected) => {
    expect(recommendPlan(usage)).toBe(expected);
  });

  it('lista o que trava no gratuito', () => {
    expect(lostOnFree({ mediuns: 0, girasPerMonth: 2 })).toEqual([]);
    expect(lostOnFree({ mediuns: 12, girasPerMonth: 6, users: 2 })).toEqual([
      'Cadastro de médiuns (12 cadastrados)',
      'Mais de 2 giras por mês',
      'Mais de um usuário no painel',
    ]);
  });
});
