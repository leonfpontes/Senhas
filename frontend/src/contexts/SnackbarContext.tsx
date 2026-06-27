/**
 * SnackbarContext — provider global de notificações (toast) para uso em código novo.
 *
 * Uso:
 *   const { showSuccess, showError, showInfo } = useSnackbar();
 *   showSuccess('Salvo com sucesso');
 *
 * Não substitui os Snackbars locais existentes — coexiste com eles.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { AlertColor } from '@mui/material/Alert';

interface SnackbarContextValue {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({
  showSuccess: () => {},
  showError: () => {},
  showInfo: () => {},
});

export const useSnackbar = (): SnackbarContextValue => useContext(SnackbarContext);

interface SnackState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snack, setSnack] = useState<SnackState>({ open: false, message: '', severity: 'success' });

  const show = useCallback((message: string, severity: AlertColor) => {
    setSnack({ open: true, message, severity });
  }, []);

  const value = useMemo<SnackbarContextValue>(
    () => ({
      showSuccess: (msg: string) => show(msg, 'success'),
      showError: (msg: string) => show(msg, 'error'),
      showInfo: (msg: string) => show(msg, 'info'),
    }),
    [show],
  );

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

export default SnackbarContext;
