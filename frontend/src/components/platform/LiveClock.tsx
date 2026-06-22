import React, { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { usePlatformTheme } from "../../providers/PlatformThemeProvider";

/**
 * Real-time HH:MM:SS clock shown in the top-bar.
 * Hidden on mobile (xs breakpoint).
 */
export const LiveClock: React.FC = () => {
  const { tokens } = usePlatformTheme();
  const [time, setTime] = useState("");

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        alignItems: "center",
        px: 1.5,
        py: 0.5,
        borderRadius: "8px",
        border: `1px solid ${tokens.border}`,
        bgcolor: "rgba(99,102,241,0.06)",
      }}
    >
      <Typography
        sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "text.secondary",
          fontFamily: "monospace",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.05em",
        }}
      >
        {time}
      </Typography>
    </Box>
  );
};
