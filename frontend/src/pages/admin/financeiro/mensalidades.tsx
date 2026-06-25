/**
 * Admin Financeiro — Controle de Mensalidade de Médiuns (Premium)
 *
 * Tabs: Médiuns (tabela com status do mês) | Gráfico (histórico + projeção)
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AdminLayout from '../admin_layout';
import CrudDrawer from '../../../components/CrudDrawer';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { NumericFormat } from 'react-number-format';
import { apiClient } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MensalidadeItem {
  mediun_id: string;
  mediun_nome: string;
  mensalidade_isento: boolean;
  pagamento_id: string | null;
  status: 'PAGO' | 'PENDENTE' | 'ISENTO' | null;
  data_pagamento: string | null;
  valor_vigente: number | null;
  valor_pago: number | null;
  comprovante_filename: string | null;
  observacao: string | null;
}

interface AssociadoMensalidadeItem {
  associado_id: string;
  associado_nome: string;
  mensalidade_isento: boolean;
  pagamento_id: string | null;
  status: 'PAGO' | 'PENDENTE' | 'ISENTO' | null;
  data_pagamento: string | null;
  valor_vigente: number | null;
  valor_pago: number | null;
  comprovante_filename: string | null;
  observacao: string | null;
}

interface Config {
  valor_mensal: number;
  dia_vencimento: number;
  ativo: boolean;
  valor_mensal_associado?: number;
  dia_vencimento_associado?: number;
  enable_mensalidade_associado?: boolean;
}

interface ResumoHistorico {
  mes: string;
  esperado: number;
  arrecadado: number;
  inadimplentes: number;
}

interface ResumoProjecao {
  mes: string;
  projetado: number;
}

interface Resumo {
  historico: ResumoHistorico[];
  projecao: ResumoProjecao[];
  config: { valor_mensal: number; count_ativos: number; count_isentos: number; count_pagantes: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

function toYYYYMM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MensalidadesPage() {
  const { can, subscription } = useSubscription();
  const { can: canGroup } = usePermissions();

  const today = new Date();
  const [mes, setMes] = useState<string>(toYYYYMM(today));
  const [tab, setTab] = useState(0);

  const [items, setItems] = useState<MensalidadeItem[]>([]);
  const [assocItems, setAssocItems] = useState<AssociadoMensalidadeItem[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [assocResumo, setAssocResumo] = useState<Resumo | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingAssoc, setLoadingAssoc] = useState(false);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });

  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'PENDENTE' | 'PAGO' | 'ISENTO'>('TODOS');
  const [search, setSearch] = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'mediun' | 'associado'>('mediun');
  const [drawerItem, setDrawerItem] = useState<MensalidadeItem | null>(null);
  const [drawerAssocItem, setDrawerAssocItem] = useState<AssociadoMensalidadeItem | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<'PAGO' | 'PENDENTE' | 'ISENTO'>('PENDENTE');
  const [drawerValorPago, setDrawerValorPago] = useState<string>('');
  const [drawerDataPag, setDrawerDataPag] = useState<string>('');
  const [drawerObs, setDrawerObs] = useState<string>('');
  const [drawerFile, setDrawerFile] = useState<File | null>(null);
  const [drawerSaving, setDrawerSaving] = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/financeiro/config');
      setConfig(res.data);
    } catch {
      setConfig(null);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    if (!can('mensalidade_mediun') || !canGroup('financeiro', 'view')) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/v1/admin/financeiro/mensalidades?mes=${mes}`);
      setItems(res.data);
    } catch {
      setSnack({ open: true, msg: 'Erro ao carregar mensalidades.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [mes, can, canGroup]);

  const fetchAssocItems = useCallback(async () => {
    if (!canGroup('financeiro', 'view')) return;
    setLoadingAssoc(true);
    try {
      const res = await apiClient.get(`/api/v1/admin/financeiro/associados?mes=${mes}`);
      setAssocItems(res.data);
    } catch {
      // non-critical
    } finally {
      setLoadingAssoc(false);
    }
  }, [mes, canGroup]);

  const fetchResumo = useCallback(async () => {
    if (!can('mensalidade_mediun') || !canGroup('financeiro', 'view')) return;
    setLoadingResumo(true);
    try {
      const res = await apiClient.get('/api/v1/admin/financeiro/resumo');
      setResumo(res.data);
    } catch {
      // non-critical
    } finally {
      setLoadingResumo(false);
    }
  }, [can, canGroup]);

  const fetchAssocResumo = useCallback(async () => {
    if (!canGroup('financeiro', 'view')) return;
    try {
      const res = await apiClient.get('/api/v1/admin/financeiro/associados/resumo');
      setAssocResumo(res.data);
    } catch {
      // non-critical
    }
  }, [canGroup]);

  const assocEnabled = !!(config?.enable_mensalidade_associado);

  // tabIds maps the rendered tab index to a stable string id, accounting for
  // conditional tab rendering (médiuns only for PREMIUM, associados only when flag enabled).
  const tabIds = useMemo(() => [
    can('mensalidade_mediun') ? 'mediuns' : null,
    'grafico',
    can('mensalidade_associado') && assocEnabled ? 'associados' : null,
  ].filter(Boolean) as string[], [can, assocEnabled]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  // PRO-only: load assocItems on mount (after config) so KPI cards have accurate data
  useEffect(() => {
    if (!can('mensalidade_mediun') && can('mensalidade_associado') && assocEnabled) {
      fetchAssocItems();
    }
  }, [assocEnabled, fetchAssocItems, can]);
  useEffect(() => {
    if (tabIds[tab] === 'grafico') {
      fetchResumo();
      if (can('mensalidade_associado') && assocEnabled) fetchAssocResumo();
    }
  }, [tab, tabIds, fetchResumo, fetchAssocResumo, can, assocEnabled]);
  useEffect(() => {
    if (tabIds[tab] === 'associados' && can('mensalidade_associado') && assocEnabled) fetchAssocItems();
  }, [tab, tabIds, fetchAssocItems, can, assocEnabled]);

  // ── Gate (after all hooks) ────────────────────────────────────────────
  if (!can('mensalidade_mediun') && !can('mensalidade_associado')) {
    return (
      <AdminLayout title="Mensalidades">
        <UpgradePrompt feature="Controle de Mensalidade" minPlan="Pro" />
      </AdminLayout>
    );
  }

  if (!canGroup('financeiro', 'view')) {
    return (
      <AdminLayout title="Mensalidades">
        <Alert severity="warning" sx={{ mt: 2 }}>
          Você não tem permissão para visualizar as mensalidades. Contate o administrador do sistema.
        </Alert>
      </AdminLayout>
    );
  }

  const canInsertEdit = canGroup('financeiro', 'insert') || canGroup('financeiro', 'edit');

  // ── Month navigation ──────────────────────────────────────────────────

  const handlePrevMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1, 1); // local time — avoids UTC timezone offset
    setMes(toYYYYMM(addMonths(d, -1)));
  };

  const handleNextMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1, 1); // local time — avoids UTC timezone offset
    setMes(toYYYYMM(addMonths(d, 1)));
  };

  // ── Drawer handlers ───────────────────────────────────────────────────

  const openDrawer = (item: MensalidadeItem) => {
    setDrawerMode('mediun');
    setDrawerItem(item);
    setDrawerAssocItem(null);
    setDrawerStatus((item.status as 'PAGO' | 'PENDENTE' | 'ISENTO') || 'PENDENTE');
    setDrawerValorPago(item.valor_pago != null ? String(item.valor_pago) : config ? String(config.valor_mensal) : '');
    setDrawerDataPag(item.data_pagamento ? item.data_pagamento.slice(0, 10) : '');
    setDrawerObs(item.observacao || '');
    setDrawerFile(null);
    setDrawerOpen(true);
  };

  const openAssocDrawer = (item: AssociadoMensalidadeItem) => {
    setDrawerMode('associado');
    setDrawerAssocItem(item);
    setDrawerItem(null);
    setDrawerStatus((item.status as 'PAGO' | 'PENDENTE' | 'ISENTO') || 'PENDENTE');
    setDrawerValorPago(item.valor_pago != null ? String(item.valor_pago) : config ? String(config.valor_mensal_associado ?? 0) : '');
    setDrawerDataPag(item.data_pagamento ? item.data_pagamento.slice(0, 10) : '');
    setDrawerObs(item.observacao || '');
    setDrawerFile(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (drawerMode === 'mediun' && !drawerItem) return;
    if (drawerMode === 'associado' && !drawerAssocItem) return;
    setDrawerSaving(true);
    try {
      const form = new FormData();
      form.append('status', drawerStatus);
      if (drawerValorPago) form.append('valor_pago', drawerValorPago);
      if (drawerDataPag) form.append('data_pagamento', drawerDataPag);
      if (drawerObs) form.append('observacao', drawerObs);
      if (drawerFile) form.append('comprovante', drawerFile);

      if (drawerMode === 'mediun' && drawerItem) {
        await apiClient.post(
          `/api/v1/admin/financeiro/mensalidades/${drawerItem.mediun_id}/${mes}`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        await fetchItems();
      } else if (drawerMode === 'associado' && drawerAssocItem) {
        await apiClient.post(
          `/api/v1/admin/financeiro/associados/${drawerAssocItem.associado_id}/${mes}`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        await fetchAssocItems();
      }
      setSnack({ open: true, msg: 'Mensalidade registrada com sucesso.', severity: 'success' });
      setDrawerOpen(false);
      // Refresh resumo so KPI cards and chart stay in sync
      fetchResumo();
      if (assocEnabled) fetchAssocResumo();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Erro ao salvar.';
      setSnack({ open: true, msg: detail, severity: 'error' });
    } finally {
      setDrawerSaving(false);
    }
  };

  const handleDownloadComprovante = async (item: MensalidadeItem) => {
    try {
      const res = await apiClient.get(
        `/api/v1/admin/financeiro/mensalidades/${item.mediun_id}/${mes}/comprovante`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.comprovante_filename || 'comprovante';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSnack({ open: true, msg: 'Comprovante não encontrado.', severity: 'error' });
    }
  };

  const handleDownloadAssocComprovante = async (item: AssociadoMensalidadeItem) => {
    try {
      const res = await apiClient.get(
        `/api/v1/admin/financeiro/associados/${item.associado_id}/${mes}/comprovante`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.comprovante_filename || 'comprovante';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSnack({ open: true, msg: 'Comprovante não encontrado.', severity: 'error' });
    }
  };

  // ── Derived values ────────────────────────────────────────────────────

  const mesDate = new Date(mes + '-01');
  const diaVenc = config?.dia_vencimento ?? 10;
  const vencimento = new Date(mesDate.getFullYear(), mesDate.getMonth(), diaVenc);
  const hoje = new Date();

  const filtered = items.filter((i) => {
    const matchStatus = filterStatus === 'TODOS' || i.status === filterStatus;
    const matchSearch = i.mediun_nome.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalEsperado =
    items.filter((i) => !i.mensalidade_isento && i.status !== 'ISENTO').length * (config?.valor_mensal ?? 0) +
    (assocEnabled ? assocItems.filter((i) => !i.mensalidade_isento && i.status !== 'ISENTO').length * (config?.valor_mensal_associado ?? 0) : 0);
  const totalArrecadado =
    items.filter((i) => i.status === 'PAGO').reduce((s, i) => s + (i.valor_pago ?? 0), 0) +
    (assocEnabled ? assocItems.filter((i) => i.status === 'PAGO').reduce((s, i) => s + (i.valor_pago ?? 0), 0) : 0);
  const inadimplentes =
    items.filter((i) => !i.mensalidade_isento && i.status !== 'PAGO' && i.status !== 'ISENTO').length +
    (assocEnabled ? assocItems.filter((i) => !i.mensalidade_isento && i.status !== 'PAGO' && i.status !== 'ISENTO').length : 0);

  const statusChip = (item: MensalidadeItem) => {
    const s = item.status;
    if (s === 'PAGO') return <Chip label="Pago" color="success" size="small" />;
    if (s === 'ISENTO') return <Chip label="Isento" size="small" />;
    if (!s || s === 'PENDENTE') {
      if (hoje > vencimento) return <Chip label="Inadimplente" color="error" size="small" />;
      return <Chip label="Pendente" color="warning" size="small" />;
    }
    return <Chip label={s} size="small" />;
  };

  // ── Chart data ─────────────────────────────────────────────────────────

  const assocArrecadadoByMes: Record<string, number> = {};
  if (assocResumo) {
    for (const h of assocResumo.historico) {
      assocArrecadadoByMes[mesLabel(h.mes)] = h.arrecadado;
    }
  }

  // For PRO-only users resumo is null; fall back to assocResumo so the chart renders
  const effectiveResumo = resumo ?? (can('mensalidade_associado') && assocEnabled ? assocResumo : null);

  const chartData = effectiveResumo
    ? [
        ...effectiveResumo.historico.map((h) => ({
          mes: mesLabel(h.mes),
          Esperado: h.esperado,
          Arrecadado: h.arrecadado,
          projecao: false,
          ...(resumo && assocEnabled && assocResumo ? { Associados: assocArrecadadoByMes[mesLabel(h.mes)] ?? 0 } : {}),
        })),
        ...effectiveResumo.projecao.map((p) => ({
          mes: mesLabel(p.mes),
          Projetado: p.projetado,
          projecao: true,
        })),
      ]
    : [];

  // ── Primary brand color from subscription context ──────────────────────
  const primaryColor = '#7C3AED';

  return (
    <AdminLayout title="Mensalidades">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          <AccountBalanceWalletIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Controle de Mensalidades
        </Typography>

        {/* Month navigator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={handlePrevMes} size="small"><ArrowBackIosNewIcon fontSize="small" /></IconButton>
          <Typography variant="h6" sx={{ minWidth: 100, textAlign: 'center' }}>
            {mesLabel(mes)}
          </Typography>
          <IconButton onClick={handleNextMes} size="small"><ArrowForwardIosIcon fontSize="small" /></IconButton>
          <IconButton onClick={() => { fetchItems(); if (can('mensalidade_associado') && assocEnabled) fetchAssocItems(); fetchResumo(); if (can('mensalidade_associado') && assocEnabled) fetchAssocResumo(); }} size="small" title="Atualizar"><RefreshIcon fontSize="small" /></IconButton>
        </Box>

        {/* KPI Cards */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            { label: 'Esperado', value: fmtBRL(totalEsperado), color: 'text.primary' },
            { label: 'Arrecadado', value: fmtBRL(totalArrecadado), color: 'success.main' },
            { label: 'Inadimplentes', value: String(inadimplentes), color: inadimplentes > 0 ? 'error.main' : 'success.main' },
            { label: 'Em aberto', value: fmtBRL(Math.max(0, totalEsperado - totalArrecadado)), color: 'warning.main' },
          ].map(({ label, value, color }) => (
            <Grid item xs={6} md={3} key={label}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase">{label}</Typography>
                  <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {!config && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Configure o valor mensal em{' '}
            <a href="/admin/financeiro/config">Financeiro → Configuração</a> para ativar o controle.
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {can('mensalidade_mediun') && <Tab label="Médiuns" />}
          <Tab label="Gráfico" />
          {can('mensalidade_associado') && assocEnabled && <Tab label="Associados" />}
        </Tabs>

        {/* TAB: Médiuns */}
        {tabIds[tab] === 'mediuns' && (
          <>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="Buscar nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 200 }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filterStatus}
                  label="Status"
                  onChange={(e: SelectChangeEvent) => setFilterStatus(e.target.value as typeof filterStatus)}
                >
                  <MenuItem value="TODOS">Todos</MenuItem>
                  <MenuItem value="PENDENTE">Pendente / Inadimplente</MenuItem>
                  <MenuItem value="PAGO">Pagos</MenuItem>
                  <MenuItem value="ISENTO">Isentos</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : filtered.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
                <Typography color="text.secondary">
                  {items.length === 0
                    ? 'Nenhum médium ativo cadastrado.'
                    : 'Nenhum resultado para os filtros selecionados.'}
                </Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nome</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Vencimento</TableCell>
                      <TableCell>Data Pag.</TableCell>
                      <TableCell align="right">Valor Pago</TableCell>
                      <TableCell>Comprovante</TableCell>
                      {canInsertEdit && <TableCell />}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.mediun_id} hover>
                        <TableCell>
                          {item.mediun_nome}
                          {item.mensalidade_isento && (
                            <Chip label="isento perm." size="small" sx={{ ml: 1, fontSize: 11 }} />
                          )}
                        </TableCell>
                        <TableCell>{statusChip(item)}</TableCell>
                        <TableCell>
                          {config ? `${String(config.dia_vencimento).padStart(2, '0')}/${mes.slice(5, 7)}/${mes.slice(0, 4)}` : '—'}
                        </TableCell>
                        <TableCell>
                          {item.data_pagamento
                            ? (() => { const d = item.data_pagamento.slice(0, 10); return `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`; })()
                            : '—'}
                        </TableCell>
                        <TableCell align="right">{item.status === 'PAGO' ? fmtBRL(item.valor_pago) : '—'}</TableCell>
                        <TableCell>
                          {item.comprovante_filename ? (
                            <Tooltip title={item.comprovante_filename}>
                              <IconButton size="small" onClick={() => handleDownloadComprovante(item)}>
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <AttachFileIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                          )}
                        </TableCell>
                        {canInsertEdit && (
                          <TableCell>
                            <Tooltip title="Registrar / Editar">
                              <IconButton size="small" onClick={() => openDrawer(item)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {/* TAB: Associados (PRO+) */}
        {tabIds[tab] === 'associados' && can('mensalidade_associado') && assocEnabled && (
          <Box>
            {loadingAssoc ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : assocItems.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
                <Typography color="text.secondary">Nenhum associado ativo cadastrado.</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nome</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Vencimento</TableCell>
                      <TableCell>Data Pag.</TableCell>
                      <TableCell align="right">Valor Pago</TableCell>
                      <TableCell>Comprovante</TableCell>
                      {canInsertEdit && <TableCell />}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {assocItems.map((item) => {
                      const s = item.status;
                      const chip = s === 'PAGO'
                        ? <Chip label="Pago" color="success" size="small" />
                        : s === 'ISENTO'
                          ? <Chip label="Isento" size="small" />
                          : hoje > vencimento
                            ? <Chip label="Inadimplente" color="error" size="small" />
                            : <Chip label="Pendente" color="warning" size="small" />;
                      return (
                        <TableRow key={item.associado_id} hover>
                          <TableCell>
                            {item.associado_nome}
                            {item.mensalidade_isento && <Chip label="isento perm." size="small" sx={{ ml: 1, fontSize: 11 }} />}
                          </TableCell>
                          <TableCell>{chip}</TableCell>
                          <TableCell>
                            {config ? `${String(config.dia_vencimento_associado ?? 10).padStart(2, '0')}/${mes.slice(5, 7)}/${mes.slice(0, 4)}` : '—'}
                          </TableCell>
                          <TableCell>
                            {item.data_pagamento
                              ? (() => { const d = item.data_pagamento!.slice(0, 10); return `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`; })()
                              : '—'}
                          </TableCell>
                          <TableCell align="right">{item.status === 'PAGO' ? fmtBRL(item.valor_pago) : '—'}</TableCell>
                          <TableCell>
                            {item.comprovante_filename ? (
                              <Tooltip title={item.comprovante_filename}>
                                <IconButton size="small" onClick={() => handleDownloadAssocComprovante(item)}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <AttachFileIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                            )}
                          </TableCell>
                          {canInsertEdit && (
                            <TableCell>
                              <Tooltip title="Registrar / Editar">
                                <IconButton size="small" onClick={() => openAssocDrawer(item)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* TAB: Gráfico */}
        {tabIds[tab] === 'grafico' && (
          <Box>
            {loadingResumo ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : !effectiveResumo ? (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Nenhum dado disponível.
              </Typography>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <RechartsTooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend />
                    <Bar dataKey="Esperado" fill="#bdbdbd" />
                    <Bar dataKey="Arrecadado" fill={primaryColor} />
                    <Bar dataKey="Projetado" fill="#c5cae9" />
                    {resumo && assocEnabled && assocResumo && (
                      <Bar dataKey="Associados" fill="#80cbc4" />
                    )}
                  </BarChart>
                </ResponsiveContainer>

                <Grid container spacing={2} sx={{ mt: 2 }}>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Ativos</Typography>
                        <Typography variant="h6" fontWeight={700}>{effectiveResumo.config.count_ativos}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Isentos</Typography>
                        <Typography variant="h6" fontWeight={700}>{effectiveResumo.config.count_isentos}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Projeção mensal</Typography>
                        <Typography variant="h6" fontWeight={700}>{fmtBRL(effectiveResumo.projecao[0]?.projetado ?? 0)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  * Projeção baseada no valor mensal atual × número de associados pagantes ativos.
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Registration Drawer — only rendered for users with insert/edit permission */}
      {canInsertEdit && <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          drawerMode === 'associado' && drawerAssocItem
            ? `Mensalidade — ${drawerAssocItem.associado_nome}`
            : drawerItem
            ? `Mensalidade — ${drawerItem.mediun_nome}`
            : 'Registrar Mensalidade'
        }
        onSave={handleSave}
        saving={drawerSaving}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {(drawerItem?.mensalidade_isento || drawerAssocItem?.mensalidade_isento) && (
            <Alert severity="info">
              {drawerMode === 'associado' ? 'Este associado' : 'Este médium'} possui isenção permanente configurada.
            </Alert>
          )}

          {mes < toYYYYMM(hoje) && (
            <Alert severity="warning">
              Você está editando um mês passado. Verifique os dados antes de salvar.
            </Alert>
          )}

          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={drawerStatus}
              label="Status"
              onChange={(e) => setDrawerStatus(e.target.value as 'PAGO' | 'PENDENTE' | 'ISENTO')}
            >
              <MenuItem value="PAGO">Pago</MenuItem>
              <MenuItem value="PENDENTE">Pendente</MenuItem>
              <MenuItem value="ISENTO">Isento</MenuItem>
            </Select>
          </FormControl>

          {drawerStatus === 'PAGO' && (
            <>
              <TextField
                size="small"
                label="Data do pagamento"
                type="date"
                value={drawerDataPag}
                onChange={(e) => setDrawerDataPag(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <NumericFormat
                customInput={TextField}
                size="small"
                label="Valor pago (R$)"
                fullWidth
                value={drawerValorPago}
                onValueChange={(values) => setDrawerValorPago(values.value)}
                thousandSeparator="."
                decimalSeparator=","
                decimalScale={2}
                fixedDecimalScale
                prefix="R$ "
                allowNegative={false}
              />
              <Box>
                <Typography variant="caption" color="text.secondary">Comprovante (JPG, PNG, WebP, PDF — max 5MB)</Typography>
                <Button
                  variant="outlined"
                  component="label"
                  size="small"
                  startIcon={<AttachFileIcon />}
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  {drawerFile ? drawerFile.name : 'Anexar arquivo'}
                  <input
                    type="file"
                    hidden
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setDrawerFile(e.target.files?.[0] ?? null)}
                  />
                </Button>
              </Box>
            </>
          )}

          <TextField
            size="small"
            label="Observação"
            multiline
            rows={3}
            value={drawerObs}
            onChange={(e) => setDrawerObs(e.target.value)}
            fullWidth
          />
        </Box>
      </CrudDrawer>}

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
}
