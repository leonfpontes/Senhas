/**
 * T076: Admin Audit Trail Page - Audit log viewer, filter, export
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Typography,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/GetApp';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import UpgradePrompt from '../../components/UpgradePrompt';
import { apiClient } from '../../services/api_client';

// ─── Types ────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  user_name?: string;
  details?: Record<string, any>;
  created_at: string;
}

// ─── Translation maps ────────────────────────────────────

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

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  create: { bg: '#c8e6c9', fg: '#2e7d32' },
  delete: { bg: '#ffcdd2', fg: '#c62828' },
  update: { bg: '#fff9c4', fg: '#f57f17' },
  login: { bg: '#bbdefb', fg: '#1565c0' },
  logout: { bg: '#e1bee7', fg: '#6a1b9a' },
  read: { bg: '#e0e0e0', fg: '#424242' },
  token_refresh: { bg: '#e0e0e0', fg: '#424242' },
};

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  email: 'Email',
  full_name: 'Nome completo',
  username: 'Usuário',
  phone: 'Telefone',
  is_active: 'Ativo',
  data_inicio: 'Data de início',
  data_fim: 'Data de fim',
  endereco: 'Endereço',
  primary_color: 'Cor primária',
  secondary_color: 'Cor secundária',
  font_color: 'Cor da fonte',
  max_giras_per_month: 'Máx. giras/mês',
  max_tickets_per_gira: 'Máx. tickets/gira',
  enable_walk_in: 'Walk-in habilitado',
  enable_sponsors: 'Patrocinadores habilitados',
  validate_associado_on_emit: 'Validar associado na emissão',
  enable_estoque_log: 'Log de estoque ativado',
  walk_in_limit: 'Limite walk-in',
  slug: 'Slug',
  role: 'Papel',
  password_hash: 'Senha',
  status: 'Status',
  tipo: 'Tipo',
  consulente_nome: 'Nome do consulente',
  consulente_email: 'Email do consulente',
  consulente_telefone: 'Telefone do consulente',
  is_sponsor: 'É associado',
  numero: 'Número',
  gira_id: 'Gira',
  plan: 'Plano',
  success: 'Sucesso',
  ip_address: 'Endereço IP',
  timestamp: 'Data/hora',
  path: 'Rota',
  user_agent: 'Navegador',
  impersonated_by: 'Impersonado por',
  method: 'Método',
  max_tickets: 'Máx. tickets',
  release_start_at: 'Liberação início',
  release_end_at: 'Liberação fim',
  error: 'Erro',
  operation_type: 'Tipo de operação',
  count: 'Quantidade',
  resource_ids: 'IDs afetados',
  config_type: 'Tipo de config.',
};

// ─── Detail formatting ──────────────────────────────────

const HIDDEN_FIELDS = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at',
  'password_hash', 'profile_photo_data', 'profile_photo_url',
  'profile_photo_content_type', 'user_agent', 'path', 'method',
]);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (Array.isArray(val)) return `${val.length} item(ns)`;
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val);
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; }
  }
  return s;
}

function diffObjects(prev: Record<string, any>, next: Record<string, any>): Array<{ field: string; from: any; to: any }> {
  const changes: Array<{ field: string; from: any; to: any }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const a = JSON.stringify(prev[key] ?? null);
    const b = JSON.stringify(next[key] ?? null);
    if (a !== b) {
      changes.push({ field: key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

function FormatDetails({ action, details }: { action: string; details?: Record<string, any> }) {
  if (!details) return <Typography variant="body2" color="text.secondary">—</Typography>;

  // LOGIN
  if (action === 'login' || action === 'logout') {
    const success = details.success !== false;
    return (
      <Typography variant="body2">
        {action === 'login' ? 'Login' : 'Logout'}{' '}
        <Chip
          label={success ? 'sucesso' : 'falha'}
          size="small"
          color={success ? 'success' : 'error'}
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
        {details.ip_address && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            IP: {details.ip_address}
          </Typography>
        )}
      </Typography>
    );
  }

  // BULK
  if (details.operation_type) {
    const opLabels: Record<string, string> = {
      bulk_mark_used: 'Marcar como usado',
      bulk_cancel: 'Cancelar em massa',
    };
    return (
      <Typography variant="body2">
        <strong>{opLabels[details.operation_type] || details.operation_type}</strong>
        {' — '}{details.count} registro(s)
      </Typography>
    );
  }

  // UPDATE — state diff
  const prev = details.previous_state || details.previous_values;
  const next = details.new_state || details.new_values;
  if (prev && next) {
    const changes = diffObjects(prev, next);
    if (changes.length === 0) {
      return <Typography variant="body2" color="text.secondary">Sem alterações visíveis</Typography>;
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {changes.map(({ field, from, to }) => (
          <Box key={field} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 'fit-content' }}>
              {fieldLabel(field)}:
            </Typography>
            <Typography variant="body2" component="span" sx={{ color: '#c62828', textDecoration: 'line-through', wordBreak: 'break-word' }}>
              {formatValue(from)}
            </Typography>
            <Typography variant="body2" component="span" sx={{ mx: 0.5 }}>→</Typography>
            <Typography variant="body2" component="span" sx={{ color: '#2e7d32', fontWeight: 600, wordBreak: 'break-word' }}>
              {formatValue(to)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }

  // DELETE — previous state summary
  if (action === 'delete' && details.previous_state) {
    const state = details.previous_state;
    const summary = state.nome || state.email || state.numero || '';
    return (
      <Typography variant="body2">
        Removido{summary ? `: ${summary}` : ''}
      </Typography>
    );
  }

  // CREATE — show key fields
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

  // Fallback — show raw but truncated
  const raw = JSON.stringify(details);
  if (raw.length <= 120) {
    return <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{raw}</Typography>;
  }
  return <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{raw.slice(0, 120)}…</Typography>;
}

// ─── Page wrapper ────────────────────────────────────────

export default function AdminAuditTrailPage() {
  return (
    <AdminLayout title="Auditoria">
      <AdminAuditTrailContent />
    </AdminLayout>
  );
}

// ─── Page content ────────────────────────────────────────

function AdminAuditTrailContent() {
  const { can, loading: subLoading } = useSubscription();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('');
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadAuditLogs(controller.signal);
    return () => controller.abort();
  }, [page, actionFilter, resourceTypeFilter]);

  const buildQueryString = (overrideLimit?: number, overrideSkip?: number) => {
    const params = new URLSearchParams();
    params.set('skip', String(overrideSkip ?? page * limit));
    params.set('limit', String(overrideLimit ?? limit));
    if (actionFilter) params.set('action_filter', actionFilter);
    if (resourceTypeFilter) params.set('resource_type_filter', resourceTypeFilter);
    return params.toString();
  };

  const loadAuditLogs = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/v1/admin/audit-logs?${buildQueryString()}`, { signal });
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch (error: any) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') return;
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await apiClient.get(
        `/api/v1/admin/audit-logs?${buildQueryString(10000, 0)}`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error('Error exporting logs:', error);
    }
  };

  return (
    <>
      {!subLoading && !can('auditoria') ? (
        <UpgradePrompt feature="Auditoria" minPlan="Pro" />
      ) : (
      <>
      <Box data-tour="audit-header" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Auditoria</Typography>
      </Box>
      <Box data-tour="audit-filtros" sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 2 }, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 150 } }} size="small">
          <InputLabel>Ação</InputLabel>
          <Select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            label="Ação"
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="create">Criação</MenuItem>
            <MenuItem value="update">Alteração</MenuItem>
            <MenuItem value="delete">Exclusão</MenuItem>
            <MenuItem value="login">Login</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: { xs: '100%', sm: 180 } }} size="small">
          <InputLabel>Tipo de Recurso</InputLabel>
          <Select
            value={resourceTypeFilter}
            onChange={(e) => { setResourceTypeFilter(e.target.value); setPage(0); }}
            label="Tipo de Recurso"
          >
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

        <Button
          data-tour="audit-export"
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
        >
          Exportar
        </Button>
      </Box>

      <TableContainer data-tour="audit-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table size="small">
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Data</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Usuário</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Ação</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Recurso</TableCell>
                  <TableCell sx={{ fontWeight: 700, display: { xs: 'none', md: 'table-cell' } }}>Detalhes</TableCell>
                  <TableCell sx={{ fontWeight: 700, display: { xs: 'table-cell', md: 'none' }, width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length > 0 ? (
                  logs.map((log) => {
                    const colors = ACTION_COLORS[log.action] || ACTION_COLORS.read;
                    return (
                      <TableRow key={log.id} sx={{ verticalAlign: 'top', '&:hover': { backgroundColor: '#fafafa' } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 1.5 }}>
                          <Typography variant="body2">
                            {new Date(log.created_at).toLocaleDateString('pt-BR')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <Typography variant="body2">
                            {log.user_name || 'Sistema'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <Box
                            sx={{
                              display: 'inline-block',
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 1,
                              backgroundColor: colors.bg,
                              color: colors.fg,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {ACTION_LABELS[log.action] || log.action.toUpperCase()}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <Typography variant="body2">
                            {RESOURCE_LABELS[log.resource_type] || log.resource_type}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, maxWidth: 450, display: { xs: 'none', md: 'table-cell' } }}>
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
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        Nenhum log encontrado
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {total > limit && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination
                  count={Math.ceil(total / limit)}
                  page={page + 1}
                  onChange={(_, p) => setPage(p - 1)}
                />
              </Box>
            )}
          </>
        )}
      </TableContainer>
      </>
      )}

      {/* Detail Dialog — mobile */}
      <Dialog
        open={Boolean(detailLog)}
        onClose={() => setDetailLog(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
      >
        <DialogTitle>Detalhes do Evento</DialogTitle>
        <DialogContent dividers>
          {detailLog && <FormatDetails action={detailLog.action} details={detailLog.details} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailLog(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
