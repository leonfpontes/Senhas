/**
 * Admin Estoque — Relatório de Posição (posição atual + export CSV)
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
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
import BarChartIcon from '@mui/icons-material/BarChart';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { apiClient } from '../../../services/api_client';

interface Grupo { id: string; nome: string; }

interface RelatorioItem {
  item_id: string;
  item_nome: string;
  grupo_id: string | null;
  grupo_nome: string | null;
  unidade_medida: string;
  saldo: number;
  estoque_minimo: number;
  status: 'ok' | 'atencao' | 'critico';
  ultima_movimentacao: string | null;
}

const STATUS_LABEL: Record<string, { label: string; color: 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
  ok: { label: 'OK', color: 'success', icon: <CheckCircleOutlineIcon fontSize="small" /> },
  atencao: { label: 'Atenção', color: 'warning', icon: <WarningAmberIcon fontSize="small" /> },
  critico: { label: 'Crítico', color: 'error', icon: <ErrorOutlineIcon fontSize="small" /> },
};

export default function AdminEstoqueRelatorioPage() {
  return (
    <AdminLayout title="Relatório de Estoque">
      <AdminEstoqueRelatorioContent />
    </AdminLayout>
  );
}

function AdminEstoqueRelatorioContent() {
  const { can, loading: subLoading } = useSubscription();
  const [posicao, setPosicao] = useState<RelatorioItem[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => {
    loadGrupos();
    loadPosicao();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(filterSearch), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterSearch]);

  useEffect(() => { loadPosicao(); }, [filterGrupo, debouncedSearch]);

  const loadGrupos = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/estoque/grupos');
      setGrupos(res.data);
    } catch { /* silencioso */ }
  };

  const loadPosicao = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterGrupo) params.grupo_id = filterGrupo;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await apiClient.get('/api/v1/admin/estoque/relatorio/posicao', { params });
      setPosicao(res.data);
    } catch {
      setSnackbar({ open: true, message: 'Erro ao carregar relatório', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!can('export_csv')) {
      setSnackbar({ open: true, message: 'Export CSV disponível a partir do plano Premium', severity: 'error' });
      return;
    }
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (filterGrupo) params.grupo_id = filterGrupo;
      const res = await apiClient.get('/api/v1/admin/estoque/relatorio/posicao/csv', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `estoque_posicao_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'CSV exportado!', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Erro ao exportar CSV', severity: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Summary counts
  const totalOk = posicao.filter((r) => r.status === 'ok').length;
  const totalAtencao = posicao.filter((r) => r.status === 'atencao').length;
  const totalCritico = posicao.filter((r) => r.status === 'critico').length;

  if (subLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!can('estoque_controle')) return <UpgradePrompt feature="controle de estoque" minPlan="Pro" />;

  return (
    <Box>
      <Box data-tour="estoque-rel-header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BarChartIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Relatório de Estoque</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Buscar por nome..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: 'text.disabled' }} /> }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Filtrar por grupo</InputLabel>
            <Select value={filterGrupo} label="Filtrar por grupo" onChange={(e) => setFilterGrupo(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {grupos.map((g) => <MenuItem key={g.id} value={g.id}>{g.nome}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Atualizar"><IconButton onClick={loadPosicao}><RefreshIcon /></IconButton></Tooltip>
          <Tooltip title={can('export_csv') ? 'Exportar CSV' : 'Exportar CSV — disponível no plano Premium'}>
            <span>
              <Button
                data-tour="estoque-rel-export"
                variant="outlined"
                startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
                onClick={handleExportCsv}
                disabled={exporting || !can('export_csv')}
              >
                CSV
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Summary cards */}
      {!loading && posicao.length > 0 && (
        <Grid data-tour="estoque-rel-kpis" container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total de itens', value: posicao.length, color: 'primary.main' },
            { label: 'Em nível OK', value: totalOk, color: 'success.main' },
            { label: 'Atenção (abaixo do mínimo)', value: totalAtencao, color: 'warning.main' },
            { label: 'Crítico (zerado ou negativo)', value: totalCritico, color: 'error.main' },
          ].map((card) => (
            <Grid item xs={6} md={3} key={card.label}>
              <Card variant="outlined">
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="h4" fontWeight={700} sx={{ color: card.color }}>{card.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : posicao.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BarChartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Nenhum item cadastrado para exibir relatório.</Typography>
        </Paper>
      ) : (
        <TableContainer data-tour="estoque-rel-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Item</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Grupo</strong></TableCell>
                <TableCell><strong>Saldo</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Mínimo</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Unidade</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><strong>Última Mov.</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {posicao
                .sort((a, b) => {
                  const order = { critico: 0, atencao: 1, ok: 2 };
                  return order[a.status] - order[b.status];
                })
                .map((row) => {
                  const st = STATUS_LABEL[row.status];
                  return (
                    <TableRow key={row.item_id} hover sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell fontWeight={500}>{row.item_nome}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{row.grupo_nome || '—'}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ color: row.status === 'critico' ? 'error.main' : row.status === 'atencao' ? 'warning.main' : 'success.main' }}
                        >
                          {row.saldo}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{row.estoque_minimo}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>{row.unidade_medida}</TableCell>
                      <TableCell>
                        <Chip
                          label={st.label}
                          color={st.color}
                          size="small"
                          icon={st.icon as React.ReactElement}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', display: { xs: 'none', md: 'table-cell' } }}>
                        {row.ultima_movimentacao
                          ? new Date(row.ultima_movimentacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
