import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface SectionLabelProps {
  children: React.ReactNode;
  /** Optional subtitle below the main label */
  sub?: string;
}

/**
 * Consistent section heading used above charts and content blocks.
 */
export const SectionLabel: React.FC<SectionLabelProps> = ({ children, sub }) => (
  <Box sx={{ mb: 2 }}>
    <Typography
      sx={{ fontSize: "0.78rem", fontWeight: 700, color: "text.primary" }}
    >
      {children}
    </Typography>
    {sub && (
      <Typography sx={{ fontSize: "0.66rem", color: "text.secondary", mt: 0.25 }}>
        {sub}
      </Typography>
    )}
  </Box>
);
