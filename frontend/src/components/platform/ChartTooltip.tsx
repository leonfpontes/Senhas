import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { TooltipProps } from "recharts";
import { usePlatformTheme } from "../../providers/PlatformThemeProvider";

/**
 * Shadcn-inspired recharts tooltip that adapts to the current platform theme.
 * Drop-in replacement for recharts' default Tooltip content prop.
 *
 * Usage:
 *   <RechartsTooltip content={<ChartTooltip />} />
 */
export const ChartTooltip: React.FC<TooltipProps<number, string>> = ({
  active, payload, label,
}) => {
  const { tokens, isDark } = usePlatformTheme();

  if (!active || !payload?.length) return null;

  return (
    <Box
      sx={{
        bgcolor: tokens.tooltipBg,
        border: `1px solid ${tokens.borderStrong}`,
        borderRadius: "10px",
        px: 1.5,
        py: 1,
        backdropFilter: "blur(12px)",
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.5)"
          : "0 8px 24px rgba(99,102,241,0.12)",
      }}
    >
      <Typography sx={{ fontSize: "0.65rem", color: "text.secondary", mb: 0.5 }}>
        {label}
      </Typography>
      {payload.map((entry) => (
        <Box
          key={entry.name}
          sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
        >
          <Box
            sx={{
              width: 8, height: 8, borderRadius: "50%",
              bgcolor: entry.color ?? "#6366F1",
              boxShadow: `0 0 6px ${entry.color ?? "#6366F1"}`,
            }}
          />
          <Typography
            sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.primary" }}
          >
            {entry.value?.toLocaleString("pt-BR")}
          </Typography>
          <Typography sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
            {entry.name}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};
