'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import CakeRoundedIcon from '@mui/icons-material/CakeRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import MeetingRoomRoundedIcon from '@mui/icons-material/MeetingRoomRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import TodayRoundedIcon from '@mui/icons-material/TodayRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AdminLayout from './admin_layout';
import { KpiCard } from '@/components/admin';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient } from '../../services/api_client';
import { useRouter } from 'next/router';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpcomingGira {
  id: string;
  nome: string;
  data_inicio: string;
  max_tickets: number | null;
  current_count: number;
  sponsor_count: number;
  is_open: boolean;
}

interface TicketStats {
  total_emitted: number;
  total_used: number;
  total_cancelled: number;
  usage_rate: number;
  emitted_today: number;
  used_today: number;
  walk_in_total: number;
}

interface DailyDist {
  date: string;
  total: number;
  common: number;
  sponsor: number;
  walk_in: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface EstoqueAlert {
  item_id: string;
  item_nome: string;
  grupo_nome: string | null;
  unidade_medida: string;
  saldo: number;
  estoque_minimo: number;
  status: string;
}

interface EstoqueSummary {
  total_itens: number;
  total_grupos: number;
  itens_ok: number;
  itens_atencao: number;
  itens_critico: number;
}

interface AniversarianteItem {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string | null;
  dias_ate_aniversario: number;
}

interface DashboardData {
  upcoming_giras: UpcomingGira[];
  ticket_stats: TicketStats;
  daily_distribution: DailyDist[];
  peak_hours: PeakHour[];
  estoque_alerts: EstoqueAlert[];
  estoque_summary: EstoqueSummary | null;
  plan: { name: string; label: string; status: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatTodayLong(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} color="text.primary">
        {title}
      </Typography>
      {action}
    </Box>
  );
}

function GiraCard({ gira, primary, canOpenPorta }: { gira: UpcomingGira; primary: string; canOpenPorta: boolean }) {
  const pct = gira.max_tickets ? Math.min((gira.current_count / gira.max_tickets) * 100, 100) : null;
  const isFull = pct !== null && pct >= 100;

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: gira.is_open ? `${primary}40` : 'divider',
        bgcolor: gira.is_open ? `${primary}06` : 'transparent',
        transition: 'border-color .15s',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, mr: 1 }}>
          {gira.nome}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Chip
            label={gira.is_open ? 'Aberta' : 'Fechada'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 700,
              bgcolor: gira.is_open ? '#dcfce7' : 'action.selected',
              color: gira.is_open ? '#16a34a' : 'text.secondary',
            }}
          />
          {canOpenPorta && !!gira.max_tickets && (
            <Tooltip title="Abrir na Porta">
              <IconButton size="small" component={Link} href={`/admin/porta?gira=${gira.id}`} sx={{ p: 0.5 }}>
                <MeetingRoomRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary">
        {formatShortDate(gira.data_inicio)}
        {gira.max_tickets ? ` · ${gira.current_count} / ${gira.max_tickets} tickets` : ` · ${gira.current_count} tickets`}
      </Typography>

      {pct !== null && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 5,
              borderRadius: 3,
              bgcolor: `${primary}18`,
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: isFull ? '#ef4444' : primary,
              },
            }}
          />
          {isFull && (
            <Typography variant="caption" color="error" sx={{ mt: 0.25, display: 'block' }}>
              Lotada
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Typography variant="body2" color="text.disabled">{label}</Typography>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aniversariantes, setAniversariantes] = useState<AniversarianteItem[]>([]);
  const [greeting, setGreeting] = useState('');
  const [todayLabel, setTodayLabel] = useState('');

  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canViewPorta = canGroup('porta', 'view');
  const { config: tenantConfig } = useTenant();
  const { tokens, isDark } = useAdminTheme();
  const router = useRouter();

  // Exportação do gráfico como PNG (html2canvas, com fallback para impressão)
  const chartRef = useRef<HTMLDivElement | null>(null);
  const handleExportChart = async () => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const html2canvas = (await import('html2canvas')).default;
      if (chartRef.current) {
        const canvas = await html2canvas(chartRef.current, {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          scale: 2,
        });
        const link = document.createElement('a');
        link.download = `dashboard-${today}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        return;
      }
    } catch {
      /* fallback abaixo */
    }
    window.print();
  };

  const primary = tenantConfig?.colors?.primary || '#6366f1';

  useEffect(() => {
    setGreeting(getGreeting());
    setTodayLabel(formatTodayLong());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!can('mediuns')) return;
    const controller = new AbortController();
    apiClient
      .get<AniversarianteItem[]>('/api/v1/admin/mediuns/aniversariantes?dias=7', { signal: controller.signal })
      .then((res) => setAniversariantes(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboard = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/api/v1/admin/dashboard-summary', { signal });
      setData(res.data);
    } catch (err) {
      if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
      setError('Não foi possível carregar os dados do dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const stats = data?.ticket_stats;

  const kpis = [
    {
      label: 'Total emitidos',
      value: String(stats?.total_emitted ?? 0),
      icon: <SendRoundedIcon />,
      color: primary,
      subtitle: stats?.emitted_today != null ? `${stats.emitted_today} hoje` : undefined,
      loading,
    },
    {
      label: 'Total utilizados',
      value: String(stats?.total_used ?? 0),
      icon: <CheckRoundedIcon />,
      color: '#22c55e',
      subtitle: stats?.used_today != null ? `${stats.used_today} hoje` : undefined,
      loading,
    },
    {
      label: 'Taxa de uso',
      value: `${Number(stats?.usage_rate ?? 0).toFixed(1)}%`,
      icon: <TrendingUpRoundedIcon />,
      color: '#f59e0b',
      loading,
    },
    {
      label: 'Walk-in',
      value: String(stats?.walk_in_total ?? 0),
      icon: <TodayRoundedIcon />,
      color: '#ec4899',
      loading,
    },
  ];

  const chartData = (data?.daily_distribution ?? []).map((d) => ({
    date: formatChartDate(d.date),
    Comum: d.common,
    Associado: d.sponsor,
    'Walk-in': d.walk_in,
  }));

  const peakHours = data?.peak_hours ?? [];
  const maxPeak = peakHours[0]?.count || 1;

  const estoqueCriticos = (data?.estoque_alerts ?? []).filter((a) => a.status === 'critico');
  const estoqueAtencao  = (data?.estoque_alerts ?? []).filter((a) => a.status !== 'critico');
  const hasEstoqueIssues = data?.estoque_alerts && data.estoque_alerts.length > 0;

  const upcomingGiras = data?.upcoming_giras ?? [];
  const hasAniversariantes = can('mediuns') && aniversariantes.length > 0;

  return (
    <AdminLayout title="Dashboard">
      {/* ── Greeting header ── */}
      <Box data-tour="dashboard-greeting" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {greeting || ' '}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, textTransform: 'capitalize' }}>
            {todayLabel || ' '}
          </Typography>
        </Box>
        <Tooltip title="Atualizar dados">
          <span>
            <IconButton onClick={() => loadDashboard()} disabled={loading} size="small">
              {loading ? <CircularProgress size={18} /> : <RefreshRoundedIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={<Button size="small" onClick={() => loadDashboard()}>Tentar novamente</Button>}
        >
          {error}
        </Alert>
      )}

      {/* ── KPIs ── */}
      <Grid data-tour="dashboard-kpis" container spacing={2} sx={{ mb: 3 }}>
        {kpis.map((kpi) => (
          <Grid item xs={6} md={3} key={kpi.label}>
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              color={kpi.color}
              subtitle={kpi.subtitle}
              loading={kpi.loading}
            />
          </Grid>
        ))}
      </Grid>

      {/* ── Main: chart + peak hours  |  giras + aniversariantes ── */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Left column */}
        <Grid item xs={12} lg={7}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Bar chart */}
            <Paper ref={chartRef} data-tour="dashboard-chart" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader
                title="Tickets — últimos 7 dias"
                action={
                  <Tooltip title="Baixar gráfico (PNG)">
                    <IconButton size="small" onClick={handleExportChart} data-no-export>
                      <DownloadRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              />
              {loading ? (
                <Skeleton variant="rounded" height={220} />
              ) : chartData.length > 0 ? (
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={tokens.chartGrid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tokens.chartTick }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                        contentStyle={{
                          background: tokens.tooltipBg,
                          border: `1px solid ${tokens.border}`,
                          borderRadius: 10,
                          fontSize: 12,
                          color: tokens.textPrimary,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconSize={10} />
                      <Bar dataKey="Comum"    stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="Associado" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="Walk-in"  stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]}  maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <EmptyState label="Sem emissões no período" />
              )}
            </Paper>

            {/* Peak hours */}
            <Paper data-tour="dashboard-peak-hours" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader title="Horários de pico" />
              {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={20} />)}
                </Box>
              ) : peakHours.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {peakHours.map((ph) => {
                    const pct = (ph.count / maxPeak) * 100;
                    return (
                      <Box key={ph.hour} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="caption" fontWeight={600} sx={{ width: 36, flexShrink: 0, fontFamily: 'monospace', color: 'text.secondary' }}>
                          {String(ph.hour).padStart(2, '0')}h
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            flex: 1,
                            height: 8,
                            borderRadius: 4,
                            bgcolor: `${primary}14`,
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${primary}cc, ${primary})`,
                            },
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ width: 50, flexShrink: 0, textAlign: 'right' }}>
                          {ph.count} emis.
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <EmptyState label="Sem dados de horário" />
              )}
            </Paper>
          </Box>
        </Grid>

        {/* Right column */}
        <Grid item xs={12} lg={5}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Próximas giras */}
            <Paper data-tour="dashboard-giras" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <SectionHeader
                title="Próximas giras"
                action={
                  <Button size="small" onClick={() => router.push('/admin/giras')} sx={{ fontWeight: 600 }}>
                    Ver todas
                  </Button>
                }
              />
              {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={72} />)}
                </Box>
              ) : upcomingGiras.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {upcomingGiras.map((g) => (
                    <GiraCard key={g.id} gira={g} primary={primary} canOpenPorta={canViewPorta} />
                  ))}
                </Box>
              ) : (
                <EmptyState label="Nenhuma gira agendada" />
              )}
            </Paper>

            {/* Aniversariantes (feature-gated) */}
            {hasAniversariantes && (
              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
                <SectionHeader
                  title="Aniversariantes da semana"
                  action={
                    <Button size="small" onClick={() => router.push('/admin/mediuns')} sx={{ fontWeight: 600 }}>
                      Ver médiuns
                    </Button>
                  }
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {aniversariantes.slice(0, 7).map((m, idx, arr) => (
                    <React.Fragment key={m.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                          <CakeRoundedIcon sx={{ fontSize: 15, color: m.dias_ate_aniversario === 0 ? 'error.main' : 'text.disabled', flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={m.dias_ate_aniversario === 0 ? 700 : 400} noWrap>
                            {m.nome}
                          </Typography>
                        </Box>
                        <Chip
                          label={
                            m.dias_ate_aniversario === 0 ? 'Hoje!'
                              : m.dias_ate_aniversario === 1 ? 'Amanhã'
                              : `Em ${m.dias_ate_aniversario}d`
                          }
                          size="small"
                          color={m.dias_ate_aniversario === 0 ? 'error' : 'default'}
                          variant={m.dias_ate_aniversario === 0 ? 'filled' : 'outlined'}
                          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}
                        />
                      </Box>
                      {idx < arr.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </Box>
              </Paper>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ── Estoque (feature-gated) ── */}
      {can('estoque_controle') && !loading && hasEstoqueIssues && (
        <Paper data-tour="dashboard-estoque" elevation={0} sx={{ border: '1px solid', borderColor: 'warning.light', borderRadius: 3, p: 3 }}>
          <SectionHeader
            title="Alertas de estoque"
            action={
              <Button
                size="small"
                startIcon={<Inventory2RoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => router.push('/admin/estoque/relatorio')}
                sx={{ fontWeight: 600 }}
              >
                Ver relatório
              </Button>
            }
          />

          <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
            {data?.estoque_summary?.itens_ok != null && data.estoque_summary.itens_ok > 0 && (
              <Chip icon={<CheckRoundedIcon sx={{ fontSize: 13 }} />} label={`${data.estoque_summary.itens_ok} OK`} size="small"
                sx={{ bgcolor: '#dcfce7', color: '#16a34a', fontWeight: 600, height: 22 }} />
            )}
            {data?.estoque_summary?.itens_atencao != null && data.estoque_summary.itens_atencao > 0 && (
              <Chip icon={<WarningAmberRoundedIcon sx={{ fontSize: 13 }} />} label={`${data.estoque_summary.itens_atencao} Atenção`} size="small"
                sx={{ bgcolor: '#fef3c7', color: '#d97706', fontWeight: 600, height: 22 }} />
            )}
            {data?.estoque_summary?.itens_critico != null && data.estoque_summary.itens_critico > 0 && (
              <Chip icon={<ErrorOutlineRoundedIcon sx={{ fontSize: 13 }} />} label={`${data.estoque_summary.itens_critico} Crítico`} size="small"
                sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontWeight: 600, height: 22 }} />
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {[...estoqueCriticos, ...estoqueAtencao].slice(0, 6).map((item, idx, arr) => (
              <React.Fragment key={item.item_id}>
                <Box sx={{ display: 'flex', alignItems: 'center', py: 1.25, gap: 2 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: item.status === 'critico' ? 'error.main' : 'warning.main', flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{item.item_nome}</Typography>
                    {item.grupo_nome && <Typography variant="caption" color="text.secondary">{item.grupo_nome}</Typography>}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {item.saldo} / {item.estoque_minimo} {item.unidade_medida}
                  </Typography>
                  <Chip
                    label={item.status === 'critico' ? 'Crítico' : 'Atenção'}
                    size="small"
                    sx={{
                      height: 20, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                      bgcolor: item.status === 'critico' ? '#fee2e2' : '#fef3c7',
                      color: item.status === 'critico' ? '#dc2626' : '#d97706',
                    }}
                  />
                </Box>
                {idx < arr.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Box>
        </Paper>
      )}

      {can('estoque_controle') && !loading && !hasEstoqueIssues && data && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, px: 3, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckRoundedIcon sx={{ fontSize: 18, color: 'success.main' }} />
            <Typography variant="body2" color="text.secondary">
              Estoque em dia — nenhum item abaixo do mínimo.
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => router.push('/admin/estoque/relatorio')} sx={{ fontWeight: 600 }}>
              Relatório
            </Button>
          </Box>
        </Paper>
      )}
    </AdminLayout>
  );
}
