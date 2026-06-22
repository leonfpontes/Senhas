import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import AttachMoneyRoundedIcon    from "@mui/icons-material/AttachMoneyRounded";
import TrendingUpRoundedIcon     from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon   from "@mui/icons-material/TrendingDownRounded";
import TrendingFlatRoundedIcon   from "@mui/icons-material/TrendingFlatRounded";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const deltaPct = (cur: number, prev: number): number | null =>
  prev === 0 ? null : ((cur - prev) / prev) * 100;

interface MrrHeroCardProps {
  mrr:  number;
  prev: number;
}

/**
 * Hero card showing MRR with gradient text and month-over-month delta badge.
 */
export const MrrHeroCard: React.FC<MrrHeroCardProps> = ({ mrr, prev }) => {
  const delta    = deltaPct(mrr, prev);
  const positive = delta !== null && delta >= 0;
  const neutral  = delta !== null && Math.abs(delta) < 1;

  const TrendIcon = neutral
    ? TrendingFlatRoundedIcon
    : positive
    ? TrendingUpRoundedIcon
    : TrendingDownRoundedIcon;

  const trendColor = neutral ? "text.secondary" : positive ? "#10B981" : "#EF4444";

  return (
    <Card
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(16,185,129,0.3)",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, rgba(16,185,129,0.6), transparent)",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at top right, rgba(16,185,129,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        },
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.62rem", fontWeight: 700, color: "text.secondary",
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}
          >
            MRR
          </Typography>
          <Box
            sx={{
              width: 36, height: 36, borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              bgcolor: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              color: "#10B981",
              boxShadow: "0 0 12px rgba(16,185,129,0.2)",
              "& svg": { fontSize: "1rem" },
            }}
          >
            <AttachMoneyRoundedIcon />
          </Box>
        </Box>

        <Typography
          sx={{
            fontSize: "2rem", fontWeight: 800, lineHeight: 1.1,
            letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {fmtBRL(mrr)}
        </Typography>

        {delta !== null && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
            <TrendIcon sx={{ fontSize: "0.9rem", color: trendColor }} />
            <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, color: trendColor }}>
              {positive && !neutral ? "+" : ""}{delta.toFixed(1)}% vs mês anterior
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
