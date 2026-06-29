/**
 * Observatório de Tenants — visão cross-tenant para o super-admin.
 * Mostra próximas giras, cursos, features mais usadas e erros por tenant.
 */

import React, { useEffect, useState, useCallback } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";

import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import PlatformLayout from "./layout";
import { KpiCard, SectionLabel } from "../../components/platform";
import { ACCENT } from "../../styles/platformTheme";
import { usePlatformTheme } from "../../providers/PlatformThemeProvider";
import { apiClient } from "../../services/api_client";

const POLL_MS = 120_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpcomingGira {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string | null;
  max_tickets: number | null;
  tickets_emitidos: number;
  ocupacao_pct: number | null;
  release_start_at: string | null;
  release_end_at: string | null;
  is_active: boolean;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  public_link: string;
}

interface UpcomingCurso {
  id: string;
  titulo: string;
  data_inicio: string;
  data_fim: string | null;
  max_participantes: number | null;
  inscritos: number;
  ocupacao_pct: number | null;
  local: string | null;
  is_active: boolean;
  gerar_mensalidade: boolean;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
}

interface TenantFeatures {
  tenant_id: string;
  tenant_name: string;
  total_acoes: number;
  features: { resource_type: string; label: string; uso: number }[];
}

interface TenantErrors {
  tenant_id: string | null;
  total_erros: number;
  top_endpoints: { endpoint: string; count: number }[];
}

interface ObservatoryData {
  upcoming_giras: UpcomingGira[];
  upcoming_cursos: UpcomingCurso[];
  top_features_by_tenant: TenantFeatures[];
  errors_by_tenant: TenantErrors[];
  error_window_minutes: number;
  generated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function OcupacaoBar({ pct, emitidos, max }: { pct: number | null; emitidos: number; max: number | null }) {
  if (pct === null) return <Typography variant="caption" color="text.secondary">{emitidos} emitidos</Typography>;
  const color = pct >= 90 ? "#EF4444" : pct >= 60 ? "#F59E0B" : "#10B981";
  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary">{emitidos}/{max}</Typography>
        <Typography variant="caption" fontWeight={700} sx={{ color }}>{pct}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(pct, 100)}
        sx={{
          height: 5, borderRadius: 99,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 99 },
        }}
      />
    </Box>
  );
}

function TenantChip({ name }: { name: string }) {
  return (
    <Chip
      label={name}
      size="small"
      sx={{ fontSize: "0.65rem", fontWeight: 600, height: 20, bgcolor: `${ACCENT}15`, color: ACCENT }}
    />
  );
}

function DaysChip({ days }: { days: number }) {
  const color = days <= 3 ? "#EF4444" : days <= 7 ? "#F59E0B" : "#10B981";
  const label = days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `${days}d`;
  return (
    <Chip
      label={label}
      size="small"
      sx={{ fontSize: "0.65rem", fontWeight: 700, height: 20, bgcolor: `${color}18`, color }}
    />
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function GirasSection({ giras }: { giras: UpcomingGira[] }) {
  const { tokens } = usePlatformTheme();
  if (!giras.length) return (
    <Alert severity="info" sx={{ fontSize: "0.8rem" }}>Nenhuma gira nos próximos 30 dias.</Alert>
  );
  return (
    <TableContainer component={Card} sx={{ border: `1px solid ${tokens.border}` }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary", py: 1.25 } }}>
            <TableCell>Tenant</TableCell>
            <TableCell>Gira</TableCell>
            <TableCell>Data</TableCell>
            <TableCell>Faltam</TableCell>
            <TableCell>Abertura de senhas</TableCell>
            <TableCell>Ocupação</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="center">Link</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {giras.map((g) => {
            const days = daysUntil(g.data_inicio);
            return (
              <TableRow key={g.id} hover sx={{ "& td": { py: 1.2, fontSize: "0.8rem" } }}>
                <TableCell><TenantChip name={g.tenant_name} /></TableCell>
                <TableCell sx={{ fontWeight: 600, maxWidth: 180 }}>
                  <Tooltip title={g.nome}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{g.nome}</span></Tooltip>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{fmtDate(g.data_inicio)}</TableCell>
                <TableCell><DaysChip days={days} /></TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                  {g.release_start_at ? (
                    <>{fmtDateShort(g.release_start_at)}{g.release_end_at ? ` → ${fmtDateShort(g.release_end_at)}` : ""}</>
                  ) : "—"}
                </TableCell>
                <TableCell sx={{ minWidth: 140 }}>
                  <OcupacaoBar pct={g.ocupacao_pct} emitidos={g.tickets_emitidos} max={g.max_tickets} />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={g.is_active ? "Ativa" : "Inativa"}
                    sx={{ fontSize: "0.65rem", height: 20, bgcolor: g.is_active ? "#10B98118" : "#EF444418", color: g.is_active ? "#10B981" : "#EF4444", fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Abrir link público">
                    <IconButton size="small" href={g.public_link} target="_blank" rel="noopener">
                      <OpenInNewRoundedIcon sx={{ fontSize: "0.9rem" }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function CursosSection({ cursos }: { cursos: UpcomingCurso[] }) {
  const { tokens } = usePlatformTheme();
  if (!cursos.length) return (
    <Alert severity="info" sx={{ fontSize: "0.8rem" }}>Nenhum curso nos próximos 60 dias.</Alert>
  );
  return (
    <TableContainer component={Card} sx={{ border: `1px solid ${tokens.border}` }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary", py: 1.25 } }}>
            <TableCell>Tenant</TableCell>
            <TableCell>Curso</TableCell>
            <TableCell>Data início</TableCell>
            <TableCell>Faltam</TableCell>
            <TableCell>Local</TableCell>
            <TableCell>Inscritos</TableCell>
            <TableCell>Mensalidade</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cursos.map((c) => {
            const days = daysUntil(c.data_inicio);
            return (
              <TableRow key={c.id} hover sx={{ "& td": { py: 1.2, fontSize: "0.8rem" } }}>
                <TableCell><TenantChip name={c.tenant_name} /></TableCell>
                <TableCell sx={{ fontWeight: 600, maxWidth: 180 }}>
                  <Tooltip title={c.titulo}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{c.titulo}</span></Tooltip>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{fmtDate(c.data_inicio)}</TableCell>
                <TableCell><DaysChip days={days} /></TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem" }}>{c.local || "—"}</TableCell>
                <TableCell sx={{ minWidth: 130 }}>
                  <OcupacaoBar pct={c.ocupacao_pct} emitidos={c.inscritos} max={c.max_participantes} />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={c.gerar_mensalidade ? "Sim" : "Não"} sx={{ fontSize: "0.65rem", height: 20, fontWeight: 600, bgcolor: c.gerar_mensalidade ? "#6366F118" : "action.hover", color: c.gerar_mensalidade ? ACCENT : "text.secondary" }} />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={c.is_active ? "Ativo" : "Inativo"} sx={{ fontSize: "0.65rem", height: 20, bgcolor: c.is_active ? "#10B98118" : "#EF444418", color: c.is_active ? "#10B981" : "#EF4444", fontWeight: 700 }} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function FeaturesSection({ tenants }: { tenants: TenantFeatures[] }) {
  const { tokens } = usePlatformTheme();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!tenants.length) return (
    <Alert severity="info" sx={{ fontSize: "0.8rem" }}>Sem dados de uso nos últimos 30 dias.</Alert>
  );

  const maxTotal = Math.max(...tenants.map((t) => t.total_acoes), 1);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {tenants.map((t) => {
        const isOpen = expanded === t.tenant_id;
        const maxFeatureUso = Math.max(...t.features.map((f) => f.uso), 1);
        return (
          <Card key={t.tenant_id} sx={{ border: `1px solid ${tokens.border}` }}>
            <Box
              onClick={() => setExpanded(isOpen ? null : t.tenant_id)}
              sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
            >
              <Box sx={{ width: 220, flexShrink: 0 }}>
                <TenantChip name={t.tenant_name} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={(t.total_acoes / maxTotal) * 100}
                  sx={{
                    height: 6, borderRadius: 99, bgcolor: "action.hover",
                    "& .MuiLinearProgress-bar": { bgcolor: ACCENT, borderRadius: 99 },
                  }}
                />
              </Box>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: ACCENT, width: 72, textAlign: "right", flexShrink: 0 }}>
                {t.total_acoes.toLocaleString("pt-BR")} ações
              </Typography>
              {isOpen ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ px: 2, pb: 2, pt: 0.5, display: "flex", flexDirection: "column", gap: 1 }}>
                {t.features.map((f) => (
                  <Box key={f.resource_type} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", width: 220, flexShrink: 0 }}>{f.label}</Typography>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={(f.uso / maxFeatureUso) * 100}
                        sx={{
                          height: 5, borderRadius: 99, bgcolor: "action.hover",
                          "& .MuiLinearProgress-bar": { bgcolor: `${ACCENT}99`, borderRadius: 99 },
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "text.primary", width: 40, textAlign: "right", flexShrink: 0 }}>
                      {f.uso}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Card>
        );
      })}
    </Box>
  );
}

function ErrorsSection({ errors, windowMinutes }: { errors: TenantErrors[]; windowMinutes: number }) {
  const { tokens } = usePlatformTheme();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!errors.length) return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2, borderRadius: 2, border: `1px solid ${tokens.border}`, bgcolor: "#10B98108" }}>
      <CheckCircleRoundedIcon sx={{ color: "#10B981", fontSize: "1rem" }} />
      <Typography sx={{ fontSize: "0.8rem", color: "#10B981", fontWeight: 600 }}>
        Nenhum erro detectado na última hora. Tudo OK!
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {errors.map((e, i) => {
        const key = e.tenant_id ?? "__anon__";
        const isOpen = expanded === key;
        const label = e.tenant_id ?? "Sem tenant (público)";
        return (
          <Card key={key} sx={{ border: `1px solid #EF444430`, bgcolor: "#EF444408" }}>
            <Box
              onClick={() => setExpanded(isOpen ? null : key)}
              sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "#EF444410" } }}
            >
              <WarningAmberRoundedIcon sx={{ color: "#EF4444", fontSize: "1rem" }} />
              <Typography sx={{ flex: 1, fontSize: "0.8rem", fontWeight: 600 }}>{label}</Typography>
              <Chip
                label={`${e.total_erros} erro${e.total_erros !== 1 ? "s" : ""}`}
                size="small"
                sx={{ fontSize: "0.65rem", height: 20, bgcolor: "#EF444420", color: "#EF4444", fontWeight: 700 }}
              />
              {isOpen ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
                {e.top_endpoints.map((ep) => (
                  <Box key={ep.endpoint} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.secondary" }}>{ep.endpoint}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "#EF4444" }}>{ep.count}x</Typography>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Card>
        );
      })}
    </Box>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ObservatoryPage() {
  const [data, setData] = useState<ObservatoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/platform/tenant-observatory");
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Falha ao carregar dados do observatório.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const kpis = data ? [
    {
      label: "Giras (próx. 30d)",
      value: data.upcoming_giras.length,
      sub: `${data.upcoming_giras.filter((g) => g.ocupacao_pct !== null && g.ocupacao_pct >= 80).length} com ocupação alta`,
      icon: <CalendarMonthRoundedIcon />,
      color: ACCENT,
    },
    {
      label: "Cursos (próx. 60d)",
      value: data.upcoming_cursos.length,
      sub: `${data.upcoming_cursos.reduce((s, c) => s + c.inscritos, 0)} inscritos total`,
      icon: <SchoolRoundedIcon />,
      color: "#10B981",
    },
    {
      label: "Tenants com erros",
      value: data.errors_by_tenant.length,
      sub: `na última ${data.error_window_minutes} min`,
      icon: <BugReportRoundedIcon />,
      color: data.errors_by_tenant.length > 0 ? "#EF4444" : "#10B981",
    },
    {
      label: "Tenants ativos (30d)",
      value: data.top_features_by_tenant.length,
      sub: "com ao menos 1 ação",
      icon: <InsightsRoundedIcon />,
      color: "#F59E0B",
    },
  ] : [];

  return (
    <PlatformLayout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: "auto" }}>

        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ letterSpacing: "-0.02em" }}>
              Observatório de Tenants
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR")} · atualiza a cada 2 min` : "Carregando…"}
            </Typography>
          </Box>
          <Tooltip title="Atualizar agora">
            <IconButton onClick={load} disabled={loading} size="small" sx={{ border: "1px solid", borderColor: "divider" }}>
              <RefreshRoundedIcon fontSize="small" sx={{ ...(loading && { animation: "spin 1s linear infinite", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }) }} />
            </IconButton>
          </Tooltip>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading && !data ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : data ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {/* KPIs */}
            <Grid container spacing={2}>
              {kpis.map((k) => (
                <Grid item xs={6} md={3} key={k.label}>
                  <KpiCard {...k} />
                </Grid>
              ))}
            </Grid>

            {/* Próximas Giras */}
            <Box>
              <SectionLabel sub="Próximos 30 dias — todos os tenants">Próximas Giras</SectionLabel>
              <GirasSection giras={data.upcoming_giras} />
            </Box>

            {/* Próximos Cursos */}
            <Box>
              <SectionLabel sub="Próximos 60 dias — todos os tenants">Próximos Cursos</SectionLabel>
              <CursosSection cursos={data.upcoming_cursos} />
            </Box>

            {/* Features mais usadas */}
            <Box>
              <SectionLabel sub="Últimos 30 dias · clique para expandir">Features mais usadas por tenant</SectionLabel>
              <FeaturesSection tenants={data.top_features_by_tenant} />
            </Box>

            {/* Erros por tenant */}
            <Box>
              <SectionLabel sub="Monitor in-memory — independente do Sentry">{`Erros por tenant (última ${data.error_window_minutes} min)`}</SectionLabel>
              <ErrorsSection errors={data.errors_by_tenant} windowMinutes={data.error_window_minutes} />
            </Box>

          </Box>
        ) : null}
      </Box>
    </PlatformLayout>
  );
}
