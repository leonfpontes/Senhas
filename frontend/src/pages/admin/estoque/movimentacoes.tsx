/**
 * Admin Estoque — Movimentações (CRUD completo)
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import UpgradePrompt from '../../../components/UpgradePrompt';
import CrudDrawer from '../../../components/CrudDrawer';
import { apiClient } from '../../../services/api_client';

interface Item { id: string; nome: string; saldo: number; estoque_minimo: number; unidade_medida: string; }
interface Movimentacao {
  id: string;
  item_id: string;
  item_nome: string | null;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo: string | null;
  data_movimentacao: string;
  requisitante: string | null;
  created_at: string;
}

interface FormData {
  item_id: string;
  tipo: 'entrada' | 'saida';
  quantidade: string;
  data_movimentacao: string;
  motivo: string;
  requisitante: string;
}

const toLocalDatetimeInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const EMPTY_FORM: FormData = {
  item_id: '', tipo: 'entrada', quantidade: '',
  data_movimentacao: '',
  motivo: '', requisitante: '',
};

export default function AdminEstoqueMovimentacoesPage() {
  return (
    <AdminLayout title="Movimentações de Estoque">
      <AdminEstoqueMovimentacoesContent />
    </AdminLayout>
  );
}

function AdminEstoqueMovimentacoesContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterItem, setFilterItem] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<Movimentacao | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // For showing negative-stock warning
  const [saldoWarning, setSaldoWarning] = useState<string | null>(null);

  // Delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Movimentacao | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({
    open: false, message: '', severity: 'success',
  });
  const showSnack = (message: string, severity: 'success' | 'error' | 'warning' = 'success') =>
    setSnackbar({ open: true, message, severity });

  const canEdit = canGroup('estoque', 'edit');
  const canDelete = canGroup('estoque', 'delete');
  const canInsert = canGroup('estoque', 'insert');

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(filterSearch), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterSearch]);

  useEffect(() => { loadMovimentacoes(); }, [filterItem, filterTipo, filterDateFrom, filterDateTo, debouncedSearch]);

  const loadItems = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/estoque/itens');
      setItems(res.data);
    } catch { /* silencioso */ }
  };

  const loadMovimentacoes = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterItem) params.item_id = filterItem;
      if (filterTipo) params.tipo = filterTipo;
      if (filterDateFrom) params.date_from = new Date(filterDateFrom + 'T00:00:00').toISOString();
      if (filterDateTo) params.date_to = new Date(filterDateTo + 'T23:59:59').toISOString();
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await apiClient.get('/api/v1/admin/estoque/movimentacoes', { params });
      setMovimentacoes(res.data);
    } catch {
      showSnack('Erro ao carregar movimentações', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (itemId: string) => {
    setFormData((prev) => ({ ...prev, item_id: itemId }));
    checkNegativeWarning(itemId, formData.tipo, formData.quantidade);
  };

  const checkNegativeWarning = (itemId: string, tipo: 'entrada' | 'saida', qtdStr: string) => {
    if (tipo !== 'saida' || !itemId) { setSaldoWarning(null); return; }
    const item = items.find((i) => i.id === itemId);
    if (!item) { setSaldoWarning(null); return; }
    const qtd = parseInt(qtdStr, 10);
    if (!isNaN(qtd) && qtd > 0 && item.saldo - qtd < 0) {
      setSaldoWarning(`Atenção: esta saída resultará em saldo negativo (${item.saldo - qtd} ${item.unidade_medida}).`);
    } else {
      setSaldoWarning(null);
    }
  };

  const openCreate = async () => {
    await loadItems();
    setFormData({ ...EMPTY_FORM, data_movimentacao: toLocalDatetimeInput(new Date()) });
    setSaldoWarning(null);
    setTouched({});
    setDrawerError(null);
    setEditTarget(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (m: Movimentacao) => {
    setFormData({
      item_id: m.item_id,
      tipo: m.tipo,
      quantidade: String(m.quantidade),
      data_movimentacao: toLocalDatetimeInput(new Date(m.data_movimentacao)),
      motivo: m.motivo ?? '',
      requisitante: m.requisitante ?? '',
    });
    setSaldoWarning(null);
    setTouched({});
    setDrawerError(null);
    setEditTarget(m);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setTouched({ item_id: true, quantidade: true });
    if (!formData.item_id || !formData.quantidade || parseInt(formData.quantidade, 10) <= 0) {
      setDrawerError('Preencha o item e a quantidade.');
      return;
    }

    setSaving(true);
    setDrawerError(null);
    try {
      if (drawerMode === 'edit' && editTarget) {
        await apiClient.put(`/api/v1/admin/estoque/movimentacoes/${editTarget.id}`, {
          tipo: formData.tipo,
          quantidade: parseInt(formData.quantidade, 10),
          data_movimentacao: new Date(formData.data_movimentacao).toISOString(),
          motivo: formData.motivo.trim() || null,
          requisitante: formData.requisitante.trim() || null,
        });
        showSnack('Movimentação atualizada!');
      } else {
        await apiClient.post('/api/v1/admin/estoque/movimentacoes', {
          item_id: formData.item_id,
          tipo: formData.tipo,
          quantidade: parseInt(formData.quantidade, 10),
          data_movimentacao: new Date(formData.data_movimentacao).toISOString(),
          motivo: formData.motivo.trim() || null,
          requisitante: formData.requisitante.trim() || null,
        });
        showSnack('Movimentação registrada!');
      }
      setDrawerOpen(false);
      setFormData(EMPTY_FORM);
      setSaldoWarning(null);
      loadItems();
      loadMovimentacoes();
    } catch (e: any) {
      setDrawerError(e?.response?.data?.detail || e?.response?.data?.message || 'Erro ao salvar movimentação.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/estoque/movimentacoes/${deleteTarget.id}`);
      showSnack('Movimentação excluída.');
      setDeleteOpen(false);
      setDeleteTarget(null);
      loadItems();
      loadMovimentacoes();
    } catch (e: any) {
      showSnack(e?.response?.data?.detail || 'Erro ao excluir movimentação.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (subLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!can('estoque_controle')) return <UpgradePrompt feature="controle de estoque" minPlan="Pro" />;

  const showActionsColumn = canEdit || canDelete;

  return (
    <Box>
      <Box data-tour="estoque-mov-header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapVertIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Movimentações</Typography>
          <Chip label={`${movimentacoes.length}`} size="small" variant="outlined" />
        </Box>
          <Box data-tour="estoque-mov-filtros" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Buscar por nome do item..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: 'text.disabled' }} /> }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Item</InputLabel>
            <Select value={filterItem} label="Item" onChange={(e) => setFilterItem(e.target.value)}>
              <MenuItem value="">Todos os itens</MenuItem>
              {items.map((i) => <MenuItem key={i.id} value={i.id}>{i.nome}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Tipo</InputLabel>
            <Select value={filterTipo} label="Tipo" onChange={(e) => setFilterTipo(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="entrada">Entrada</MenuItem>
              <MenuItem value="saida">Saída</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="De"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="date"
            label="Até"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Tooltip title="Atualizar"><IconButton onClick={loadMovimentacoes}><RefreshIcon /></IconButton></Tooltip>
          {canInsert && (
            <Button data-tour="estoque-mov-nova" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Registrar
            </Button>
          )}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : movimentacoes.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SwapVertIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Nenhuma movimentação registrada.</Typography>
        </Paper>
      ) : (
        <TableContainer data-tour="estoque-mov-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Data</strong></TableCell>
                <TableCell><strong>Item</strong></TableCell>
                <TableCell><strong>Tipo</strong></TableCell>
                <TableCell><strong>Qtd</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Requisitante</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Motivo</strong></TableCell>
                {showActionsColumn && <TableCell align="right"><strong>Ações</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {movimentacoes.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(m.data_movimentacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell>{m.item_nome || m.item_id}</TableCell>
                  <TableCell>
                    <Chip
                      label={m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      color={m.tipo === 'entrada' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{m.quantidade}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{m.requisitante || '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' }, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={m.motivo || ''}><span>{m.motivo || '—'}</span></Tooltip>
                  </TableCell>
                  {showActionsColumn && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {canEdit && (
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => openEdit(m)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Excluir">
                          <IconButton size="small" color="error" onClick={() => { setDeleteTarget(m); setDeleteOpen(true); }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Drawer criar / editar */}
      <CrudDrawer
        open={drawerOpen}
        title={drawerMode === 'edit' ? 'Editar Movimentação' : 'Registrar Movimentação'}
        onClose={() => { setDrawerOpen(false); setDrawerError(null); }}
        onSave={handleSave}
        saving={saving}
        saveLabel={drawerMode === 'edit' ? 'Salvar alterações' : 'Confirmar'}
        error={drawerError}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <ToggleButtonGroup
            exclusive
            value={formData.tipo}
            onChange={(_, val) => {
              if (!val) return;
              setFormData((prev) => ({ ...prev, tipo: val }));
              checkNegativeWarning(formData.item_id, val, formData.quantidade);
            }}
            color={formData.tipo === 'entrada' ? 'success' : 'error'}
          >
            <ToggleButton value="entrada" sx={{ px: 4 }}>Entrada</ToggleButton>
            <ToggleButton value="saida" sx={{ px: 4 }}>Saída</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }} error={touched.item_id && !formData.item_id} disabled={drawerMode === 'edit'}>
          <InputLabel>Item *</InputLabel>
          <Select value={formData.item_id} label="Item *" onChange={(e) => handleItemChange(e.target.value)}>
            {items.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.nome} — saldo: {i.saldo} {i.unidade_medida}
              </MenuItem>
            ))}
          </Select>
          {touched.item_id && !formData.item_id && <Typography variant="caption" color="error" sx={{ ml: 2 }}>Selecione um item</Typography>}
        </FormControl>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Quantidade *"
            type="number"
            inputProps={{ min: 1 }}
            fullWidth
            value={formData.quantidade}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, quantidade: e.target.value }));
              checkNegativeWarning(formData.item_id, formData.tipo, e.target.value);
            }}
            error={touched.quantidade && (!formData.quantidade || parseInt(formData.quantidade, 10) <= 0)}
            helperText={touched.quantidade && (!formData.quantidade || parseInt(formData.quantidade, 10) <= 0) ? 'Quantidade inválida' : ''}
          />
          <TextField
            label="Data/hora"
            type="datetime-local"
            fullWidth
            value={formData.data_movimentacao}
            onChange={(e) => setFormData((prev) => ({ ...prev, data_movimentacao: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
        </Box>

        {saldoWarning && (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            {saldoWarning}
          </Alert>
        )}

        <TextField
          label="Requisitante"
          fullWidth
          value={formData.requisitante}
          onChange={(e) => setFormData((prev) => ({ ...prev, requisitante: e.target.value }))}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Motivo / Observação"
          fullWidth
          multiline
          rows={2}
          value={formData.motivo}
          onChange={(e) => setFormData((prev) => ({ ...prev, motivo: e.target.value }))}
        />
      </CrudDrawer>

      {/* Confirmação de exclusão */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir movimentação?</DialogTitle>
        <DialogContent>
          <Typography>
            Isso removerá a movimentação de <strong>{deleteTarget?.tipo === 'entrada' ? 'entrada' : 'saída'}</strong> de{' '}
            <strong>{deleteTarget?.quantidade}</strong> unidade(s) do item <strong>{deleteTarget?.item_nome}</strong>.
            O saldo do item será recalculado automaticamente.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : undefined}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
