/**
 * SnackbarContext — fachada sobre o `toast()` do Sonner (fase 1 da migração MUI → shadcn).
 *
 * Uso (inalterado para quem já usava):
 *   const { showSuccess, showError, showInfo, showWarning, showSnackbar } = useSnackbar();
 *   showSuccess('Salvo com sucesso');
 *   showSnackbar('Atenção', 'warning');
 *
 * O `<Toaster />` (components/ui/sonner) está montado em `_app.tsx`; o provider continua
 * existindo só para não quebrar as telas que o importam — não renderiza mais Snackbar do MUI.
 * Código novo pode importar `toast` de 'sonner' diretamente.
 */
import React, { createContext, useContext } from 'react';
import { toast } from 'sonner';

export type SnackbarSeverity = 'success' | 'error' | 'info' | 'warning';

interface SnackbarContextValue {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
  showWarning: (msg: string) => void;
  showSnackbar: (msg: string, severity?: SnackbarSeverity) => void;
}

export function showSnackbar(message: string, severity: SnackbarSeverity = 'info'): void {
  switch (severity) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
    default:
      toast.info(message);
  }
}

const value: SnackbarContextValue = {
  showSuccess: (msg) => showSnackbar(msg, 'success'),
  showError: (msg) => showSnackbar(msg, 'error'),
  showInfo: (msg) => showSnackbar(msg, 'info'),
  showWarning: (msg) => showSnackbar(msg, 'warning'),
  showSnackbar,
};

const SnackbarContext = createContext<SnackbarContextValue>(value);

export const useSnackbar = (): SnackbarContextValue => useContext(SnackbarContext);

/** Mantido por compatibilidade: só repassa os filhos (o Toaster vive em `_app.tsx`). */
export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>
);

export default SnackbarContext;
