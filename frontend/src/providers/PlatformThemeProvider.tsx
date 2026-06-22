/**
 * PlatformThemeProvider
 *
 * Scoped MUI ThemeProvider + context for the /platform area.
 * Default mode is "light". Persists the chosen mode to localStorage across sessions.
 *
 * Usage (in layout.tsx):
 *   <PlatformThemeProvider>...</PlatformThemeProvider>
 *
 * Usage (in any child):
 *   const { mode, isDark, toggleMode, tokens } = usePlatformTheme();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import {
  PlatformThemeMode,
  PlatformTokens,
  getTokens,
  platformThemes,
} from "../styles/platformTheme";

// ─── Context ──────────────────────────────────────────────────────────────────

interface PlatformThemeContextValue {
  mode:       PlatformThemeMode;
  isDark:     boolean;
  tokens:     PlatformTokens;
  toggleMode: () => void;
}

const PlatformThemeContext = createContext<PlatformThemeContextValue>({
  mode:       "light",
  isDark:     false,
  tokens:     getTokens("light"),
  toggleMode: () => {},
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const usePlatformTheme = (): PlatformThemeContextValue =>
  useContext(PlatformThemeContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "platform_theme_mode";

export const PlatformThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<PlatformThemeMode>("light");

  // Rehydrate from localStorage (client-side only).
  // Sessions saved with the old default "dark" are migrated to "light".
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PlatformThemeMode | null;
    if (saved === "dark" || saved === "light") setMode(saved);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: PlatformThemeMode = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value: PlatformThemeContextValue = {
    mode,
    isDark:     mode === "dark",
    tokens:     getTokens(mode),
    toggleMode,
  };

  return (
    <PlatformThemeContext.Provider value={value}>
      <ThemeProvider theme={platformThemes[mode]}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </PlatformThemeContext.Provider>
  );
};
