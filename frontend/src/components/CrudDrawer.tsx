/**
 * CrudDrawer — Reusable side drawer for CRUD forms.
 *
 * Design:
 *  - Header: icon + title + subtitle description
 *  - Body: scrollable form area (children)
 *  - Footer: sticky Cancel / Save buttons
 *  - Unsaved-changes guard on close
 */
'use client';

import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Button,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const DRAWER_WIDTH = 480;

export interface CrudDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  isDirty?: boolean;
}

export default function CrudDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  onSave,
  saveLabel = 'Salvar',
  saving = false,
  saveDisabled = false,
  isDirty = false,
}: CrudDrawerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onClose();
    }
  };

  const handleDiscardClose = () => {
    setConfirmOpen(false);
    onClose();
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={handleClose}
        sx={{ zIndex: (t) => t.zIndex.drawer + 2 }}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : DRAWER_WIDTH,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 3, pt: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {icon && (
                <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                  {icon}
                </Box>
              )}
              <Typography variant="h6" fontWeight={700}>
                {title}
              </Typography>
            </Box>
            <IconButton size="small" onClick={handleClose} aria-label="fechar">
              <CloseIcon />
            </IconButton>
          </Box>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Body — scrollable form area */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 3,
            py: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          {children}
        </Box>

        {/* Footer — sticky action buttons */}
        <Divider />
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1.5,
            bgcolor: 'background.paper',
          }}
        >
          <Button variant="outlined" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={saving || saveDisabled}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {saveLabel}
          </Button>
        </Box>
      </Drawer>

      {/* Unsaved changes confirmation */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Descartar alterações?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Você tem alterações não salvas. Se sair agora, as informações preenchidas serão perdidas.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Continuar editando</Button>
          <Button onClick={handleDiscardClose} color="error">
            Descartar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
