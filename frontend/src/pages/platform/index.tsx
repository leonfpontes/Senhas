/**
 * Platform Dashboard — Métricas reais do super-admin
 *
 * Seções:
 * 1. Faixa de saúde (health check, polling 30s)
 * 2. Big Numbers (6 cards com dados reais)
 * 3. Gráficos (LineChart tickets diários + BarChart distribuição de planos)
 * 4. Crescimento de tenants (AreaChart 90d) + Top 5 tenants (tabela)
 */

import React, { useEffect, useState, useCallback } from 'react';
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
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StorageIcon from '@mui/icons-material/Storage';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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

interface DashboardData {
  tenants: TenantCounts;
  user_count: number;
  tickets: TicketCounts;
  mrr: number;
  plans_distribution: { plan: string; count: number }[];
  daily_tickets: { date: string; count: number }[];
  tenant_growth: { date: string; count: number }[];
  top_tenants: { id: string; name: string; plan: string | null; tickets_30d: number }[];
  generated_at: string;
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
          <Typography variant="body2" color="text.secondary">
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

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const PlatformDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cálculo cumulativo do crescimento de tenants (feito no frontend)
  const cumulativeGrowth = React.useMemo(() => {
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

  // Carga inicial
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchDashboard()]);
      setLoading(false);
    };
    init();
  }, [fetchHealth, fetchDashboard]);

  // Polling de dados principais (60s)
  useEffect(() => {
    const timer = setInterval(fetchDashboard, MAIN_POLLING_MS);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  // Polling de saúde (30s)
  useEffect(() => {
    const timer = setInterval(fetchHealth, HEALTH_POLLING_MS);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const dbOk = health?.database.status === 'ok';

  return (
    <PlatformLayout>
      <Box>
        {/* ---------------------------------------------------------------- */}
        {/* 1. Faixa de saúde                                                 */}
        {/* ---------------------------------------------------------------- */}
        <Box
          data-tour="platform-health"
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            mb: 3,
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
            <Chip
              size="small"
              label="API Online"
              color="success"
              icon={<CheckCircleIcon />}
            />
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* -------------------------------------------------------------- */}
            {/* 2. Big Numbers                                                   */}
            {/* -------------------------------------------------------------- */}
            <Grid data-tour="platform-stats" container spacing={2} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Total de Tenants"
                  value={data?.tenants.total ?? 0}
                  sub={`${data?.tenants.new_30d ?? 0} novos nos últimos 30d`}
                  icon={<BusinessIcon />}
                  color="#6366f1"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Tenants Ativos"
                  value={data?.tenants.active ?? 0}
                  sub={`${data?.tenants.trial ?? 0} em trial`}
                  icon={<BusinessIcon />}
                  color="#22c55e"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <BigCard
                  title="Tenants em Trial"
                  value={data?.tenants.trial ?? 0}
                  sub={`${data?.tenants.inactive ?? 0} inativos`}
                  icon={<BusinessIcon />}
                  color="#f59e0b"
                />
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
                  title="MRR"
                  value={`R$ ${(data?.mrr ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  icon={<AttachMoneyIcon />}
                  color="#10b981"
                />
              </Grid>
            </Grid>

            {/* -------------------------------------------------------------- */}
            {/* 3. Gráficos (tickets diários + distribuição de planos)          */}
            {/* -------------------------------------------------------------- */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Tickets por dia (últimos 30d)
                    </Typography>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={data?.daily_tickets ?? []}>
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
              </Grid>

              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Planos (assinaturas ativas)
                    </Typography>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={data?.plans_distribution ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="plan"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => PLAN_LABELS[v] ?? v}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(_value: unknown, _name: unknown, props: { payload: { plan: string } }) => [
                            _value,
                            PLAN_LABELS[props.payload.plan] ?? props.payload.plan,
                          ]}
                        />
                        <Bar dataKey="count" name="Tenants" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* -------------------------------------------------------------- */}
            {/* 4. Crescimento cumulativo + Top 5 tenants                       */}
            {/* -------------------------------------------------------------- */}
            <Grid container spacing={3}>
              <Grid item xs={12} md={7}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Crescimento de tenants (últimos 90d — cumulativo)
                    </Typography>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={cumulativeGrowth}>
                        <defs>
                          <linearGradient id="tenantGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
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

              <Grid item xs={12} md={5}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Top 5 tenants (tickets 30d)
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Tenant</TableCell>
                          <TableCell>Plano</TableCell>
                          <TableCell align="right">Tickets</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(data?.top_tenants ?? []).map((t) => (
                          <TableRow key={t.id}>
                            <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            <TableCell align="right">{t.tickets_30d}</TableCell>
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
              </Grid>
            </Grid>
          </>
        )}
      </Box>
    </PlatformLayout>
  );
};

export default PlatformDashboard;


  return (
    <PlatformLayout>
      <Box>
        <Box data-tour="platform-header" sx={{ mb: 4 }}>
          <p>Manage all tenants, users, and billing from here</p>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Statistics */}
        <Grid data-tour="platform-stats" container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Tenants"
              value={stats.total_tenants || 0}
              icon={<BusinessIcon />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Tenants"
              value={stats.active_tenants || 0}
              icon={<BusinessIcon />}
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Platform Users"
              value={stats.total_users || 0}
              icon={<PeopleIcon />}
              color="info.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Monthly Revenue"
              value={`$${stats.total_revenue || 0}`}
              icon={<BillingIcon />}
              color="warning.main"
            />
          </Grid>
        </Grid>

        {/* Quick Links */}
        <Box data-tour="platform-quick-links" sx={{ mb: 4 }}>
          <h2>Quick Links</h2>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/tenants" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<BusinessIcon />}
                      sx={{ textAlign: "left" }}
                    >
                      Manage Tenants
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/users_global" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PeopleIcon />}
                    >
                      Global Users
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/audit_consolidated" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<DescriptionIcon />}
                    >
                      Audit Logs
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/billing" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<BillingIcon />}
                    >
                      Billing
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* System Status */}
        <Box>
          <h2>System Status</h2>
          <Card>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>Database Connection</span>
                  <span style={{ color: "green" }}>✓ Healthy</span>
                </Box>
                <LinearProgress variant="determinate" value={100} sx={{ bgcolor: "success.light" }} />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>API Response Time</span>
                  <span style={{ color: "green" }}>45ms</span>
                </Box>
                <LinearProgress variant="determinate" value={90} sx={{ bgcolor: "success.light" }} />
              </Box>

              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>Server CPU</span>
                  <span style={{ color: "green" }}>38%</span>
                </Box>
                <LinearProgress variant="determinate" value={38} sx={{ bgcolor: "success.light" }} />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </PlatformLayout>
  );
};

export default PlatformDashboard;
