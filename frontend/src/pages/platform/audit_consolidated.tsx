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
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Alert,
  Chip,
  Tab,
  Typography,
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
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FeedEntry {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_slug: string;
  user_id: string | null;
  user_email?: string | null;
  user_username?: string | null;
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
    most_active_tenant_name?: string | null;
    most_active_tenant_slug?: string | null;
    most_active_user: string | null;
    most_common_action: string | null;
    avg_logs_per_tenant: number;
  };
  by_tenant_name?: Record<string, string>;
  by_tenant_slug?: Record<string, string>;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// â”€â”€â”€ Mapeamentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const RESOURCE_LABELS: Record<string, string> = {
  User: "Usuario",
  Ticket: "Ticket",
  Gira: "Gira",
  TenantConfig: "Configuracao",
  GiraSenhaConfig: "Config. de Senha",
  Subscription: "Assinatura",
  EstoqueGrupo: "Grupo de Material",
  EstoqueItem: "Item de Estoque",
  EstoqueMovimentacao: "Movimentacao de Estoque",
  Tenant: "Terreiro",
  Associado: "Associado",
  MensalidadeConfig: "Config. Mensalidade",
  MensalidadePagamento: "Pagamento de Mensalidade",
};

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  email: "Email",
  full_name: "Nome completo",
  username: "Usuario",
  phone: "Telefone",
  impersonated_by: "Impersonado por",
  is_bonus: "Bonus",
  plan: "Plano",
  mediun_id: "Mediun",
  associado_id: "Associado",
  gira_id: "Gira",
  data_inicio: "Data de inicio",
  data_fim: "Data de fim",
  endereco: "Endereco",
  primary_color: "Cor primaria",
  secondary_color: "Cor secundaria",
  font_color: "Cor da fonte",
  max_giras_per_month: "Max. giras/mes",
  max_tickets_per_gira: "Max. tickets/gira",
  enable_walk_in: "Walk-in habilitado",
  enable_sponsors: "Patrocinadores habilitados",
  validate_associado_on_emit: "Validar associado na emissao",
  walk_in_limit: "Limite walk-in",
  slug: "Slug",
  role: "Papel",
  status: "Status",
  tipo: "Tipo",
  numero: "Numero",
  success: "Sucesso",
  ip_address: "Endereco IP",
  valor_mensal: "Valor mensal",
  dia_vencimento: "Dia de vencimento",
  mensalidade_isento: "Isento de mensalidade",
  release_end_at: "Fim do release",
  release_start_at: "Inicio do release",
  release_at: "Data do release",
  max_tickets: "Max. tickets",
  gira_type: "Tipo de gira",
  is_open: "Aberta",
  is_visible: "Visivel",
  walk_in_enabled: "Walk-in habilitado",
};

const HIDDEN_FIELDS = new Set([
  "id", "tenant_id", "created_at", "updated_at", "deleted_at",
  "password_hash", "profile_photo_data", "profile_photo_url",
  "profile_photo_content_type", "user_agent", "path", "method",
  "custom_settings", "logo_data", "logo_content_type", "logo_url",
  "comprovante_data", "comprovante_content_type",
]);

// â”€â”€â”€ Helpers de formatacao de detalhes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  premium: "Premium",
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "boolean") return val ? "Sim" : "Nao";
  if (Array.isArray(val)) return `${val.length} item(ns)`;
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    // Subscription shorthand: {plan, is_bonus}
    if ("plan" in obj && typeof obj.plan === "string") {
      const label = PLAN_LABELS[String(obj.plan).toLowerCase()] ?? obj.plan;
      const bonus = obj.is_bonus ? " + Bonus" : "";
      return `Plano: ${label}${bonus}`;
    }
    return JSON.stringify(val);
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
  }
  if (UUID_RE.test(s)) return s.slice(0, 8) + "...";
  return s;
}

function diffObjects(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      changes.push({ field: key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

// â”€â”€â”€ Componente de detalhes formatados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FormatDetails({
  action,
  details,
}: {
  action: string;
  details?: Record<string, unknown> | null;
}) {
  if (!details) return <Typography variant="body2" color="text.secondary">{"—"}</Typography>;

  // LOGIN / LOGOUT - destacar falhas como erros
  if (action === "login" || action === "logout") {
    const success = details.success !== false;
    const ipAddress = details.ip_address as string | undefined;
    return (
      <Stack direction="row" flexWrap="wrap" spacing={0.5} alignItems="center">
        <Chip
          label={success ? "sucesso" : "FALHA"}
          size="small"
          color={success ? "success" : "error"}
          sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }}
        />
        {ipAddress && (
          <Typography variant="caption" color="text.secondary">
            IP: {ipAddress}
          </Typography>
        )}
      </Stack>
    );
  }

  // BULK
  const operationType = details.operation_type as string | undefined;
  if (operationType) {
    const opLabels: Record<string, string> = {
      bulk_mark_used: "Marcar como usado",
      bulk_cancel: "Cancelar em massa",
    };
    return (
      <Typography variant="body2">
        <strong>{opLabels[operationType] || operationType}</strong>
        {" — "}{details.count as number} registro(s)
      </Typography>
    );
  }

  // UPDATE - diff entre estados
  const prev = (details.previous_state || details.previous_values) as Record<string, unknown> | undefined;
  const next = (details.new_state || details.new_values) as Record<string, unknown> | undefined;
  if (prev && next) {
    const changes = diffObjects(prev, next);
    if (changes.length === 0)
      return <Typography variant="body2" color="text.secondary">Sem alteracoes visiveis</Typography>;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.4 }}>
        {changes.map(({ field, from, to }) => (
          <Box key={field} sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 0.4 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>
              {fieldLabel(field)}:
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "#c62828", textDecoration: "line-through", wordBreak: "break-word" }}
            >
              {formatValue(from)}
            </Typography>
            <Typography variant="caption" sx={{ mx: 0.3 }}>{"\u2192"}</Typography>
            <Typography
              variant="caption"
              sx={{ color: "#2e7d32", fontWeight: 700, wordBreak: "break-word" }}
            >
              {formatValue(to)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }

  // DELETE - nome do recurso removido
  if (action === "delete" && details.previous_state) {
    const state = details.previous_state as Record<string, unknown>;
    const label = (state.nome || state.email || state.numero) as string | undefined;
    return (
      <Typography variant="body2" color="error.main">
        Removido{label ? `: ${label}` : ""}
      </Typography>
    );
  }

  // CREATE - campos principais
  if (action === "create") {
    const meaningful = Object.entries(details).filter(([k]) => !HIDDEN_FIELDS.has(k) && k !== "path" && k !== "user_agent");
    if (meaningful.length === 0)
      return <Typography variant="body2" color="text.secondary">-</Typography>;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        {meaningful.slice(0, 4).map(([key, val]) => (
          <Typography key={key} variant="caption">
            <strong>{fieldLabel(key)}:</strong> {formatValue(val)}
          </Typography>
        ))}
      </Box>
    );
  }

  // Fallback
  const raw = JSON.stringify(details);
  return (
    <Typography variant="caption" sx={{ wordBreak: "break-word", color: "text.secondary" }}>
      {raw.length <= 100 ? raw : raw.slice(0, 100) + "..."}
    </Typography>
  );
}

// â”€â”€â”€ Helpers de data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// â”€â”€â”€ Componente KPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Modal de detalhes completos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DetailsModal({
  entry,
  onClose,
}: {
  entry: FeedEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  return (
    <Dialog open={!!entry} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Detalhes do Evento
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">Tenant</Typography>
            <Typography variant="body2" fontWeight={600}>{entry.tenant_name}</Typography>
            {entry.tenant_slug && (
              <Typography variant="caption" color="text.secondary">{entry.tenant_slug}</Typography>
            )}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Acao</Typography>
            <Box mt={0.25}>
              <Chip
                label={ACTION_LABELS[entry.action] ?? entry.action}
                color={ACTION_COLORS[entry.action] ?? "default"}
                size="small"
              />
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Recurso</Typography>
            <Typography variant="body2">
              {RESOURCE_LABELS[entry.resource_type] ?? entry.resource_type}
              {entry.resource_id && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({entry.resource_id})
                </Typography>
              )}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Usuario</Typography>
            <Typography variant="body2">
              {entry.user_username || entry.user_email || "sistema"}
              {entry.user_email && entry.user_username && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({entry.user_email})
                </Typography>
              )}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Data / Hora</Typography>
            <Typography variant="body2">
              {new Date(entry.created_at).toLocaleString("pt-BR")}
            </Typography>
          </Box>
          {entry.details && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Detalhes
              </Typography>
              <FormatDetails action={entry.action} details={entry.details} />
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Pagina Principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function AuditConsolidadoPage() {
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [tab, setTab] = useState("feed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedPage, setFeedPage] = useState(0);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [detailEntry, setDetailEntry] = useState<FeedEntry | null>(null);

  const [filterTenant, setFilterTenant] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const FEED_LIMIT = 50;

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

        const [summaryRes, feedRes, tenantsRes] = await Promise.all([
          apiClient.get<AuditSummary>(`/api/v1/platform/audit-logs?${params}`),
          apiClient.get<FeedEntry[]>(`/api/v1/platform/audit-logs/feed?${feedParams}`),
          apiClient.get<{ items: Tenant[] }>("/api/v1/platform/tenants?limit=200"),
        ]);

        const tenantList = tenantsRes.data?.items ?? [];
        const map: Record<string, string> = {};
        tenantList.forEach((t) => { map[t.id] = t.name; });
        setTenants(tenantList);
        setTenantMap(map);

        setSummary(summaryRes.data);
        setFeed(Array.isArray(feedRes.data) ? feedRes.data : []);
        setFeedPage(page);
      } catch {
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
      const resp = await apiClient.get<FeedEntry[]>(
        `/api/v1/platform/audit-logs/feed?${feedParams}`
      );
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], {
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

  // â”€â”€â”€ KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const activeTenantsCount = summary
    ? Object.keys(summary.by_tenant ?? {}).length
    : 0;

  const mostCommonAction = summary?.statistics?.most_common_action ?? null;

  const mostActiveTenantName =
    (summary?.statistics?.most_active_tenant_name as string | null | undefined) ??
    (summary?.statistics?.most_active_tenant as string | null | undefined
      ? (tenantMap[(summary?.statistics?.most_active_tenant as string)] ?? (summary?.statistics?.most_active_tenant as string).slice(0, 8) + "...")
      : null);

  // â”€â”€â”€ Tabela Por Tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const byTenantRows = summary
    ? Object.entries(summary.by_tenant ?? {})
        .map(([id, count]) => {
          const isNone = !id || id === "None";
          const name = isNone
            ? "Platform"
            : (summary.by_tenant_name?.[id] ?? tenantMap[id] ?? id.slice(0, 8) + "...");
          const slug = isNone
            ? ""
            : (summary.by_tenant_slug?.[id] ?? tenants.find((t) => t.id === id)?.slug ?? "");
          return { id, name, slug, count };
        })
        .sort((a, b) => b.count - a.count)
    : [];

  const maxTenantCount = byTenantRows[0]?.count ?? 1;

  // â”€â”€â”€ Tabela Por Acao â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const byActionRows = summary
    ? Object.entries(summary.by_action ?? {})
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const totalActions = byActionRows.reduce((s, r) => s + r.count, 0) || 1;

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <PlatformLayout>
      <Box sx={{ p: 3 }}>
        {/* Cabecalho */}
        <Stack data-tour="audit-cons-header" direction="row" alignItems="center" spacing={1.5} mb={1}>
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
        <Paper data-tour="audit-cons-filtros" sx={{ p: 2, mb: 2 }}>
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
                  : "-"
              }
              color="warning"
            />
            <KpiCard
              icon={<PeopleIcon fontSize="small" />}
              label="Tenant Mais Ativo"
              value={mostActiveTenantName ?? "-"}
              color="success"
            />
          </Stack>
        )}

        {/* Tabs */}
        <TabContext value={tab}>
          {/* data-tour anchor aplicado no Paper das tabs */}
          <Paper data-tour="audit-cons-tabs" sx={{ mb: 2 }}>
            <TabList onChange={(_, v) => setTab(v)} variant="scrollable">
              <Tab label="Atividade Recente" value="feed" />
              <Tab label="Por Tenant" value="tenant" />
              <Tab label="Por Acao" value="action" />
            </TabList>
          </Paper>

          {/* â”€â”€ Tab: Atividade Recente â”€â”€ */}
          <TabPanel value="feed" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "#f5f5f5" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Tenant</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Acao</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Recurso</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Detalhes</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>Data / Hora</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {feed.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          Nenhum evento encontrado no periodo selecionado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    feed.map((entry) => {
                      const isError =
                        entry.action === "login" &&
                        entry.details?.success === false;
                      const dt = fmtDate(entry.created_at);
                      return (
                        <TableRow
                          key={entry.id}
                          hover
                          sx={{
                            verticalAlign: "top",
                            bgcolor: isError ? "rgba(211,47,47,0.05)" : undefined,
                          }}
                        >
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2" fontWeight={500}>
                              {entry.tenant_name}
                            </Typography>
                            {entry.tenant_slug && (
                              <Typography variant="caption" color="text.secondary">
                                {entry.tenant_slug}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Chip
                              label={ACTION_LABELS[entry.action] ?? entry.action}
                              color={ACTION_COLORS[entry.action] ?? "default"}
                              size="small"
                            />
                            {isError && (
                              <Chip
                                label="ERRO"
                                color="error"
                                size="small"
                                sx={{ ml: 0.5, height: 18, fontSize: "0.65rem", fontWeight: 700 }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2">
                              {RESOURCE_LABELS[entry.resource_type] ?? entry.resource_type}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2">
                              {entry.user_username || entry.user_email || "sistema"}
                            </Typography>
                            {entry.user_username && entry.user_email && (
                              <Typography variant="caption" color="text.secondary">
                                {entry.user_email}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 1.5, maxWidth: 300 }}>
                            <FormatDetails action={entry.action} details={entry.details} />
                          </TableCell>
                          <TableCell sx={{ py: 1.5, whiteSpace: "nowrap" }}>
                            <Typography variant="body2">{dt.date}</Typography>
                            <Typography variant="caption" color="text.secondary">{dt.time}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1 }}>
                            <Tooltip title="Ver detalhes completos">
                              <IconButton
                                size="small"
                                onClick={() => setDetailEntry(entry)}
                              >
                                <InfoOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Paginacao */}
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

          {/* â”€â”€ Tab: Por Tenant â”€â”€ */}
          <TabPanel value="tenant" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "#f5f5f5" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Tenant</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Eventos</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Proporcao</TableCell>
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
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>
                            {idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {row.name}
                          </Typography>
                          {row.slug && (
                            <Typography variant="caption" color="text.secondary">
                              {row.slug}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>
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
                            <Typography variant="caption" sx={{ minWidth: 38 }}>
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

          {/* â”€â”€ Tab: Por Acao â”€â”€ */}
          <TabPanel value="action" sx={{ p: 0 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "#f5f5f5" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Acao</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Eventos</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Proporcao</TableCell>
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
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>
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
                          <Typography variant="body2" fontWeight={700}>
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
                            <Typography variant="caption" sx={{ minWidth: 38 }}>
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

      {/* Modal de detalhes */}
      <DetailsModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </PlatformLayout>
  );
}

