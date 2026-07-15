/**
 * Admin Estoque — Itens (CRUD + saldo colorido)
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { ConfirmDialog } from '@/components/admin';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { apiClient } from '../../../services/api_client';
import CrudDrawer from '../../../components/CrudDrawer';

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'CX', 'PCT', 'RO'] as const;
type Unidade = typeof UNIDADES[number];

/** Small helper to render images that require Authorization header. */
function AuthImage({ src, sx }: { src: string; sx?: object }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiClient.get(src, { responseType: 'blob' }).then((res) => {
      if (!cancelled) {
        const url = URL.createObjectURL(res.data);
        urlRef.current = url;
        setBlobUrl(url);
      }
    }).catch(() => {});
    return () => { cancelled = true; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [src]);
  if (!blobUrl) return null;
  return <Box component="img" src={blobUrl} sx={sx} />;
}

interface Grupo { id: string; nome: string; }

interface Item {
  id: string;
  nome: string;
  grupo_id: string | null;
  grupo_nome: string | null;
  descricao: string | null;
  unidade_medida: Unidade;
  estoque_minimo: number;
  custo_unitario: number | null;
  observacoes: string | null;
  tem_foto: boolean;
  saldo: number;
}

interface FormData {
  nome: string;
  grupo_id: string;
  descricao: string;
  unidade_medida: Unidade;
  estoque_minimo: string;
  custo_unitario: string;
  observacoes: string;
  foto_base64: string | null;
  foto_content_type: string | null;
}

const EMPTY_FORM: FormData = {
  nome: '', grupo_id: '', descricao: '',
  unidade_medida: 'UN', estoque_minimo: '0',
  custo_unitario: '', observacoes: '',
  foto_base64: null, foto_content_type: null,
};

function SaldoChip({ saldo, minimo, unidade }: { saldo: number; minimo: number; unidade: string }) {
  const isCrit = saldo < 0 || (minimo > 0 && saldo === 0);
  const isLow = !isCrit && minimo > 0 && saldo < minimo;
  const color = isCrit ? 'error' : isLow ? 'warning' : 'success';
  const label = `${saldo} ${unidade}`;
  return <Chip label={label} color={color} size="small" variant="outlined" />;
}

export default function AdminEstoqueItensPage() {
  return (
    <AdminLayout title="Itens de Estoque">
      <AdminEstoqueItensContent />
    </AdminLayout>
  );
}

function AdminEstoqueItensContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('estoque', 'view');
  const canInsert = canGroup('estoque', 'insert');
  const canEdit = canGroup('estoque', 'edit');
  const canDelete = canGroup('estoque', 'delete');
  const [items, setItems] = useState<Item[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterGrupo, setFilterGrupo] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => {
    loadGrupos();
  }, [canView]);

  useEffect(() => { loadItems(); }, [filterGrupo, canView]);

  const loadGrupos = async () => {
    if (!canView) return;
    try {
      const res = await apiClient.get('/api/v1/admin/estoque/grupos');
      setGrupos(res.data);
    } catch { /* silencioso */ }
  };

  const loadItems = async () => {
    if (!canView) { setLoading(false); return; }
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterGrupo) params.grupo_id = filterGrupo;
      const res = await apiClient.get('/api/v1/admin/estoque/itens', { params });
      setItems(res.data);
    } catch {
      setSnackbar({ open: true, message: 'Erro ao carregar itens', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setFotoPreview(null);
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = async (item: Item) => {
    setCurrentItem(item);
    setFormData({
      nome: item.nome,
      grupo_id: item.grupo_id || '',
      descricao: item.descricao || '',
      unidade_medida: item.unidade_medida,
      estoque_minimo: String(item.estoque_minimo),
      custo_unitario: item.custo_unitario != null ? String(item.custo_unitario) : '',
      observacoes: item.observacoes || '',
      foto_base64: null,
      foto_content_type: null,
    });
    if (item.tem_foto) {
      try {
        const res = await apiClient.get(`/api/v1/admin/estoque/itens/${item.id}/foto`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        setFotoPreview(url);
      } catch {
        setFotoPreview(null);
      }
    } else {
      setFotoPreview(null);
    }
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setFotoPreview(dataUri);
      setFormData((prev) => ({
        ...prev,
        foto_base64: dataUri,
        foto_content_type: file.type,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!formData.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;

    const minimo = parseInt(formData.estoque_minimo, 10);
    if (isNaN(minimo) || minimo < 0) {
      setSnackbar({ open: true, message: 'Estoque mínimo inválido', severity: 'error' });
      return;
    }
    const custo = formData.custo_unitario ? parseFloat(formData.custo_unitario) : null;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: formData.nome.trim(),
        grupo_id: formData.grupo_id || null,
        descricao: formData.descricao.trim() || null,
        unidade_medida: formData.unidade_medida,
        estoque_minimo: minimo,
        custo_unitario: custo,
        observacoes: formData.observacoes.trim() || null,
        foto_base64: formData.foto_base64,
        foto_content_type: formData.foto_content_type,
      };

      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/estoque/itens', payload);
        setSnackbar({ open: true, message: 'Item criado com sucesso!', severity: 'success' });
      } else {
        await apiClient.put(`/api/v1/admin/estoque/itens/${currentItem!.id}`, payload);
        setSnackbar({ open: true, message: 'Item atualizado!', severity: 'success' });
      }
      setDrawerOpen(false);
      loadItems();
    } catch {
      setSnackbar({ open: true, message: 'Erro ao salvar item', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    try {
      await apiClient.delete(`/api/v1/admin/estoque/itens/${deleteTarget.id}`);
      setSnackbar({ open: true, message: 'Item excluído.', severity: 'success' });
      loadItems();
    } catch {
      setSnackbar({ open: true, message: 'Erro ao excluir item', severity: 'error' });
    } finally {
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  if (subLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!can('estoque_controle')) return <UpgradePrompt feature="controle de estoque" minPlan="Pro" />;
  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar itens de estoque. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <Box>
      <Box data-tour="estoque-itens-header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Inventory2Icon color="primary" />
          <Typography variant="h5" fontWeight={700}>Itens de Estoque</Typography>
          <Chip label={`${items.length}`} size="small" variant="outlined" />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl data-tour="estoque-itens-filtro" size="small" sx={{ minWidth: 180 }}>
            <Select value={filterGrupo} label="Filtrar por grupo" onChange={(e) => setFilterGrupo(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {grupos.map((g) => <MenuItem key={g.id} value={g.id}>{g.nome}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Atualizar"><IconButton onClick={loadItems}><RefreshIcon /></IconButton></Tooltip>
          {canInsert && (
            <Button data-tour="estoque-itens-novo" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Novo Item</Button>
          )}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Inventory2Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Nenhum item cadastrado.</Typography>
        </Paper>
      ) : (
        <TableContainer data-tour="estoque-itens-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Nome</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Grupo</strong></TableCell>
                <TableCell><strong>Saldo</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Mínimo</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><strong>Custo Unit.</strong></TableCell>
                {(canEdit || canDelete) && <TableCell align="right"><strong>Ações</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {item.tem_foto && (
                        <AuthImage
                          src={`/api/v1/admin/estoque/itens/${item.id}/foto`}
                          sx={{ width: 32, height: 32, borderRadius: 1, objectFit: 'cover' }}
                        />
                      )}
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{item.nome}</Typography>
                        {item.descricao && <Typography variant="caption" color="text.secondary">{item.descricao}</Typography>}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{item.grupo_nome || '—'}</TableCell>
                  <TableCell><SaldoChip saldo={item.saldo} minimo={item.estoque_minimo} unidade={item.unidade_medida} /></TableCell>
                  <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{item.estoque_minimo} {item.unidade_medida}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>{item.custo_unitario != null ? `R$ ${item.custo_unitario.toFixed(2)}` : '—'}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell align="right">
                      {canEdit && <Tooltip title="Editar"><IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton></Tooltip>}
                      {canDelete && <Tooltip title="Excluir"><IconButton size="small" color="error" onClick={() => { setDeleteTarget(item); setDeleteOpen(true); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Drawer */}
      <CrudDrawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Novo Item' : 'Editar Item'}
        onClose={() => {
          if (fotoPreview && fotoPreview.startsWith('blob:')) URL.revokeObjectURL(fotoPreview);
          setDrawerOpen(false);
          setCurrentItem(null);
          setFotoPreview(null);
        }}
        onSave={handleSave}
        saving={saving}
      >
        <TextField
          label="Nome do item *"
          fullWidth
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
          onBlur={() => setTouched({ ...touched, nome: true })}
          error={touched.nome && !formData.nome.trim()}
          helperText={touched.nome && !formData.nome.trim() ? 'Nome obrigatório' : ''}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Grupo</InputLabel>
          <Select value={formData.grupo_id} label="Grupo" onChange={(e) => setFormData({ ...formData, grupo_id: e.target.value })}>
            <MenuItem value="">Sem grupo</MenuItem>
            {grupos.map((g) => <MenuItem key={g.id} value={g.id}>{g.nome}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Descrição"
          fullWidth
          multiline
          rows={2}
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Unidade de medida</InputLabel>
            <Select value={formData.unidade_medida} label="Unidade de medida" onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value as Unidade })}>
              {UNIDADES.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            label="Estoque mínimo"
            fullWidth
            type="number"
            inputProps={{ min: 0 }}
            value={formData.estoque_minimo}
            onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
          />
        </Box>
        <TextField
          label="Custo unitário (R$)"
          fullWidth
          type="number"
          inputProps={{ min: 0, step: '0.01' }}
          value={formData.custo_unitario}
          onChange={(e) => setFormData({ ...formData, custo_unitario: e.target.value })}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Observações"
          fullWidth
          multiline
          rows={2}
          value={formData.observacoes}
          onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
          sx={{ mb: 2 }}
        />

        {/* Foto */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Foto (JPG/PNG/WEBP, máx. 2 MB)</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
            {fotoPreview && (
              <Box
                component="img"
                src={fotoPreview}
                sx={{ width: 56, height: 56, borderRadius: 1, objectFit: 'cover', border: 1, borderColor: 'divider' }}
              />
            )}
            <Button variant="outlined" size="small" startIcon={<PhotoCameraIcon />} onClick={() => fileInputRef.current?.click()}>
              {fotoPreview ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleFotoChange}
            />
          </Box>
        </Box>
      </CrudDrawer>

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir Item"
        message={<><Typography component="span">Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>?</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>O histórico de movimentações será mantido.</Typography></>}
        confirmText="Excluir"
        destructive
        onConfirm={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
