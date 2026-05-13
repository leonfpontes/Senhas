/**
 * Platform Billing Page
 *
 * Visão consolidada de faturamento para SUPER_ADMIN:
 * - KPIs: MRR, ativos, trials, suspensos
 * - Distribuição de planos
 * - Tabela de assinaturas por tenant com busca
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Typography,
  Stack,
  InputAdornment,
  Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import PeopleIcon from "@mui/icons-material/People";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BillingStats {
  active_tenants: number;
  trial_tenants: number;
  suspended_tenants: number;
  mrr: number;
  plan_distribution: Record<string, number>;
}

interface SubscriptionItem {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  status: string;
  monthly_price: number;
  current_users: number;
  max_users: number;
  is_trial: boolean;
  is_bonus: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const PLAN_COLORS: Record<string, "default" | "info" | "primary" | "success"> = {
  free: "default",
  basic: "info",
  pro: "primary",
  premium: "success",
};

const PLAN_LABELS: Record<string, string> = {
  free: "FREE",
  basic: "BASIC",
  pro: "PRO",
  premium: "PREMIUM",
};

const STATUS_COLORS: Record<string, "success" | "warning" | "error" | "default"> = {
  active: "success",
  suspended: "warning",
  cancelled: "error",
  expired: "error",
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
}

function KpiCard({ label, value, icon, color = "text.primary", subtitle }: KpiCardProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={700} color={color} mt={0.5}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            )}
          </Box>
          <Box sx={{ color, opacity: 0.7, mt: 0.5 }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const BillingPage: React.FC = () => {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [subs, setSubs] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, subsRes] = await Promise.all([
        apiClient.get("/api/v1/platform/billing/statistics/summary"),
        apiClient.get("/api/v1/platform/billing/subscriptions"),
      ]);
      setStats(statsRes.data);
      setSubs(subsRes.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Erro ao carregar dados de faturamento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(
      (s) =>
        s.tenant_name.toLowerCase().includes(q) ||
        s.tenant_slug.toLowerCase().includes(q)
    );
  }, [subs, search]);

  const planOrder = ["free", "basic", "pro", "premium"];

  return (
    <PlatformLayout>
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Faturamento</Typography>
          <Typography variant="body2" color="text.secondary">
            Visão consolidada de assinaturas e receita da plataforma
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={loadData}
          disabled={loading}
        >
          Atualizar
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="MRR Estimado"
            value={stats ? fmt(stats.mrr) : "—"}
            icon={<TrendingUpIcon />}
            color="primary.main"
            subtitle="Receita mensal recorrente"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Tenants Ativos"
            value={stats?.active_tenants ?? "—"}
            icon={<PeopleIcon />}
            color="success.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Em Trial"
            value={stats?.trial_tenants ?? "—"}
            icon={<HourglassTopIcon />}
            color="warning.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Suspensos / Cancelados"
            value={stats?.suspended_tenants ?? "—"}
            icon={<WarningAmberIcon />}
            color={stats && stats.suspended_tenants > 0 ? "error.main" : "text.secondary"}
          />
        </Grid>
      </Grid>

      {/* Plan Distribution */}
      {stats && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ py: "12px !important" }}>
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              gap={1.5}
            >
              <Typography variant="caption" fontWeight={700} textTransform="uppercase" letterSpacing={0.5} color="text.secondary">
                Planos
              </Typography>
              {planOrder.map((p) => {
                const count = stats.plan_distribution[p] ?? 0;
                return (
                  <Chip
                    key={p}
                    label={`${PLAN_LABELS[p] ?? p.toUpperCase()}  ${count}`}
                    color={PLAN_COLORS[p] ?? "default"}
                    size="small"
                    variant={count > 0 ? "filled" : "outlined"}
                    sx={{ fontWeight: 600, minWidth: 80 }}
                  />
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions Table */}
      <Card variant="outlined">
        <CardContent sx={{ pb: "0 !important" }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Assinaturas ({filtered.length})
            </Typography>
            <TextField
              size="small"
              placeholder="Buscar por nome ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 240 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>

          {loading && subs.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700, whiteSpace: "nowrap" } }}>
                    <TableCell>Tenant</TableCell>
                    <TableCell>Plano</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">MRR</TableCell>
                    <TableCell align="center" sx={{ display: { xs: "none", sm: "table-cell" } }}>Usuários</TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Extras</TableCell>
                    <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>Próx. Ciclo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        {search ? "Nenhum resultado para a busca." : "Nenhuma assinatura encontrada."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s) => (
                      <TableRow key={s.tenant_id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {s.tenant_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.tenant_slug}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={PLAN_LABELS[s.plan] ?? s.plan.toUpperCase()}
                            color={PLAN_COLORS[s.plan] ?? "default"}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={s.status}
                            color={STATUS_COLORS[s.status] ?? "default"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                          {fmt(s.monthly_price)}
                        </TableCell>
                        <TableCell align="center" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                          <Typography variant="body2">
                            {s.current_users}
                            <Typography component="span" variant="caption" color="text.secondary">
                              /{s.max_users === 999999 ? "∞" : s.max_users}
                            </Typography>
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                          <Stack direction="row" gap={0.5} flexWrap="wrap">
                            {s.is_trial && (
                              <Tooltip title={s.trial_ends_at ? `Trial até ${fmtDate(s.trial_ends_at)}` : "Em trial"}>
                                <Chip label="TRIAL" size="small" color="warning" variant="outlined" sx={{ fontSize: "0.65rem" }} />
                              </Tooltip>
                            )}
                            {s.is_bonus && (
                              <Chip label="BÔNUS" size="small" color="secondary" variant="outlined" sx={{ fontSize: "0.65rem" }} />
                            )}
                            {s.cancel_at_period_end && (
                              <Chip label="CANCELA" size="small" color="error" variant="outlined" sx={{ fontSize: "0.65rem" }} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ display: { xs: "none", lg: "table-cell" }, color: "text.secondary", fontSize: "0.8rem" }}>
                          {fmtDate(s.current_period_end)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </PlatformLayout>
  );
};

export default BillingPage;

interface BillingStats {
  total_invoices: number;
  paid_invoices: number;
  total_revenue: number;
  average_invoice_value: number;
}

interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  paid_amount: number;
  payment_method: string | null;
  due_date: string;
  paid_at: string | null;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "overdue":
      return "error";
    case "cancelled":
      return "default";
    default:
      return "info";
  }
};

const BillingPage: React.FC = () => {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchInvoices(selectedTenant);
    } else {
      setInvoices([]);
    }
  }, [selectedTenant]);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get(
        "/api/v1/platform/billing/statistics/summary"
      );
      setStats(response.data);
    } catch (err: any) {
      console.error("Failed to fetch billing stats:", err);
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await apiClient.get("/api/v1/platform/tenants");
      setTenants(response.data);
    } catch (err: any) {
      console.error("Failed to fetch tenants:", err);
    }
  };

  const fetchInvoices = async (tenantId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/platform/billing/${tenantId}/invoices`
      );
      setInvoices(response.data);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR");

  return (
    <PlatformLayout>
      <Box data-tour="billing-header" sx={{ mb: 3 }}>
        <h1>Billing</h1>
        <p>Platform billing statistics and invoice management</p>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid data-tour="billing-stats" container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Total Invoices
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {stats.total_invoices}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Paid Invoices
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700, color: "success.main" }}>
                  {stats.paid_invoices}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Total Revenue
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700, color: "primary.main" }}>
                  {formatCurrency(stats.total_revenue)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Avg Invoice Value
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {formatCurrency(stats.average_invoice_value)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tenant Selector + Invoices */}
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <FormControl data-tour="billing-tenant-select" sx={{ minWidth: { xs: '100%', sm: 250 } }} size="small">
              <InputLabel>Select Tenant</InputLabel>
              <Select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                label="Select Tenant"
              >
                <MenuItem value="">
                  <em>-- Select a tenant --</em>
                </MenuItem>
                {tenants.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedTenant && (
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchInvoices(selectedTenant)}
                size="small"
              >
                Refresh
              </Button>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : !selectedTenant ? (
            <Alert severity="info">
              Select a tenant above to view their invoices.
            </Alert>
          ) : invoices.length === 0 ? (
            <Alert severity="info">No invoices found for this tenant.</Alert>
          ) : (
            <TableContainer data-tour="billing-tabela" component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice #</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Period</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Paid</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Paid At</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.invoice_number}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        {formatDate(inv.period_start)} –{" "}
                        {formatDate(inv.period_end)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(inv.total_amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {formatCurrency(inv.paid_amount)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inv.status}
                          color={statusColor(inv.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(inv.due_date)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </PlatformLayout>
  );
};

export default BillingPage;
