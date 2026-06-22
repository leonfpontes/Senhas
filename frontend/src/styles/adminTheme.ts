/**
 * Admin Theme — Structural tokens only.
 *
 * Brand colors (primary_color, secondary_color, font_color) come exclusively
 * from useTenant() and are NEVER stored here. This file controls only the
 * structural layer: backgrounds, borders, text, chart grid, etc.
 *
 * Dark mode toggles structural tokens. Brand colors are immune to the toggle.
 */

import { createTheme, Theme } from '@mui/material/styles';

export type AdminThemeMode = 'light' | 'dark';

export interface AdminTokens {
  pageBg:        string;
  sidebarBg:     string;
  cardBg:        string;
  border:        string;
  borderStrong:  string;
  textPrimary:   string;
  textSecondary: string;
  textGhost:     string;
  inputBg:       string;
  chartGrid:     string;
  chartTick:     string;
  tooltipBg:     string;
  rowHover:      string;
  skeletonBase:  string;
}

const TOKENS: Record<AdminThemeMode, AdminTokens> = {
  light: {
    pageBg:        '#F8FAFC',
    sidebarBg:     '#FFFFFF',
    cardBg:        '#FFFFFF',
    border:        '#E2E8F0',
    borderStrong:  '#CBD5E1',
    textPrimary:   '#0F172A',
    textSecondary: '#64748B',
    textGhost:     '#CBD5E1',
    inputBg:       '#F8FAFC',
    chartGrid:     'rgba(0,0,0,0.06)',
    chartTick:     '#94A3B8',
    tooltipBg:     '#FFFFFF',
    rowHover:      'rgba(99,102,241,0.04)',
    skeletonBase:  '#F1F5F9',
  },
  dark: {
    pageBg:        '#0F172A',
    sidebarBg:     '#1E293B',
    cardBg:        '#1E293B',
    border:        'rgba(255,255,255,0.08)',
    borderStrong:  'rgba(255,255,255,0.16)',
    textPrimary:   '#F1F5F9',
    textSecondary: '#94A3B8',
    textGhost:     '#334155',
    inputBg:       'rgba(255,255,255,0.05)',
    chartGrid:     'rgba(255,255,255,0.06)',
    chartTick:     '#64748B',
    tooltipBg:     '#1E293B',
    rowHover:      'rgba(255,255,255,0.04)',
    skeletonBase:  '#334155',
  },
};

export const getAdminTokens = (mode: AdminThemeMode): AdminTokens => TOKENS[mode];

const FONT_FAMILY = [
  '-apple-system', 'BlinkMacSystemFont', '"Inter"', '"Segoe UI"', 'sans-serif',
].join(',');

/**
 * Builds a MUI theme for the admin area using structural tokens only.
 * Brand colors (primary/secondary) are injected at call time from TenantContext.
 */
export function buildAdminTheme(
  mode: AdminThemeMode,
  brandPrimary: string,
  brandSecondary: string,
): Theme {
  const dark = mode === 'dark';
  const t = TOKENS[mode];

  return createTheme({
    palette: {
      mode,
      primary:   { main: brandPrimary },
      secondary: { main: brandSecondary },
      background: {
        default: t.pageBg,
        paper:   t.cardBg,
      },
      text: {
        primary:   t.textPrimary,
        secondary: t.textSecondary,
        disabled:  t.textGhost,
      },
      divider: t.border,
    },

    shape: { borderRadius: 12 },

    typography: {
      fontFamily: FONT_FAMILY,
      h5: { fontWeight: 700, letterSpacing: '-0.02em' },
      h6: { fontWeight: 700, letterSpacing: '-0.015em' },
      subtitle1: { fontWeight: 600 },
      body2: { fontSize: '0.875rem' },
      caption: { fontSize: '0.75rem' },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { backgroundColor: t.pageBg } },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            background: t.cardBg,
            border: `1px solid ${t.border}`,
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            background: t.cardBg,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            background: t.cardBg,
            border: `1px solid ${t.border}`,
            boxShadow: dark
              ? '0 8px 32px rgba(0,0,0,0.5)'
              : '0 4px 20px rgba(0,0,0,0.12)',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            background: t.cardBg,
            border: `1px solid ${t.border}`,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: t.cardBg,
            border: `1px solid ${t.borderStrong}`,
            borderRadius: 16,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: t.sidebarBg,
            borderRight: `1px solid ${t.border}`,
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: t.border } },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, textTransform: 'none', fontWeight: 600 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 600, fontSize: '0.72rem' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            background: t.inputBg,
          },
          notchedOutline: { borderColor: t.border },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              fontWeight: 700,
              fontSize: '0.72rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: t.textSecondary,
              borderBottom: `1px solid ${t.border}`,
              background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            },
          },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root:hover': { background: t.rowHover },
            '& .MuiTableCell-root': {
              borderBottom: `1px solid ${t.border}`,
              color: t.textPrimary,
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { backgroundColor: t.skeletonBase },
        },
      },
    },
  });
}
