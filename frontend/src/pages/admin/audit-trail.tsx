'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import AdminLayout from './admin_layout';
import UpgradePrompt from '../../components/UpgradePrompt';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { apiClient } from '../../services/api_client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  user_name?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// ─── Translation maps ─────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  User: 'Usuário',
  Ticket: 'Ticket',
  Gira: 'Gira',
  TenantConfig: 'Configuração',
  GiraSenhaConfig: 'Config. de Senha',
  tenant: 'Terreiro',
  door: 'Porta',
  giras: 'Giras',
  Subscription: 'Assinatura',
  subscription: 'Assinatura',
  EstoqueGrupo: 'Grupo de Material',
  EstoqueItem: 'Item de Estoque',
  EstoqueMovimentacao: 'Movimentação de Estoque',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  login: 'Login',
  logout: 'Logout',
  read: 'Leitura',
  token_refresh: 'Token',
};

// Semantic color keys — resolved at render time using isDark
type ActionColor = { light: { bg: string; fg: string }; dark: { bg: string; fg: string } };
const ACTION_COLORS: Record<string, ActionColor> = {
  create:        { light: { bg: '#dcfce7', fg: '#166534' }, dark: { bg: '#14532d', fg: '#86efac' } },
  delete:        { light: { bg: '#fee2e2', fg: '#991b1b' }, dark: { bg: '#7f1d1d', fg: '#fca5a5' } },
  update:        { light: { bg: '#fef9c3', fg: '#854d0e' }, dark: { bg: '#713f12', fg: '#fde68a' } },
  login:         { light: { bg: '#dbeafe', fg: '#1e40af' }, dark: { bg: '#1e3a8a', fg: '#93c5fd' } },
  logout:        { light: { bg: '#f3e8ff', fg: '#6b21a8' }, dark: { bg: '#581c87', fg: '#d8b4fe' } },
  read:          { light: { bg: '#f1f5f9', fg: '#475569' }, dark: { bg: '#1e293b', fg: '#94a3b8' } },
  token_refresh: { light: { bg: '#f1f5f9', fg: '#475569' }, dark: { bg: '#1e293b', fg: '#94a3b8' } },
};

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome', email: 'Email', full_name: 'Nome completo', username: 'Usuário',
  phone: 'Telefone', is_active: 'Ativo', data_inicio: 'Data de início',
  data_fim: 'Data de fim', endereco: 'Endereço', primary_color: 'Cor primária',
  secondary_color: 'Cor secundária', font_color: 'Cor da fonte',
  max_giras_per_month: 'Máx. giras/mês', max_tickets_per_gira: 'Máx. tickets/gira',
  enable_walk_in: 'Walk-in habilitado', enable_sponsors: 'Patrocinadores habilitados',
  validate_associado_on_emit: 'Validar associado na emissão',
  enable_estoque_log: 'Log de estoque ativado', walk_in_limit: 'Limite walk-in',
  slug: 'Slug', role: 'Papel', password_hash: 'Senha', status: 'Status',
  tipo: 'Tipo', consulente_nome: 'Nome do consulente', consulente_email: 'Email do consulente',
  consulente_telefone: 'Telefone do consulente', is_sponsor: 'É associado',
  numero: 'Número', gira_id: 'Gira', plan: 'Plano', success: 'Sucesso',
  ip_address: 'Endereço IP', timestamp: 'Data/hora', path: 'Rota',
  user_agent: 'Navegador', impersonated_by: 'Impersonado por', method: 'Método',
  max_tickets: 'Máx. tickets', release_start_at: 'Liberação início',
  release_end_at: 'Liberação fim', error: 'Erro', operation_type: 'Tipo de operação',
  count: 'Quantidade', resource_ids: 'IDs afetados', config_type: 'Tipo de config.',
};

// ─── Detail formatting ────────────────────────────────────────────────────────

const HIDDEN_FIELDS = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at',
  'password_hash', 'profile_photo_data', 'profile_photo_url',
  'profile_photo_content_type', 'user_agent', 'path', 'method',
]);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (Array.isArray(val)) return `${val.length} item(ns)`;
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; }
  }
  return s;
}

function diffObjects(prev: Record<string, unknown>, next: Record<string, unknown>) {
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

function FormatDetails({ action, details }: { action: string; details?: Record<string, unknown> }) {
  if (!details) return <Typography variant="body2" color="text.secondary">—</Typography>;

  if (action === 'login' || action === 'logout') {
    const ok = details.success !== false;
    const ipAddress = details.ip_address as string | undefined;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2">{action === 'login' ? 'Login' : 'Logout'}</Typography>
        <Chip label={ok ? 'sucesso' : 'falha'} size="small" color={ok ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.7rem' }} />
        {ipAddress && (
          <Typography variant="caption" color="text.secondary">IP: {ipAddress}</Typography>
        )}
      </Box>
    );
  }

  const operationType = details.operation_type as string | undefined;
  if (operationType) {
    const opLabels: Record<string, string> = { bulk_mark_used: 'Marcar como usado', bulk_cancel: 'Cancelar em massa' };
    return (
      <Typography variant="body2">
        <strong>{opLabels[operationType] || operationType}</strong>{' — '}{details.count as number} registro(s)
      </Typography>
    );
  }

  const prev = (details.previous_state || details.previous_values) as Record<string, unknown> | undefined;
  const next = (details.new_state || details.new_values) as Record<string, unknown> | undefined;
  if (prev && next) {
    const changes = diffObjects(prev, next);
    if (changes.length === 0) return <Typography variant="body2" color="text.secondary">Sem alterações visíveis</Typography>;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {changes.map(({ field, from, to }) => (
          <Box key={field} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 'fit-content' }}>{fieldLabel(field)}:</Typography>
            <Typography variant="body2" sx={{ color: 'error.main', textDecoration: 'line-through', wordBreak: 'break-word' }}>{formatValue(from)}</Typography>
            <Typography variant="body2" sx={{ mx: 0.5 }}>→</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ color: 'success.main', wordBreak: 'break-word' }}>{formatValue(to)}</Typography>
          </Box>
        ))}
      </Box>
    );
  }

  if (action === 'delete' && details.previous_state) {
    const state = details.previous_state as Record<string, unknown>;
    const summary = (state.nome || state.email || state.numero || '') as string;
    return <Typography variant="body2">Removido{summary ? `: ${summary}` : ''}</Typography>;
  }

  if (action === 'create') {
    const meaningful = Object.entries(details).filter(([k]) => !HIDDEN_FIELDS.has(k) && k !== 'path' && k !== 'user_agent');
    if (meaningful.length === 0) return <Typography variant="body2" color="text.secondary">—</Typography>;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {meaningful.slice(0, 6).map(([key, val]) => (
          <Typography key={key} variant="body2">
            <strong>{fieldLabel(key)}:</strong> {formatValue(val)}
          </Typography>
        ))}
      </Box>
    );
  }

  const raw = JSON.stringify(details);
  return <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{raw.length <= 120 ? raw : `${raw.slice(0, 120)}…`}</Typography>;
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function AdminAuditTrailPage() {
  return (
    <AdminLayout title="Auditoria">
      <AdminAuditTrailContent />
    </AdminLayout>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function AdminAuditTrailContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup }            = usePermissions();
  const canView                      = canGroup('auditoria', 'view');
  const { isDark }                   = useAdminTheme();
  const theme                        = useTheme();
  const isMobile                     = useMediaQuery(theme.breakpoints.down('md'));

  const [logs, setLogs]                           = useState<AuditLog[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [page, setPage]                           = useState(0);
  const limit                                     = 50;
  const [total, setTotal]                         = useState(0);
  const [actionFilter, setActionFilter]           = useState<string>('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('');
  const [detailLog, setDetailLog]                 = useState<AuditLog | null>(null);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    const c = new AbortController();
    loadLogs(c.signal);
    return () => c.abort();
    // loadLogs isn't memoized — including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter, resourceTypeFilter, canView]);

  function buildQuery(overrideLimit?: number, overrideSkip?: number) {
    const p = new URLSearchParams();
    p.set('skip',  String(overrideSkip  ?? page * limit));
    p.set('limit', String(overrideLimit ?? limit));
    if (actionFilter)       p.set('action_filter', actionFilter);
    if (resourceTypeFilter) p.set('resource_type_filter', resourceTypeFilter);
    return p.toString();
  }

  async function loadLogs(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/v1/admin/audit-logs?${buildQuery()}`, { signal });
      setLogs(res.data.items);
      setTotal(res.data.total);
    } catch (e) {
      if (e instanceof Error && (e.name === 'CanceledError' || e.name === 'AbortError')) return;
    } finally { setLoading(false); }
  }

  async function handleExport() {
    if (!canView) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/audit-logs?${buildQuery(10000, 0)}`, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch { /* non-critical */ }
  }

  if (!subLoading && !can('auditoria')) {
    return <UpgradePrompt feature="Auditoria" minPlan="Pro" />;
  }

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar a auditoria. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <Box>
      {/* ── Header ── */}
      <Box
        data-tour="audit-header"
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>Auditoria</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Registro de todas as ações realizadas no sistema
          </Typography>
        </Box>
        {canView && (
          <Button
            data-tour="audit-export"
            variant="outlined"
            size="small"
            startIcon={<DownloadRoundedIcon sx={{ fontSize: 17 }} />}
            onClick={handleExport}
            sx={{ flexShrink: 0 }}
          >
            Exportar CSV
          </Button>
        )}
      </Box>

      {/* ── Filters ── */}
      <Paper
        data-tour="audit-filtros"
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 3 }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Ação</InputLabel>
            <Select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0); }} label="Ação">
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="create">Criação</MenuItem>
              <MenuItem value="update">Alteração</MenuItem>
              <MenuItem value="delete">Exclusão</MenuItem>
              <MenuItem value="login">Login</MenuItem>
              <MenuItem value="logout">Logout</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Tipo de recurso</InputLabel>
            <Select value={resourceTypeFilter} onChange={(e) => { setResourceTypeFilter(e.target.value); setPage(0); }} label="Tipo de recurso">
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="User">Usuário</MenuItem>
              <MenuItem value="Ticket">Ticket</MenuItem>
              <MenuItem value="Gira">Gira</MenuItem>
              <MenuItem value="TenantConfig">Configuração</MenuItem>
              <MenuItem value="EstoqueGrupo">Grupo de Material</MenuItem>
              <MenuItem value="EstoqueItem">Item de Estoque</MenuItem>
              <MenuItem value="EstoqueMovimentacao">Movimentação de Estoque</MenuItem>
            </Select>
          </FormControl>

          {total > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* ── Table ── */}
      <Paper
        data-tour="audit-tabela"
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)' }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.5, whiteSpace: 'nowrap' }}>Data</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Usuário</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Ação</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Recurso</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', display: { xs: 'none', md: 'table-cell' } }}>Detalhes</TableCell>
                    <TableCell sx={{ display: { xs: 'table-cell', md: 'none' }, width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.length > 0 ? (
                    logs.map((log) => {
                      const palette = (ACTION_COLORS[log.action] || ACTION_COLORS.read)[isDark ? 'dark' : 'light'];
                      return (
                        <TableRow key={log.id} hover sx={{ verticalAlign: 'top' }}>
                          <TableCell sx={{ py: 1.5, whiteSpace: 'nowrap' }}>
                            <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                              {new Date(log.created_at).toLocaleDateString('pt-BR')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                              {log.user_name || 'Sistema'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Box
                              sx={{
                                display: 'inline-block',
                                px: 1.25,
                                py: 0.375,
                                borderRadius: 1.5,
                                bgcolor: palette.bg,
                                color: palette.fg,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                letterSpacing: '0.01em',
                              }}
                            >
                              {ACTION_LABELS[log.action] || log.action.toUpperCase()}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                              {RESOURCE_LABELS[log.resource_type] || log.resource_type}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5, maxWidth: 440, display: { xs: 'none', md: 'table-cell' } }}>
                            <FormatDetails action={log.action} details={log.details} />
                          </TableCell>
                          <TableCell sx={{ py: 1.5, display: { xs: 'table-cell', md: 'none' }, width: 40 }}>
                            <Tooltip title="Ver detalhes">
                              <IconButton size="small" onClick={() => setDetailLog(log)}>
                                <InfoOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        Nenhum registro encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {total > limit && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Pagination
                  count={Math.ceil(total / limit)}
                  page={page + 1}
                  onChange={(_, p) => setPage(p - 1)}
                  size="small"
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      {/* Detail Dialog — mobile */}
      <Dialog
        open={Boolean(detailLog)}
        onClose={() => setDetailLog(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Detalhes do evento</DialogTitle>
        <DialogContent dividers>
          {detailLog && <FormatDetails action={detailLog.action} details={detailLog.details} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailLog(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
