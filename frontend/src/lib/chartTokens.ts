/**
 * chartTokens — cores dos gráficos Recharts lidas das variáveis CSS (globals.css), para as telas
 * trocarem `tokens.chartGrid` / `tokens.chartTick` (AdminTokens via useAdminTheme) por valores que
 * seguem o modo escuro e a marca do terreiro sem re-render do tema MUI.
 *
 *   <CartesianGrid stroke={chartTokens.grid} />
 *   <XAxis tick={{ fill: chartTokens.tick, fontSize: 12 }} />
 *   <Bar fill={chartTokens.primary} />
 *   <Tooltip contentStyle={chartTooltipStyle} />
 *
 * O SVG do Recharts aceita `var(--x)` em `stroke`/`fill`. Onde for preciso um valor resolvido
 * (ex.: Canvas/jsPDF), use `resolveChartToken('--chart-grid')`.
 */
import type { CSSProperties } from 'react';

export const chartTokens = {
  grid: 'var(--chart-grid)',
  tick: 'var(--chart-tick)',
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  destructive: 'var(--destructive)',
  muted: 'var(--muted-foreground)',
  border: 'var(--border)',
  tooltipBg: 'var(--popover)',
  tooltipText: 'var(--popover-foreground)',
} as const;

export type ChartToken = keyof typeof chartTokens;

/** Paleta de séries (ordem estável) para gráficos com várias categorias. */
export const chartSeries: readonly string[] = [
  chartTokens.primary,
  chartTokens.secondary,
  chartTokens.success,
  chartTokens.warning,
  chartTokens.info,
  chartTokens.destructive,
];

/** Estilo do tooltip padrão do Recharts coerente com o Popover do kit. */
export const chartTooltipStyle: CSSProperties = {
  backgroundColor: chartTokens.tooltipBg,
  color: chartTokens.tooltipText,
  border: `1px solid ${chartTokens.border}`,
  borderRadius: 'var(--radius)',
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};

/** Lê o valor atual de uma variável CSS em <html> ('' fora do browser ou se não definida). */
export function resolveChartToken(variable: `--${string}`, root?: HTMLElement): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return '';
  const el = root ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue(variable).trim();
}
