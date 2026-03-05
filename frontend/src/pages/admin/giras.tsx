/**
 * T073: Admin Giras Page - Giras table with edit modal and delete confirm
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';

interface Gira {
  id: string;
  nome: string;
  descricao?: string;
  data_inicio: string;
  data_fim?: string;
  local?: string;
  is_active: boolean;
}

export default function AdminGiras() {
  const [giras, setGiras] = useState<Gira[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentGira, setCurrentGira] = useState<Gira | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    loadGiras();
  }, []);

  const loadGiras = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/admin/giras');
      setGiras(response.data.items || response.data);
    } catch (error) {
      console.error('Error loading giras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (gira: Gira) => {
    setCurrentGira(gira);
    setFormData(gira);
    setEditOpen(true);
  };

  const handleDeleteClick = (gira: Gira) => {
    setCurrentGira(gira);
    setDeleteOpen(true);
  };

  const handleEditClose = () => {
    setEditOpen(false);
    setCurrentGira(null);
    setFormData({});
  };

  const handleDeleteClose = () => {
    setDeleteOpen(false);
    setCurrentGira(null);
  };

  const handleSave = async () => {
    try {
      if (currentGira) {
        await apiClient.put(`/api/v1/admin/giras/${currentGira.id}`, formData);
        handleEditClose();
        loadGiras();
      }
    } catch (error) {
      console.error('Error saving gira:', error);
    }
  };

  const handleDelete = async () => {
    try {
      if (currentGira) {
        await apiClient.delete(`/api/v1/admin/giras/${currentGira.id}`);
        handleDeleteClose();
        loadGiras();
      }
    } catch (error) {
      console.error('Error deleting gira:', error);
    }
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <AdminLayout title="Gerenciar Giras">
      <Box sx={{ mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />}>
          Nova Gira
        </Button>
      </Box>

      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Data Início</TableCell>
                <TableCell>Local</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {giras.map((gira) => (
                <TableRow key={gira.id}>
                  <TableCell>{gira.nome}</TableCell>
                  <TableCell>
                    {new Date(gira.data_inicio).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>{gira.local || '-'}</TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        display: 'inline-block',
                        px: 2,
                        py: 0.5,
                        borderRadius: 1,
                        backgroundColor: gira.is_active ? '#c8e6c9' : '#ffcdd2',
                        color: gira.is_active ? '#2e7d32' : '#c62828',
                        fontSize: '0.875rem',
                      }}
                    >
                      {gira.is_active ? 'Ativa' : 'Inativa'}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(gira)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Deletar">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(gira)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle>Editar Gira</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Nome"
            value={formData.nome || ''}
            onChange={(e) => handleFormChange('nome', e.target.value)}
            fullWidth
          />
          <TextField
            label="Descrição"
            value={formData.descricao || ''}
            onChange={(e) => handleFormChange('descricao', e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label="Data Início"
            type="datetime-local"
            value={formData.data_inicio || ''}
            onChange={(e) => handleFormChange('data_inicio', e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Local"
            value={formData.local || ''}
            onChange={(e) => handleFormChange('local', e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onClose={handleDeleteClose}>
        <DialogTitle>Confirmar Deletar</DialogTitle>
        <DialogContent>
          Tem certeza que deseja deletar a gira "{currentGira?.nome}"?
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose}>Cancelar</Button>
          <Button onClick={handleDelete} variant="contained" color="error">
            Deletar
          </Button>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  );
}
