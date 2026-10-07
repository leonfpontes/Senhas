/**
 * Faixa de números da landing (V-02). Os totais vêm de GET /api/v1/public/stats (reais, sem o
 * tenant demo). Cada número só aparece acima do mínimo — número pequeno espanta em vez de convencer —
 * e é arredondado para baixo com "+" (3.216 → "3.000+"), nunca para cima.
 */
export interface PublicStats {
  senhas_emitidas: number;
  giras_realizadas: number;
  terreiros_ativos: number;
}

export interface StatDef {
  key: keyof PublicStats;
  label: string;
  min: number;
}

export const STAT_DEFS: readonly StatDef[] = [
  { key: 'senhas_emitidas', label: 'senhas emitidas pelo celular', min: 1000 },
  { key: 'giras_realizadas', label: 'giras organizadas', min: 50 },
  { key: 'terreiros_ativos', label: 'terreiros usando', min: 20 },
];

/** Arredonda para baixo num degrau "redondo" e formata em pt-BR com "+". */
export function formatStat(n: number): string {
  const step = n >= 10000 ? 1000 : n >= 1000 ? 500 : n >= 100 ? 50 : 10;
  const floored = Math.floor(n / step) * step;
  return `${floored.toLocaleString('pt-BR')}+`;
}

export function visibleStats(stats: PublicStats | null): { label: string; value: string }[] {
  if (!stats) return [];
  return STAT_DEFS.filter((d) => stats[d.key] >= d.min).map((d) => ({ label: d.label, value: formatStat(stats[d.key]) }));
}
