'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
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
import CurrencyInput from '../../../components/CurrencyInput';
import AddIcon           from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CheckCircleIcon   from '@mui/icons-material/CheckCircle';
import DeleteIcon        from '@mui/icons-material/Delete';
import EditIcon          from '@mui/icons-material/Edit';
import RefreshIcon       from '@mui/icons-material/Refresh';
import TrendingUpIcon    from '@mui/icons-material/TrendingUp';
import WarningIcon       from '@mui/icons-material/Warning';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AdminLayout from '../admin_layout';
import CrudDrawer  from '../../../components/CrudDrawer';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { KpiCard, PageHeader, ConfirmDialog } from '@/components/admin';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions }  from '../../../hooks/usePermissions';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Categoria     { id: string; nome: string; tipo: string; cor: string | null; }
interface ContaBancaria { id: string; nome: string; banco: string | null; }

interface ContaFinanceira {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_competencia: string | null;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  data_pagamento: string | null;
  valor_pago: number | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  conta_bancaria_id: string | null;
  conta_bancaria_nome: string | null;
  recorrencia: string | null;
  observacoes: string | null;
  created_at: string;
}

interface Resumo {
  total_pagar_pendente: number;
  total_pagar_vencido: number;
  total_pagar_pago_mes: number;
  total_receber_pendente: number;
  total_receber_vencido: number;
  total_receber_pago_mes: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  descricao: '', valor: 0, data_vencimento: '', data_competencia: '',
  categoria_id: '', conta_bancaria_id: '', recorrencia: 'unica', observacoes: '',
};

const EMPTY_BAIXA = { data_pagamento: '', valor_pago: 0, conta_bancaria_id: '' };

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', pago: 'Recebido', vencido: 'Vencido', cancelado: 'Cancelado',
};
const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  pendente: 'warning', pago: 'success', vencido: 'error', cancelado: 'default',
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
const fmtBRLShort = (v: number) =>
  v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmtBRL(v);

// ─── Exported page ────────────────────────────────────────────────────────────

export default function ContasReceberPage() {
  return (
    <AdminLayout title="Contas a Receber">
      <ContasReceberContent />
    </AdminLayout>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

function ContasReceberContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { tokens, isDark } = useAdminTheme();

  const canView   = can('contas_financeiras') && canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit   = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');

  const [contas, setContas]             = useState<ContaFinanceira[]>([]);
  const [categorias, setCategorias]     = useState<Categoria[]>([]);
  const [contasBanc, setContasBanc]     = useState<ContaBancaria[]>([]);
  const [resumo, setResumo]             = useState<Resumo | null>(null);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter]       = useState('');

  const now = new Date();
  const [mesFilter, setMesFilter] = useState(String(now.getMonth() + 1));
  const [anoFilter, setAnoFilter] = useState(String(now.getFullYear()));

  // Drawer — criar / editar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<ContaFinanceira | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [touched, setTouched]       = useState<Record<string, boolean>>({});
  const [saving, setSaving]         = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Drawer — registrar recebimento
  const [baixaOpen, setBaixaOpen]     = useState(false);
  const [baixaTarget, setBaixaTarget] = useState<ContaFinanceira | null>(null);
  const [baixaForm, setBaixaForm]     = useState(EMPTY_BAIXA);
  const [savingBaixa, setSavingBaixa] = useState(false);

  // Delete confirm
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContaFinanceira | null>(null);

  // Snackbar
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });
  const showSnack = (msg: string, severity: 'success' | 'error' = 'success') =>
    setSnack({ open: true, msg, severity });

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const mes = parseInt(mesFilter, 10);
      const ano = parseInt(anoFilter, 10);
      const firstDay = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(ano, mes, 0).toISOString().slice(0, 10);

      const params: Record<string, string> = {
        tipo: 'receber',
        data_vencimento_de: firstDay,
        data_vencimento_ate: lastDay,
      };
      if (statusFilter) params.status = statusFilter;
      if (catFilter)    params.categoria_id = catFilter;

      const [contasRes, resumoRes, catRes, cbRes] = await Promise.all([
        apiClient.get<ContaFinanceira[]>('/api/v1/admin/financeiro/contas', { params }),
        apiClient.get<Resumo>('/api/v1/admin/financeiro/contas/resumo', { params: { mes: mesFilter, ano: anoFilter } }),
        apiClient.get<Categoria[]>('/api/v1/admin/financeiro/categorias'),
        apiClient.get<ContaBancaria[]>('/api/v1/admin/financeiro/contas-bancarias'),
      ]);
      setContas(contasRes.data);
      setResumo(resumoRes.data);
      setCategorias(catRes.data.filter((c) => c.tipo === 'receber' || c.tipo === 'ambos'));
      setContasBanc(cbRes.data);
    } catch {
      showSnack('Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canView, statusFilter, catFilter, mesFilter, anoFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ ...EMPTY_FORM, data_vencimento: today });
    setTouched({});
    setDrawerError(null);
    setEditTarget(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (c: ContaFinanceira) => {
    setForm({
      descricao: c.descricao, valor: c.valor,
      data_vencimento: c.data_vencimento, data_competencia: c.data_competencia ?? '',
      categoria_id: c.categoria_id ?? '', conta_bancaria_id: c.conta_bancaria_id ?? '',
      recorrencia: c.recorrencia ?? 'unica', observacoes: c.observacoes ?? '',
    });
    setTouched({});
    setDrawerError(null);
    setEditTarget(c);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const setField = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    setTouched((p) => ({ ...p, [field]: true }));
  };

  const isDirty = drawerMode === 'create'
    ? form.descricao !== '' || form.valor > 0 || form.data_vencimento !== ''
    : editTarget != null && (
        form.descricao !== editTarget.descricao ||
        form.valor !== editTarget.valor ||
        form.data_vencimento !== editTarget.data_vencimento
      );

  const saveDisabled = drawerMode === 'edit' && !isDirty;

  const handleSave = async () => {
    setTouched({ descricao: true, valor: true, data_vencimento: true });
    if (!form.descricao.trim() || form.valor <= 0 || !form.data_vencimento) {
      setDrawerError('Preencha os campos obrigatórios: Descrição, Valor e Data de Vencimento.');
      return;
    }
    setSaving(true);
    setDrawerError(null);
    try {
      const payload = {
        tipo: 'receber',
        descricao: form.descricao,
        valor: form.valor,
        data_vencimento: form.data_vencimento,
        data_competencia: form.data_competencia || null,
        categoria_id: form.categoria_id || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        recorrencia: form.recorrencia === 'unica' ? null : form.recorrencia || null,
        observacoes: form.observacoes || null,
      };
      if (drawerMode === 'edit' && editTarget) {
        await apiClient.put(`/api/v1/admin/financeiro/contas/${editTarget.id}`, payload);
        showSnack('Lançamento atualizado.');
      } else {
        await apiClient.post('/api/v1/admin/financeiro/contas', payload);
        showSnack('Lançamento criado.');
        // Sincroniza o filtro de mês/ano com a data de vencimento do lançamento criado
        if (form.data_vencimento) {
          const [y, m] = form.data_vencimento.split('-');
          setMesFilter(String(parseInt(m, 10)));
          setAnoFilter(y);
        }
      }
      setDrawerOpen(false);
      fetchAll();
    } catch (e) {
      setDrawerError(extractApiErrorMessage(e, 'Erro ao salvar o lançamento. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Recebimento helpers ────────────────────────────────────────────────────

  const openBaixa = (c: ContaFinanceira) => {
    setBaixaTarget(c);
    setBaixaForm({
      data_pagamento: new Date().toISOString().slice(0, 10),
      valor_pago: c.valor,
      conta_bancaria_id: '',
    });
    setBaixaOpen(true);
  };

  const baixaIsDirty    = baixaForm.data_pagamento !== '' || baixaForm.valor_pago > 0;
  const baixaSaveDisabled = !baixaForm.data_pagamento || baixaForm.valor_pago <= 0;

  const handleBaixa = async () => {
    if (baixaSaveDisabled || !baixaTarget) return;
    setSavingBaixa(true);
    try {
      await apiClient.post(`/api/v1/admin/financeiro/contas/${baixaTarget.id}/baixa`, {
        data_pagamento: baixaForm.data_pagamento,
        valor_pago: baixaForm.valor_pago,
        conta_bancaria_id: baixaForm.conta_bancaria_id || null,
      });
      showSnack('Recebimento registrado com sucesso.');
      setBaixaOpen(false);
      fetchAll();
    } catch (e) {
      showSnack(extractApiErrorMessage(e, 'Erro ao registrar recebimento.'), 'error');
    } finally {
      setSavingBaixa(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/contas/${deleteTarget.id}`);
      showSnack('Lançamento excluído.');
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchAll();
    } catch {
      showSnack('Erro ao excluir.', 'error');
    }
  };

  // ── Chart data ─────────────────────────────────────────────────────────────

  const barData = [
    { name: 'Pendente',    valor: resumo?.total_receber_pendente ?? 0, fill: '#3b82f6' },
    { name: 'Vencido',     valor: resumo?.total_receber_vencido  ?? 0, fill: '#ef4444' },
    { name: 'Receb./mês', valor: resumo?.total_receber_pago_mes ?? 0, fill: '#22c55e' },
  ];

  const monthlyMap: Record<string, number> = {};
  contas.forEach((c) => {
    const month = c.data_vencimento.slice(0, 7);
    monthlyMap[month] = (monthlyMap[month] ?? 0) + c.valor;
  });
  const areaData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([m, v]) => {
      const [y, mo] = m.split('-');
      const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return { mes: `${monthNames[parseInt(mo) - 1]}/${y.slice(2)}`, valor: v };
    });

  const tooltipStyle = {
    background: tokens.tooltipBg,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textPrimary,
    fontSize: 12,
  };
  const chartCursor = { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' };

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!can('contas_financeiras')) {
    return (
      <UpgradePrompt
        feature="Contas a Receber"
        minPlan="Pro"
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>

      {/* Header */}
      <PageHeader
        title="Contas a Receber"
        subtitle="Controle de receitas, recebimentos e inadimplências"
        actions={
          <>
            <Tooltip title="Atualizar"><IconButton onClick={fetchAll}><RefreshIcon /></IconButton></Tooltip>
            {canInsert && (
              <Button variant="contained" color="success" startIcon={<AddIcon />} onClick={openCreate}>
                Novo Lançamento
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'A Receber',       value: loading ? '—' : fmtBRL(resumo?.total_receber_pendente ?? 0), icon: <TrendingUpIcon />,  color: '#3b82f6', subtitle: 'pendente' },
          { label: 'Vencido',         value: loading ? '—' : fmtBRL(resumo?.total_receber_vencido  ?? 0), icon: <WarningIcon />,     color: '#ef4444', subtitle: 'em atraso' },
          { label: 'Recebido este mês', value: loading ? '—' : fmtBRL(resumo?.total_receber_pago_mes ?? 0), icon: <CheckCircleIcon />, color: '#22c55e', subtitle: 'mês corrente' },
        ].map((kpi) => (
          <Grid item xs={12} sm={4} key={kpi.label}>
            <KpiCard label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} loading={loading} subtitle={kpi.subtitle} />
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>

        {/* Bar chart — status breakdown */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              Situação Atual
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={52} />
                  <RechartsTooltip
                    cursor={chartCursor}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtBRL(v), 'Valor']}
                  />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Area chart — monthly trend */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              Tendência — Valor a Receber por Mês
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
            ) : areaData.length === 0 ? (
              <Box sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">Sem dados suficientes</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={areaData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradReceber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={52} />
                  <RechartsTooltip
                    cursor={chartCursor}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtBRL(v), 'Total']}
                  />
                  <Area
                    type="monotone" dataKey="valor"
                    stroke="#3b82f6" strokeWidth={2}
                    fill="url(#gradReceber)"
                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Mês</InputLabel>
          <Select value={mesFilter} label="Mês" onChange={(e) => setMesFilter(e.target.value)}>
            {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((n, i) => (
              <MenuItem key={i + 1} value={String(i + 1)}>{n}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel>Ano</InputLabel>
          <Select value={anoFilter} label="Ano" onChange={(e) => setAnoFilter(e.target.value)}>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <MenuItem key={y} value={String(y)}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="pendente">Pendente</MenuItem>
            <MenuItem value="vencido">Vencido</MenuItem>
            <MenuItem value="pago">Recebido</MenuItem>
            <MenuItem value="cancelado">Cancelado</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Categoria</InputLabel>
          <Select value={catFilter} label="Categoria" onChange={(e) => setCatFilter(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {categorias.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Descrição</TableCell>
                <TableCell>Categoria</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell>Vencimento</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Data Receb.</TableCell>
                <TableCell align="right">Valor Recebido</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nenhum lançamento encontrado.
                  </TableCell>
                </TableRow>
              ) : contas.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{c.descricao}</TableCell>
                  <TableCell>{c.categoria_nome ?? '—'}</TableCell>
                  <TableCell align="right">{fmtBRL(c.valor)}</TableCell>
                  <TableCell>{fmtDate(c.data_vencimento)}</TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABEL[c.status] ?? c.status} color={STATUS_COLOR[c.status] ?? 'default'} size="small" />
                  </TableCell>
                  <TableCell>{c.data_pagamento ? fmtDate(c.data_pagamento) : '—'}</TableCell>
                  <TableCell align="right">{c.valor_pago != null ? fmtBRL(c.valor_pago) : '—'}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      {canEdit && c.status !== 'pago' && c.status !== 'cancelado' && (
                        <Tooltip title="Registrar Recebimento">
                          <IconButton size="small" color="success" onClick={() => openBaixa(c)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canEdit && (
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => openEdit(c)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Excluir">
                          <IconButton size="small" color="error" onClick={() => { setDeleteTarget(c); setDeleteOpen(true); }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Drawer — criar / editar */}
      <CrudDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerError(null); }}
        title={drawerMode === 'create' ? 'Novo Lançamento' : 'Editar Lançamento'}
        subtitle="Conta a receber"
        icon={<ArrowDownwardIcon />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={saveDisabled}
        isDirty={isDirty}
        error={drawerError}
      >
        <TextField
          label="Descrição *"
          placeholder="Ex: Mensalidade de associado, Doação..."
          value={form.descricao}
          onChange={(e) => setField('descricao', e.target.value)}
          error={touched.descricao && !form.descricao.trim()}
          helperText={touched.descricao && !form.descricao.trim() ? 'Obrigatório' : ''}
          fullWidth
        />
        <CurrencyInput
          label="Valor *"
          value={form.valor}
          onValueChange={(v) => { setForm((p) => ({ ...p, valor: v })); setTouched((p) => ({ ...p, valor: true })); }}
          error={touched.valor && form.valor <= 0}
          helperText={touched.valor && form.valor <= 0 ? 'Obrigatório' : ''}
          fullWidth
        />
        <TextField
          label="Data de Vencimento *"
          type="date"
          value={form.data_vencimento}
          onChange={(e) => setField('data_vencimento', e.target.value)}
          InputLabelProps={{ shrink: true }}
          error={touched.data_vencimento && !form.data_vencimento}
          helperText={touched.data_vencimento && !form.data_vencimento ? 'Obrigatório' : ''}
          fullWidth
        />
        <TextField
          label="Data de Competência"
          type="date"
          value={form.data_competencia}
          onChange={(e) => setField('data_competencia', e.target.value)}
          InputLabelProps={{ shrink: true }}
          helperText="Opcional — período a que a receita se refere (pode diferir do vencimento)"
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Categoria</InputLabel>
          <Select value={form.categoria_id} label="Categoria" onChange={(e) => setField('categoria_id', e.target.value)}>
            <MenuItem value="">Sem categoria</MenuItem>
            {categorias.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
          </Select>
          {categorias.length === 0 && (
            <Alert severity="info" sx={{ mt: 1, py: 0.5, fontSize: 12 }}>
              Nenhuma categoria cadastrada. Crie categorias em <strong>Financeiro → Configuração</strong>.
            </Alert>
          )}
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Conta Bancária</InputLabel>
          <Select value={form.conta_bancaria_id} label="Conta Bancária" onChange={(e) => setField('conta_bancaria_id', e.target.value)}>
            <MenuItem value="">Nenhuma</MenuItem>
            {contasBanc.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ''}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Recorrência</InputLabel>
          <Select value={form.recorrencia} label="Recorrência" onChange={(e) => setField('recorrencia', e.target.value)}>
            <MenuItem value="unica">Única</MenuItem>
            <MenuItem value="mensal">Mensal</MenuItem>
            <MenuItem value="anual">Anual</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Observações"
          placeholder="Informações adicionais sobre este lançamento..."
          value={form.observacoes}
          onChange={(e) => setField('observacoes', e.target.value)}
          multiline rows={3}
          fullWidth
        />
      </CrudDrawer>

      {/* Drawer — registrar recebimento */}
      <CrudDrawer
        open={baixaOpen}
        onClose={() => setBaixaOpen(false)}
        title="Registrar Recebimento"
        subtitle={baixaTarget ? `Conta: ${baixaTarget.descricao}` : ''}
        icon={<CheckCircleIcon />}
        onSave={handleBaixa}
        saving={savingBaixa}
        saveDisabled={baixaSaveDisabled}
        saveLabel="Confirmar Recebimento"
        isDirty={baixaIsDirty}
      >
        <TextField
          label="Data do Recebimento *"
          type="date"
          value={baixaForm.data_pagamento}
          onChange={(e) => setBaixaForm((f) => ({ ...f, data_pagamento: e.target.value }))}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <CurrencyInput
          label="Valor Recebido *"
          value={baixaForm.valor_pago}
          onValueChange={(v) => setBaixaForm((f) => ({ ...f, valor_pago: v }))}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Conta Bancária</InputLabel>
          <Select value={baixaForm.conta_bancaria_id} label="Conta Bancária" onChange={(e) => setBaixaForm((f) => ({ ...f, conta_bancaria_id: e.target.value }))}>
            <MenuItem value="">Nenhuma</MenuItem>
            {contasBanc.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
          </Select>
        </FormControl>
      </CrudDrawer>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        title="Excluir Lançamento"
        message={`Deseja excluir "${deleteTarget?.descricao}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        destructive
        onConfirm={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
