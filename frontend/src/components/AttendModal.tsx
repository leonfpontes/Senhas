/**
 * AttendModal - Modal for confirming/editing a consultation (atendimento)
 * Collects medium name, cambone name, and description
 */
import React, { useState, useEffect } from 'react';
import {
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from '@mui/material';

interface MediumOption {
  id: string;
  nome: string;
  is_atendimento: boolean;
}

interface AttendModalProps {
  open: boolean;
  ticketNumero: number;
  consulenteNome: string;
  onConfirm: (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => void;
  onClose: () => void;
  loading?: boolean;
  /** Pre-populate fields for edit mode */
  initialValues?: {
    medium_nome?: string;
    cambone_nome?: string;
    atendimento_descricao?: string;
  };
  /** True when editing an already completed ticket */
  editMode?: boolean;
  /** Médium de atendimento options (is_atendimento=true) */
  mediumOptions?: MediumOption[];
  /** All active options (médiuns + cambones) */
  camboneOptions?: MediumOption[];
}

export default function AttendModal({
  open,
  ticketNumero,
  consulenteNome,
  onConfirm,
  onClose,
  loading = false,
  initialValues,
  editMode = false,
  mediumOptions = [],
  camboneOptions = [],
}: AttendModalProps) {
  const [mediumNome, setMediumNome] = useState('');
  const [camboneNome, setCamboneNome] = useState('');
  const [descricao, setDescricao] = useState('');

  // Populate fields when opening (supports edit mode)
  useEffect(() => {
    if (open) {
      setMediumNome(initialValues?.medium_nome || '');
      setCamboneNome(initialValues?.cambone_nome || '');
      setDescricao(initialValues?.atendimento_descricao || '');
    }
  }, [open, initialValues]);

  const handleConfirm = () => {
    if (!mediumNome.trim()) return;
    onConfirm({
      medium_nome: mediumNome.trim(),
      cambone_nome: camboneNome.trim() || undefined,
      atendimento_descricao: descricao.trim() || undefined,
    });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editMode ? 'Editar Atendimento' : 'Confirmar Atendimento'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Senha <strong>#{ticketNumero}</strong> — {consulenteNome}
          </Typography>
        </Box>
        <Autocomplete
          freeSolo
          options={mediumOptions.map((m) => m.nome)}
          inputValue={mediumNome}
          onInputChange={(_, v) => setMediumNome(v)}
          disabled={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              label="Nome do Médium *"
              fullWidth
              sx={{ mb: 2 }}
            />
          )}
        />
        <Autocomplete
          freeSolo
          options={camboneOptions.map((m) => m.nome)}
          inputValue={camboneNome}
          onInputChange={(_, v) => setCamboneNome(v)}
          disabled={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Nome do Cambone"
              fullWidth
              sx={{ mb: 2 }}
            />
          )}
        />
        <TextField
          label="Descrição / Observações"
          fullWidth
          multiline
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          disabled={loading}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!mediumNome.trim() || loading}
        >
          {loading ? 'Salvando...' : editMode ? 'Salvar Alterações' : 'Confirmar Atendimento'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
