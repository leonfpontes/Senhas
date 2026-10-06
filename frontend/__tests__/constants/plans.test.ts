/**
 * constants/plans.ts — fonte única de planos do frontend. Os números abaixo são cópia de
 * `PLAN_LIMITS` (backend/src/repositories/subscription_repo.py) e dos `tier >= n` de
 * `_get_plan_features` (backend/src/services/plan_features.py). Se este teste quebrar porque o
 * backend mudou, atualize os dois lados juntos.
 */
import {
  FEATURE_CATALOG,
  FEATURE_MIN_PLAN,
  PLANS,
  formatLimit,
  formatPricePerMonth,
  lostOnFree,
  minPlanFor,
  normalizePlanKey,
  planHighlights,
  planIncludes,
  recommendPlan,
  subscriptionStatusLabel,
} from '@/constants/plans';

describe('plans — espelho do backend', () => {
  it.each([
    ['free', 1, 4, 0, 0],
    ['basic', 3, 10, 50, 49],
    ['pro', 10, 15, 150, 79],
    ['premium', 99999, 999999, 9999999, 99],
  ] as const)('%s: usuários, giras/mês, médiuns e preço iguais a PLAN_LIMITS', (key, users, giras, mediuns, price) => {
    expect(PLANS[key].limits).toEqual({ users, girasPerMonth: giras, mediuns });
    expect(PLANS[key].price).toBe(price);
  });

  it('plano mínimo de cada recurso igual aos tiers de plan_features.py', () => {
    const tier1 = ['bulk_operations', 'mediuns', 'relatorio_gira'];
    const tier3 = ['suporte_prioritario'];
    Object.entries(FEATURE_MIN_PLAN).forEach(([feature, plan]) => {
      const expected = tier1.includes(feature) ? 'basic' : tier3.includes(feature) ? 'premium' : 'pro';
      expect([feature, plan]).toEqual([feature, expected]);
    });
    expect(Object.keys(FEATURE_MIN_PLAN)).toHaveLength(18);
  });

  it('todo recurso tem rótulo no catálogo', () => {
    expect(FEATURE_CATALOG.map((f) => f.key).sort()).toEqual(Object.keys(FEATURE_MIN_PLAN).sort());
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
    expect(planIncludes('premium', 'estoque_controle')).toBe(true);
    expect(minPlanFor('site_builder').key).toBe('pro');
  });

  it('destaques do card: limites e o que entra de novo', () => {
    expect(planHighlights('basic')).toEqual(expect.arrayContaining(['Tudo do Gratuito', '3 usuários', '10 giras por mês', 'Até 50 médiuns']));
    expect(planHighlights('premium')).toEqual(expect.arrayContaining(['Usuários ilimitados', 'Giras ilimitadas']));
  });

  it.each([
    [{ mediuns: 0, girasPerMonth: 2 }, 'free'],
    [{ mediuns: 0, girasPerMonth: 5 }, 'basic'],
    [{ mediuns: 30, girasPerMonth: 3 }, 'basic'],
    [{ mediuns: 80, girasPerMonth: 3 }, 'pro'],
    [{ mediuns: 10, girasPerMonth: 12 }, 'pro'],
    [{ mediuns: 200, girasPerMonth: 3 }, 'premium'],
    [{ mediuns: 0, girasPerMonth: 2, users: 4 }, 'pro'],
  ] as const)('recomenda o plano mais barato que comporta o uso %#', (usage, expected) => {
    expect(recommendPlan(usage)).toBe(expected);
  });

  it('lista o que trava no gratuito', () => {
    expect(lostOnFree({ mediuns: 0, girasPerMonth: 2 })).toEqual([]);
    expect(lostOnFree({ mediuns: 12, girasPerMonth: 6, users: 2 })).toEqual([
      'Cadastro de médiuns (12 cadastrados)',
      'Mais de 4 giras por mês',
      'Mais de um usuário no painel',
    ]);
  });
});
