/**
 * AdminThemeProvider
 *
 * Scoped MUI ThemeProvider for the /admin area.
 * Manages structural tokens (dark/light) independently of the tenant's brand colors.
 * Brand colors (primary_color, secondary_color) are read from TenantContext and
 * passed into the MUI theme so they survive dark mode toggling.
 *
 * Usage (in admin_layout.tsx):
 *   <AdminThemeProvider>...</AdminThemeProvider>
 *
 * Usage (in any /admin component):
 *   const { mode, isDark, tokens, toggleMode } = useAdminTheme();
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { AdminThemeMode, AdminTokens, buildAdminTheme, getAdminTokens } from '../styles/adminTheme';
import { useTenant } from './ThemeProvider';

const DEFAULT_PRIMARY   = '#6366F1';
const DEFAULT_SECONDARY = '#EC4899';
const STORAGE_KEY       = 'admin_theme_mode';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AdminThemeContextValue {
  mode:       AdminThemeMode;
  isDark:     boolean;
  tokens:     AdminTokens;
  toggleMode: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue>({
  mode:       'light',
  isDark:     false,
  tokens:     getAdminTokens('light'),
  toggleMode: () => {},
});

export const useAdminTheme = (): AdminThemeContextValue => useContext(AdminThemeContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AdminThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useTenant();
  const brandPrimary   = config?.colors?.primary   ?? DEFAULT_PRIMARY;
  const brandSecondary = config?.colors?.secondary ?? DEFAULT_SECONDARY;

  const [mode, setMode] = useState<AdminThemeMode>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as AdminThemeMode | null;
      if (saved === 'dark' || saved === 'light') setMode(saved);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: AdminThemeMode = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  // Rebuild theme whenever mode or brand colors change.
  // Brand colors change when TenantContext resolves after login.
  const theme = React.useMemo(
    () => buildAdminTheme(mode, brandPrimary, brandSecondary),
    [mode, brandPrimary, brandSecondary],
  );

  const value: AdminThemeContextValue = {
    mode,
    isDark: mode === 'dark',
    tokens: getAdminTokens(mode),
    toggleMode,
  };

  return (
    <AdminThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AdminThemeContext.Provider>
  );
};
