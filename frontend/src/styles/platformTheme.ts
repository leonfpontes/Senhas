/**
 * Platform Theme Factory
 *
 * Single source of truth for all visual tokens used in /platform.
 * Both dark and light themes are built from the same factory function,
 * guaranteeing zero divergence between them.
 *
 * Usage:
 *   import { platformThemes, getTokens } from "@/styles/platformTheme";
 *   const theme = platformThemes["dark"];
 *   const tokens = getTokens("dark");
 */

import { createTheme, Theme } from "@mui/material/styles";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PlatformThemeMode = "dark" | "light";

// ─── Accent — identical in both modes ─────────────────────────────────────────

export const ACCENT      = "#6366F1";
export const ACCENT_GLOW = "rgba(99,102,241,0.25)";

// ─── Per-mode tokens (values not expressible through MUI palette) ─────────────

export interface PlatformTokens {
  /** Full-page background */
  pageBg:        string;
  /** Sidebar/drawer background */
  sidebarBg:     string;
  /** Top-bar background (with backdrop-filter) */
  topbarBg:      string;
  /** Default card/paper fill */
  cardBg:        string;
  /** Subtle border on cards and dividers */
  border:        string;
  /** Stronger border used for active/highlighted states */
  borderStrong:  string;
  /** Primary content text */
  textPrimary:   string;
  /** Secondary / helper text */
  textSecondary: string;
  /** Near-invisible version of accent used for watermarks */
  textGhost:     string;
  /** Recharts grid line color */
  chartGrid:     string;
  /** Recharts axis tick text color */
  chartTick:     string;
  /** Background for chart tooltip */
  tooltipBg:     string;
  /** Radial ambient glow — top-right */
  glowTR:        string;
  /** Radial ambient glow — bottom-left */
  glowBL:        string;
}

const TOKENS: Record<PlatformThemeMode, PlatformTokens> = {
  dark: {
    pageBg:        "#151C2E",          // midnight blue — perceptibly dark but not void
    sidebarBg:     "rgba(17,22,42,0.97)",
    topbarBg:      "rgba(17,22,42,0.82)",
    cardBg:        "rgba(255,255,255,0.055)",
    border:        "rgba(99,102,241,0.14)",
    borderStrong:  "rgba(99,102,241,0.35)",
    textPrimary:   "#F1F5F9",          // near-white for headings and values
    textSecondary: "#94A3B8",          // medium slate — readable on dark bg
    textGhost:     "#2D3A55",
    chartGrid:     "rgba(148,163,184,0.1)",
    chartTick:     "#64748B",
    tooltipBg:     "#1A2440",
    glowTR: "radial-gradient(ellipse at center, rgba(99,102,241,0.09) 0%, transparent 70%)",
    glowBL: "radial-gradient(ellipse at center, rgba(6,182,212,0.05) 0%, transparent 70%)",
  },
  light: {
    pageBg:        "#EEF2FF",
    sidebarBg:     "rgba(255,255,255,0.98)",
    topbarBg:      "rgba(238,242,255,0.9)",
    cardBg:        "#FFFFFF",
    border:        "rgba(99,102,241,0.12)",
    borderStrong:  "rgba(99,102,241,0.35)",
    textPrimary:   "#0F172A",
    textSecondary: "#64748B",
    textGhost:     "#CBD5E1",
    chartGrid:     "rgba(99,102,241,0.07)",
    chartTick:     "#94A3B8",
    tooltipBg:     "#FFFFFF",
    glowTR: "radial-gradient(ellipse at center, rgba(99,102,241,0.06) 0%, transparent 70%)",
    glowBL: "radial-gradient(ellipse at center, rgba(6,182,212,0.04) 0%, transparent 70%)",
  },
};

export const getTokens = (mode: PlatformThemeMode): PlatformTokens => TOKENS[mode];

// ─── Shared constants ─────────────────────────────────────────────────────────

const FONT_FAMILY = [
  "-apple-system", "BlinkMacSystemFont", '"Inter"', '"Segoe UI"', "sans-serif",
].join(",");

// ─── Theme factory ─────────────────────────────────────────────────────────────

function buildTheme(mode: PlatformThemeMode): Theme {
  const dark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary:   { main: "#6366F1", light: "#818CF8", dark: "#4F46E5" },
      secondary: { main: "#06B6D4" },
      success:   { main: "#10B981" },
      warning:   { main: "#F59E0B" },
      error:     { main: "#EF4444" },
      background: {
        default: TOKENS[mode].pageBg,
        paper:   dark ? "#1C2440" : "#FFFFFF",
      },
      divider: "rgba(99,102,241,0.12)",
      text: {
        primary:   TOKENS[mode].textPrimary,
        secondary: TOKENS[mode].textSecondary,
        // Explicitly set disabled so MUI components don't render invisible text
        disabled:  dark ? "#4A5568" : "#9CA3AF",
      },
    },

    shape: { borderRadius: 12 },

    typography: {
      fontFamily: FONT_FAMILY,
      h4: { fontWeight: 700, letterSpacing: "-0.025em" },
      h5: { fontWeight: 700, letterSpacing: "-0.02em" },
      h6: { fontWeight: 600, letterSpacing: "-0.01em" },
      body1: { fontSize: "0.9rem" },
      body2: { fontSize: "0.8rem" },
      caption: { fontSize: "0.7rem", letterSpacing: "0.04em" },
      overline: { fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em" },
    },

    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            background: TOKENS[mode].cardBg,
            border: `1px solid ${TOKENS[mode].border}`,
            borderRadius: 16,
            backdropFilter: "blur(12px)",
            boxShadow: dark
              ? "none"
              : "0 1px 4px rgba(99,102,241,0.06), 0 4px 20px rgba(99,102,241,0.05)",
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            // Sólido no dark: evita que dropdowns/menus/modais sejam transparentes.
            // No light usa branco puro por padrão do tema.
            background: dark ? "#1C2440" : "#FFFFFF",
            border: `1px solid ${TOKENS[mode].border}`,
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: "rgba(99,102,241,0.12)" } },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8, fontWeight: 600, fontSize: "0.7rem" } },
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: 10, textTransform: "none", fontWeight: 600 } },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 10,
              background: dark ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.02)",
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(99,102,241,0.5)",
              },
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            "& .MuiTableCell-root": {
              background: dark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.04)",
              fontWeight: 700,
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#64748B",
              borderBottom: `1px solid ${TOKENS[mode].border}`,
            },
          },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            "& .MuiTableRow-root": {
              "&:hover": { background: "rgba(99,102,241,0.04)" },
            },
            "& .MuiTableCell-root": {
              borderBottom: `1px solid rgba(99,102,241,0.06)`,
              color: dark ? "#CBD5E1" : "#374151",
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 10, backdropFilter: "blur(8px)" } },
      },
      MuiSelect: {
        styleOverrides: {
          root: { borderRadius: 10 },
          // O papel do dropdown (Popover > Paper) já é coberto pelo MuiPaper override acima.
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            background: dark ? "#1C2440" : "#FFFFFF",
            border: `1px solid ${TOKENS[mode].border}`,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            background: dark ? "#1C2440" : "#FFFFFF",
            border: `1px solid ${TOKENS[mode].border}`,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: dark ? "#1A2440" : "#FFFFFF",
            border: `1px solid ${TOKENS[mode].borderStrong}`,
            borderRadius: 16,
          },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: "none", fontWeight: 600, fontSize: "0.82rem" } },
      },
    },
  });
}

// ─── Pre-built themes (singleton — created once at module load) ───────────────

export const platformThemes: Record<PlatformThemeMode, Theme> = {
  dark:  buildTheme("dark"),
  light: buildTheme("light"),
};
