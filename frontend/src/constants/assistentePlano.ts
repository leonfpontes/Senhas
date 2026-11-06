/**
 * Assistente de plano do site (J1 v2 · 03, decisão do Leonardo em 04/11/2026).
 *
 * Três perguntas sobre a casa e a indicação de um plano. Nada aqui é escrito à mão: as opções
 * saem dos limites de cada plano (`PLANS[*].limits`), a indicação é a mesma regra de
 * `recommendPlan` que a assinatura já usa, e "financeiro, estoque ou fila de espera" pesa pelo
 * plano mínimo desses recursos (`FEATURE_MIN_PLAN`, espelho de `_FEATURE_MIN_TIER` do backend).
 *
 * Fica atrás de NEXT_PUBLIC_ASSISTENTE_PLANO (docs/betas/assistente_plano_site.md): o site não tem
 * casa logada, então não cabe uma beta do Laboratório. Desligada, a página Planos é a de sempre.
 */
import {
  FEATURE_MIN_PLAN,
  PLANS,
  PLAN_ORDER,
  isUnlimited,
  planTier,
  recommendPlan,
  type PlanFeatureKey,
  type PlanKey,
} from '@/constants/plans';

export const ASSISTENTE_PLANO_PUBLICADO = process.env.NEXT_PUBLIC_ASSISTENTE_PLANO === 'true';

export interface OpcaoDoAssistente {
  /** Valor usado na conta (giras por mês ou médiuns). */
  valor: number;
  rotulo: string;
}

/** Os recursos da terceira pergunta. */
export const RECURSOS_DA_CASA: readonly PlanFeatureKey[] = ['contas_financeiras', 'estoque_controle', 'fila_espera'];

function limitesFinitos(campo: 'girasPerMonth' | 'mediuns'): number[] {
  const vistos = new Set<number>();
  for (const key of PLAN_ORDER) {
    const n = PLANS[key].limits[campo];
    if (n > 0 && !isUnlimited(n)) vistos.add(n);
  }
  return [...vistos].sort((a, b) => a - b);
}

/** "Até 2" · "3" · "4" · "Mais de 4", pelos limites de giras dos planos. */
export function opcoesDeGiras(): OpcaoDoAssistente[] {
  const limites = limitesFinitos('girasPerMonth');
  const out: OpcaoDoAssistente[] = limites.map((n, i) => {
    const anterior = i === 0 ? 0 : limites[i - 1];
    return { valor: n, rotulo: i === 0 || n - anterior > 1 ? `Até ${n}` : String(n) };
  });
  const ultimo = limites[limites.length - 1];
  if (ultimo !== undefined) out.push({ valor: ultimo + 1, rotulo: `Mais de ${ultimo}` });
  return out;
}

/** "Não vou cadastrar" · "Até 15" · "Até 30" · "Mais de 30", pelos limites de médiuns. */
export function opcoesDeMediuns(): OpcaoDoAssistente[] {
  const limites = limitesFinitos('mediuns');
  const out: OpcaoDoAssistente[] = [{ valor: 0, rotulo: 'Não vou cadastrar' }, ...limites.map((n) => ({ valor: n, rotulo: `Até ${n}` }))];
  const ultimo = limites[limites.length - 1];
  if (ultimo !== undefined) out.push({ valor: ultimo + 1, rotulo: `Mais de ${ultimo}` });
  return out;
}

export interface RespostasDoAssistente {
  girasPorMes: number;
  mediuns: number;
  precisaDosRecursos: boolean;
}

/** O plano mais barato que comporta as respostas. */
export function planoIndicado(r: RespostasDoAssistente): PlanKey {
  const peloUso = recommendPlan({ girasPerMonth: r.girasPorMes, mediuns: r.mediuns });
  if (!r.precisaDosRecursos) return peloUso;
  const pelosRecursos = RECURSOS_DA_CASA.map((f) => FEATURE_MIN_PLAN[f]).reduce<PlanKey>(
    (maior, k) => (planTier(k) > planTier(maior) ? k : maior),
    'free',
  );
  return planTier(pelosRecursos) > planTier(peloUso) ? pelosRecursos : peloUso;
}

/** "4 giras por mês e até 30 médiuns" / "giras e médiuns sem limite", dos limites do plano. */
export function resumoDosLimites(plan: PlanKey): string {
  const { girasPerMonth, mediuns } = PLANS[plan].limits;
  const giras = isUnlimited(girasPerMonth) ? 'giras sem limite' : `${girasPerMonth} giras por mês`;
  if (mediuns <= 0) return `${giras}, sem cadastro de médiuns`;
  return isUnlimited(mediuns) ? `${giras} e médiuns sem limite` : `${giras} e até ${mediuns} médiuns`;
}
