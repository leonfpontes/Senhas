import React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { PLAN_META } from "./planMeta";

// Rank 1-2-3 medals
const RANK_COLORS = ["#F59E0B", "#94A3B8", "#B45309"];

interface TenantEntry {
  id:          string;
  name:        string;
  plan:        string | null;
  tickets_30d: number;
}

interface TopTenantsLeaderboardProps {
  tenants: TenantEntry[];
}

/**
 * Ranked list of top-performing tenants by ticket volume (last 30 days).
 * Top 3 receive gold/silver/bronze rank indicators.
 */
export const TopTenantsLeaderboard: React.FC<TopTenantsLeaderboardProps> = ({
  tenants,
}) => {
  if (!tenants.length) {
    return (
      <Typography
        sx={{ fontSize: "0.8rem", color: "text.secondary", textAlign: "center", py: 3 }}
      >
        Sem dados
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {tenants.map((tenant, idx) => {
        const rankColor  = idx < 3 ? RANK_COLORS[idx] : undefined;
        const planMeta   = tenant.plan ? PLAN_META[tenant.plan] : null;
        const isInactive = tenant.tickets_30d === 0;

        return (
          <Box
            key={tenant.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5, py: 1,
              borderRadius: "10px",
              border: "1px solid rgba(99,102,241,0.06)",
              bgcolor: idx === 0 ? "rgba(245,158,11,0.04)" : "transparent",
              transition: "background 0.15s ease",
              "&:hover": { bgcolor: "rgba(99,102,241,0.05)" },
            }}
          >
            {/* Rank badge */}
            <Box
              sx={{
                width: 24, height: 24,
                borderRadius: "6px",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                bgcolor: rankColor ? `${rankColor}18` : "rgba(99,102,241,0.06)",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.68rem", fontWeight: 700,
                  color: rankColor ?? "text.secondary",
                }}
              >
                {idx + 1}
              </Typography>
            </Box>

            {/* Tenant name */}
            <Typography
              sx={{
                flex: 1, fontSize: "0.8rem", fontWeight: 500,
                color: "text.primary",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {tenant.name}
            </Typography>

            {/* Plan chip */}
            {planMeta && (
              <Chip
                size="small"
                label={planMeta.label}
                sx={{
                  bgcolor: `${planMeta.color}18`,
                  color: planMeta.color,
                  border: `1px solid ${planMeta.color}30`,
                  fontSize: "0.62rem",
                  height: 20,
                }}
              />
            )}

            {/* Ticket count */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 28 }}>
              {isInactive && (
                <Tooltip title="Sem atividade — risco de churn">
                  <WarningAmberRoundedIcon sx={{ fontSize: "0.9rem", color: "#F59E0B" }} />
                </Tooltip>
              )}
              <Typography
                sx={{
                  fontSize: "0.8rem", fontWeight: 700,
                  color: isInactive ? "text.secondary" : "text.primary",
                  textAlign: "right",
                }}
              >
                {tenant.tickets_30d}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
