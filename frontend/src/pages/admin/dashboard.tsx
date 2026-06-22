/**
 * Admin Dashboard — Executive overview with KPIs, giras, estoque, tickets
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TodayIcon from '@mui/icons-material/Today';
import EventIcon from '@mui/icons-material/Event';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import AssessmentIcon from '@mui/icons-material/Assessment';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CakeIcon from '@mui/icons-material/Cake';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient } from '../../services/api_client';
import { useRouter } from 'next/router';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

interface PlanBadge {
  name: string;
  label: string;
  status: string;
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
  plan: PlanBadge;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  const [todayLabel, setTodayLabel] = useState('');
  const [aniversariantes, setAniversariantes] = useState<AniversarianteItem[]>([]);
  const { can } = useSubscription();
  const { config: tenantConfig } = useTenant();
  const router = useRouter();

  const primaryColor = tenantConfig?.colors?.primary || '#1976d2';

  useEffect(() => {
    setGreeting(getGreeting());
    setTodayLabel(formatDateLong(new Date()));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, []);

  // Birthday digest — independent fetch, non-blocking
  useEffect(() => {
    if (!can('mediuns')) return;
    const controller = new AbortController();
    apiClient
      .get<AniversarianteItem[]>('/api/v1/admin/mediuns/aniversariantes?dias=7', {
        signal: controller.signal,
      })
      .then((res) => setAniversariantes(Array.isArray(res.data) ? res.data : []))
      .catch(() => { /* non-critical */ });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboard = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/v1/admin/dashboard-summary', { signal });
      setData(response.data);
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Error loading dashboard:', err);
      setError('Não foi possível carregar os dados do dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const stats = data?.ticket_stats;
  const userName = ''; // Will be filled from layout context

  // KPI definitions
  const kpis = [
    {
      label: 'Tickets Emitidos',
      value: stats?.total_emitted ?? 0,
      icon: <SendIcon />,
      color: '#6366f1',
      suffix: '',
    },
    {
      label: 'Tickets Usados',
      value: stats?.total_used ?? 0,
      icon: <CheckCircleOutlineIcon />,
      color: '#22c55e',
      suffix: '',
    },
    {
      label: 'Taxa de Uso',
      value: stats?.usage_rate ?? 0,
      icon: <TrendingUpIcon />,
      color: '#f59e0b',
      suffix: '%',
      decimals: 1,
    },
    {
      label: 'Emitidos Hoje',
      value: stats?.emitted_today ?? 0,
      icon: <TodayIcon />,
      color: '#ec4899',
      suffix: '',
    },
  ];

  // Chart data
  const chartData = (data?.daily_distribution ?? []).map((d) => ({
    date: formatChartDate(d.date),
    Comum: d.common,
    Patrocinador: d.sponsor,
    'Walk-in': d.walk_in,
  }));

  // Quick actions
  const quickActions = [
    { label: 'Giras', icon: <EventIcon />, href: '/admin/giras', always: true },
    { label: 'Tickets', icon: <ConfirmationNumberIcon />, href: '/admin/tickets', always: true },
    { label: 'Porta', icon: <MeetingRoomIcon />, href: '/admin/porta', always: true },
    { label: 'Analytics', icon: <AssessmentIcon />, href: '/admin/analytics', always: false, feature: 'analytics_basico' as const },
    { label: 'Estoque', icon: <Inventory2Icon />, href: '/admin/estoque/itens', always: false, feature: 'estoque_controle' as const },
    { label: 'Configurações', icon: <SettingsIcon />, href: '/admin/config', always: true },
  ];

  const visibleActions = quickActions.filter((a) => a.always || (a.feature && can(a.feature)));

  return (
    <AdminLayout title="Dashboard">
      <Box data-tour="dashboard-header" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {greeting ? `${greeting}! 👋` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
            {todayLabel}
          </Typography>
        </Box>
        <Tooltip title="Atualizar dados">
          <span>
            <IconButton onClick={() => loadDashboard()} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => loadDashboard()}>Tentar novamente</Button>}>
          {error}
        </Alert>
      )}

      <Grid data-tour="dashboard-kpis" container spacing={{ xs: 2, md: 3 }}>
        {/* ── KPI Cards ── */}
        {kpis.map((kpi) => (
          <Grid item xs={6} sm={6} md={3} key={kpi.label}>
            {loading ? (
              <Skeleton variant="rounded" height={120} />
            ) : (
              <Card
                sx={{
                  background: `linear-gradient(135deg, ${kpi.color}12 0%, ${kpi.color}06 100%)`,
                  border: `1.5px solid ${kpi.color}25`,
                  height: '100%',
                }}
              >
                <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        {kpi.label}
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 800,
                          color: kpi.color,
                          fontSize: { xs: '1.4rem', sm: '2rem' },
                          lineHeight: 1.2,
                        }}
                      >
                        {kpi.decimals ? kpi.value.toFixed(kpi.decimals) : kpi.value}
                        {kpi.suffix}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: { xs: 36, sm: 48 },
                        height: { xs: 36, sm: 48 },
                        borderRadius: '50%',
                        backgroundColor: `${kpi.color}18`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: kpi.color,
                        flexShrink: 0,
                      }}
                    >
                      {kpi.icon}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}
          </Grid>
        ))}

        {/* ── Próximas Giras ── */}
        <Grid data-tour="dashboard-giras" item xs={12} md={6}>
          {loading ? (
            <Skeleton variant="rounded" height={260} />
          ) : (
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  📅 Próximas Giras
                </Typography>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => router.push('/admin/giras')}>
                  Ver todas
                </Button>
              </Box>

              {data?.upcoming_giras && data.upcoming_giras.length > 0 ? (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {data.upcoming_giras.map((g) => {
                    const progress = g.max_tickets ? Math.min((g.current_count / g.max_tickets) * 100, 100) : 0;
                    const sponsorProgress = g.max_tickets ? Math.min((g.sponsor_count / g.max_tickets) * 100, 100) : 0;
                    return (
                      <Box
                        key={g.id}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          backgroundColor: 'background.default',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {g.nome}
                          </Typography>
                          <Chip
                            label={g.is_open ? 'Aberta' : 'Fechada'}
                            size="small"
                            color={g.is_open ? 'success' : 'default'}
                            variant={g.is_open ? 'filled' : 'outlined'}
                            sx={{ height: 22, fontSize: '0.7rem' }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatShortDate(g.data_inicio)}
                          {g.max_tickets ? ` · ${g.current_count}/${g.max_tickets} tickets` : ''}
                        </Typography>
                        {g.max_tickets && (
                          <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ width: 68, flexShrink: 0 }}>
                                Comuns
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: `${primaryColor}15`,
                                  '& .MuiLinearProgress-bar': {
                                    borderRadius: 3,
                                    backgroundColor: progress >= 90 ? '#ef4444' : primaryColor,
                                  },
                                }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ width: 28, textAlign: 'right', flexShrink: 0 }}>
                                {g.current_count}
                              </Typography>
                            </Box>
                            {g.sponsor_count > 0 && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ width: 68, flexShrink: 0 }}>
                                  Associados
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={sponsorProgress}
                                  sx={{
                                    flex: 1,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: '#f59e0b20',
                                    '& .MuiLinearProgress-bar': {
                                      borderRadius: 3,
                                      backgroundColor: '#f59e0b',
                                    },
                                  }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ width: 28, textAlign: 'right', flexShrink: 0 }}>
                                  {g.sponsor_count}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma gira agendada
                  </Typography>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        {/* ── Tickets Últimos 7 Dias (Recharts) ── */}
        <Grid data-tour="dashboard-chart" item xs={12} md={6}>
          {loading ? (
            <Skeleton variant="rounded" height={260} />
          ) : (
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                📊 Tickets — Últimos 7 dias
              </Typography>
              {chartData.length > 0 ? (
                <Box sx={{ flex: 1, minHeight: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Comum" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Patrocinador" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Walk-in" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Sem dados no período
                  </Typography>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        {/* ── Alertas de Estoque (feature-gated) ── */}
        {can('estoque_controle') && (
          <Grid item xs={12} md={6}>
            {loading ? (
              <Skeleton variant="rounded" height={260} />
            ) : (
              <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    📦 Estoque
                  </Typography>
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => router.push('/admin/estoque/relatorio')}>
                    Relatório
                  </Button>
                </Box>

                {/* Summary chips */}
                {data?.estoque_summary && (
                  <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <Chip
                      icon={<CheckIcon sx={{ fontSize: 14 }} />}
                      label={`${data.estoque_summary.itens_ok} OK`}
                      size="small"
                      sx={{ backgroundColor: '#22c55e20', color: '#16a34a', fontWeight: 600 }}
                    />
                    {data.estoque_summary.itens_atencao > 0 && (
                      <Chip
                        icon={<WarningAmberIcon sx={{ fontSize: 14 }} />}
                        label={`${data.estoque_summary.itens_atencao} Atenção`}
                        size="small"
                        sx={{ backgroundColor: '#f59e0b20', color: '#d97706', fontWeight: 600 }}
                      />
                    )}
                    {data.estoque_summary.itens_critico > 0 && (
                      <Chip
                        icon={<WarningAmberIcon sx={{ fontSize: 14 }} />}
                        label={`${data.estoque_summary.itens_critico} Crítico`}
                        size="small"
                        sx={{ backgroundColor: '#ef444420', color: '#dc2626', fontWeight: 600 }}
                      />
                    )}
                    <Chip
                      label={`${data.estoque_summary.total_itens} itens · ${data.estoque_summary.total_grupos} grupos`}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500 }}
                    />
                  </Box>
                )}

                {data?.estoque_alerts && data.estoque_alerts.length > 0 ? (
                  <Box sx={{ flex: 1, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Item</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Grupo</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Saldo</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Mín.</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.estoque_alerts.slice(0, 5).map((item) => (
                          <TableRow key={item.item_id} hover>
                            <TableCell sx={{ fontSize: '0.8rem' }}>{item.item_nome}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{item.grupo_nome || '—'}</TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              {item.saldo} {item.unidade_medida}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                              {item.estoque_minimo}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={item.status === 'critico' ? 'Crítico' : 'Atenção'}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  backgroundColor: item.status === 'critico' ? '#fee2e2' : '#fef3c7',
                                  color: item.status === 'critico' ? '#dc2626' : '#d97706',
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ) : (
                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <CheckIcon sx={{ fontSize: 40, color: '#22c55e', mb: 0.5 }} />
                      <Typography variant="body2" color="text.secondary">
                        Estoque em dia
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
            )}
          </Grid>
        )}

        {/* ── Horários de Pico ── */}
        <Grid data-tour="dashboard-peak-hours" item xs={12} md={can('estoque_controle') ? 6 : 12}>
          {loading ? (
            <Skeleton variant="rounded" height={260} />
          ) : (
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                ⏰ Horários de Pico
              </Typography>
              {data?.peak_hours && data.peak_hours.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {data.peak_hours.map((ph, idx) => {
                    const maxCount = data.peak_hours[0]?.count || 1;
                    const pct = (ph.count / maxCount) * 100;
                    return (
                      <Box key={ph.hour}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {String(ph.hour).padStart(2, '0')}:00
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {ph.count} emissões
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: `${primaryColor}12`,
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)`,
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Sem dados de horário
                  </Typography>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        {/* ── Aniversariantes (feature-gated: mediuns) ── */}
        {can('mediuns') && aniversariantes.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  🎂 Aniversariantes da Semana
                </Typography>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => router.push('/admin/mediuns')}>
                  Ver médiuns
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {aniversariantes.slice(0, 7).map((m) => (
                  <Box
                    key={m.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: m.dias_ate_aniversario === 0 ? 'error.light' : 'divider',
                      backgroundColor: m.dias_ate_aniversario === 0 ? 'error.50' : 'background.default',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CakeIcon sx={{ fontSize: 18, color: m.dias_ate_aniversario === 0 ? 'error.main' : 'text.secondary' }} />
                      <Typography variant="body2" sx={{ fontWeight: m.dias_ate_aniversario === 0 ? 700 : 500 }}>
                        {m.nome}
                      </Typography>
                    </Box>
                    <Chip
                      label={m.dias_ate_aniversario === 0 ? 'Hoje!' : m.dias_ate_aniversario === 1 ? 'Amanhã' : `Em ${m.dias_ate_aniversario}d`}
                      size="small"
                      color={m.dias_ate_aniversario === 0 ? 'error' : 'default'}
                      variant={m.dias_ate_aniversario === 0 ? 'filled' : 'outlined'}
                      sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                    />
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        )}

        {/* ── Ações Rápidas ── */}
        <Grid data-tour="dashboard-quick-actions" item xs={12}>
          {loading ? (
            <Skeleton variant="rounded" height={80} />
          ) : (
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                🚀 Ações Rápidas
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {visibleActions.map((a) => (
                  <Button
                    key={a.href}
                    variant="outlined"
                    startIcon={a.icon}
                    onClick={() => router.push(a.href)}
                    sx={{
                      textTransform: 'none',
                      borderRadius: 2,
                      fontWeight: 600,
                      borderColor: 'divider',
                      color: 'text.primary',
                      '&:hover': {
                        borderColor: primaryColor,
                        color: primaryColor,
                        backgroundColor: `${primaryColor}08`,
                      },
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>
    </AdminLayout>
  );
}
