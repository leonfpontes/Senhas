'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowDownwardIcon  from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon    from '@mui/icons-material/ArrowUpward';
import RefreshIcon        from '@mui/icons-material/Refresh';
import SwapHorizIcon      from '@mui/icons-material/SwapHoriz';
import TrendingUpIcon     from '@mui/icons-material/TrendingUp';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AdminLayout   from '../admin_layout';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { KpiCard, PageHeader } from '@/components/admin';
import { useAdminTheme }       from '@/providers/AdminThemeProvider';
import { useSubscription }     from '../../../hooks/useSubscription';
import { usePermissions }      from '../../../hooks/usePermissions';
import { apiClient }           from '../../../services/api_client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FluxoMes {
  ano: number;
  mes: number;
  mes_label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  saldo_acumulado: number;
  a_receber: number;
  a_pagar: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLShort = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return fmtBRL(v);
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FluxoDeCaixaPage() {
  return (
    <AdminLayout title="Fluxo de Caixa">
      <FluxoDeCaixaContent />
    </AdminLayout>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

function FluxoDeCaixaContent() {
  const { can }        = useSubscription();
  const { can: canGroup } = usePermissions();
  const { tokens, isDark } = useAdminTheme();

  const [dados, setDados]   = useState<FluxoMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [meses, setMeses]   = useState('12');

  const fetchAll = useCallback(async () => {
    if (!can('contas_financeiras') || !canGroup('contas_financeiras', 'view')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<FluxoMes[]>('/api/v1/admin/financeiro/fluxo-de-caixa', {
        params: { meses },
      });
      setDados(res.data);
    } catch {
      /* silently show empty */
    } finally {
      setLoading(false);
    }
  }, [can, canGroup, meses]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!can('contas_financeiras')) {
    return <UpgradePrompt feature="Fluxo de Caixa" minPlan="Pro" />;
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalReceitas   = dados.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas   = dados.reduce((s, d) => s + d.despesas, 0);
  const saldoAtual      = dados[dados.length - 1]?.saldo_acumulado ?? 0;
  const projecaoReceber = dados.reduce((s, d) => s + d.a_receber, 0);
  const projecaoPagar   = dados.reduce((s, d) => s + d.a_pagar, 0);

  // ── Chart helpers ──────────────────────────────────────────────────────────

  const tooltipStyle = {
    background: tokens.tooltipBg,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textPrimary,
    fontSize: 12,
  };
  const chartCursor = { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>

      {/* Header */}
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Evolução de receitas, despesas e saldo acumulado"
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Período</InputLabel>
              <Select value={meses} label="Período" onChange={(e) => setMeses(e.target.value)}>
                <MenuItem value="3">3 meses</MenuItem>
                <MenuItem value="6">6 meses</MenuItem>
                <MenuItem value="12">12 meses</MenuItem>
                <MenuItem value="24">24 meses</MenuItem>
              </Select>
            </FormControl>
            <Tooltip title="Atualizar">
              <IconButton onClick={fetchAll}><RefreshIcon /></IconButton>
            </Tooltip>
          </>
        }
      />

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Saldo Acumulado',
            value: loading ? '—' : fmtBRL(saldoAtual),
            icon: <AccountBalanceIcon />,
            color: saldoAtual >= 0 ? '#22c55e' : '#ef4444',
            subtitle: 'no período',
          },
          {
            label: 'Total Recebido',
            value: loading ? '—' : fmtBRL(totalReceitas),
            icon: <ArrowDownwardIcon />,
            color: '#3b82f6',
            subtitle: 'realizado',
          },
          {
            label: 'Total Pago',
            value: loading ? '—' : fmtBRL(totalDespesas),
            icon: <ArrowUpwardIcon />,
            color: '#f59e0b',
            subtitle: 'realizado',
          },
          {
            label: 'Projeção Líquida',
            value: loading ? '—' : fmtBRL(projecaoReceber - projecaoPagar),
            icon: <TrendingUpIcon />,
            color: '#8b5cf6',
            subtitle: 'pendentes',
          },
        ].map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <KpiCard {...kpi} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>

        {/* Grouped bar: receitas vs despesas */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              Receitas vs Despesas por Mês
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
            ) : dados.length === 0 ? (
              <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">Sem dados</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={56} />
                  <RechartsTooltip
                    cursor={chartCursor}
                    contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => [fmtBRL(v), name === 'receitas' ? 'Recebido' : 'Pago']}
                  />
                  <Legend
                    formatter={(v) => v === 'receitas' ? 'Recebido' : 'Pago'}
                    wrapperStyle={{ fontSize: 12, color: tokens.textSecondary }}
                  />
                  <Bar dataKey="receitas" name="receitas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="despesas" name="despesas" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Saldo acumulado area chart */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              Saldo Acumulado
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
            ) : dados.length === 0 ? (
              <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">Sem dados</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSaldoNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={56} />
                  <ReferenceLine y={0} stroke={tokens.border} strokeDasharray="4 2" />
                  <RechartsTooltip
                    cursor={chartCursor}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtBRL(v), 'Saldo acumulado']}
                  />
                  <Area
                    type="monotone"
                    dataKey="saldo_acumulado"
                    stroke={saldoAtual >= 0 ? '#22c55e' : '#ef4444'}
                    strokeWidth={2}
                    fill={saldoAtual >= 0 ? 'url(#gradSaldo)' : 'url(#gradSaldoNeg)'}
                    dot={{ r: 3, fill: saldoAtual >= 0 ? '#22c55e' : '#ef4444', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Projeção bar: a receber vs a pagar */}
      {dados.some((d) => d.a_receber > 0 || d.a_pagar > 0) && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
            Projeção — Pendentes por Mês
          </Typography>
          {loading ? (
            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dados} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={56} />
                <RechartsTooltip
                  cursor={chartCursor}
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [fmtBRL(v), name === 'a_receber' ? 'A Receber' : 'A Pagar']}
                />
                <Legend
                  formatter={(v) => v === 'a_receber' ? 'A Receber' : 'A Pagar'}
                  wrapperStyle={{ fontSize: 12, color: tokens.textSecondary }}
                />
                <Bar dataKey="a_receber" name="a_receber" fill="#3b82f680" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="a_pagar"   name="a_pagar"   fill="#f59e0b80" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Paper>
      )}

      {/* Tabela mensal detalhada */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Mês</TableCell>
                <TableCell align="right">Recebido</TableCell>
                <TableCell align="right">Pago</TableCell>
                <TableCell align="right">Saldo do Mês</TableCell>
                <TableCell align="right">Saldo Acumulado</TableCell>
                <TableCell align="right">A Receber</TableCell>
                <TableCell align="right">A Pagar</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Sem dados no período.
                  </TableCell>
                </TableRow>
              ) : (
                [...dados].reverse().map((d) => {
                  const isCurrentMonth = d.ano === new Date().getFullYear() && d.mes === new Date().getMonth() + 1;
                  return (
                    <TableRow key={`${d.ano}-${d.mes}`} hover sx={isCurrentMonth ? { fontWeight: 700, bgcolor: 'action.hover' } : {}}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {d.mes_label}
                          {isCurrentMonth && <Chip label="atual" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#3b82f6', fontWeight: 500 }}>
                        {fmtBRL(d.receitas)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#f59e0b', fontWeight: 500 }}>
                        {fmtBRL(d.despesas)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ color: d.saldo >= 0 ? '#22c55e' : '#ef4444' }}
                        >
                          {d.saldo >= 0 ? '+' : ''}{fmtBRL(d.saldo)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          sx={{ color: d.saldo_acumulado >= 0 ? 'text.primary' : '#ef4444' }}
                        >
                          {fmtBRL(d.saldo_acumulado)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {d.a_receber > 0 ? fmtBRL(d.a_receber) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {d.a_pagar > 0 ? fmtBRL(d.a_pagar) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

    </Box>
  );
}
