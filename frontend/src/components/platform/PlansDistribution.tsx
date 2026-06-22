import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { PLAN_META, DEFAULT_PLAN_META } from "./planMeta";

interface Plan {
  plan:  string;
  count: number;
}

interface PlansDistributionProps {
  plans:       Plan[];
  totalActive: number;
}

/**
 * Horizontal progress-bar breakdown of tenants by subscription plan.
 */
export const PlansDistribution: React.FC<PlansDistributionProps> = ({
  plans,
  totalActive,
}) => {
  if (!plans.length) {
    return (
      <Typography sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
        Sem dados
      </Typography>
    );
  }

  const sorted = [...plans].sort((a, b) => b.count - a.count);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {sorted.map(({ plan, count }) => {
        const pct  = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
        const meta = PLAN_META[plan] ?? DEFAULT_PLAN_META;

        return (
          <Box key={plan}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: "50%",
                    bgcolor: meta.color,
                    boxShadow: `0 0 6px ${meta.glow}`,
                  }}
                />
                <Typography
                  sx={{ fontSize: "0.78rem", fontWeight: 600, color: "text.primary" }}
                >
                  {meta.label}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  sx={{ fontSize: "0.72rem", color: meta.color, fontWeight: 700 }}
                >
                  {count}
                </Typography>
                <Typography sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                  {pct}%
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                height: 5,
                bgcolor: "rgba(99,102,241,0.08)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: 99,
                  background: meta.color,
                  boxShadow: `0 0 8px ${meta.glow}`,
                  transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
