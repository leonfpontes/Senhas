/**
 * Platform Settings Page
 *
 * Tabs:
 *   0 - Feature Flags: per-tenant feature overrides
 *   1 - Status do Sistema: real-time health from /api/v1/platform/status
 *   2 - Tiers e Limites: plan comparison reference table
 */

import React, { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Paper,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FlagIcon from "@mui/icons-material/Flag";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RefreshIcon from "@mui/icons-material/Refresh";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import TableChartIcon from "@mui/icons-material/TableChart";
import { apiClient, extractApiErrorMessage } from "../../services/api_client";
import PlatformLayout from "./layout";
import CrudDrawer from "../../components/CrudDrawer";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface FeatureFlag {
  id: string;
  tenant_id: string;
  feature: string;
  enabled: boolean;
  expires_at: string | null;
  description: string | null;
  created_at: string;
}

interface SystemComponent {
  name: string;
  description: string;
  status: "operational" | "degraded" | "outage" | string;
  uptime_30d: number;
  uptime_90d: number;
  latency_ms?: number | null;
}

interface SystemStatusResponse {
  components: SystemComponent[];
}

// ─── Dados estáticos dos planos ──────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  FREE:    "#94a3b8",
  BASIC:   "#3b82f6",
  PRO:     "#8b5cf6",
  PREMIUM: "#f59e0b",
};

interface PlanRow {
  label: string;
  FREE:    string | boolean;
  BASIC:   string | boolean;
  PRO:     string | boolean;
  PREMIUM: string | boolean;
}

const PLAN_ROWS: PlanRow[] = [
  { label: "Preço mensal",                 FREE: "Grátis",    BASIC: "R$49",    PRO: "R$79",    PREMIUM: "R$99"      },
  { label: "Usuários",                     FREE: "1",         BASIC: "5",       PRO: "20",      PREMIUM: "Ilimitado" },
  { label: "Giras por mês",               FREE: "2",         BASIC: "10",      PRO: "50",      PREMIUM: "Ilimitado" },
  { label: "Médiuns/cambones",             FREE: "—",         BASIC: "15",      PRO: "30",      PREMIUM: "Ilimitado" },
  { label: "Emissão de senhas",            FREE: true,        BASIC: true,      PRO: true,      PREMIUM: true        },
  { label: "Porta (fila em tempo real)",   FREE: true,        BASIC: true,      PRO: true,      PREMIUM: true        },
  { label: "Relatório de Gira",            FREE: false,       BASIC: true,      PRO: true,      PREMIUM: true        },
  { label: "Envio de senha por e-mail",    FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Tema personalizado",           FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Analytics avançado",           FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Gestão de Associados",         FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Controle de Estoque",          FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Site do Terreiro",             FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Export CSV",                   FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Auditoria completa",           FREE: false,       BASIC: false,     PRO: true,      PREMIUM: true        },
  { label: "Mensalidade de Médiuns",       FREE: false,       BASIC: false,     PRO: false,     PREMIUM: true        },
  { label: "Suporte prioritário",          FREE: false,       BASIC: false,     PRO: false,     PREMIUM: true        },
  { label: "API Access",                   FREE: false,       BASIC: false,     PRO: false,     PREMIUM: true        },
];

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function PlanCell({ value }: { value: string | boolean }) {
  if (value === true)  return <CheckCircleIcon sx={{ color: "success.main", fontSize: 18 }} />;
  if (value === false) return <CancelIcon     sx={{ color: "text.disabled", fontSize: 18 }} />;
  return <Typography variant="body2" fontWeight={600}>{value}</Typography>;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: "success" | "warning" | "error" | "default" }> = {
    operational: { label: "Operacional",  color: "success" },
    degraded:    { label: "Degradado",    color: "warning" },
    outage:      { label: "Fora do ar",   color: "error"   },
    unknown:     { label: "Desconhecido", color: "default" },
  };
  const { label, color } = map[status] ?? map.unknown;
  return <Chip label={label} color={color} size="small" />;
}

// ─── Tab 0: Feature Flags ─────────────────────────────────────────────────────

function FeatureFlagsTab() {
  const [tenants, setTenants]               = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [flags, setFlags]                   = useState<FeatureFlag[]>([]);
  const [error, setError]                   = useState<string | null>(null);
  const [success, setSuccess]               = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]         = useState(false);
  const [newFlag, setNewFlag]               = useState({ feature: "", description: "" });
  const [touched, setTouched]               = useState<Record<string, boolean>>({});
  const [saving, setSaving]                 = useState(false);

  useEffect(() => { fetchTenants(); }, []);
  useEffect(() => {
    if (selectedTenant) fetchFlags(selectedTenant);
    else setFlags([]);
  }, [selectedTenant]);

  const fetchTenants = async () => {
    try {
      const res = await apiClient.get("/api/v1/platform/tenants");
      setTenants(res.data);
    } catch { /* silent */ }
  };

  const fetchFlags = async (tenantId: string) => {
    try {
      const res = await apiClient.get(`/api/v1/platform/feature-flags/${tenantId}`);
      setFlags(res.data);
    } catch { setFlags([]); }
  };

  const openAddFlag = () => {
    setNewFlag({ feature: "", description: "" });
    setTouched({});
    setDrawerOpen(true);
  };

  const flagIsDirty  = newFlag.feature.length > 0 || newFlag.description.length > 0;
  const featureError = touched.feature && !newFlag.feature.trim() ? "Nome da feature obrigatório" : "";
  const flagValid    = newFlag.feature.trim().length > 0;

  const handleAddFlag = async () => {
    if (!selectedTenant || !newFlag.feature) return;
    setSaving(true);
    try {
      await apiClient.post(`/api/v1/platform/feature-flags/${selectedTenant}`, {
        feature:     newFlag.feature,
        enabled:     true,
        description: newFlag.description || null,
      });
      setDrawerOpen(false);
      setSuccess("Feature flag adicionada com sucesso!");
      setTimeout(() => setSuccess(null), 3000);
      fetchFlags(selectedTenant);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao adicionar feature flag"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFlag = async (feature: string) => {
    if (!selectedTenant) return;
    if (!window.confirm(`Remover feature flag "${feature}"?`)) return;
    try {
      await apiClient.delete(`/api/v1/platform/feature-flags/${selectedTenant}/${feature}`);
      fetchFlags(selectedTenant);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao remover feature flag"));
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <FormControl sx={{ minWidth: { xs: "100%", sm: 320 } }} size="small">
            <InputLabel>Tenant</InputLabel>
            <Select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              label="Tenant"
            >
              <MenuItem value=""><em>— Selecione um tenant —</em></MenuItem>
              {tenants.map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.name} ({t.slug})</MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!selectedTenant ? (
        <Alert severity="info">Selecione um tenant acima para gerenciar suas feature flags.</Alert>
      ) : (
        <Card>
          <CardContent>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography fontWeight={700} fontSize="1.05rem">Feature Flags</Typography>
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAddFlag}>
                Adicionar Flag
              </Button>
            </Box>

            {flags.length === 0 ? (
              <Alert severity="info">Nenhuma feature flag para este tenant.</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Feature</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Expira em</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {flags.map((flag) => (
                      <TableRow key={flag.id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{flag.feature}</Typography>
                          {flag.description && (
                            <Typography variant="caption" color="text.secondary">{flag.description}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={flag.enabled ? "ON" : "OFF"}
                            color={flag.enabled ? "success" : "default"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{flag.expires_at ? formatDate(flag.expires_at) : "—"}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remover">
                            <IconButton size="small" color="error" onClick={() => handleDeleteFlag(flag.feature)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nova Feature Flag"
        subtitle="Adicione uma feature flag para o tenant selecionado."
        icon={<FlagIcon />}
        onSave={handleAddFlag}
        saveLabel="Adicionar"
        saving={saving}
        saveDisabled={!flagValid}
        isDirty={flagIsDirty}
      >
        <TextField
          label="Nome da Feature"
          fullWidth
          value={newFlag.feature}
          onChange={(e) => setNewFlag({ ...newFlag, feature: e.target.value })}
          onBlur={() => setTouched((p) => ({ ...p, feature: true }))}
          required
          error={!!featureError}
          helperText={featureError}
        />
        <TextField
          label="Descrição"
          fullWidth
          value={newFlag.description}
          onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
          multiline
          rows={3}
        />
      </CrudDrawer>
    </Box>
  );
}

// ─── Tab 1: Status do Sistema ─────────────────────────────────────────────────

function SystemStatusTab() {
  const [data, setData]           = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/api/v1/platform/status");
      setData(res.data);
      setCheckedAt(new Date());
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao buscar status do sistema"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  if (loading) return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress />
    </Box>
  );

  if (error) return <Alert severity="error">{error}</Alert>;

  const allOperational = data?.components.every((c) => c.status === "operational");

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Chip
            icon={<HealthAndSafetyIcon />}
            label={allOperational ? "Todos os sistemas operacionais" : "Atenção: degradação detectada"}
            color={allOperational ? "success" : "warning"}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {checkedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              Verificado às {checkedAt.toLocaleTimeString("pt-BR")}
            </Typography>
          )}
        </Box>
        <Tooltip title="Atualizar">
          <IconButton onClick={fetchStatus} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={2}>
        {data?.components.map((comp) => (
          <Grid item xs={12} sm={6} md={4} key={comp.name}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
                  <Typography fontWeight={700} fontSize="0.95rem">{comp.name}</Typography>
                  <StatusChip status={comp.status} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  {comp.description}
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <Stack spacing={0.5}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Uptime 30d</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      {comp.uptime_30d.toFixed(1)}%
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Uptime 90d</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      {comp.uptime_90d.toFixed(1)}%
                    </Typography>
                  </Box>
                  {comp.latency_ms != null && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="caption" color="text.secondary">Latência DB</Typography>
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        color={comp.latency_ms > 200 ? "warning.main" : "success.main"}
                      >
                        {comp.latency_ms} ms
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ─── Tab 2: Tiers & Limites ───────────────────────────────────────────────────

const PLAN_KEYS = ["FREE", "BASIC", "PRO", "PREMIUM"] as const;

function TiersTab() {
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Tabela de referência dos planos da plataforma. Os limites refletem os valores padrão
        definidos no backend — tenants com Stripe podem ter valores customizados via assinatura.
      </Alert>

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Recurso / Feature</TableCell>
              {PLAN_KEYS.map((plan) => (
                <TableCell
                  key={plan}
                  align="center"
                  sx={{
                    fontWeight: 700,
                    color: PLAN_COLORS[plan],
                    minWidth: 110,
                    borderBottom: `3px solid ${PLAN_COLORS[plan]}`,
                  }}
                >
                  {plan}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {PLAN_ROWS.map((row, idx) => (
              <TableRow key={row.label} sx={{ bgcolor: idx % 2 === 0 ? "action.hover" : "transparent" }}>
                <TableCell sx={{ fontSize: "0.85rem" }}>{row.label}</TableCell>
                {PLAN_KEYS.map((plan) => (
                  <TableCell key={plan} align="center">
                    <PlanCell value={row[plan]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <PlatformLayout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Configurações da Plataforma</Typography>
        <Typography variant="body2" color="text.secondary">
          Feature flags por tenant, saúde do sistema e referência de planos
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<FlagIcon />}            iconPosition="start" label="Feature Flags"     />
          <Tab icon={<HealthAndSafetyIcon />} iconPosition="start" label="Status do Sistema" />
          <Tab icon={<TableChartIcon />}      iconPosition="start" label="Tiers & Limites"   />
        </Tabs>
      </Box>

      {tab === 0 && <FeatureFlagsTab />}
      {tab === 1 && <SystemStatusTab />}
      {tab === 2 && <TiersTab />}
    </PlatformLayout>
  );
};

export default SettingsPage;
