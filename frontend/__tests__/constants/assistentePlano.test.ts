/** Assistente de plano do site (J1 v2 · 03): opções e indicação saem dos planos, nada à mão. */
import { FEATURE_MIN_PLAN, PLANS } from '@/constants/plans';
import { RECURSOS_DA_CASA, opcoesDeGiras, opcoesDeMediuns, planoIndicado, resumoDosLimites } from '@/constants/assistentePlano';

describe('assistente de plano', () => {
  it('as opções vêm dos limites dos planos', () => {
    expect(opcoesDeGiras().map((o) => o.rotulo)).toEqual([
      `Até ${PLANS.free.limits.girasPerMonth}`,
      String(PLANS.basic.limits.girasPerMonth),
      String(PLANS.pro.limits.girasPerMonth),
      `Mais de ${PLANS.pro.limits.girasPerMonth}`,
    ]);
    expect(opcoesDeMediuns().map((o) => o.rotulo)).toEqual([
      'Não vou cadastrar',
      `Até ${PLANS.basic.limits.mediuns}`,
      `Até ${PLANS.pro.limits.mediuns}`,
      `Mais de ${PLANS.pro.limits.mediuns}`,
    ]);
  });

  it('indica o Gratuito quando ele dá conta (opção honesta)', () => {
    expect(planoIndicado({ girasPorMes: PLANS.free.limits.girasPerMonth, mediuns: 0, precisaDosRecursos: false })).toBe('free');
  });

  it('sobe pelo uso: giras e médiuns, como recommendPlan', () => {
    expect(planoIndicado({ girasPorMes: PLANS.basic.limits.girasPerMonth, mediuns: 0, precisaDosRecursos: false })).toBe('basic');
    expect(planoIndicado({ girasPorMes: 2, mediuns: PLANS.pro.limits.mediuns, precisaDosRecursos: false })).toBe('pro');
    expect(planoIndicado({ girasPorMes: PLANS.pro.limits.girasPerMonth + 1, mediuns: 0, precisaDosRecursos: false })).toBe('premium');
  });

  it('financeiro, estoque ou fila de espera puxam o plano mínimo desses recursos', () => {
    const minimo = RECURSOS_DA_CASA.map((f) => FEATURE_MIN_PLAN[f]);
    expect(planoIndicado({ girasPorMes: 2, mediuns: 0, precisaDosRecursos: true })).toBe(minimo.includes('premium') ? 'premium' : minimo[0]);
  });

  it('o resumo é o dos limites', () => {
    expect(resumoDosLimites('pro')).toBe(`${PLANS.pro.limits.girasPerMonth} giras por mês e até ${PLANS.pro.limits.mediuns} médiuns`);
    expect(resumoDosLimites('free')).toContain('sem cadastro de médiuns');
  });
});
