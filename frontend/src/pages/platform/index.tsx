/**
 * Platform Dashboard – Métricas reais do super-admin
 *
 * Seções:
 * 1. Alertas acionáveis (tenants inativos, sem atividade)
 * 2. Hero MRR + KPIs
 * 3. Tickets diários (LineChart)
 * 4. Distribuição de planos (pills) + Crescimento cumulativo (AreaChart)
 * 5. Top 5 tenants
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StorageIcon from '@mui/icons-material/Storage';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import SignalCellularOffIcon from '@mui/icons-material/SignalCellularOff';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import PlatformLayout from './layout';
import { apiClient } from '../../services/api_client';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MAIN_POLLING_MS = 60_000;
const HEALTH_POLLING_MS = 30_000;

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium',
};

const PLAN_COLORS: Record<string, string> = {
  free: '#9e9e9e',
  basic: '#42a5f5',
  pro: '#6366f1',
  premium: '#f59e0b',
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface HealthData {
  database: { status: string; latency_ms: number };
  api: { status: string; generated_at: string };
}

interface TenantCounts {
  total: number;
  active: number;
  inactive: number;
  trial: number;
  new_30d: number;
}

interface TicketCounts {
  total: number;
  last_30d: number;
  last_7d: number;
}

interface Alerts {
  inactive_tenants: number;
  no_activity_30d: number;
}

interface DashboardData {
  tenants: TenantCounts;
  user_count: number;
  tickets: TicketCounts;
  mrr: number;
  mrr_prev_month: number;
  alerts: Alerts;
  plans_distribution: { plan: string; count: number }[];
  daily_tickets: { date: string; count: number }[];
  tenant_growth: { date: string; count: number }[];
  top_tenants: { id: string; name: string; plan: string | null; tickets_30d: number }[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mrrDeltaPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

const BigCard = ({
  title,
  value,
  sub,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box
          sx={{
            bgcolor: color,
            color: 'white',
            borderRadius: '50%',
            p: 1.5,
            display: 'flex',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              mb: 0.25,
            }}
          >
            {title}
          </Typography>
          <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary">
              {sub}
            </Typography>
          )}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const MrrDeltaBadge = ({ current, prev }: { current: number; prev: number }) => {
  const delta = mrrDeltaPct(current, prev);
  if (delta === null) return null;
  const positive = delta >= 0;
  const neutral = Math.abs(delta) < 1;
  return (
    <Chip
      size="small"
      icon={neutral ? <TrendingFlatIcon /> : positive ? <TrendingUpIcon /> : <TrendingDownIcon />}
      label={`${positive && !neutral ? '+' : ''}${delta.toFixed(1)}% vs mês ant.`}
      color={neutral ? 'default' : positive ? 'success' : 'error'}
      variant="outlined"
      sx={{ mt: 0.5 }}
    />
  );
};

/** Distribuição de planos como progress bars */
const PlansDistribution = ({
  plans,
  totalActive,
}: {
  plans: { plan: string; count: number }[];
  totalActive: number;
}) => {
  if (!plans.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sem dados
      </Typography>
    );
  }
  const sorted = [...plans].sort((a, b) => b.count - a.count);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {sorted.map(({ plan, count }) => {
        const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
        const color = PLAN_COLORS[plan] ?? '#9e9e9e';
        return (
          <Box key={plan}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="body2" fontWeight={600}>
                  {PLAN_LABELS[plan] ?? plan}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {count} tenant{count !== 1 ? 's' : ''} · {pct}%
              </Typography>
            </Box>
            <Box sx={{ height: 6, bgcolor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${pct}%`,
                  bgcolor: color,
                  borderRadius: 3,
                  transition: 'width 0.6s ease',
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const PlatformDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agrega tickets diários em semanas para o gráfico
  const weeklyTickets = useMemo(() => {
    const days = data?.daily_tickets ?? [];
    if (!days.length) return days;
    const weeks: { date: string; count: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const slice = days.slice(i, i + 7);
      weeks.push({
        date: slice[0].date,
        count: slice.reduce((s, d) => s + d.count, 0),
      });
    }
    return weeks;
  }, [data?.daily_tickets]);

  const cumulativeGrowth = useMemo(() => {
    if (!data?.tenant_growth) return [];
    let accumulated = 0;
    return data.tenant_growth.map((d) => {
      accumulated += d.count;
      return { date: d.date, total: accumulated };
    });
  }, [data?.tenant_growth]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiClient.get<HealthData>('/api/v1/platform/health');
      setHealth(res.data);
    } catch {
      setHealth(null);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiClient.get<DashboardData>('/api/v1/platform/dashboard');
      setData(res.data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dashboard';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchDashboard()]);
      setLoading(false);
    };
    init();
  }, [fetchHealth, fetchDashboard]);

  useEffect(() => {
    const timer = setInterval(fetchDashboard, MAIN_POLLING_MS);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  useEffect(() => {
    const timer = setInterval(fetchHealth, HEALTH_POLLING_MS);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const dbOk = health?.database.status === 'ok';
  const alerts = data?.alerts;
  const hasAlerts = alerts && (alerts.inactive_tenants > 0 || alerts.no_activity_30d > 0);

  return (
    <PlatformLayout>
      <Box>
        {/* ---------------------------------------------------------------- */}
        {/* 1. Faixa de saude                                                 */}
        {/* ---------------------------------------------------------------- */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            mb: hasAlerts ? 2 : 3,
            p: 2,
            borderRadius: 2,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon fontSize="small" color={health ? (dbOk ? 'success' : 'error') : 'disabled'} />
            <Typography variant="body2" fontWeight={600}>
              Banco de dados
            </Typography>
            {health ? (
              <>
                <Chip
                  size="small"
                  label={dbOk ? 'OK' : 'Erro'}
                  color={dbOk ? 'success' : 'error'}
                  icon={dbOk ? <CheckCircleIcon /> : <ErrorIcon />}
                />
                <Typography variant="caption" color="text.secondary">
                  {health.database.latency_ms} ms
                </Typography>
              </>
            ) : (
              <Chip size="small" label="—" />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip size="small" label="API Online" color="success" icon={<CheckCircleIcon />} />
          </Box>
        </Box>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Alertas acionaveis                                             */}
        {/* ---------------------------------------------------------------- */}
        {hasAlerts && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
            {(alerts?.inactive_tenants ?? 0) > 0 && (
              <Alert
                severity="warning"
                icon={<PersonOffIcon fontSize="small" />}
                sx={{ py: 0.5, flex: '1 1 auto' }}
                action={
                  <Chip
                    size="small"
                    label={`${alerts!.inactive_tenants} tenant${alerts!.inactive_tenants > 1 ? 's' : ''}`}
                    color="warning"
                    variant="outlined"
                  />
                }
              >
                Tenants desabilitados — conta ativa, acesso bloqueado
              </Alert>
            )}
            {(alerts?.no_activity_30d ?? 0) > 0 && (
              <Alert
                severity="warning"
                icon={<SignalCellularOffIcon fontSize="small" />}
                sx={{ py: 0.5, flex: '1 1 auto' }}
                action={
                  <Tooltip title="Tenants ativos que não emitiram nenhum ticket nos últimos 30 dias. Risco de churn.">
                    <Chip
                      size="small"
                      label={`${alerts!.no_activity_30d} tenant${alerts!.no_activity_30d > 1 ? 's' : ''}`}
                      color="warning"
                      variant="outlined"
                    />
                  </Tooltip>
                }
              >
                Sem atividade nos últimos 30d — risco de churn
              </Alert>
            )}
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* -------------------------------------------------------------- */}
            {/* 3. Hero MRR + KPIs                                              */}
            {/* -------------------------------------------------------------- */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {/* Hero MRR */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', border: '2px solid #10b981' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box
                        sx={{
                          bgcolor: '#10b981',
                          color: 'white',
                          borderRadius: '50%',
                          p: 2,
                          display: 'flex',
                          flexShrink: 0,
                        }}
                      >
                        <AttachMoneyIcon />
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          MRR
                        </Typography>
                        <Typography variant="h4" fontWeight={700} lineHeight={1.2}>
                          {fmtBRL(data?.mrr ?? 0)}
                        </Typography>
                        <MrrDeltaBadge
                          current={data?.mrr ?? 0}
                          prev={data?.mrr_prev_month ?? 0}
                        />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Tenants Ativos"
                  value={data?.tenants.active ?? 0}
                  sub={`${data?.tenants.new_30d ?? 0} novos nos últimos 30d${(data?.tenants.trial ?? 0) > 0 ? ` · ${data?.tenants.trial} em trial` : ''}`}
                  icon={<BusinessIcon />}
                  color="#22c55e"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                {(data?.tenants.inactive ?? 0) > 0 ? (
                  <BigCard
                    title="Tenants Inativos"
                    value={`${data!.tenants.inactive} / ${data!.tenants.total}`}
                    sub={`${data!.tenants.inactive} tenant${data!.tenants.inactive !== 1 ? 's' : ''} com acesso bloqueado`}
                    icon={<BusinessIcon />}
                    color="#f59e0b"
                  />
                ) : (
                  <BigCard
                    title="Total de Tenants"
                    value={data?.tenants.total ?? 0}
                    sub="todos com acesso ativo"
                    icon={<BusinessIcon />}
                    color="#9e9e9e"
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Usuários Ativos"
                  value={data?.user_count ?? 0}
                  icon={<PeopleIcon />}
                  color="#0ea5e9"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Tickets (últimos 30d)"
                  value={data?.tickets.last_30d ?? 0}
                  sub={`${data?.tickets.last_7d ?? 0} nos últimos 7d`}
                  icon={<ConfirmationNumberIcon />}
                  color="#8b5cf6"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Tickets (total)"
                  value={(data?.tickets.total ?? 0).toLocaleString('pt-BR')}
                  icon={<ConfirmationNumberIcon />}
                  color="#6366f1"
                />
              </Grid>
            </Grid>

            {/* -------------------------------------------------------------- */}
            {/* 4. Tickets diários (30d)                                        */}
            {/* -------------------------------------------------------------- */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">Tickets por semana</Typography>
                    <Typography variant="caption" color="text.secondary">tendência nos últimos 30d</Typography>
                  </Box>
                  <Chip size="small" label="últimos 30d" variant="outlined" />
                </Box>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={weeklyTickets}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name="Tickets"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* -------------------------------------------------------------- */}
            {/* 5. Distribuição de planos + Crescimento cumulativo              */}
            {/* -------------------------------------------------------------- */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">Distribuição de planos</Typography>
                      <Chip size="small" label="ativos" variant="outlined" />
                    </Box>
                    <PlansDistribution
                      plans={data?.plans_distribution ?? []}
                      totalActive={data?.tenants.active ?? 0}
                    />
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={8}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">Crescimento de tenants (cumulativo)</Typography>
                      <Chip size="small" label="últimos 90d" variant="outlined" />
                    </Box>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={cumulativeGrowth}>
                        <defs>
                          <linearGradient id="tenantGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                        <RechartsTooltip />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#tenantGrowthGrad)"
                          name="Tenants"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* -------------------------------------------------------------- */}
            {/* 6. Top 5 tenants                                                */}
            {/* -------------------------------------------------------------- */}
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Top 5 tenants</Typography>
                  <Chip size="small" label="por tickets nos últimos 30d" variant="outlined" />
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tenant</TableCell>
                      <TableCell>Plano</TableCell>
                      <TableCell align="right">Tickets (30d)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data?.top_tenants ?? []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell
                          sx={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.name}
                        </TableCell>
                        <TableCell>
                          {t.plan ? (
                            <Chip
                              size="small"
                              label={PLAN_LABELS[t.plan] ?? t.plan}
                              sx={{ bgcolor: PLAN_COLORS[t.plan] ?? '#9e9e9e', color: 'white' }}
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            {t.tickets_30d === 0 && (
                              <Tooltip title="Nenhum ticket emitido nos últimos 30d — risco de churn">
                                <WarningAmberIcon fontSize="small" color="warning" />
                              </Tooltip>
                            )}
                            {t.tickets_30d}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!data?.top_tenants?.length && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          <Typography variant="body2" color="text.secondary">
                            Sem dados
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </Box>
    </PlatformLayout>
  );
};

export default PlatformDashboard;