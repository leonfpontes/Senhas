import React from 'react';
import Box       from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAdminTheme } from '@/providers/AdminThemeProvider';

interface TooltipPayloadEntry {
  name:   string;
  value:  number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?:  boolean;
  payload?: TooltipPayloadEntry[];
  label?:   string;
  formatter?: (value: number | string, name: string) => string;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active, payload, label, formatter,
}) => {
  const { tokens } = useAdminTheme();

  if (!active || !payload?.length) return null;

  return (
    <Box
      sx={{
        background: tokens.tooltipBg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2,
        px: 1.5,
        py: 1,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}
    >
      {label && (
        <Typography
          sx={{ fontSize: '0.72rem', color: tokens.textSecondary, mb: 0.5, fontWeight: 600 }}
        >
          {label}
        </Typography>
      )}
      {payload.map((entry, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: i < payload.length - 1 ? 0.25 : 0 }}>
          {entry.color && (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
          )}
          <Typography sx={{ fontSize: '0.78rem', color: tokens.textPrimary, fontWeight: 600 }}>
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
            {entry.name}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};
