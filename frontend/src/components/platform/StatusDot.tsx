import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface StatusDotProps {
  ok:    boolean;
  label: string;
}

/**
 * Animated status indicator used in the system health bar.
 * Green = ok (pulsing), red = error (static).
 */
export const StatusDot: React.FC<StatusDotProps> = ({ ok, label }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
    <Box
      sx={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        bgcolor:   ok ? "#10B981" : "#EF4444",
        boxShadow: ok
          ? "0 0 6px rgba(16,185,129,0.7)"
          : "0 0 6px rgba(239,68,68,0.7)",
        animation: ok ? "platformPulse 2s ease-in-out infinite" : "none",
        "@keyframes platformPulse": {
          "0%,100%": { opacity: 1 },
          "50%":     { opacity: 0.45 },
        },
      }}
    />
    <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, color: "text.secondary" }}>
      {label}
    </Typography>
  </Box>
);
