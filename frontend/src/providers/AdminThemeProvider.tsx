/**
 * AdminThemeProvider
 *
 * Modo claro/escuro da área /admin. Aplica a classe `dark` em <html> para os tokens
 * shadcn/Tailwind de `styles/globals.css` e guarda a escolha em localStorage.
 * As cores do terreiro vêm do TenantAwareThemeProvider (applyBrand) e não mudam com o modo.
 *
 * Uso: const { mode, isDark, toggleMode } = useAdminTheme();
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type AdminThemeMode = 'light' | 'dark';

const STORAGE_KEY       = 'admin_theme_mode';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AdminThemeContextValue {
  mode:       AdminThemeMode;
  isDark:     boolean;
  toggleMode: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue>({
  mode:       'light',
  isDark:     false,
  toggleMode: () => {},
});

export const useAdminTheme = (): AdminThemeContextValue => useContext(AdminThemeContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AdminThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<AdminThemeMode>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as AdminThemeMode | null;
      if (saved === 'dark' || saved === 'light') setMode(saved);
    } catch { /* non-critical */ }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: AdminThemeMode = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* non-critical */ }
      return next;
    });
  }, []);

  // Classe `dark` em <html> para os tokens shadcn/Tailwind (globals.css). Na raiz, e não
  // no div do layout, porque Dialog/Popover/Select do Radix são portados para o <body>.
  // Removida no unmount: páginas públicas continuam claras.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    return () => { root.classList.remove('dark'); };
  }, [mode]);

  const value: AdminThemeContextValue = {
    mode,
    isDark: mode === 'dark',
    toggleMode,
  };

  return (
    <AdminThemeContext.Provider value={value}>
      {children}
    </AdminThemeContext.Provider>
  );
};
