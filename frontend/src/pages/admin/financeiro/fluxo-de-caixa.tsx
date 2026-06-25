'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
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
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pt-br';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowDownwardIcon  from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon    from '@mui/icons-material/ArrowUpward';
import RefreshIcon        from '@mui/icons-material/Refresh';
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

type Preset = 'mes_atual' | 'mes_anterior' | 'ultimos_90' | 'customizado';

interface PeriodoState {
  preset: Preset;
  inicio: Dayjs;
  fim: Dayjs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLShort = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return fmtBRL(v);
};

function presetRange(preset: Exclude<Preset, 'customizado'>): { inicio: Dayjs; fim: Dayjs } {
  const today = dayjs();
  switch (preset) {
    case 'mes_atual':
      return { inicio: today.startOf('month'), fim: today.endOf('month') };
    case 'mes_anterior': {
      const prev = today.subtract(1, 'month');
      return { inicio: prev.startOf('month'), fim: prev.endOf('month') };
    }
    case 'ultimos_90':
      return { inicio: today.subtract(89, 'day'), fim: today };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'mes_atual',    label: 'Mês atual' },
  { key: 'mes_anterior', label: 'Mês anterior' },
  { key: 'ultimos_90',   label: 'Últimos 90 dias' },
  { key: 'customizado',  label: 'Customizado' },
];

function initialPeriodo(): PeriodoState {
  const { inicio, fim } = presetRange('mes_atual');
  return { preset: 'mes_atual', inicio, fim };
}

// ─── Regressão linear simples ─────────────────────────────────────────────────

interface RegressionResult { slope: number; intercept: number; r2: number }

function linearRegression(ys: number[]): RegressionResult {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXX  = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const ssXY  = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  const ssYY  = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const slope     = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r2        = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY);
  return { slope, intercept, r2 };
}

function nextMonthLabel(last: FluxoMes, delta: number): string {
  const labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const total  = (last.ano * 12 + last.mes - 1) + delta;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return `${labels[m]}/${String(y).slice(2)}`;
}

const PROJ_MESES = 3;

interface ProjPonto {
  mes_label: string;
  saldo_acumulado: number | null;
  saldo_proj: number | null;
  isProj: boolean;
}

function buildProjecao(dados: FluxoMes[]): {
  chartData: ProjPonto[];
  reg: RegressionResult | null;
  projecoes: { mes_label: string; valor: number }[];
} {
  if (dados.length < 2) return { chartData: [], reg: null, projecoes: [] };

  const ys  = dados.map((d) => d.saldo);
  const reg = linearRegression(ys);
  const n   = dados.length;

  // Projeta saldos mensais futuros e acumula sobre o último saldo_acumulado real
  let acum = dados[n - 1].saldo_acumulado;
  const projecoes: { mes_label: string; valor: number }[] = [];
  const projPontos: ProjPonto[] = [];

  for (let i = 1; i <= PROJ_MESES; i++) {
    const saldoProj = reg.intercept + reg.slope * (n - 1 + i);
    acum += saldoProj;
    const label = nextMonthLabel(dados[n - 1], i);
    projecoes.push({ mes_label: label, valor: Math.round(acum * 100) / 100 });
    projPontos.push({ mes_label: label, saldo_acumulado: null, saldo_proj: Math.round(acum * 100) / 100, isProj: true });
  }

  // Ponte: último ponto real aparece nas duas séries para a linha não flutuar
  const last = dados[n - 1];
  const chartData: ProjPonto[] = [
    ...dados.map((d) => ({
      mes_label: d.mes_label,
      saldo_acumulado: d.saldo_acumulado,
      saldo_proj: null,
      isProj: false,
    })),
    { mes_label: last.mes_label, saldo_acumulado: null, saldo_proj: last.saldo_acumulado, isProj: true },
    ...projPontos,
  ];

  return { chartData, reg, projecoes };
}

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
  const { can }           = useSubscription();
  const { can: canGroup } = usePermissions();
  const { tokens, isDark } = useAdminTheme();

  const [dados, setDados]     = useState<FluxoMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoState>(initialPeriodo);

  const fetchAll = useCallback(async () => {
    if (!can('contas_financeiras') || !canGroup('contas_financeiras', 'view')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<FluxoMes[]>('/api/v1/admin/financeiro/fluxo-de-caixa', {
        params: {
          data_inicio: periodo.inicio.format('YYYY-MM-DD'),
          data_fim:    periodo.fim.format('YYYY-MM-DD'),
        },
      });
      setDados(res.data);
    } catch {
      /* silently show empty */
    } finally {
      setLoading(false);
    }
  }, [can, canGroup, periodo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handlePreset = (key: Preset) => {
    if (key === 'customizado') {
      setPeriodo((p) => ({ ...p, preset: 'customizado' }));
      return;
    }
    const { inicio, fim } = presetRange(key);
    setPeriodo({ preset: key, inicio, fim });
  };

  const handleCustomInicio = (v: Dayjs | null) => {
    if (!v) return;
    setPeriodo((p) => ({ ...p, preset: 'customizado', inicio: v }));
  };

  const handleCustomFim = (v: Dayjs | null) => {
    if (!v) return;
    setPeriodo((p) => ({ ...p, preset: 'customizado', fim: v }));
  };

  if (!can('contas_financeiras')) {
    return <UpgradePrompt feature="Fluxo de Caixa" minPlan="Pro" />;
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalReceitas   = dados.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas   = dados.reduce((s, d) => s + d.despesas, 0);
  const saldoAtual      = dados[dados.length - 1]?.saldo_acumulado ?? 0;
  const projecaoReceber = dados.reduce((s, d) => s + d.a_receber, 0);
  const projecaoPagar   = dados.reduce((s, d) => s + d.a_pagar, 0);

  const { chartData: projChartData, reg: projReg, projecoes } = buildProjecao(dados);

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
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pt-br">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'nowrap' }}>
              {/* Preset buttons */}
              <ButtonGroup size="small" variant="outlined">
                {PRESETS.map(({ key, label }) => (
                  <Button
                    key={key}
                    onClick={() => handlePreset(key)}
                    variant={periodo.preset === key ? 'contained' : 'outlined'}
                    disableElevation
                  >
                    {label}
                  </Button>
                ))}
              </ButtonGroup>

              {/* Date pickers — only visible in custom mode */}
              {periodo.preset === 'customizado' && (
                <>
                  <DatePicker
                    label="De"
                    value={periodo.inicio}
                    onChange={handleCustomInicio}
                    format="DD/MM/YYYY"
                    maxDate={periodo.fim}
                    slotProps={{
                      textField: {
                        size: 'small',
                        sx: { width: 136, '& input': { fontSize: 13 } },
                      },
                    }}
                  />
                  <DatePicker
                    label="Até"
                    value={periodo.fim}
                    onChange={handleCustomFim}
                    format="DD/MM/YYYY"
                    minDate={periodo.inicio}
                    maxDate={dayjs()}
                    slotProps={{
                      textField: {
                        size: 'small',
                        sx: { width: 136, '& input': { fontSize: 13 } },
                      },
                    }}
                  />
                </>
              )}

              <Tooltip title="Atualizar">
                <IconButton onClick={fetchAll}><RefreshIcon /></IconButton>
              </Tooltip>
            </Box>
          </LocalizationProvider>
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

      {/* Projeção por regressão linear */}
      {!loading && dados.length >= 2 && projReg && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Projeção de Caixa — próximos {PROJ_MESES} meses
            </Typography>

            {/* Cards de projeção */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {projecoes.map((p) => (
                <Box
                  key={p.mes_label}
                  sx={{
                    px: 1.5, py: 0.75,
                    borderRadius: 1,
                    bgcolor: p.valor >= 0 ? 'success.50' : 'error.50',
                    border: '1px solid',
                    borderColor: p.valor >= 0 ? 'success.200' : 'error.200',
                    minWidth: 100, textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    {p.mes_label}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ color: p.valor >= 0 ? 'success.dark' : 'error.dark' }}
                  >
                    {fmtBRL(p.valor)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Gráfico histórico + projeção */}
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={projChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
              <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 10, fill: tokens.chartTick }} axisLine={false} tickLine={false} width={56} />
              <ReferenceLine y={0} stroke={tokens.border} strokeDasharray="4 2" />
              <RechartsTooltip
                cursor={chartCursor}
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [
                  fmtBRL(v),
                  name === 'saldo_acumulado' ? 'Saldo real' : 'Projeção',
                ]}
              />
              <Legend
                formatter={(v) => v === 'saldo_acumulado' ? 'Saldo real' : 'Projeção (regressão)'}
                wrapperStyle={{ fontSize: 12, color: tokens.textSecondary }}
              />
              <Area
                type="monotone"
                dataKey="saldo_acumulado"
                name="saldo_acumulado"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradReal)"
                dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="saldo_proj"
                name="saldo_proj"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#gradProj)"
                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Disclaimer */}
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'warning.50',
              border: '1px solid',
              borderColor: 'warning.200',
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
            }}
          >
            <Typography variant="caption" sx={{ color: 'warning.dark', lineHeight: 1.6 }}>
              <strong>Como a projeção é calculada:</strong> aplicamos regressão linear simples sobre
              os saldos mensais do período selecionado (R² = {(projReg.r2 * 100).toFixed(1)}%),
              extrapolando a tendência para os próximos {PROJ_MESES} meses.
              Quanto mais próximo de 100% o R², mais consistente é o histórico com a tendência linear.
              A projeção <strong>não considera</strong> sazonalidade, eventos extraordinários ou
              lançamentos futuros já cadastrados. Use como referência indicativa, não como previsão financeira.
            </Typography>
          </Box>
        </Paper>
      )}

      {!loading && dados.length < 2 && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            São necessários ao menos 2 meses de dados para calcular a projeção.
          </Typography>
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
