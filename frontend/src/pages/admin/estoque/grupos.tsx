/**
 * Admin Estoque — Grupos de Material (CRUD)
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CategoryIcon from '@mui/icons-material/Category';
import RefreshIcon from '@mui/icons-material/Refresh';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { apiClient } from '../../../services/api_client';
import CrudDrawer from '../../../components/CrudDrawer';

interface Grupo {
  id: string;
  nome: string;
  descricao: string | null;
}

const EMPTY_FORM = { nome: '', descricao: '' };

export default function AdminEstoqueGruposPage() {
  return (
    <AdminLayout title="Grupos de Material">
      <AdminEstoqueGruposContent />
    </AdminLayout>
  );
}

function AdminEstoqueGruposContent() {
  const { can, loading: subLoading } = useSubscription();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Grupo | null>(null);
  const [formData, setFormData] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Grupo | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => { loadGrupos(); }, []);

  const loadGrupos = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/v1/admin/estoque/grupos');
      setGrupos(res.data);
    } catch {
      setSnackbar({ open: true, message: 'Erro ao carregar grupos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (item: Grupo) => {
    setCurrentItem(item);
    setFormData({ nome: item.nome, descricao: item.descricao || '' });
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
  };

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!formData.nome.trim()) return;

    setSaving(true);
    try {
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/estoque/grupos', {
          nome: formData.nome.trim(),
          descricao: formData.descricao.trim() || null,
        });
        setSnackbar({ open: true, message: 'Grupo criado com sucesso!', severity: 'success' });
      } else {
        await apiClient.put(`/api/v1/admin/estoque/grupos/${currentItem!.id}`, {
          nome: formData.nome.trim(),
          descricao: formData.descricao.trim() || null,
        });
        setSnackbar({ open: true, message: 'Grupo atualizado!', severity: 'success' });
      }
      closeDrawer();
      loadGrupos();
    } catch {
      setSnackbar({ open: true, message: 'Erro ao salvar grupo', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/v1/admin/estoque/grupos/${deleteTarget.id}`);
      setSnackbar({ open: true, message: 'Grupo excluído.', severity: 'success' });
      loadGrupos();
    } catch {
      setSnackbar({ open: true, message: 'Erro ao excluir grupo', severity: 'error' });
    } finally {
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  if (subLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!can('estoque_controle')) return <UpgradePrompt feature="controle de estoque" minPlan="Pro" />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CategoryIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Grupos de Material</Typography>
          <Chip label={`${grupos.length} grupo${grupos.length !== 1 ? 's' : ''}`} size="small" variant="outlined" />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Atualizar"><IconButton onClick={loadGrupos}><RefreshIcon /></IconButton></Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Novo Grupo</Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : grupos.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CategoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Nenhum grupo cadastrado. Crie o primeiro!</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Nome</strong></TableCell>
                <TableCell><strong>Descrição</strong></TableCell>
                <TableCell align="right"><strong>Ações</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell>{g.nome}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{g.descricao || '—'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar"><IconButton size="small" onClick={() => openEdit(g)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Excluir"><IconButton size="small" color="error" onClick={() => { setDeleteTarget(g); setDeleteOpen(true); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Drawer */}
      <CrudDrawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Novo Grupo' : 'Editar Grupo'}
        onClose={closeDrawer}
        onSave={handleSave}
        loading={saving}
      >
        <TextField
          label="Nome do grupo *"
          fullWidth
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
          onBlur={() => setTouched({ ...touched, nome: true })}
          error={touched.nome && !formData.nome.trim()}
          helperText={touched.nome && !formData.nome.trim() ? 'Nome obrigatório' : ''}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Descrição"
          fullWidth
          multiline
          rows={3}
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
        />
      </CrudDrawer>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir Grupo</DialogTitle>
        <DialogContent>
          <Typography>Tem certeza que deseja excluir o grupo <strong>{deleteTarget?.nome}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>Excluir</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
