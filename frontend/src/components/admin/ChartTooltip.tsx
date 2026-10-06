/**
 * ChartTooltip — tooltip customizado para gráficos Recharts do admin, nas cores do Popover
 * (`chartTokens`), seguindo o modo escuro sem depender do tema MUI.
 *
 *   <RechartsTooltip content={<ChartTooltip />} />
 */
import React from 'react';
import { chartTooltipStyle } from '@/lib/chartTokens';

interface TooltipPayloadEntry {
  name: string;
  value: number | string;
  color?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  formatter?: (value: number | string, name: string) => string;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;

  return (
    <div data-slot="chart-tooltip" style={chartTooltipStyle} className="px-3 py-2">
      {label && <p className="mb-1 text-[0.72rem] font-semibold text-muted-foreground">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 not-last:mb-0.5">
          {entry.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />}
          <span className="text-[0.78rem] font-semibold">{formatter ? formatter(entry.value, entry.name) : entry.value}</span>
          <span className="text-[0.72rem] text-muted-foreground">{entry.name}</span>
        </div>
      ))}
    </div>
  );
};

export default ChartTooltip;
