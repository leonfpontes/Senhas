import React from 'react';
import { chartTooltipStyle } from '@/lib/chartTokens';

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  /** Formata o valor (ex.: moeda). */
  formatter?: (value: number | string, name: string) => string;
}

/** Tooltip do Recharts coerente com o Popover do kit (tokens, sem cor fixa). */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={chartTooltipStyle} className="px-3 py-2">
      {label !== undefined && <p className="mb-1 text-xs font-semibold text-muted-foreground">{String(label)}</p>}
      <ul className="m-0 list-none space-y-0.5 p-0">
        {payload.map((item, i) => {
          const name = item.name ?? String(item.dataKey ?? '');
          const value = item.value ?? '';
          return (
            <li key={`${name}-${i}`} className="flex items-center gap-2 text-xs">
              <span aria-hidden className="size-2 rounded-full" style={{ background: item.color ?? 'var(--primary)' }} />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-semibold tabular-nums">{formatter ? formatter(value, name) : value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ChartTooltip;
