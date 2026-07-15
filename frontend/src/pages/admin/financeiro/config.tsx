/**
 * Admin Financeiro — Configuração
 * Tabs: Categorias | Contas Bancárias | Mensalidade
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CategoryIcon from '@mui/icons-material/Category';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CurrencyInput from '../../../components/CurrencyInput';
import AdminLayout from '../admin_layout';
import UpgradePrompt from '../../../components/UpgradePrompt';
import CrudDrawer from '../../../components/CrudDrawer';
import { apiClient } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string | null;
  ativo: boolean;
}

interface ContaBancaria {
  id: string;
  nome: string;
  banco: string | null;
  saldo_inicial: number;
  ativo: boolean;
}

// ── Paleta de cores para categorias ───────────────────────────────────────────

const COR_OPTIONS = [
  '#1D9E75', '#378ADD', '#D4537E', '#BA7517', '#A32D2D',
  '#534AB7', '#0F6E56', '#993C1D', '#185FA5', '#3B6D11',
  '#5F5E5A', '#D85A30',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  pagar: 'A Pagar',
  receber: 'A Receber',
  ambos: 'Ambos',
};

const TIPO_COLOR: Record<string, 'error' | 'success' | 'default'> = {
  pagar: 'error',
  receber: 'success',
  ambos: 'default',
};

// ── Snack helper type ──────────────────────────────────────────────────────────

type Snack = { open: boolean; msg: string; severity: 'success' | 'error' };

const SNACK_CLOSED: Snack = { open: false, msg: '', severity: 'success' };

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Categorias
// ═══════════════════════════════════════════════════════════════════════════════

function CategoriasTab() {
  const { can: canGroup } = usePermissions();
  const canView = canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');
  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<Snack>(SNACK_CLOSED);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<Categoria | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const EMPTY_FORM = { nome: '', tipo: 'ambos', cor: COR_OPTIONS[0] };
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isDirty = form.nome !== EMPTY_FORM.nome || form.tipo !== EMPTY_FORM.tipo;

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    try {
      const res = await apiClient.get<Categoria[]>('/api/v1/admin/financeiro/categorias');
      setItems(res.data);
    } catch {
      setSnack({ open: true, msg: 'Erro ao carregar categorias.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setTouched({});
    setDrawerMode('create');
    setEditTarget(null);
    setDrawerOpen(true);
  };

  const openEdit = (cat: Categoria) => {
    setForm({ nome: cat.nome, tipo: cat.tipo, cor: cat.cor ?? COR_OPTIONS[0] });
    setTouched({});
    setDrawerMode('edit');
    setEditTarget(cat);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!form.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/financeiro/categorias', {
          nome: form.nome.trim(),
          tipo: form.tipo,
          cor: form.cor,
        });
      } else if (editTarget) {
        await apiClient.put(`/api/v1/admin/financeiro/categorias/${editTarget.id}`, {
          nome: form.nome.trim(),
          tipo: form.tipo,
          cor: form.cor,
        });
      }
      setDrawerOpen(false);
      setSnack({ open: true, msg: drawerMode === 'create' ? 'Categoria criada.' : 'Categoria atualizada.', severity: 'success' });
      load();
    } catch (err: any) {
      setSnack({ open: true, msg: err?.response?.data?.detail ?? 'Erro ao salvar.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/categorias/${deleteTarget.id}`);
      setDeleteTarget(null);
      setSnack({ open: true, msg: 'Categoria excluída.', severity: 'success' });
      load();
    } catch (err: any) {
      setDeleteTarget(null);
      setSnack({ open: true, msg: err?.response?.data?.detail ?? 'Erro ao excluir.', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar categorias financeiras. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {loading ? '' : `${items.length} categoria${items.length !== 1 ? 's' : ''} cadastrada${items.length !== 1 ? 's' : ''}`}
        </Typography>
        {canInsert && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            Nova categoria
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CategoryIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Nenhuma categoria cadastrada. Crie a primeira para organizar seus lançamentos.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          {items.map((cat, idx) => (
            <Box
              key={cat.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderBottom: idx < items.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: cat.cor ?? '#888',
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                {cat.nome}
              </Typography>
              <Chip
                label={TIPO_LABEL[cat.tipo] ?? cat.tipo}
                color={TIPO_COLOR[cat.tipo] ?? 'default'}
                size="small"
                variant="outlined"
              />
              {canEdit && (
                <Tooltip title="Editar">
                  <IconButton size="small" onClick={() => openEdit(cat)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip title="Excluir">
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(cat)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}
        </Card>
      )}

      {/* Drawer criar / editar */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nova Categoria' : 'Editar Categoria'}
        subtitle="Organize seus lançamentos financeiros por categoria"
        icon={<CategoryIcon />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!form.nome.trim()}
        isDirty={isDirty}
      >
        <TextField
          label="Nome *"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
          error={touched.nome && !form.nome.trim()}
          helperText={touched.nome && !form.nome.trim() ? 'Obrigatório' : ''}
          fullWidth
          autoFocus
        />

        <FormControl fullWidth>
          <InputLabel>Tipo</InputLabel>
          <Select
            value={form.tipo}
            label="Tipo"
            onChange={(e: SelectChangeEvent) => setForm((f) => ({ ...f, tipo: e.target.value }))}
          >
            <MenuItem value="pagar">A Pagar</MenuItem>
            <MenuItem value="receber">A Receber</MenuItem>
            <MenuItem value="ambos">Ambos</MenuItem>
          </Select>
        </FormControl>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Cor de identificação
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {COR_OPTIONS.map((cor) => (
              <Box
                key={cor}
                onClick={() => setForm((f) => ({ ...f, cor }))}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: cor,
                  cursor: 'pointer',
                  border: form.cor === cor ? '3px solid' : '2px solid transparent',
                  borderColor: form.cor === cor ? 'text.primary' : 'transparent',
                  transition: 'border-color 0.15s',
                  '&:hover': { opacity: 0.85 },
                }}
              />
            ))}
          </Box>
        </Box>
      </CrudDrawer>

      {/* Confirmar exclusão */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Excluir categoria?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A categoria <strong>{deleteTarget?.nome}</strong> será excluída permanentemente.
            Lançamentos vinculados a ela ficarão sem categoria.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : undefined}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(SNACK_CLOSED)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} onClose={() => setSnack(SNACK_CLOSED)}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Contas Bancárias
// ═══════════════════════════════════════════════════════════════════════════════

function ContasBancariasTab() {
  const { can: canGroup } = usePermissions();
  const canView = canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');
  const [items, setItems] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<Snack>(SNACK_CLOSED);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<ContaBancaria | null>(null);
  const [saving, setSaving] = useState(false);

  const EMPTY_FORM = { nome: '', banco: '', saldo_inicial: 0 };
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ContaBancaria | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isDirty = form.nome !== EMPTY_FORM.nome || form.banco !== EMPTY_FORM.banco || form.saldo_inicial !== EMPTY_FORM.saldo_inicial;

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    try {
      const res = await apiClient.get<ContaBancaria[]>('/api/v1/admin/financeiro/contas-bancarias');
      setItems(res.data);
    } catch {
      setSnack({ open: true, msg: 'Erro ao carregar contas bancárias.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setTouched({});
    setDrawerMode('create');
    setEditTarget(null);
    setDrawerOpen(true);
  };

  const openEdit = (conta: ContaBancaria) => {
    setForm({
      nome: conta.nome,
      banco: conta.banco ?? '',
      saldo_inicial: conta.saldo_inicial,
    });
    setTouched({});
    setDrawerMode('edit');
    setEditTarget(conta);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!form.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        banco: form.banco.trim() || null,
        saldo_inicial: form.saldo_inicial,
      };
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/financeiro/contas-bancarias', body);
      } else if (editTarget) {
        await apiClient.put(`/api/v1/admin/financeiro/contas-bancarias/${editTarget.id}`, body);
      }
      setDrawerOpen(false);
      setSnack({ open: true, msg: drawerMode === 'create' ? 'Conta criada.' : 'Conta atualizada.', severity: 'success' });
      load();
    } catch (err: any) {
      setSnack({ open: true, msg: err?.response?.data?.detail ?? 'Erro ao salvar.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/contas-bancarias/${deleteTarget.id}`);
      setDeleteTarget(null);
      setSnack({ open: true, msg: 'Conta excluída.', severity: 'success' });
      load();
    } catch (err: any) {
      setDeleteTarget(null);
      setSnack({ open: true, msg: err?.response?.data?.detail ?? 'Erro ao excluir.', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const fmtSaldo = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar contas bancárias. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {loading ? '' : `${items.length} conta${items.length !== 1 ? 's' : ''} cadastrada${items.length !== 1 ? 's' : ''}`}
        </Typography>
        {canInsert && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            Nova conta
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <AccountBalanceIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Nenhuma conta bancária cadastrada. Adicione contas para registrar pagamentos e recebimentos.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          {items.map((conta, idx) => (
            <Box
              key={conta.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderBottom: idx < items.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <AccountBalanceIcon sx={{ color: 'text.secondary', fontSize: 20, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500} noWrap>
                  {conta.nome}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {conta.banco ? `${conta.banco} · ` : ''}Saldo inicial {fmtSaldo(conta.saldo_inicial)}
                </Typography>
              </Box>
              {canEdit && (
                <Tooltip title="Editar">
                  <IconButton size="small" onClick={() => openEdit(conta)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip title="Excluir">
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(conta)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}
        </Card>
      )}

      {/* Drawer criar / editar */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nova Conta Bancária' : 'Editar Conta Bancária'}
        subtitle="Conta corrente, poupança, carteira ou caixa do terreiro"
        icon={<AccountBalanceIcon />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!form.nome.trim()}
        isDirty={isDirty}
      >
        <TextField
          label="Nome da conta *"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
          error={touched.nome && !form.nome.trim()}
          helperText={touched.nome && !form.nome.trim() ? 'Obrigatório' : 'Ex: Conta Bradesco, Caixa do Terreiro'}
          fullWidth
          autoFocus
        />
        <TextField
          label="Banco / instituição"
          value={form.banco}
          onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
          helperText="Opcional — ex: Bradesco, Nubank, Caixa"
          fullWidth
        />
        <CurrencyInput
          label="Saldo inicial"
          value={form.saldo_inicial}
          onValueChange={(v) => setForm((f) => ({ ...f, saldo_inicial: v }))}
          helperText="Saldo da conta no momento do cadastro"
          fullWidth
        />
      </CrudDrawer>

      {/* Confirmar exclusão */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Excluir conta bancária?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A conta <strong>{deleteTarget?.nome}</strong> será excluída. Lançamentos
            vinculados a ela perderão a referência bancária.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : undefined}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(SNACK_CLOSED)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} onClose={() => setSnack(SNACK_CLOSED)}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Mensalidade (conteúdo existente preservado)
// ═══════════════════════════════════════════════════════════════════════════════

function MensalidadeTab() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('financeiro', 'view');
  const canEdit = canGroup('financeiro', 'edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [valorMensal, setValorMensal] = useState<number>(0);
  const [diaVencimento, setDiaVencimento] = useState<string>('10');
  const [emailRelatorioAtivo, setEmailRelatorioAtivo] = useState<boolean>(false);
  const [valorMensalAssociado, setValorMensalAssociado] = useState<number>(0);
  const [diaVencimentoAssociado, setDiaVencimentoAssociado] = useState<string>('10');
  const [relatorioHoraEnvio, setRelatorioHoraEnvio] = useState<string>('');
  const [flagMensalidadeAssociado, setFlagMensalidadeAssociado] = useState<boolean>(false);
  const [snack, setSnack] = useState<Snack>(SNACK_CLOSED);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    apiClient.get('/api/v1/admin/financeiro/config')
      .then((res) => {
        if (res.data) {
          setValorMensal(res.data.valor_mensal ?? 0);
          setDiaVencimento(String(res.data.dia_vencimento ?? '10'));
          setEmailRelatorioAtivo(Boolean(res.data.email_relatorio_ativo));
          setValorMensalAssociado(res.data.valor_mensal_associado ?? 0);
          setDiaVencimentoAssociado(String(res.data.dia_vencimento_associado ?? '10'));
          setRelatorioHoraEnvio(res.data.relatorio_hora_envio ?? '');
          setFlagMensalidadeAssociado(Boolean(res.data.enable_mensalidade_associado));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const handleSave = async () => {
    if (!canEdit) return;
    if (can('mensalidade_mediun') && valorMensal < 0) {
      setSnack({ open: true, msg: 'Informe um valor mensal válido (≥ 0).', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (can('mensalidade_mediun')) {
        body.valor_mensal = valorMensal;
        body.dia_vencimento = parseInt(diaVencimento);
        body.email_relatorio_ativo = emailRelatorioAtivo;
      }
      if (can('mensalidade_associado')) {
        body.enable_mensalidade_associado = flagMensalidadeAssociado;
        if (valorMensalAssociado > 0) body.valor_mensal_associado = valorMensalAssociado;
        if (diaVencimentoAssociado) body.dia_vencimento_associado = parseInt(diaVencimentoAssociado);
        if (relatorioHoraEnvio) body.relatorio_hora_envio = relatorioHoraEnvio;
      }
      await apiClient.put('/api/v1/admin/financeiro/config', body);
      setSnack({ open: true, msg: 'Configuração salva com sucesso.', severity: 'success' });
    } catch (err: any) {
      setSnack({ open: true, msg: err?.response?.data?.detail ?? 'Erro ao salvar configuração.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar a configuração de mensalidade. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <>
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {can('mensalidade_mediun') && (
            <>
              <Typography variant="subtitle2" color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                Médiuns
              </Typography>
              <CurrencyInput
                label="Valor Mensal"
                size="small"
                fullWidth
                value={valorMensal}
                onValueChange={(v) => setValorMensal(v)}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Dia de Vencimento</InputLabel>
                <Select
                  value={diaVencimento}
                  label="Dia de Vencimento"
                  onChange={(e: SelectChangeEvent) => setDiaVencimento(e.target.value)}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <MenuItem key={d} value={String(d)}>Dia {d}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch checked={emailRelatorioAtivo}
                    onChange={(e) => setEmailRelatorioAtivo(e.target.checked)} color="primary" />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>Enviar relatório por e-mail</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Quando ativo, o botão &quot;Enviar Relatório&quot; dispara e-mail para todos os admins do tenant.
                    </Typography>
                  </Box>
                }
              />
            </>
          )}

          {can('mensalidade_associado') && (
            <>
              <FormControlLabel
                control={
                  <Switch checked={flagMensalidadeAssociado}
                    onChange={(e) => setFlagMensalidadeAssociado(e.target.checked)} color="primary" />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>Habilitar Mensalidade de Associados</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ativa o controle de mensalidades para associados do terreiro.
                    </Typography>
                  </Box>
                }
              />
              {flagMensalidadeAssociado && (
                <>
                  <Typography variant="subtitle2" color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                    Associados
                  </Typography>
                  <CurrencyInput
                    label="Valor Mensal Associados"
                    size="small"
                    fullWidth
                    value={valorMensalAssociado}
                    onValueChange={(v) => setValorMensalAssociado(v)}
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Dia de Vencimento (Associados)</InputLabel>
                    <Select
                      value={diaVencimentoAssociado}
                      label="Dia de Vencimento (Associados)"
                      onChange={(e: SelectChangeEvent) => setDiaVencimentoAssociado(e.target.value)}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <MenuItem key={d} value={String(d)}>Dia {d}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box>
                    <TextField
                      size="small"
                      label="Hora de envio do relatório"
                      type="time"
                      value={relatorioHoraEnvio}
                      onChange={(e) => setRelatorioHoraEnvio(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ step: 300 }}
                      fullWidth
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Envio automático — em breve
                    </Typography>
                  </Box>
                </>
              )}
            </>
          )}

          {canEdit && (
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ alignSelf: 'flex-start' }}
            >
              Salvar Configuração
            </Button>
          )}
        </CardContent>
      </Card>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(SNACK_CLOSED)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} onClose={() => setSnack(SNACK_CLOSED)}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Página principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function FinanceiroConfigPage() {
  const { can } = useSubscription();
  const [tab, setTab] = useState(0);

  if (!can('mensalidade_mediun') && !can('mensalidade_associado')) {
    return (
      <AdminLayout title="Configuração Financeira">
        <UpgradePrompt feature="Configuração Financeira" minPlan="Pro" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Configuração Financeira">
      <Box sx={{ maxWidth: 680 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Configuração Financeira
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Gerencie categorias, contas bancárias e as configurações de mensalidade do seu terreiro.
        </Typography>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Categorias" />
          <Tab label="Contas Bancárias" />
          <Tab label="Mensalidade" />
        </Tabs>

        {tab === 0 && <CategoriasTab />}
        {tab === 1 && <ContasBancariasTab />}
        {tab === 2 && <MensalidadeTab />}
      </Box>
    </AdminLayout>
  );
}
