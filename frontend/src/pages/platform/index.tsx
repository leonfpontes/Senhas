/**
 * Platform Dashboard
 *
 * Data-fetching + composition only.
 * All visual atoms live in components/platform/.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Alert           from "@mui/material/Alert";
import Box             from "@mui/material/Box";
import Card            from "@mui/material/Card";
import CardContent     from "@mui/material/CardContent";
import Chip            from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid            from "@mui/material/Grid";
import Tooltip         from "@mui/material/Tooltip";
import Typography      from "@mui/material/Typography";

import BusinessRoundedIcon           from "@mui/icons-material/BusinessRounded";
import CheckCircleRoundedIcon        from "@mui/icons-material/CheckCircleRounded";
import ConfirmationNumberRoundedIcon from "@mui/icons-material/ConfirmationNumberRounded";
import PeopleAltRoundedIcon          from "@mui/icons-material/PeopleAltRounded";
import PersonOffRoundedIcon          from "@mui/icons-material/PersonOffRounded";
import SignalCellularOffRoundedIcon  from "@mui/icons-material/SignalCellularOffRounded";
import StorageRoundedIcon            from "@mui/icons-material/StorageRounded";
import WifiRoundedIcon               from "@mui/icons-material/WifiRounded";

import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

import PlatformLayout                from "./layout";
import { usePlatformTheme }          from "../../providers/PlatformThemeProvider";
import { ACCENT }                    from "../../styles/platformTheme";
import {
  ChartTooltip,
  KpiCard,
  MrrHeroCard,
  PlansDistribution,
  SectionLabel,
  StatusDot,
  TopTenantsLeaderboard,
} from "../../components/platform";
import { apiClient } from "../../services/api_client";

// ─── Polling intervals ────────────────────────────────────────────────────────

const POLL_DASHBOARD_MS = 60_000;
const POLL_HEALTH_MS    = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  database: { status: string; latency_ms: number };
  api:      { status: string; generated_at: string };
}

interface DashboardData {
  tenants: {
    total: number; active: number; inactive: number; trial: number; new_30d: number;
  };
  user_count:         number;
  tickets:            { total: number; last_30d: number; last_7d: number };
  mrr:                number;
  mrr_prev_month:     number;
  alerts:             { inactive_tenants: number; no_activity_30d: number };
  plans_distribution: { plan: string; count: number }[];
  daily_tickets:      { date: string; count: number }[];
  tenant_growth:      { date: string; count: number }[];
  top_tenants:        { id: string; name: string; plan: string | null; tickets_30d: number }[];
}

// ─── SystemStatusBar ──────────────────────────────────────────────────────────

const SystemStatusBar: React.FC<{ health: HealthData | null }> = ({ health }) => {
  const { tokens } = usePlatformTheme();
  const dbOk = health?.database.status === "ok";

  return (
    <Box
      sx={{
        display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap",
        px: 2, py: 1.25, mb: 3,
        borderRadius: "12px",
        border: `1px solid ${tokens.border}`,
        bgcolor: "rgba(99,102,241,0.03)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <StorageRoundedIcon
          sx={{
            fontSize: "0.9rem",
            color: health ? (dbOk ? "#10B981" : "#EF4444") : "text.secondary",
          }}
        />
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, color: "text.secondary" }}>
          Banco de dados
        </Typography>
        {health ? (
          <>
            <StatusDot ok={dbOk} label={dbOk ? "OK" : "Erro"} />
            <Typography
              sx={{
                fontSize: "0.68rem", color: "text.secondary",
                fontFamily: "monospace",
              }}
            >
              {health.database.latency_ms} ms
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: "0.68rem", color: "text.secondary" }}>—</Typography>
        )}
      </Box>

      <Box
        sx={{
          width: 1, height: 16,
          bgcolor: "rgba(99,102,241,0.12)",
          display: { xs: "none", sm: "block" },
        }}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <WifiRoundedIcon sx={{ fontSize: "0.9rem", color: "#10B981" }} />
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, color: "text.secondary" }}>
          API
        </Typography>
        <StatusDot ok label="Online" />
      </Box>
    </Box>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const PlatformDashboard: React.FC = () => {
  const { tokens } = usePlatformTheme();

  const [health,  setHealth]  = useState<HealthData | null>(null);
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Aggregate daily tickets into weekly buckets for the chart
  const weeklyTickets = useMemo(() => {
    const days = data?.daily_tickets ?? [];
    const weeks: { date: string; count: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const slice = days.slice(i, i + 7);
      weeks.push({ date: slice[0].date, count: slice.reduce((s, d) => s + d.count, 0) });
    }
    return weeks;
  }, [data?.daily_tickets]);

  // Cumulative tenant growth for the area chart
  const cumulativeGrowth = useMemo(() => {
    let acc = 0;
    return (data?.tenant_growth ?? []).map((d) => {
      acc += d.count;
      return { date: d.date, total: acc };
    });
  }, [data?.tenant_growth]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiClient.get<HealthData>("/api/v1/platform/health");
      setHealth(res.data);
    } catch {
      setHealth(null);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiClient.get<DashboardData>("/api/v1/platform/dashboard");
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchDashboard()]);
      setLoading(false);
    })();
  }, [fetchHealth, fetchDashboard]);

  useEffect(() => {
    const t = setInterval(fetchDashboard, POLL_DASHBOARD_MS);
    return () => clearInterval(t);
  }, [fetchDashboard]);

  useEffect(() => {
    const t = setInterval(fetchHealth, POLL_HEALTH_MS);
    return () => clearInterval(t);
  }, [fetchHealth]);

  const alerts    = data?.alerts;
  const hasAlerts = !!alerts && (alerts.inactive_tenants > 0 || alerts.no_activity_30d > 0);

  // Shared recharts axis / grid styles
  const tickStyle  = { fontSize: 10, fill: tokens.chartTick, fontFamily: "monospace" } as const;
  const cursorStyle = { stroke: "rgba(99,102,241,0.2)", strokeWidth: 1 };

  return (
    <PlatformLayout>
      <Box>
        <SystemStatusBar health={health} />

        {/* ── Actionable alerts ── */}
        {hasAlerts && (
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
            {(alerts?.inactive_tenants ?? 0) > 0 && (
              <Alert
                severity="warning"
                icon={<PersonOffRoundedIcon fontSize="small" />}
                sx={{ py: 0.5, flex: "1 1 auto" }}
                action={
                  <Chip
                    size="small"
                    label={`${alerts!.inactive_tenants} tenant${alerts!.inactive_tenants > 1 ? "s" : ""}`}
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
                icon={<SignalCellularOffRoundedIcon fontSize="small" />}
                sx={{ py: 0.5, flex: "1 1 auto" }}
                action={
                  <Chip
                    size="small"
                    label={`${alerts!.no_activity_30d} tenant${alerts!.no_activity_30d > 1 ? "s" : ""}`}
                    color="warning"
                    variant="outlined"
                  />
                }
              >
                Sem atividade nos últimos 30d — risco de churn
              </Alert>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        )}

        {loading ? (
          <Box
            sx={{
              display: "flex", justifyContent: "center",
              alignItems: "center", py: 12,
            }}
          >
            <Box sx={{ textAlign: "center" }}>
              <CircularProgress size={32} sx={{ color: ACCENT, mb: 2 }} />
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                Carregando dados da plataforma…
              </Typography>
            </Box>
          </Box>
        ) : (
          <>
            {/* ── KPIs ── */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
              <Grid item xs={12} md={3}>
                <MrrHeroCard mrr={data?.mrr ?? 0} prev={data?.mrr_prev_month ?? 0} />
              </Grid>
              <Grid item xs={6} md={2.25}>
                <KpiCard
                  label="Tenants Ativos"
                  value={data?.tenants.active ?? 0}
                  sub={`+${data?.tenants.new_30d ?? 0} nos últimos 30d`}
                  icon={<BusinessRoundedIcon />}
                  color="#10B981"
                  glow="rgba(16,185,129,0.3)"
                />
              </Grid>
              <Grid item xs={6} md={2.25}>
                <KpiCard
                  label="Total Tenants"
                  value={data?.tenants.total ?? 0}
                  sub={`${data?.tenants.trial ?? 0} em trial`}
                  icon={<BusinessRoundedIcon />}
                  color="#6366F1"
                  glow="rgba(99,102,241,0.3)"
                />
              </Grid>
              <Grid item xs={6} md={2.25}>
                <KpiCard
                  label="Usuários Ativos"
                  value={data?.user_count ?? 0}
                  icon={<PeopleAltRoundedIcon />}
                  color="#06B6D4"
                  glow="rgba(6,182,212,0.3)"
                />
              </Grid>
              <Grid item xs={6} md={2.25}>
                <KpiCard
                  label="Tickets (30d)"
                  value={data?.tickets.last_30d ?? 0}
                  sub={`${data?.tickets.last_7d ?? 0} nos últimos 7d`}
                  icon={<ConfirmationNumberRoundedIcon />}
                  color="#8B5CF6"
                  glow="rgba(139,92,246,0.3)"
                />
              </Grid>
            </Grid>

            {/* ── Charts row ── */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {/* Weekly tickets line chart */}
              <Grid item xs={12} md={7}>
                <Card sx={{ height: "100%" }}>
                  <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    <SectionLabel sub="Tickets emitidos por semana — últimos 30d">
                      Atividade de Tickets
                    </SectionLabel>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart
                        data={weeklyTickets}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <filter id="lineGlow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={tokens.chartGrid}
                          vertical={false}
                        />
                        <XAxis dataKey="date" tick={tickStyle} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={tickStyle} axisLine={false} tickLine={false} />
                        <RechartsTooltip content={<ChartTooltip />} cursor={cursorStyle} />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Tickets"
                          stroke="#6366F1"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "#6366F1", stroke: "var(--mui-palette-background-paper, #080F24)", strokeWidth: 2 }}
                          filter="url(#lineGlow)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Plans distribution */}
              <Grid item xs={12} md={5}>
                <Card sx={{ height: "100%" }}>
                  <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    <SectionLabel sub="Tenants ativos por plano">
                      Distribuição de Planos
                    </SectionLabel>
                    <PlansDistribution
                      plans={data?.plans_distribution ?? []}
                      totalActive={data?.tenants.active ?? 0}
                    />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* ── Growth + Leaderboard ── */}
            <Grid container spacing={3}>
              {/* Cumulative growth area chart */}
              <Grid item xs={12} md={7}>
                <Card>
                  <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    <SectionLabel sub="Crescimento cumulativo — últimos 90d">
                      Crescimento de Tenants
                    </SectionLabel>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart
                        data={cumulativeGrowth}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#6366F1" stopOpacity={0}   />
                          </linearGradient>
                          <linearGradient id="growthStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%"   stopColor="#6366F1" />
                            <stop offset="100%" stopColor="#8B5CF6" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={tokens.chartGrid}
                          vertical={false}
                        />
                        <XAxis dataKey="date" tick={tickStyle} axisLine={false} tickLine={false} />
                        <YAxis
                          allowDecimals={false}
                          tick={tickStyle}
                          axisLine={false}
                          tickLine={false}
                          domain={[0, "auto"]}
                        />
                        <RechartsTooltip content={<ChartTooltip />} cursor={cursorStyle} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name="Tenants"
                          stroke="url(#growthStroke)"
                          strokeWidth={2}
                          fill="url(#growthFill)"
                          activeDot={{ r: 4, fill: "#6366F1", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Top tenants leaderboard */}
              <Grid item xs={12} md={5}>
                <Card sx={{ height: "100%" }}>
                  <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        mb: 2,
                      }}
                    >
                      <SectionLabel sub="Por tickets nos últimos 30d">
                        Top Tenants
                      </SectionLabel>
                      <Chip
                        size="small"
                        label="30d"
                        sx={{
                          bgcolor: "rgba(99,102,241,0.1)",
                          color: "#6366F1",
                          border: "1px solid rgba(99,102,241,0.2)",
                          fontSize: "0.62rem",
                          height: 20,
                        }}
                      />
                    </Box>
                    <TopTenantsLeaderboard tenants={data?.top_tenants ?? []} />
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
