import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
} from '@mui/material';

interface WalkInModalProps {
  open: boolean;
  mode?: 'create' | 'edit';
  ticketNumero?: string;
  initialValues?: {
    nome?: string;
    email?: string;
    telefone?: string;
    preferencial?: boolean;
  };
  onConfirm: (data: {
    nome: string;
    email?: string;
    telefone?: string;
    preferencial: boolean;
  }) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function WalkInModal({
  open,
  mode = 'create',
  ticketNumero,
  initialValues,
  onConfirm,
  onClose,
  loading = false,
}: WalkInModalProps) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [preferencial, setPreferencial] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome || '');
    setEmail(initialValues?.email || '');
    setTelefone(initialValues?.telefone || '');
    setPreferencial(initialValues?.preferencial || false);
  }, [open, initialValues]);

  const handleConfirm = () => {
    if (!nome.trim()) return;
    onConfirm({
      nome: nome.trim(),
      email: email.trim() || undefined,
      telefone: telefone.trim() || undefined,
      preferencial,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'edit' ? 'Editar Walk-in' : 'Novo Walk-in'}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {mode === 'edit'
              ? `Atualize os dados do consulente${ticketNumero ? ` (${ticketNumero})` : ''}`
              : 'Cadastre um novo consulente presencial e insira-o na fila'}
          </Typography>
        </Box>
        <TextField
          autoFocus
          label="Nome *"
          fullWidth
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          sx={{ mb: 2 }}
          disabled={loading}
        />
        <TextField
          label="E-mail"
          type="email"
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
          disabled={loading}
        />
        <TextField
          label="Telefone"
          fullWidth
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          sx={{ mb: 1 }}
          disabled={loading}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={preferencial}
              onChange={(e) => setPreferencial(e.target.checked)}
              disabled={loading}
            />
          }
          label="Marcar como preferencial"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!nome.trim() || loading}>
          {loading ? 'Salvando...' : mode === 'edit' ? 'Salvar Alterações' : 'Emitir Walk-in'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
