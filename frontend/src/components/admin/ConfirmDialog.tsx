import React from 'react';
import Button         from '@mui/material/Button';
import Dialog         from '@mui/material/Dialog';
import DialogActions  from '@mui/material/DialogActions';
import DialogContent  from '@mui/material/DialogContent';
import DialogTitle    from '@mui/material/DialogTitle';
import Typography     from '@mui/material/Typography';

interface ConfirmDialogProps {
  open:        boolean;
  title:       string;
  message:     React.ReactNode;
  confirmText?: string;
  cancelText?:  string;
  destructive?: boolean;
  loading?:     boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText  = 'Cancelar',
  destructive = false,
  loading     = false,
  onConfirm,
  onCancel,
}) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
    <DialogContent>
      {typeof message === 'string'
        ? <Typography variant="body2" color="text.secondary">{message}</Typography>
        : message}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
      <Button onClick={onCancel} disabled={loading} variant="outlined" color="inherit">
        {cancelText}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={loading}
        variant="contained"
        color={destructive ? 'error' : 'primary'}
        sx={{ minWidth: 90 }}
      >
        {loading ? 'Aguarde...' : confirmText}
      </Button>
    </DialogActions>
  </Dialog>
);
