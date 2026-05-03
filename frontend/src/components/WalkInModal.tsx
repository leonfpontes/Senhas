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
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from '@mui/material';
import {
  PRIORITY_CATEGORY_LABELS,
  PRIORITY_ORDER,
} from 'shared-types';

interface WalkInModalProps {
  open: boolean;
  mode?: 'create' | 'edit';
  ticketNumero?: string;
  initialValues?: {
    nome?: string;
    email?: string;
    telefone?: string;
    priority_category?: string | null;
  };
  onConfirm: (data: {
    nome: string;
    email?: string;
    telefone?: string;
    priority_category: string | null;
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
  const [priorityCategory, setPriorityCategory] = useState<string>('none');

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome || '');
    setEmail(initialValues?.email || '');
    setTelefone(initialValues?.telefone || '');
    setPriorityCategory(initialValues?.priority_category || 'none');
  }, [open, initialValues]);

  const handleConfirm = () => {
    if (!nome.trim()) return;
    onConfirm({
      nome: nome.trim(),
      email: email.trim() || undefined,
      telefone: telefone.trim() || undefined,
      priority_category: priorityCategory === 'none' ? null : priorityCategory,
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
          sx={{ mb: 2 }}
          disabled={loading}
        />
        <FormControl component="fieldset" disabled={loading}>
          <FormLabel component="legend" id="walk-in-priority-label" sx={{ fontSize: 14, mb: 0.5 }}>
            Atendimento preferencial
          </FormLabel>
          <RadioGroup
            aria-labelledby="walk-in-priority-label"
            value={priorityCategory}
            onChange={(e) => setPriorityCategory(e.target.value)}
          >
            <FormControlLabel
              value="none"
              control={<Radio size="small" />}
              label={<Typography variant="body2">Não sou de grupo prioritário</Typography>}
            />
            {PRIORITY_ORDER.map((cat) => (
              <FormControlLabel
                key={cat}
                value={cat}
                control={<Radio size="small" />}
                label={<Typography variant="body2">{PRIORITY_CATEGORY_LABELS[cat]}</Typography>}
              />
            ))}
          </RadioGroup>
        </FormControl>
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
