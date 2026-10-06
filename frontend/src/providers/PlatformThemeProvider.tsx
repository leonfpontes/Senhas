/**
 * PlatformThemeProvider — modo claro/escuro da área /platform.
 *
 * Só alterna a classe `dark` em <html> (tokens shadcn/Tailwind de globals.css) e persiste a
 * escolha em localStorage. Sem ThemeProvider do MUI: a plataforma é toda shadcn.
 *
 *   const { mode, isDark, toggleMode } = usePlatformTheme();
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type PlatformThemeMode = 'dark' | 'light';

interface PlatformThemeContextValue {
  mode: PlatformThemeMode;
  isDark: boolean;
  toggleMode: () => void;
}

const PlatformThemeContext = createContext<PlatformThemeContextValue>({
  mode: 'light',
  isDark: false,
  toggleMode: () => {},
});

export const usePlatformTheme = (): PlatformThemeContextValue => useContext(PlatformThemeContext);

export const PLATFORM_THEME_STORAGE_KEY = 'platform_theme_mode';

export const PlatformThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<PlatformThemeMode>('light');

  // Reidrata do localStorage (só no cliente).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLATFORM_THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') setMode(saved);
    } catch {
      /* storage indisponível */
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: PlatformThemeMode = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(PLATFORM_THEME_STORAGE_KEY, next);
      } catch {
        /* storage indisponível */
      }
      return next;
    });
  }, []);

  // Classe `dark` na raiz (Dialog/Popover/Select do Radix são portados para o <body>).
  // Removida no unmount: páginas públicas continuam claras.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    return () => {
      root.classList.remove('dark');
    };
  }, [mode]);

  return (
    <PlatformThemeContext.Provider value={{ mode, isDark: mode === 'dark', toggleMode }}>
      {children}
    </PlatformThemeContext.Provider>
  );
};

export default PlatformThemeProvider;
