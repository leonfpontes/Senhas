/**
 * Visão da Porta - Mobile-first real-time gira queue management
 * Route: /admin/porta
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
  Divider,
  Paper,
  Stack,
  useTheme,
  useMediaQuery,
  Tooltip,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import CancelIcon from '@mui/icons-material/Cancel';
import UndoIcon from '@mui/icons-material/Undo';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AddIcon from '@mui/icons-material/Add';

const POLLING_INTERVAL_MS = 8000;
import AdminLayout from './admin_layout';
import AttendModal from '../../components/AttendModal';
import WalkInModal from '../../components/WalkInModal';
import { apiClient } from '../../services/api_client';

// ── Types ─────────────────────────────────────────────────────────────

interface MediumOption {
  id: string;
  nome: string;
  is_atendimento: boolean;
}

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
  is_active: boolean;
}

interface TenantConfig {
  enable_walk_in: boolean;
}

interface DoorStats {
  total: number;
  checked_in: number;
  awaiting: number;
  in_progress: number;
  completed: number;
  no_show: number;
  walk_in: number;
  preferenciais: number;
  patrocinados: number;
}

interface QueueItem {
  id: string;
  numero: number;
  status: string;
  consulente_nome: string | null;
  consulente_email?: string | null;
  consulente_telefone: string | null;
  preferencial: boolean;
  is_sponsor: boolean;
  is_walk_in: boolean;
  numero_formatado: string;
  checkin_em: string | null;
  atendido_em: string | null;
  chamado_em: string | null;
  finalizado_em: string | null;
  medium_nome: string | null;
  cambone_nome: string | null;
  atendimento_descricao: string | null;
}

// ── Helper ────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  emitted: 'Emitido',
  called: 'Em Atendimento',
  completed: 'Atendido',
  cancelled: 'Cancelado',
  no_show: 'Não Compareceu',
};

const statusColor: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  emitted: 'default',
  called: 'info',
  completed: 'success',
  cancelled: 'error',
  no_show: 'warning',
};

// ── Component ─────────────────────────────────────────────────────────

export default function PortaPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State
  const [giras, setGiras] = useState<Gira[]>([]);
  const [selectedGiraId, setSelectedGiraId] = useState<string>('');
  const [stats, setStats] = useState<DoorStats | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [config, setConfig] = useState<TenantConfig | null>(null);

  // Medium/cambone autocomplete options (fetched once on mount)
  const [mediumOptions, setMediumOptions] = useState<MediumOption[]>([]);
  const [camboneOptions, setCamboneOptions] = useState<MediumOption[]>([]);

  // Attend modal
  const [attendTarget, setAttendTarget] = useState<QueueItem | null>(null);

  // Edit attendance modal
  const [editTarget, setEditTarget] = useState<QueueItem | null>(null);
  const [walkInCreateOpen, setWalkInCreateOpen] = useState(false);
  const [walkInEditTarget, setWalkInEditTarget] = useState<QueueItem | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  // ── Data fetching ─────────────────────────────────────────────────

  const loadGiras = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res.data) ? res.data : res.data.items || [];

      // Exibir apenas giras que ainda não aconteceram ou que aconteceram há ≤ 1 dia
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const data = all.filter((g) => new Date(g.data_inicio) >= cutoff);

      setGiras(data);
      // Auto-select first active gira
      if (data.length > 0 && !selectedGiraId) {
        const active = data.find((g: Gira) => g.is_active);
        setSelectedGiraId(active?.id || data[0].id);
      }
    } catch {
      showSnackbar('Erro ao carregar giras', 'error');
    }
  };

  const loadConfig = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/tenant/config');
      setConfig(res.data);
    } catch {
      showSnackbar('Erro ao carregar configuração do tenant', 'error');
    }
  };

  const loadMediunOptions = async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options?only_atendimento=true'),
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options'),
      ]);
      setMediumOptions(Array.isArray(mRes.data) ? mRes.data : []);
      setCamboneOptions(Array.isArray(cRes.data) ? cRes.data : []);
    } catch {
      // silent — optional feature
    }
  };

  const loadStats = useCallback(async () => {
    if (!selectedGiraId) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/stats`);
      setStats(res.data);
    } catch {
      // silent — will retry on next refresh
    }
  }, [selectedGiraId]);

  const loadQueue = useCallback(async () => {
    if (!selectedGiraId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/queue`, { params });
      setQueue(res.data.items || []);
    } catch (err) {
      console.error('[Porta] Erro ao carregar fila:', err);
      showSnackbar('Erro ao carregar fila', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedGiraId, search]);

  const refreshAll = useCallback(() => {
    loadStats();
    loadQueue();
  }, [loadStats, loadQueue]);

  // ── Effects ───────────────────────────────────────────────────────

  useEffect(() => {
    loadGiras();
    loadConfig();
    loadMediunOptions();
  }, []);

  useEffect(() => {
    if (selectedGiraId) {
      refreshAll();
    }
  }, [selectedGiraId, refreshAll]);

  // ── Polling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGiraId) return;
    const timer = setInterval(refreshAll, POLLING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [selectedGiraId, refreshAll]);

  // ── Actions ───────────────────────────────────────────────────────

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const doAction = async (
    url: string,
    method: 'patch' | 'delete',
    ticketId: string,
    body?: any,
    successMsg?: string,
  ) => {
    try {
      setActionLoading(ticketId);
      if (method === 'patch') {
        await apiClient.patch(url, body);
      } else {
        await apiClient.delete(url);
      }
      showSnackbar(successMsg || 'Ação realizada', 'success');
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || 'Erro ao realizar ação';
      showSnackbar(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckin = (id: string) =>
    doAction(`/api/v1/admin/door/tickets/${id}/checkin`, 'patch', id, undefined, 'Check-in realizado');

  const handleUndoCheckin = (id: string) =>
    doAction(`/api/v1/admin/door/tickets/${id}/checkin`, 'delete', id, undefined, 'Check-in desfeito');

  const handleAttendConfirm = (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => {
    if (!attendTarget) return;
    doAction(
      `/api/v1/admin/door/tickets/${attendTarget.id}/attend`,
      'patch',
      attendTarget.id,
      data,
      'Atendimento concluído',
    );
    setAttendTarget(null);
  };

  const handleEditAttendInfo = (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => {
    if (!editTarget) return;
    doAction(
      `/api/v1/admin/door/tickets/${editTarget.id}/attend-info`,
      'patch',
      editTarget.id,
      data,
      'Informações atualizadas',
    );
    setEditTarget(null);
  };

  const handleNoShow = (id: string) =>
    doAction(`/api/v1/admin/door/tickets/${id}/no-show`, 'patch', id, undefined, 'Marcado como não compareceu');

  const handleUndo = (id: string) =>
    doAction(`/api/v1/admin/door/tickets/${id}/undo`, 'patch', id, undefined, 'Ação desfeita');

  const handleCreateWalkIn = async (data: { nome: string; email?: string; telefone?: string; preferencial: boolean }) => {
    if (!selectedGiraId) return;
    try {
      setActionLoading('__walkin_create__');
      const res = await apiClient.post(`/api/v1/admin/giras/${selectedGiraId}/door/walk-in`, data);
      showSnackbar(`Walk-in ${res.data.numero_formatado} criado com sucesso`, 'success');
      setWalkInCreateOpen(false);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Erro ao criar walk-in';
      showSnackbar(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditWalkIn = async (data: { nome: string; email?: string; telefone?: string; preferencial: boolean }) => {
    if (!walkInEditTarget) return;
    try {
      setActionLoading(walkInEditTarget.id);
      await apiClient.patch(`/api/v1/admin/door/tickets/${walkInEditTarget.id}/walk-in`, data);
      showSnackbar('Walk-in atualizado com sucesso', 'success');
      setWalkInEditTarget(null);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Erro ao editar walk-in';
      showSnackbar(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedGiraId) loadQueue();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Derived data ──────────────────────────────────────────────────

  // Find next-in-line: first checked-in EMITTED ticket
  const nextInLine = queue.find((t) => t.status === 'emitted' && t.checkin_em);

  // Group queue by status
  const waitingQueue = queue.filter((t) => t.status === 'emitted');
  const inProgressQueue = queue.filter((t) => t.status === 'called');
  const doneQueue = queue.filter((t) => t.status === 'completed' || t.status === 'no_show' || t.status === 'cancelled');

  // ── Render ────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Visão da Porta" maxWidth="md">
      <Box sx={{ pb: 4 }}>
        {/* Header: Gira selector + connection status */}
        <Box data-tour="porta-header" sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl data-tour="porta-gira-select" size="small" sx={{ minWidth: 250 }}>
            <InputLabel>Gira</InputLabel>
            <Select
              value={selectedGiraId}
              onChange={(e) => setSelectedGiraId(e.target.value)}
              label="Gira"
            >
              {giras.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.nome} {!g.is_active && '(inativa)'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Atualização automática a cada 8 segundos">
            <Box data-tour="porta-ws-status" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FiberManualRecordIcon
                sx={{ fontSize: 12, color: 'info.main' }}
              />
              <Typography variant="caption" color="text.secondary">
                Auto
              </Typography>
            </Box>
          </Tooltip>
        </Box>

        {/* Big Numbers */}
        {stats && (
          <Box
            data-tour="porta-stats"
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(3, 1fr)',
                sm: 'repeat(6, 1fr)',
              },
              gap: 1.5,
              mb: 3,
            }}
          >
            <StatCard label="Total" value={stats.total} color={theme.palette.text.primary} />
            <StatCard label="Atendidos" value={stats.completed} color={theme.palette.success.main} />
            <StatCard label="Ausentes" value={stats.no_show} color={theme.palette.error.main} />
            <StatCard label="Walk-in" value={stats.walk_in} color="#0ea5e9" />
            <StatCard label="Preferenciais" value={stats.preferenciais} color={theme.palette.warning.main} />
            <StatCard label="Check-in" value={stats.checked_in} color="#8b5cf6" />
          </Box>
        )}

        {/* Search */}
        <TextField
          data-tour="porta-busca"
          placeholder="Buscar por nome..."
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {selectedGiraId && config?.enable_walk_in && (
          <Button
            data-tour="porta-walkin"
            variant="contained"
            fullWidth
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setWalkInCreateOpen(true)}
            sx={{ mb: 3, py: 0.75 }}
          >
            Incluir Walk-in
          </Button>
        )}

        {loading && !queue.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !selectedGiraId ? (
          <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
            Selecione uma gira para ver a fila
          </Typography>
        ) : (
          <>
            {/* Next in line highlight */}
            {nextInLine && (
              <Paper
                elevation={3}
                sx={{
                  p: 2,
                  mb: 3,
                  border: 2,
                  borderColor: 'primary.main',
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${theme.palette.primary.light}15, ${theme.palette.primary.main}10)`,
                }}
              >
                <Typography variant="overline" color="primary.main" fontWeight={700}>
                  Próximo na Fila
                </Typography>
                <Box sx={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 2, mt: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h4" fontWeight={800} color={nextInLine.is_sponsor ? '#b8860b' : 'primary.main'}>
                      {nextInLine.numero_formatado || `#${nextInLine.numero}`}
                    </Typography>
                    {nextInLine.is_sponsor && (
                      <Chip icon={<StarIcon />} label="Associado" size="small" sx={{ bgcolor: '#fef9e7', color: '#b8860b', '& .MuiChip-icon': { color: '#daa520' } }} />
                    )}
                    {nextInLine.is_walk_in && (
                      <Chip label="Walk-in" size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1' }} />
                    )}
                    {nextInLine.preferencial && (
                      <Chip icon={<StarIcon />} label="Preferencial" color="warning" size="small" />
                    )}
                  </Box>
                  <Box>
                    <Typography variant={isMobile ? 'body1' : 'h6'} fontWeight={600}>
                      {nextInLine.consulente_nome || '—'}
                    </Typography>
                    {nextInLine.consulente_telefone && (
                      <Typography variant="body2" color="text.secondary">
                        {nextInLine.consulente_telefone}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonIcon />}
                    onClick={() => setAttendTarget(nextInLine)}
                    disabled={actionLoading === nextInLine.id}
                  >
                    Atender
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => handleNoShow(nextInLine.id)}
                    disabled={actionLoading === nextInLine.id}
                  >
                    Não Compareceu
                  </Button>
                </Box>
              </Paper>
            )}

            {/* In Progress Section */}
            {inProgressQueue.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  Em Atendimento ({inProgressQueue.length})
                </Typography>
                <Stack spacing={1}>
                  {inProgressQueue.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      isNext={false}
                      isMobile={isMobile}
                      actionLoading={actionLoading}
                      onNoShow={handleNoShow}
                      onUndo={handleUndo}
                      onEditWalkIn={(t) => setWalkInEditTarget(t)}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Waiting Queue */}
            <Box data-tour="porta-fila" sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Fila de Espera ({waitingQueue.length})
              </Typography>
              {waitingQueue.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
                  Nenhum consulente na fila
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {waitingQueue.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      isNext={nextInLine?.id === item.id}
                      isMobile={isMobile}
                      actionLoading={actionLoading}
                      onCheckin={handleCheckin}
                      onUndoCheckin={handleUndoCheckin}
                      onAttend={(t) => setAttendTarget(t)}
                      onNoShow={handleNoShow}
                      onUndo={handleUndo}
                      onEditWalkIn={(t) => setWalkInEditTarget(t)}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Done Section (collapsed) */}
            {doneQueue.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, color: 'text.secondary' }}>
                  Finalizados ({doneQueue.length})
                </Typography>
                <Stack spacing={1}>
                  {doneQueue.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      isNext={false}
                      isMobile={isMobile}
                      actionLoading={actionLoading}
                      onUndo={handleUndo}
                      onEditAttend={(t) => setEditTarget(t)}
                      onEditWalkIn={(t) => setWalkInEditTarget(t)}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Attend Modal */}
      <AttendModal
        open={!!attendTarget}
        ticketNumero={attendTarget?.numero || 0}
        consulenteNome={attendTarget?.consulente_nome || '—'}
        onConfirm={handleAttendConfirm}
        onClose={() => setAttendTarget(null)}
        loading={actionLoading === attendTarget?.id}
        mediumOptions={mediumOptions}
        camboneOptions={camboneOptions}
      />

      {/* Edit Attendance Modal */}
      <AttendModal
        open={!!editTarget}
        ticketNumero={editTarget?.numero || 0}
        consulenteNome={editTarget?.consulente_nome || '—'}
        onConfirm={handleEditAttendInfo}
        onClose={() => setEditTarget(null)}
        loading={actionLoading === editTarget?.id}
        editMode
        mediumOptions={mediumOptions}
        camboneOptions={camboneOptions}
        initialValues={{
          medium_nome: editTarget?.medium_nome || '',
          cambone_nome: editTarget?.cambone_nome || '',
          atendimento_descricao: editTarget?.atendimento_descricao || '',
        }}
      />

      <WalkInModal
        open={walkInCreateOpen}
        onClose={() => setWalkInCreateOpen(false)}
        onConfirm={handleCreateWalkIn}
        loading={actionLoading === '__walkin_create__'}
      />

      <WalkInModal
        open={!!walkInEditTarget}
        mode="edit"
        ticketNumero={walkInEditTarget?.numero_formatado}
        initialValues={{
          nome: walkInEditTarget?.consulente_nome || '',
          email: walkInEditTarget?.consulente_email || '',
          telefone: walkInEditTarget?.consulente_telefone || '',
          preferencial: walkInEditTarget?.preferencial || false,
        }}
        onConfirm={handleEditWalkIn}
        onClose={() => setWalkInEditTarget(null)}
        loading={actionLoading === walkInEditTarget?.id}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        textAlign: 'center',
        borderRadius: 2,
      }}
    >
      <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={500}>
        {label}
      </Typography>
    </Paper>
  );
}

interface QueueCardProps {
  item: QueueItem;
  isNext: boolean;
  isMobile: boolean;
  actionLoading: string | null;
  onCheckin?: (id: string) => void;
  onUndoCheckin?: (id: string) => void;
  onAttend?: (item: QueueItem) => void;
  onComplete?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onUndo?: (id: string) => void;
  onEditAttend?: (item: QueueItem) => void;
  onEditWalkIn?: (item: QueueItem) => void;
}

/* ── Action Buttons (shared between mobile and desktop) ────────────── */

function ActionButtons({
  item,
  isLoading,
  size = 'small',
  variant = 'icon',
  onCheckin,
  onUndoCheckin,
  onAttend,
  onComplete,
  onNoShow,
  onUndo,
  onEditAttend,
  onEditWalkIn,
}: {
  item: QueueItem;
  isLoading: boolean;
  size?: 'small' | 'medium';
  variant?: 'icon' | 'button';
  onCheckin?: (id: string) => void;
  onUndoCheckin?: (id: string) => void;
  onAttend?: (item: QueueItem) => void;
  onComplete?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onUndo?: (id: string) => void;
  onEditAttend?: (item: QueueItem) => void;
  onEditWalkIn?: (item: QueueItem) => void;
}) {
  const isDone = item.status === 'completed' || item.status === 'no_show' || item.status === 'cancelled';
  const isInProgress = item.status === 'called';
  const isEmitted = item.status === 'emitted';
  const hasCheckin = !!item.checkin_em;

  if (variant === 'button') {
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {isEmitted && !hasCheckin && onCheckin && (
          <Button size={size} variant="outlined" color="info" startIcon={<LoginIcon />} onClick={() => onCheckin(item.id)} disabled={isLoading}>
            Check-in
          </Button>
        )}
        {isEmitted && hasCheckin && onUndoCheckin && (
          <Button size={size} variant="outlined" color="inherit" startIcon={<LogoutIcon />} onClick={() => onUndoCheckin(item.id)} disabled={isLoading}>
            Desfazer Check-in
          </Button>
        )}
        {isEmitted && hasCheckin && onAttend && (
          <Button size={size} variant="contained" color="primary" startIcon={<PersonIcon />} onClick={() => onAttend(item)} disabled={isLoading}>
            Atender
          </Button>
        )}
        {isEmitted && onNoShow && (
          <Button size={size} variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => onNoShow(item.id)} disabled={isLoading}>
            Ausente
          </Button>
        )}
        {isInProgress && onComplete && (
          <Button size={size} variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => onComplete(item.id)} disabled={isLoading}>
            Concluir
          </Button>
        )}
        {isInProgress && onNoShow && (
          <Button size={size} variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => onNoShow(item.id)} disabled={isLoading}>
            Ausente
          </Button>
        )}
        {(isDone || isInProgress) && onUndo && (
          <Button size={size} variant="outlined" color="inherit" startIcon={<UndoIcon />} onClick={() => onUndo(item.id)} disabled={isLoading}>
            Desfazer
          </Button>
        )}
        {isDone && item.status === 'completed' && onEditAttend && (
          <Button size={size} variant="outlined" color="primary" startIcon={<EditIcon />} onClick={() => onEditAttend(item)} disabled={isLoading}>
            Editar
          </Button>
        )}
        {item.is_walk_in && onEditWalkIn && (
          <Button size={size} variant="outlined" color="info" startIcon={<EditIcon />} onClick={() => onEditWalkIn(item)} disabled={isLoading}>
            Editar Walk-in
          </Button>
        )}
      </Box>
    );
  }

  // Icon variant (desktop)
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      {isEmitted && !hasCheckin && onCheckin && (
        <Tooltip title="Check-in (chegou)">
          <IconButton size={size} color="info" onClick={() => onCheckin(item.id)} disabled={isLoading}>
            <LoginIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && hasCheckin && onUndoCheckin && (
        <Tooltip title="Desfazer check-in">
          <IconButton size={size} color="default" onClick={() => onUndoCheckin(item.id)} disabled={isLoading}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && hasCheckin && onAttend && (
        <Tooltip title="Iniciar atendimento">
          <IconButton size={size} color="primary" onClick={() => onAttend(item)} disabled={isLoading}>
            <PersonIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && onNoShow && (
        <Tooltip title="Não compareceu">
          <IconButton size={size} color="error" onClick={() => onNoShow(item.id)} disabled={isLoading}>
            <CancelIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isInProgress && onComplete && (
        <Tooltip title="Concluir atendimento">
          <IconButton size={size} color="success" onClick={() => onComplete(item.id)} disabled={isLoading}>
            <CheckCircleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isInProgress && onNoShow && (
        <Tooltip title="Não compareceu">
          <IconButton size={size} color="error" onClick={() => onNoShow(item.id)} disabled={isLoading}>
            <CancelIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {(isDone || isInProgress) && onUndo && (
        <Tooltip title="Desfazer (reverter para emitido)">
          <IconButton size={size} color="default" onClick={() => onUndo(item.id)} disabled={isLoading}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isDone && item.status === 'completed' && onEditAttend && (
        <Tooltip title="Editar informações do atendimento">
          <IconButton size={size} color="primary" onClick={() => onEditAttend(item)} disabled={isLoading}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {item.is_walk_in && onEditWalkIn && (
        <Tooltip title="Editar dados do Walk-in">
          <IconButton size={size} color="info" onClick={() => onEditWalkIn(item)} disabled={isLoading}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

/* ── QueueCard ─────────────────────────────────────────────────────── */

function QueueCard({
  item,
  isNext,
  isMobile,
  actionLoading,
  onCheckin,
  onUndoCheckin,
  onAttend,
  onComplete,
  onNoShow,
  onUndo,
  onEditAttend,
  onEditWalkIn,
}: QueueCardProps) {
  const isLoading = actionLoading === item.id;
  const isDone = item.status === 'completed' || item.status === 'no_show' || item.status === 'cancelled';
  const isInProgress = item.status === 'called';
  const isEmitted = item.status === 'emitted';
  const hasCheckin = !!item.checkin_em;

  /* ── Mobile: stacked vertical layout showing all info ── */
  if (isMobile) {
    return (
      <Card
        variant="outlined"
        sx={{
          opacity: isDone ? 0.6 : 1,
          borderLeft: isNext ? 4 : 1,
          borderLeftColor: isNext ? 'primary.main' : 'divider',
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {/* Row 1: Number + Status chip */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" fontWeight={800} color={isDone ? 'text.disabled' : (item.is_sponsor ? '#b8860b' : 'text.primary')}>
                {item.numero_formatado || `#${item.numero}`}
              </Typography>
              {item.is_sponsor && (
                <Chip icon={<StarIcon />} label="Associado" size="small" sx={{ bgcolor: '#fef9e7', color: '#b8860b', '& .MuiChip-icon': { color: '#daa520' } }} />
              )}
              {item.is_walk_in && (
                <Chip label="Walk-in" size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1' }} />
              )}
              {item.preferencial && (
                <Chip icon={<StarIcon />} label="Preferencial" color="warning" size="small" />
              )}
              {hasCheckin && isEmitted && (
                <Chip label="✓ Presente" size="small" color="info" variant="outlined" sx={{ height: 22 }} />
              )}
            </Box>
            <Chip
              label={statusLabel[item.status] || item.status}
              color={statusColor[item.status] || 'default'}
              size="small"
              variant={isDone ? 'outlined' : 'filled'}
            />
          </Box>

          {/* Row 2: Full name */}
          <Typography
            variant="body1"
            fontWeight={600}
            sx={{ color: isDone ? 'text.disabled' : 'text.primary', mb: 0.5 }}
          >
            {item.consulente_nome || '—'}
          </Typography>

          {/* Row 3: Phone */}
          {item.consulente_telefone && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {item.consulente_telefone}
            </Typography>
          )}

          {/* Row 4: Medium / Cambone info */}
          {isInProgress && item.medium_nome && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Médium: {item.medium_nome}
              {item.cambone_nome && ` · Cambone: ${item.cambone_nome}`}
            </Typography>
          )}
          {isDone && item.medium_nome && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {item.medium_nome}
              {item.cambone_nome && ` · ${item.cambone_nome}`}
            </Typography>
          )}

          {/* Row 5: Action buttons — full-width labeled buttons */}
          <Box sx={{ mt: 1.5 }}>
            <ActionButtons
              item={item}
              isLoading={isLoading}
              size="small"
              variant="button"
              onCheckin={onCheckin}
              onUndoCheckin={onUndoCheckin}
              onAttend={onAttend}
              onComplete={onComplete}
              onNoShow={onNoShow}
              onUndo={onUndo}
              onEditAttend={onEditAttend}
              onEditWalkIn={onEditWalkIn}
            />
          </Box>
        </CardContent>
      </Card>
    );
  }

  /* ── Desktop: compact single-row layout (unchanged) ── */
  return (
    <Card
      variant="outlined"
      sx={{
        opacity: isDone ? 0.6 : 1,
        borderLeft: isNext ? 4 : 1,
        borderLeftColor: isNext ? 'primary.main' : 'divider',
      }}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Number */}
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ minWidth: 48, color: isDone ? 'text.disabled' : 'text.primary' }}
          >
            {item.numero_formatado || `#${item.numero}`}
          </Typography>

          {/* Info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body1" fontWeight={600} noWrap sx={{ color: isDone ? 'text.disabled' : 'text.primary' }}>
                {item.consulente_nome || '—'}
              </Typography>
              {item.is_sponsor && <StarIcon sx={{ fontSize: 16, color: '#daa520' }} />}
              {item.is_walk_in && <Chip label="Walk-in" size="small" sx={{ height: 20, bgcolor: '#e0f2fe', color: '#0369a1' }} />}
              {item.preferencial && <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
              {hasCheckin && isEmitted && (
                <Chip label="✓ Presente" size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
            </Box>
            {item.consulente_telefone && (
              <Typography variant="caption" color="text.secondary">
                {item.consulente_telefone}
              </Typography>
            )}
            {isInProgress && item.medium_nome && (
              <Typography variant="caption" color="text.secondary" display="block">
                Médium: {item.medium_nome}
                {item.cambone_nome && ` · Cambone: ${item.cambone_nome}`}
              </Typography>
            )}
            {isDone && (
              <Typography variant="caption" color="text.secondary">
                {statusLabel[item.status] || item.status}
                {item.medium_nome && ` · ${item.medium_nome}`}
              </Typography>
            )}
          </Box>

          {/* Status chip */}
          <Chip
            label={statusLabel[item.status] || item.status}
            color={statusColor[item.status] || 'default'}
            size="small"
            variant={isDone ? 'outlined' : 'filled'}
          />

          {/* Actions */}
          <ActionButtons
            item={item}
            isLoading={isLoading}
            size="small"
            variant="icon"
            onCheckin={onCheckin}
            onUndoCheckin={onUndoCheckin}
            onAttend={onAttend}
            onComplete={onComplete}
            onNoShow={onNoShow}
            onUndo={onUndo}
            onEditAttend={onEditAttend}
            onEditWalkIn={onEditWalkIn}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
