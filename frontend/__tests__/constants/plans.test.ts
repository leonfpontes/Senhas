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
    // Usuários ilimitados em todos os planos (99999 = sentinela de "ilimitado").
    ['free', 99999, 2, 0, 0],
    ['basic', 99999, 3, 15, 49],
    ['pro', 99999, 4, 30, 79],
    ['premium', 99999, 999999, 9999999, 99],
  ] as const)('%s: usuários, giras/mês, médiuns e preço iguais a PLAN_LIMITS', (key, users, giras, mediuns, price) => {
    expect(PLANS[key].limits).toEqual({ users, girasPerMonth: giras, mediuns });
    expect(PLANS[key].price).toBe(price);
  });

  it('plano mínimo de cada recurso igual aos tiers de plan_features.py', () => {
    // bulk_operations vale em todos os planos (plan_features.py: nível FREE).
    const tier0 = ['bulk_operations'];
    // Mensalidade dos médiuns a partir do Basic (gatilho de upgrade pelo nº de médiuns).
    // Área do Médium (AM-02) também a partir do Basic.
    // Atividades da casa (AM-08) também; escalas no Pro (cai no "pro" do else abaixo).
    const tier1 = ['mediuns', 'relatorio_gira', 'mensalidade_mediun', 'area_medium', 'atividades_corrente'];
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
    expect(Object.keys(FEATURE_MIN_PLAN)).toHaveLength(22);
    expect(FEATURE_MIN_PLAN.escalas).toBe('pro');
    expect(FEATURE_MIN_PLAN.biblioteca_medium).toBe('pro');
  });

  it('todo recurso vendido tem rótulo no catálogo; o que é grátis ou não existe fica fora', () => {
    const sold = Object.keys(FEATURE_MIN_PLAN).filter((k) => !UNSOLD_FEATURES.includes(k as never));
    expect(FEATURE_CATALOG.map((f) => f.key).sort()).toEqual(sold.sort());
    // Fora do quadro: ações em lote (todos os planos), CSV (Pro+, não vende), o que não existe e a
    // Área do Médium (texto de venda espera o estudo de UX — AM-00/AM-24).
    for (const k of [
      'bulk_operations',
      'export_csv',
      'analytics_avancado',
      'suporte_prioritario',
      'area_medium',
      'atividades_corrente',
      'escalas',
      'biblioteca_medium',
    ]) {
      expect(FEATURE_CATALOG.some((f) => f.key === k)).toBe(false);
    }
    expect(FEATURE_MIN_PLAN.export_csv).toBe('pro'); // o recurso continua no Pro+
    expect(FEATURE_MIN_PLAN.area_medium).toBe('basic');
    expect(BASE_FEATURES).toEqual([
      'Link de senhas para enviar via WhatsApp',
      'Porta: chamada da fila ao vivo',
      'Painel com as próximas giras',
    ]);
    expect(FEATURE_CATALOG.find((f) => f.key === 'tema_personalizado')?.label).toBe('Personalização da plataforma');
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
    expect(planIncludes('free', 'mensalidade_mediun')).toBe(false);
    expect(planIncludes('basic', 'mensalidade_mediun')).toBe(true);
    expect(planIncludes('pro', 'mensalidade_associado')).toBe(false);
    expect(minPlanFor('site_builder').key).toBe('pro');
    expect(minPlanFor('contas_financeiras').key).toBe('premium');
    expect(minPlanPhrase('site_builder')).toBe('a partir do Pro');
    expect(minPlanPhrase('fila_espera')).toBe('só no Premium');
    expect(minPlanPhrase('mensalidade_mediun')).toBe('a partir do Basic');
  });

  it('destaques do card: limites e o que entra de novo', () => {
    expect(planHighlights('free')).toEqual(expect.arrayContaining(['Link de senhas para enviar via WhatsApp', 'Usuários ilimitados']));
    expect(planHighlights('basic')).toEqual(
      expect.arrayContaining(['Tudo do Gratuito', '3 giras por mês', 'Até 15 médiuns', 'Mensalidade dos médiuns']),
    );
    expect(planHighlights('pro')).toEqual(expect.arrayContaining(['4 giras por mês', 'Até 30 médiuns', 'Site do terreiro e cursos']));
    expect(planHighlights('premium')).not.toEqual(expect.arrayContaining(['Mensalidade dos médiuns']));
    expect(planHighlights('pro')).not.toEqual(expect.arrayContaining(['Estoque de materiais']));
    expect(planHighlights('premium')).toEqual(expect.arrayContaining(['Estoque de materiais', 'Associados', 'Fila de espera quando a gira lota']));
    expect(planHighlights('premium')).toEqual(expect.arrayContaining(['Giras ilimitadas', 'Médiuns ilimitados']));
    // Nenhum card fala em "N usuários" nem em CSV / ações em lote.
    for (const k of ['free', 'basic', 'pro', 'premium'] as const) {
      expect(planHighlights(k).some((h) => /\d+ usuários?|CSV|planilha|em lote/i.test(h))).toBe(false);
    }
  });

  it.each([
    [{ mediuns: 0, girasPerMonth: 2 }, 'free'],
    [{ mediuns: 0, girasPerMonth: 3 }, 'basic'],
    [{ mediuns: 15, girasPerMonth: 3 }, 'basic'],
    [{ mediuns: 16, girasPerMonth: 3 }, 'pro'],
    [{ mediuns: 10, girasPerMonth: 4 }, 'pro'],
    [{ mediuns: 10, girasPerMonth: 5 }, 'premium'],
    [{ mediuns: 31, girasPerMonth: 3 }, 'premium'],
    // usuários não pesam: ilimitados em todos os planos
    [{ mediuns: 0, girasPerMonth: 2, users: 40 }, 'free'],
  ] as const)('recomenda o plano mais barato que comporta o uso %#', (usage, expected) => {
    expect(recommendPlan(usage)).toBe(expected);
  });

  it('lista o que trava no gratuito', () => {
    expect(lostOnFree({ mediuns: 0, girasPerMonth: 2 })).toEqual([]);
    expect(lostOnFree({ mediuns: 12, girasPerMonth: 6, users: 2 })).toEqual([
      'Cadastro de médiuns (12 cadastrados)',
      'Mais de 2 giras por mês',
    ]);
  });
});
