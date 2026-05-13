/**
 * Audit Log Consolidado (T114) - Centro de compliance e seguranca cross-tenant.
 * Responde: "O que esta acontecendo em todos os meus tenants? Quem fez o que e quando?"
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
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
  Grid,
  Chip,
  Tab,
  Typography,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Stack,
} from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import PeopleIcon from "@mui/icons-material/People";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import BusinessIcon from "@mui/icons-material/Business";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FeedEntry {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_slug: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface AuditSummary {
  total: number;
  by_tenant: Record<string, number>;
  by_action: Record<string, number>;
  by_user: Record<string, number>;
  period: { start: string; end: string };
  statistics: {
    most_active_tenant: string | null;
    most_active_user: string | null;
    most_common_action: string | null;
    avg_logs_per_tenant: number;
  };
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create: "Criacao",
  read: "Leitura",
  update: "Atualizacao",
  delete: "Exclusao",
  login: "Login",
  logout: "Logout",
  token_refresh: "Renovacao de Token",
  TENANT_DELETED: "Tenant Excluido",
};

const ACTION_COLORS: Record<string, "success" | "info" | "warning" | "error" | "default"> = {
  create: "success",
  read: "default",
  update: "warning",
  delete: "error",
  login: "info",
  logout: "info",
  token_refresh: "default",
  TENANT_DELETED: "error",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ─── Componente KPI ──────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <Card sx={{ flex: 1, minWidth: 160 }}>
      <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: `${color}.light`,
              color: `${color}.dark`,
              display: "flex",
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
              {label}
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {value}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── Pagina Principal ─────────────────────────────────────────────────────────

export default function AuditConsolidadoPage() {
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [tab, setTab] = useState("feed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedPage, setFeedPage] = useState(0);
  const [feedTotal, setFeedTotal] = useState(0);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});

  const [filterTenant, setFilterTenant] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const FEED_LIMIT = 50;

  // Carrega lista de tenants para resolver nomes
  useEffect(() => {
    apiClient.get<{ items: Tenant[] }>("/api/v1/platform/tenants?limit=200").then((res) => {
      const list = res.items ?? [];
      setTenants(list);
      const map: Record<string, string> = {};
      list.forEach((t) => { map[t.id] = t.name; });
      setTenantMap(map);
    });
  }, []);

  const fetchAll = useCallback(
    async (page = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params = `start_date=${startDate}&end_date=${endDate}`;
        const feedParams =
          `${params}&skip=${page * FEED_LIMIT}&limit=${FEED_LIMIT}` +
          (filterTenant ? `&tenant_id=${filterTenant}` : "") +
          (filterAction ? `&action=${filterAction}` : "");

        const [summaryRes, feedRes] = await Promise.all([
          apiClient.get<AuditSummary>(`/api/v1/platform/audit-logs?${params}`),
          apiClient.get<FeedEntry[]>(`/api/v1/platform/audit-logs/feed?${feedParams}`),
        ]);

        setSummary(summaryRes);
        setFeed(feedRes);
        setFeedPage(page);
        // total feed entries derived from summary
        setFeedTotal(summaryRes?.total ?? 0);
      } catch (e) {
        setError("Falha ao carregar dados de auditoria.");
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, filterTenant, filterAction]
  );

  // Auto-load no mount
  useEffect(() => {
    fetchAll(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}`;
      const feedParams =
        `${params}&skip=0&limit=500` +
        (filterTenant ? `&tenant_id=${filterTenant}` : "") +
        (filterAction ? `&action=${filterAction}` : "");
      const data = await apiClient.get<FeedEntry[]>(
        `/api/v1/platform/audit-logs/feed?${feedParams}`
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria_${startDate}_${endDate}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Falha ao exportar logs.");
    } finally {
      setExporting(false);
    }
  };

  // ─── KPI calculados ───────────────────────────────────────────────────────

  const activeTenantsCount = summary
    ? Object.keys(summary.by_tenant).length
    : 0;

  const mostCommonAction = summary?.statistics?.most_common_action ?? null;

  const mostActiveTenantId = summary?.statistics?.most_active_tenant ?? null;
  const mostActiveTenantName = mostActiveTenantId
    ? tenantMap[mostActiveTenantId] ?? mostActiveTenantId.slice(0, 8) + "..."
    : null;

  // ─── Tabela Por Tenant ────────────────────────────────────────────────────

  const byTenantRows = summary
    ? Object.entries(summary.by_tenant)
        .map(([id, count]) => ({ id, name: tenantMap[id] ?? id.slice(0, 8) + "...", count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const maxTenantCount = byTenantRows[0]?.count ?? 1;

  // ─── Tabela Por Acao ──────────────────────────────────────────────────────

  const byActionRows = summary
    ? Object.entries(summary.by_action)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const totalActions = byActionRows.reduce((s, r) => s + r.count, 0) || 1;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PlatformLayout>
      <Box sx={{ p: 3 }}>
        {/* Cabecalho */}
        <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
          <SecurityIcon color="action" />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Auditoria Consolidada
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monitoramento de compliance e seguranca em todos os tenants
            </Typography>
          </Box>
        </Stack>

        {/* Filtros */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ md: "center" }}
            flexWrap="wrap"
          >
            <TextField
              label="De"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
            <TextField
              label="Ate"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Tenant</InputLabel>
              <Select
                label="Tenant"
                value={filterTenant}
                onChange={(e) => setFilterTenant(e.target.value)}
              >
                <MenuItem value="">Todos</MenuItem>
                {tenants.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Acao</InputLabel>
              <Select
                label="Acao"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <MenuItem value="">Todas</MenuItem>
                {Object.entries(ACTION_LABELS).map(([val, lbl]) => (
                  <MenuItem key={val} value={val}>{lbl}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => fetchAll(0)}
              disabled={loading}
            >
              Atualizar
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={loading || exporting}
            >
              Exportar JSON
            </Button>
          </Stack>
        </Paper>

        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* KPI Bar */}
        {summary && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            mb={2}
            flexWrap="wrap"
          >
            <KpiCard
              icon={<SecurityIcon fontSize="small" />}
              label="Total de Eventos"
              value={summary.total.toLocaleString("pt-BR")}
              color="primary"
            />
            <KpiCard
              icon={<BusinessIcon fontSize="small" />}
              label="Tenants Ativos"
              value={activeTenantsCount}
              color="info"
            />
            <KpiCard
              icon={<TrendingUpIcon fontSize="small" />}
              label="Acao Mais Comum"
              value={
                mostCommonAction
                  ? ACTION_LABELS[mostCommonAction] ?? mostCommonAction
                  : "—"
              }
              color="warning"
            />
            <KpiCard
              icon={<PeopleIcon fontSize="small" />}
              label="Tenant Mais Ativo"
              value={mostActiveTenantName ?? "—"}
              color="success"
            />
          </Stack>
        )}

        {/* Tabs */}
        <TabContext value={tab}>
          <Paper sx={{ mb: 2 }}>
            <TabList onChange={(_, v) => setTab(v)} variant="scrollable">
              <Tab label="Atividade Recente" value="feed" />
              <Tab label="Por Tenant" value="tenant" />
              <Tab label="Por Acao" value="action" />
            </TabList>
          </Paper>

          {/* ── Tab: Atividade Recente ── */}
          <TabPanel value="feed" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tenant</TableCell>
                    <TableCell>Acao</TableCell>
                    <TableCell>Recurso</TableCell>
                    <TableCell>Recurso ID</TableCell>
                    <TableCell>Usuario</TableCell>
                    <TableCell>Data / Hora</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {feed.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          Nenhum evento encontrado no periodo selecionado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    feed.map((entry) => (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {entry.tenant_name}
                          </Typography>
                          {entry.tenant_slug && (
                            <Typography variant="caption" color="text.secondary">
                              {entry.tenant_slug}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={ACTION_LABELS[entry.action] ?? entry.action}
                            color={ACTION_COLORS[entry.action] ?? "default"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{entry.resource_type}</Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={entry.resource_id ?? ""}>
                            <Typography variant="caption" noWrap sx={{ maxWidth: 80, display: "block" }}>
                              {entry.resource_id
                                ? entry.resource_id.slice(0, 8) + "..."
                                : "—"}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={entry.user_id ?? "sistema"}>
                            <Typography variant="caption" noWrap sx={{ maxWidth: 80, display: "block" }}>
                              {entry.user_id
                                ? entry.user_id.slice(0, 8) + "..."
                                : "sistema"}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fmtDate(entry.created_at)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Paginacao simples */}
            {feed.length > 0 && (
              <Stack direction="row" spacing={1} justifyContent="center" mt={2}>
                <Button
                  size="small"
                  disabled={feedPage === 0 || loading}
                  onClick={() => fetchAll(feedPage - 1)}
                >
                  Anterior
                </Button>
                <Typography variant="body2" sx={{ py: 0.5 }}>
                  Pagina {feedPage + 1}
                </Typography>
                <Button
                  size="small"
                  disabled={feed.length < FEED_LIMIT || loading}
                  onClick={() => fetchAll(feedPage + 1)}
                >
                  Proxima
                </Button>
              </Stack>
            )}
          </TabPanel>

          {/* ── Tab: Por Tenant ── */}
          <TabPanel value="tenant" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Tenant</TableCell>
                    <TableCell>Eventos</TableCell>
                    <TableCell sx={{ minWidth: 200 }}>Proporcao</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {byTenantRows.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          Sem dados no periodo selecionado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    byTenantRows.map((row, idx) => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {row.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.id.slice(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {row.count.toLocaleString("pt-BR")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={(row.count / maxTenantCount) * 100}
                              sx={{ flex: 1, height: 8, borderRadius: 4 }}
                            />
                            <Typography variant="caption" sx={{ minWidth: 36 }}>
                              {((row.count / totalActions) * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* ── Tab: Por Acao ── */}
          <TabPanel value="action" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Acao</TableCell>
                    <TableCell>Eventos</TableCell>
                    <TableCell sx={{ minWidth: 200 }}>Proporcao</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {byActionRows.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          Sem dados no periodo selecionado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    byActionRows.map((row, idx) => (
                      <TableRow key={row.action} hover>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={ACTION_LABELS[row.action] ?? row.action}
                            color={ACTION_COLORS[row.action] ?? "default"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {row.count.toLocaleString("pt-BR")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={(row.count / totalActions) * 100}
                              sx={{ flex: 1, height: 8, borderRadius: 4 }}
                              color={ACTION_COLORS[row.action] === "error" ? "error" : "primary"}
                            />
                            <Typography variant="caption" sx={{ minWidth: 36 }}>
                              {((row.count / totalActions) * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
        </TabContext>
      </Box>
    </PlatformLayout>
  );
}
