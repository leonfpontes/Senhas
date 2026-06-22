import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

export interface KpiCardProps {
  label:      string;
  value:      string | number;
  sub?:       string;
  icon:       React.ReactNode;
  /** Hex color used for icon bg tint and optional border highlight */
  color:      string;
  /** Optional rgba glow for the icon box shadow */
  glow?:      string;
  /** When true, adds a colored top-line accent and subtle bg tint */
  highlight?: boolean;
}

/**
 * Generic KPI metric card.
 * Adapts to both dark and light themes through the MUI theme system.
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  label, value, sub, icon, color, glow, highlight,
}) => (
  <Card
    sx={{
      height: "100%",
      position: "relative",
      overflow: "hidden",
      ...(highlight && {
        border: `1px solid ${color}40`,
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "2px",
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at top left, ${color}10 0%, transparent 60%)`,
          pointerEvents: "none",
        },
      }),
    }}
  >
    <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
      <Box
        sx={{
          width: 40, height: 40,
          borderRadius: "10px",
          display: "flex", alignItems: "center", justifyContent: "center",
          mb: 1.5,
          bgcolor: `${color}18`,
          border: `1px solid ${color}30`,
          color,
          "& svg": { fontSize: "1.1rem" },
          boxShadow: glow ? `0 0 12px ${glow}` : "none",
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: "0.62rem", fontWeight: 700, color: "text.secondary",
          letterSpacing: "0.1em", textTransform: "uppercase", mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "1.6rem", fontWeight: 700, color: "text.primary",
          lineHeight: 1.1, letterSpacing: "-0.03em",
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </CardContent>
  </Card>
);
