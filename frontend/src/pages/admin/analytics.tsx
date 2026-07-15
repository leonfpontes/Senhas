'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

import AdminLayout from './admin_layout';
import { KpiCard } from '@/components/admin';
import UpgradePrompt from '../../components/UpgradePrompt';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { apiClient } from '../../services/api_client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
}

interface DailyDistributionItem {
  date: string;
  total: number;
  completed: number;
  common: number;
  sponsor: number;
  walk_in: number;
}

interface PeakHoursItem {
  hour: number;
  count: number;
}

interface AnalyticsData {
  total_emitted: number;
  total_used: number;
  total_cancelled: number;
  usage_rate: number;
  emitted_today: number;
  used_today: number;
  walk_in_total: number;
  daily_distribution: DailyDistributionItem[];
  peak_hours: PeakHoursItem[];
  category_breakdown: { common: number; sponsor: number; walk_in: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
      {title}
    </Typography>
  );
}

function EmptyChart() {
  return (
    <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="body2" color="text.disabled">Sem dados no período</Typography>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  return (
    <AdminLayout title="Analytics">
      <AdminAnalyticsContent />
    </AdminLayout>
  );
}

function AdminAnalyticsContent() {
  const { tokens, isDark } = useAdminTheme();
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('analytics', 'view');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [giras, setGiras] = useState<Gira[]>([]);
  const [giraId, setGiraId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [ready, setReady] = useState(false);

  // Initialise dates client-side to avoid SSR hydration mismatch
  useEffect(() => {
    const today = new Date();
    const ago30 = new Date(today);
    ago30.setDate(ago30.getDate() - 30);
    setDateFrom(fmtDate(ago30));
    setDateTo(fmtDate(today));
    setReady(true);
  }, []);

  const loadGiras = useCallback(async (signal?: AbortSignal) => {
    if (!canView) return;
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to', dateTo);
      const res  = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`, { signal });
      const list: Gira[] = Array.isArray(res.data) ? res.data : res.data.items ?? [];
      setGiras(list);
      if (giraId && !list.some((g) => g.id === giraId)) setGiraId('');
    } catch { /* non-critical */ }
  }, [dateFrom, dateTo, giraId, canView]);

  const loadAnalytics = useCallback(async (signal?: AbortSignal) => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to', dateTo);
      if (giraId)   params.append('gira_id', giraId);
      const res = await apiClient.get(`/api/v1/admin/analytics?${params.toString()}`, { signal });
      setAnalytics(res.data);
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, [dateFrom, dateTo, giraId, canView]);

  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    loadGiras(c.signal);
    return () => c.abort();
  }, [dateFrom, dateTo, ready, canView]);

  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    loadAnalytics(c.signal);
    return () => c.abort();
  }, [dateFrom, dateTo, giraId, ready, canView]);

  // Feature gate
  if (!subLoading && !can('analytics_basico')) {
    return <UpgradePrompt feature="Analytics" minPlan="Basic" />;
  }

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar o analytics. Contate o administrador do sistema.
      </Alert>
    );
  }

  const tooltipStyle = {
    background: tokens.tooltipBg,
    border: `1px solid ${tokens.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: tokens.textPrimary,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  };

  const chartCursor = { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' };

  const categoryData = analytics ? [
    { name: 'Comum',    value: analytics.category_breakdown.common,   color: '#8b5cf6' },
    { name: 'Associado',value: analytics.category_breakdown.sponsor,  color: '#f59e0b' },
    { name: 'Walk-in',  value: analytics.category_breakdown.walk_in,  color: '#3b82f6' },
  ] : [];

  const statusData = analytics ? [
    { name: 'Utilizados',  value: analytics.total_used,      color: '#22c55e' },
    { name: 'Cancelados',  value: analytics.total_cancelled, color: '#ef4444' },
    { name: 'Pendentes',   value: Math.max(0, analytics.total_emitted - analytics.total_used - analytics.total_cancelled), color: '#94a3b8' },
  ] : [];

  const peakMax = analytics?.peak_hours[0]?.count || 1;

  const dailyChartData = (analytics?.daily_distribution ?? []).map((d) => ({
    ...d,
    date: fmtChartDate(d.date),
  }));

  const kpis = analytics ? [
    { label: 'Total emitido',  value: String(analytics.total_emitted),  icon: <SendRoundedIcon />,           color: '#6366f1' },
    { label: 'Total utilizado',value: String(analytics.total_used),     icon: <CheckRoundedIcon />,          color: '#22c55e' },
    { label: 'Taxa de uso',    value: `${analytics.usage_rate}%`,       icon: <TrendingUpRoundedIcon />,     color: '#f59e0b' },
    { label: 'Cancelados',     value: String(analytics.total_cancelled),icon: <CancelRoundedIcon />,         color: '#ef4444' },
    { label: 'Walk-ins',       value: String(analytics.walk_in_total),  icon: <DirectionsWalkRoundedIcon />, color: '#0ea5e9' },
  ] : [];

  return (
    <Box>
      {/* ── Header ── */}
      <Box data-tour="analytics-header" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Analytics</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Métricas de emissão, uso e distribuição por período ou gira
        </Typography>
      </Box>

      {/* ── Filtros ── */}
      <Paper
        data-tour="analytics-filtros"
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 3 }}
      >
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Data de"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="Data até"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Gira</InputLabel>
            <Select value={giraId} onChange={(e) => setGiraId(e.target.value)} label="Gira">
              <MenuItem value="">Todas as giras</MenuItem>
              {giras.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.nome}
                  {g.data_inicio ? ` (${new Date(g.data_inicio).toLocaleDateString('pt-BR')})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : analytics ? (
        <Grid container spacing={3}>

          {/* ── KPIs ── */}
          <Grid data-tour="analytics-kpis" item xs={12}>
            <Grid container spacing={2}>
              {kpis.map((kpi) => (
                <Grid item xs={6} sm={4} md key={kpi.label}>
                  <KpiCard label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} />
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* ── Distribuição diária ── */}
          <Grid data-tour="analytics-chart-line" item xs={12} lg={7}>
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader title="Distribuição diária" />
              {dailyChartData.length > 0 ? (
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <RechartsTooltip cursor={chartCursor} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconSize={10} />
                      <Bar dataKey="common"  stackId="a" fill="#8b5cf6" name="Comum"    radius={[0,0,0,0]} maxBarSize={32} />
                      <Bar dataKey="sponsor" stackId="a" fill="#f59e0b" name="Associado" radius={[0,0,0,0]} maxBarSize={32} />
                      <Bar dataKey="walk_in" stackId="a" fill="#3b82f6" name="Walk-in"  radius={[4,4,0,0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyChart />}
            </Paper>
          </Grid>

          {/* ── Distribuição por categoria (donut) ── */}
          <Grid data-tour="analytics-chart-pie" item xs={12} sm={6} lg={5}>
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3, height: '100%' }}>
              <SectionHeader title="Distribuição por categoria" />
              {categoryData.some((d) => d.value > 0) ? (
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {categoryData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyChart />}
            </Paper>
          </Grid>

          {/* ── Horários de pico ── */}
          <Grid data-tour="analytics-peak" item xs={12} sm={6} lg={5}>
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader title="Horários de pico" />
              {analytics.peak_hours.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {analytics.peak_hours.map((ph) => {
                    const pct = (ph.count / peakMax) * 100;
                    return (
                      <Box key={ph.hour} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="caption" fontWeight={600} sx={{ width: 32, flexShrink: 0, fontFamily: 'monospace', color: 'text.secondary' }}>
                          {String(ph.hour).padStart(2, '0')}h
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            flex: 1,
                            height: 8,
                            borderRadius: 4,
                            bgcolor: '#f59e0b20',
                            '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: '#f59e0b' },
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
                          {ph.count} emis.
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              ) : <EmptyChart />}
            </Paper>
          </Grid>

          {/* ── Status dos tickets (donut) ── */}
          <Grid item xs={12} sm={6} lg={4}>
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3, height: '100%' }}>
              <SectionHeader title="Status dos tickets" />
              {statusData.some((d) => d.value > 0) ? (
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyChart />}
            </Paper>
          </Grid>

          {/* ── Evolução de uso (line) ── */}
          <Grid item xs={12} lg={7}>
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader title="Evolução de uso no período" />
              {dailyChartData.length > 0 ? (
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <RechartsTooltip cursor={chartCursor} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconSize={10} />
                      <Line type="monotone" dataKey="total"     stroke="#6366f1" name="Emitidos"  dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="completed" stroke="#22c55e" name="Concluídos" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyChart />}
            </Paper>
          </Grid>

        </Grid>
      ) : null}
    </Box>
  );
}
