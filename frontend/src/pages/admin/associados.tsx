/**
 * Admin Associados Page - CRUD table with create/edit drawer and delete confirm
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
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
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import RefreshIcon from '@mui/icons-material/Refresh';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import UpgradePrompt from '../../components/UpgradePrompt';
import { apiClient } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';

interface Associado {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  created_at: string;
}

const EMPTY_FORM = { nome: '', email: '', telefone: '' };

export default function AdminAssociados() {
  const { can, loading: subLoading } = useSubscription();
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Associado | null>(null);
  const [formData, setFormData] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Associado | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => {
    loadAssociados();
  }, []);

  const loadAssociados = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/admin/associados');
      setAssociados(response.data);
    } catch (error) {
      console.error('Error loading associados:', error);
      setSnackbar({ open: true, message: 'Erro ao carregar associados', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // --- Drawer helpers ---
  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (item: Associado) => {
    setCurrentItem(item);
    setFormData({
      nome: item.nome,
      email: item.email,
      telefone: item.telefone || '',
    });
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
    setFormData(EMPTY_FORM);
    setTouched({});
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? Object.values(formData).some((v) => v !== '')
      : currentItem != null &&
        (formData.nome !== currentItem.nome ||
          formData.email !== currentItem.email ||
          formData.telefone !== (currentItem.telefone || ''));

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const emailError = touched.email
    ? !formData.email.trim()
      ? 'E-mail é obrigatório'
      : !isValidEmail(formData.email)
        ? 'E-mail inválido'
        : ''
    : '';
  const saveDisabled = !formData.nome.trim() || !formData.email.trim() || !isValidEmail(formData.email);

  const handleSave = async () => {
    setTouched({ nome: true, email: true, telefone: true });
    if (saveDisabled) return;
    setSaving(true);
    try {
      const payload: Record<string, string | undefined> = {
        nome: formData.nome.trim(),
        email: formData.email.trim(),
      };
      if (formData.telefone.trim()) {
        payload.telefone = formData.telefone.trim();
      }

      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/associados', payload);
        setSnackbar({ open: true, message: 'Associado criado com sucesso!', severity: 'success' });
      } else if (currentItem) {
        await apiClient.put(`/api/v1/admin/associados/${currentItem.id}`, payload);
        setSnackbar({ open: true, message: 'Associado atualizado com sucesso!', severity: 'success' });
      }
      closeDrawer();
      loadAssociados();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Erro ao salvar associado';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDeleteClick = (item: Associado) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/v1/admin/associados/${deleteTarget.id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      setSnackbar({ open: true, message: 'Associado removido com sucesso!', severity: 'success' });
      loadAssociados();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Erro ao remover associado';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  return (
    <AdminLayout title="Associados">
      {!subLoading && !can('associados') ? (
        <UpgradePrompt feature="Associados" minPlan="Pro" />
      ) : (
      <>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>Gestão de Associados</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAssociados} disabled={loading}>
              Atualizar
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Novo Associado
            </Button>
          </Box>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : associados.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Nenhum associado cadastrado. Clique em &quot;Novo Associado&quot; para começar.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Telefone</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {associados.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.nome}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{item.telefone || '—'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(item)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                      <IconButton size="small" onClick={() => handleDeleteClick(item)}>
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

      {/* Create / Edit Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'Novo Associado' : 'Editar Associado'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre um novo associado para emissão de senhas especiais.'
            : 'Altere as informações do associado selecionado.'
        }
        icon={<Diversity3Icon />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Criar' : 'Salvar'}
        saving={saving}
        saveDisabled={saveDisabled}
        isDirty={isDirty}
      >
        <TextField
          label="Nome"
          value={formData.nome}
          onChange={(e) => handleChange('nome', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, nome: true }))}
          fullWidth
          required
          error={!!nomeError}
          helperText={nomeError}
        />
        <TextField
          label="E-mail"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, email: true }))}
          fullWidth
          required
          error={!!emailError}
          helperText={emailError}
        />
        <TextField
          label="Telefone"
          value={formData.telefone}
          onChange={(e) => handleChange('telefone', e.target.value)}
          fullWidth
          helperText="Opcional"
        />
      </CrudDrawer>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Confirmar Remoção</DialogTitle>
        <DialogContent>
          Deseja realmente remover o associado <strong>{deleteTarget?.nome}</strong>?
          Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Remover
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      </>
      )}
    </AdminLayout>
  );
}
