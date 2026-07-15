/**
 * Visão da Porta — Mobile-first real-time gira queue management
 * Route: /admin/porta
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import TvRoundedIcon from '@mui/icons-material/TvRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';

import AdminLayout from './admin_layout';
import AttendModal from '../../components/AttendModal';
import WalkInModal from '../../components/WalkInModal';
import { apiClient, extractApiErrorMessage } from '../../services/api_client';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PRIORITY_CATEGORY_LABELS,
  PriorityCategoryType,
} from 'shared-types';

const POLLING_INTERVAL_MS = 8000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediumOption { id: string; nome: string; is_atendimento: boolean; }
interface Gira         { id: string; nome: string; data_inicio: string; is_active: boolean; }
interface TenantConfig { enable_walk_in: boolean; }

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
  priority_category?: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function priorityLabel(item: QueueItem): string {
  if (!item.priority_category) return 'Preferencial';
  return PRIORITY_CATEGORY_LABELS[item.priority_category as PriorityCategoryType] ?? 'Preferencial';
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, color, accent }: { label: string; value: number; color?: string; accent?: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 1.5,
        px: 0.5,
        position: 'relative',
        overflow: 'hidden',
        '&::after': accent
          ? { content: '""', position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 3, borderRadius: '3px 3px 0 0', bgcolor: accent }
          : {},
      }}
    >
      <Typography
        sx={{
          fontSize: '1.5rem',
          fontWeight: 800,
          lineHeight: 1,
          color: color || 'text.primary',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.65rem',
          fontWeight: 500,
          color: 'text.secondary',
          mt: 0.25,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// ── Tag chips (dark-mode aware) ───────────────────────────────────────────────

function SponsorChip({ isDark }: { isDark: boolean }) {
  return (
    <Chip
      icon={<StarRoundedIcon sx={{ fontSize: '14px !important', color: isDark ? '#fbbf24 !important' : '#d97706 !important' }} />}
      label="Associado"
      size="small"
      sx={{
        height: 22, fontSize: '0.68rem', fontWeight: 700,
        bgcolor: isDark ? '#451a03' : '#fef3c7',
        color: isDark ? '#fbbf24' : '#92400e',
      }}
    />
  );
}

function WalkInChip({ isDark }: { isDark: boolean }) {
  return (
    <Chip
      label="Walk-in"
      size="small"
      sx={{
        height: 22, fontSize: '0.68rem', fontWeight: 700,
        bgcolor: isDark ? '#0c4a6e' : '#e0f2fe',
        color: isDark ? '#7dd3fc' : '#0369a1',
      }}
    />
  );
}

function PresentChip() {
  return (
    <Chip
      label="✓ Presente"
      size="small"
      color="success"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700 }}
    />
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

interface ActionBtnProps {
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
}

function ActionButtons({
  item, isLoading, size = 'small', variant = 'icon',
  onCheckin, onUndoCheckin, onAttend, onComplete, onNoShow, onUndo, onEditAttend, onEditWalkIn,
}: ActionBtnProps) {
  const isDone       = item.status === 'completed' || item.status === 'no_show' || item.status === 'cancelled';
  const isInProgress = item.status === 'called';
  const isEmitted    = item.status === 'emitted';
  const hasCheckin   = !!item.checkin_em;

  if (variant === 'button') {
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {isEmitted && !hasCheckin && onCheckin && (
          <Button size={size} variant="outlined" color="info" startIcon={<LoginRoundedIcon />} onClick={() => onCheckin(item.id)} disabled={isLoading}>
            Check-in
          </Button>
        )}
        {isEmitted && hasCheckin && onUndoCheckin && (
          <Button size={size} variant="outlined" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={() => onUndoCheckin(item.id)} disabled={isLoading}>
            Desfazer check-in
          </Button>
        )}
        {isEmitted && hasCheckin && onAttend && (
          <Button size={size} variant="contained" color="primary" disableElevation startIcon={<PersonRoundedIcon />} onClick={() => onAttend(item)} disabled={isLoading}>
            Atender
          </Button>
        )}
        {isEmitted && onNoShow && (
          <Button size={size} variant="outlined" color="error" startIcon={<CancelRoundedIcon />} onClick={() => onNoShow(item.id)} disabled={isLoading}>
            Ausente
          </Button>
        )}
        {isInProgress && onComplete && (
          <Button size={size} variant="contained" color="success" disableElevation startIcon={<CheckCircleRoundedIcon />} onClick={() => onComplete(item.id)} disabled={isLoading}>
            Concluir
          </Button>
        )}
        {isInProgress && onNoShow && (
          <Button size={size} variant="outlined" color="error" startIcon={<CancelRoundedIcon />} onClick={() => onNoShow(item.id)} disabled={isLoading}>
            Ausente
          </Button>
        )}
        {(isDone || isInProgress) && onUndo && (
          <Button size={size} variant="outlined" color="inherit" startIcon={<UndoRoundedIcon />} onClick={() => onUndo(item.id)} disabled={isLoading}>
            Desfazer
          </Button>
        )}
        {isDone && item.status === 'completed' && onEditAttend && (
          <Button size={size} variant="outlined" color="primary" startIcon={<EditRoundedIcon />} onClick={() => onEditAttend(item)} disabled={isLoading}>
            Editar atendimento
          </Button>
        )}
        {item.is_walk_in && onEditWalkIn && (
          <Button size={size} variant="outlined" color="info" startIcon={<EditRoundedIcon />} onClick={() => onEditWalkIn(item)} disabled={isLoading}>
            Editar walk-in
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
      {isEmitted && !hasCheckin && onCheckin && (
        <Tooltip title="Check-in (chegou)">
          <IconButton size={size} color="info" onClick={() => onCheckin(item.id)} disabled={isLoading}>
            <LoginRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && hasCheckin && onUndoCheckin && (
        <Tooltip title="Desfazer check-in">
          <IconButton size={size} onClick={() => onUndoCheckin(item.id)} disabled={isLoading}>
            <LogoutRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && hasCheckin && onAttend && (
        <Tooltip title="Iniciar atendimento">
          <IconButton size={size} color="primary" onClick={() => onAttend(item)} disabled={isLoading}>
            <PersonRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isEmitted && onNoShow && (
        <Tooltip title="Não compareceu">
          <IconButton size={size} color="error" onClick={() => onNoShow(item.id)} disabled={isLoading}>
            <CancelRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isInProgress && onComplete && (
        <Tooltip title="Concluir atendimento">
          <IconButton size={size} color="success" onClick={() => onComplete(item.id)} disabled={isLoading}>
            <CheckCircleRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isInProgress && onNoShow && (
        <Tooltip title="Não compareceu">
          <IconButton size={size} color="error" onClick={() => onNoShow(item.id)} disabled={isLoading}>
            <CancelRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {(isDone || isInProgress) && onUndo && (
        <Tooltip title="Desfazer">
          <IconButton size={size} onClick={() => onUndo(item.id)} disabled={isLoading}>
            <UndoRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isDone && item.status === 'completed' && onEditAttend && (
        <Tooltip title="Editar informações do atendimento">
          <IconButton size={size} color="primary" onClick={() => onEditAttend(item)} disabled={isLoading}>
            <EditRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {item.is_walk_in && onEditWalkIn && (
        <Tooltip title="Editar dados do walk-in">
          <IconButton size={size} color="info" onClick={() => onEditWalkIn(item)} disabled={isLoading}>
            <EditRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

// ── Queue card ────────────────────────────────────────────────────────────────

interface QueueCardProps {
  item: QueueItem;
  isNext: boolean;
  isMobile: boolean;
  isDark: boolean;
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

function QueueCard({
  item, isNext, isMobile, isDark, actionLoading,
  onCheckin, onUndoCheckin, onAttend, onComplete, onNoShow, onUndo, onEditAttend, onEditWalkIn,
}: QueueCardProps) {
  const isLoading    = actionLoading === item.id;
  const isDone       = item.status === 'completed' || item.status === 'no_show' || item.status === 'cancelled';
  const isInProgress = item.status === 'called';
  const isEmitted    = item.status === 'emitted';
  const hasCheckin   = !!item.checkin_em;

  // Left border color conveys state at a glance
  const borderLeftColor = isNext
    ? 'primary.main'
    : hasCheckin && isEmitted
    ? 'success.main'
    : isInProgress
    ? 'info.main'
    : isDone
    ? 'divider'
    : 'transparent';

  const cardSx = {
    opacity: isDone ? 0.55 : 1,
    border: '1px solid',
    borderColor: 'divider',
    borderLeft: '4px solid',
    borderLeftColor,
    borderRadius: 2,
    transition: 'opacity 0.2s',
  };

  if (isMobile) {
    return (
      <Card elevation={0} sx={cardSx}>
        <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
          {/* Row 1: number + tags + status chip */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography
                variant="h5"
                fontWeight={800}
                sx={{ color: isDone ? 'text.disabled' : item.is_sponsor ? (isDark ? '#fbbf24' : '#b8860b') : 'text.primary', fontFamily: 'monospace', lineHeight: 1 }}
              >
                {item.numero_formatado || `#${item.numero}`}
              </Typography>
              {item.is_sponsor  && <SponsorChip isDark={isDark} />}
              {item.is_walk_in  && <WalkInChip  isDark={isDark} />}
              {item.preferencial && (
                <Chip icon={<StarRoundedIcon sx={{ fontSize: '14px !important' }} />} label={priorityLabel(item)} color="warning" size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700 }} />
              )}
              {hasCheckin && isEmitted && <PresentChip />}
            </Box>
            <Chip
              label={statusLabel[item.status] || item.status}
              color={statusColor[item.status] || 'default'}
              size="small"
              variant={isDone ? 'outlined' : 'filled'}
              sx={{ flexShrink: 0 }}
            />
          </Box>

          {/* Row 2: name */}
          <Typography variant="body1" fontWeight={600} sx={{ color: isDone ? 'text.disabled' : 'text.primary', mb: 0.25 }}>
            {item.consulente_nome || '—'}
          </Typography>

          {/* Row 3: contato (telefone + email) — sempre visível, inclusive mobile */}
          {item.consulente_telefone && (
            <Typography variant="body2" color="text.secondary">{item.consulente_telefone}</Typography>
          )}
          {item.consulente_email && (
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.consulente_email}
            </Typography>
          )}
          {(isInProgress || isDone) && item.medium_nome && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {item.medium_nome}{item.cambone_nome && ` · ${item.cambone_nome}`}
            </Typography>
          )}

          {/* Row 4: actions */}
          {!isDone && (
            <Box sx={{ mt: 1.25 }}>
              <ActionButtons
                item={item} isLoading={isLoading} size="small" variant="button"
                onCheckin={onCheckin} onUndoCheckin={onUndoCheckin}
                onAttend={onAttend} onComplete={onComplete}
                onNoShow={onNoShow} onUndo={onUndo}
                onEditAttend={onEditAttend} onEditWalkIn={onEditWalkIn}
              />
            </Box>
          )}
          {isDone && (onEditAttend || onEditWalkIn || onUndo) && (
            <Box sx={{ mt: 1 }}>
              <ActionButtons
                item={item} isLoading={isLoading} size="small" variant="button"
                onUndo={onUndo} onEditAttend={onEditAttend} onEditWalkIn={onEditWalkIn}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }

  // Desktop: compact horizontal row
  return (
    <Card elevation={0} sx={cardSx}>
      <CardContent sx={{ py: 1.25, px: 2, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="h6"
            fontWeight={800}
            sx={{ minWidth: 56, fontFamily: 'monospace', color: isDone ? 'text.disabled' : item.is_sponsor ? (isDark ? '#fbbf24' : '#b8860b') : 'text.primary' }}
          >
            {item.numero_formatado || `#${item.numero}`}
          </Typography>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ color: isDone ? 'text.disabled' : 'text.primary' }}>
                {item.consulente_nome || '—'}
              </Typography>
              {item.is_sponsor   && <SponsorChip isDark={isDark} />}
              {item.is_walk_in   && <WalkInChip  isDark={isDark} />}
              {item.preferencial && (
                <Tooltip title={priorityLabel(item)}>
                  <StarRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                </Tooltip>
              )}
              {hasCheckin && isEmitted && <PresentChip />}
            </Box>
            {item.consulente_telefone && (
              <Typography variant="caption" color="text.secondary" display="block">{item.consulente_telefone}</Typography>
            )}
            {item.consulente_email && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: 'break-all' }}>
                {item.consulente_email}
              </Typography>
            )}
            {(isInProgress || isDone) && item.medium_nome && (
              <Typography variant="caption" color="text.secondary" display="block">
                {item.medium_nome}{item.cambone_nome && ` · ${item.cambone_nome}`}
              </Typography>
            )}
          </Box>

          <Chip
            label={statusLabel[item.status] || item.status}
            color={statusColor[item.status] || 'default'}
            size="small"
            variant={isDone ? 'outlined' : 'filled'}
          />

          <ActionButtons
            item={item} isLoading={isLoading} size="small" variant="icon"
            onCheckin={onCheckin} onUndoCheckin={onUndoCheckin}
            onAttend={onAttend} onComplete={onComplete}
            onNoShow={onNoShow} onUndo={onUndo}
            onEditAttend={onEditAttend} onEditWalkIn={onEditWalkIn}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  label, count, accentColor, action,
}: { label: string; count: number; accentColor?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {accentColor && (
        <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: accentColor, flexShrink: 0 }} />
      )}
      <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
        {label}
        <Typography component="span" variant="subtitle1" color="text.secondary" sx={{ ml: 0.75, fontWeight: 400 }}>
          ({count})
        </Typography>
      </Typography>
      {action}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortaPage() {
  const theme   = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isDark } = useAdminTheme();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('porta', 'view');
  const canInsert = canGroup('porta', 'insert');
  const canEdit = canGroup('porta', 'edit');

  const [giras, setGiras]                   = useState<Gira[]>([]);
  const [selectedGiraId, setSelectedGiraId] = useState<string>('');
  const [stats, setStats]                   = useState<DoorStats | null>(null);
  const [queue, setQueue]                   = useState<QueueItem[]>([]);
  const [search, setSearch]                 = useState('');
  const [loading, setLoading]               = useState(false);
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const [config, setConfig]                 = useState<TenantConfig | null>(null);
  const [mediumOptions, setMediumOptions]   = useState<MediumOption[]>([]);
  const [camboneOptions, setCamboneOptions] = useState<MediumOption[]>([]);
  const [attendTarget, setAttendTarget]     = useState<QueueItem | null>(null);
  const [editTarget, setEditTarget]         = useState<QueueItem | null>(null);
  const [walkInCreateOpen, setWalkInCreateOpen]   = useState(false);
  const [walkInEditTarget, setWalkInEditTarget]   = useState<QueueItem | null>(null);
  const [doneExpanded, setDoneExpanded]     = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'success',
  });

  // ── Data fetching ────────────────────────────────────────────────────────────

  const loadGiras = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res.data) ? res.data : res.data.items || [];
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const data = all.filter((g) => new Date(g.data_inicio) >= cutoff);
      setGiras(data);
      if (data.length > 0 && !selectedGiraId) {
        const active = data.find((g: Gira) => g.is_active);
        setSelectedGiraId(active?.id || data[0].id);
      }
    } catch { showSnackbar('Erro ao carregar giras', 'error'); }
  };

  const loadConfig = async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/tenant/config');
      setConfig(res.data);
    } catch { /* silent */ }
  };

  const loadMediunOptions = async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options?only_atendimento=true'),
        apiClient.get<MediumOption[]>('/api/v1/admin/mediuns/options'),
      ]);
      setMediumOptions(Array.isArray(mRes.data) ? mRes.data : []);
      setCamboneOptions(Array.isArray(cRes.data) ? cRes.data : []);
    } catch { /* optional */ }
  };

  const loadStats = useCallback(async () => {
    if (!selectedGiraId || !canView) return;
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/stats`);
      setStats(res.data);
    } catch { /* retry on next poll */ }
  }, [selectedGiraId, canView]);

  const loadQueue = useCallback(async () => {
    if (!selectedGiraId || !canView) return;
    try {
      setLoading(true);
      // Fetch full queue — filtering is done client-side so we can search by name AND number
      const res = await apiClient.get(`/api/v1/admin/giras/${selectedGiraId}/door/queue`);
      setQueue(res.data.items || []);
      setLastUpdated(new Date());
    } catch { showSnackbar('Erro ao carregar fila', 'error'); }
    finally { setLoading(false); }
  }, [selectedGiraId, canView]);

  const refreshAll = useCallback(() => { loadStats(); loadQueue(); }, [loadStats, loadQueue]);

  // loadGiras/loadConfig/loadMediunOptions aren't memoized — this effect only runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGiras(); loadConfig(); loadMediunOptions(); }, []);
  useEffect(() => { if (selectedGiraId) refreshAll(); }, [selectedGiraId, refreshAll]);
  useEffect(() => {
    if (!selectedGiraId) return;
    const t = setInterval(refreshAll, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedGiraId, refreshAll]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info') =>
    setSnackbar({ open: true, message, severity });

  const doAction = async (url: string, method: 'patch' | 'delete', ticketId: string, body?: Record<string, unknown>, successMsg?: string) => {
    if (!canEdit) return;
    try {
      setActionLoading(ticketId);
      if (method === 'patch') await apiClient.patch(url, body);
      else await apiClient.delete(url);
      showSnackbar(successMsg || 'Ação realizada', 'success');
      refreshAll();
    } catch (err) {
      showSnackbar(extractApiErrorMessage(err, 'Erro ao realizar ação'), 'error');
    } finally { setActionLoading(null); }
  };

  const handleCheckin      = (id: string) => doAction(`/api/v1/admin/door/tickets/${id}/checkin`, 'patch',  id, undefined, 'Check-in realizado');
  const handleUndoCheckin  = (id: string) => doAction(`/api/v1/admin/door/tickets/${id}/checkin`, 'delete', id, undefined, 'Check-in desfeito');
  const handleNoShow       = (id: string) => doAction(`/api/v1/admin/door/tickets/${id}/no-show`, 'patch',  id, undefined, 'Marcado como ausente');
  const handleUndo         = (id: string) => doAction(`/api/v1/admin/door/tickets/${id}/undo`,    'patch',  id, undefined, 'Ação desfeita');

  const handleAttendConfirm = (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => {
    if (!attendTarget) return;
    doAction(`/api/v1/admin/door/tickets/${attendTarget.id}/attend`, 'patch', attendTarget.id, data, 'Atendimento concluído');
    setAttendTarget(null);
  };

  const handleEditAttendInfo = (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => {
    if (!editTarget) return;
    doAction(`/api/v1/admin/door/tickets/${editTarget.id}/attend-info`, 'patch', editTarget.id, data, 'Informações atualizadas');
    setEditTarget(null);
  };

  const handleCreateWalkIn = async (data: { nome: string; email?: string; telefone?: string; priority_category: string | null }) => {
    if (!selectedGiraId || !canInsert) return;
    try {
      setActionLoading('__walkin_create__');
      const res = await apiClient.post(`/api/v1/admin/giras/${selectedGiraId}/door/walk-in`, data);
      showSnackbar(`Walk-in ${res.data.numero_formatado} criado`, 'success');
      setWalkInCreateOpen(false);
      refreshAll();
    } catch (err) {
      showSnackbar(extractApiErrorMessage(err, 'Erro ao criar walk-in'), 'error');
    } finally { setActionLoading(null); }
  };

  const handleEditWalkIn = async (data: { nome: string; email?: string; telefone?: string; priority_category: string | null }) => {
    if (!walkInEditTarget || !canEdit) return;
    try {
      setActionLoading(walkInEditTarget.id);
      await apiClient.patch(`/api/v1/admin/door/tickets/${walkInEditTarget.id}/walk-in`, data);
      showSnackbar('Walk-in atualizado', 'success');
      setWalkInEditTarget(null);
      refreshAll();
    } catch (err) {
      showSnackbar(extractApiErrorMessage(err, 'Erro ao editar walk-in'), 'error');
    } finally { setActionLoading(null); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  // Client-side search: matches by name OR ticket number (strips leading # or zeros)
  const filteredQueue = (() => {
    const q = search.trim();
    if (!q) return queue;
    const needle = q.replace(/^#/, '').toLowerCase();
    const isNumeric = /^\d+$/.test(needle);
    return queue.filter((t) => {
      if (isNumeric) {
        // Match by numero (e.g. "42") or numero_formatado (e.g. "0042")
        if (String(t.numero) === needle) return true;
        if (t.numero_formatado?.replace(/^#?0*/, '') === needle.replace(/^0*/, '')) return true;
      }
      // Match by name (case-insensitive, accent-insensitive)
      const name = (t.consulente_nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return name.includes(needle.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    });
  })();

  const nextInLine      = filteredQueue.find((t) => t.status === 'emitted' && t.checkin_em);
  const waitingQueue    = filteredQueue.filter((t) => t.status === 'emitted');
  const inProgressQueue = filteredQueue.filter((t) => t.status === 'called');
  const doneQueue       = filteredQueue.filter((t) => t.status === 'completed' || t.status === 'no_show' || t.status === 'cancelled');

  const selectedGiraName = giras.find((g) => g.id === selectedGiraId)?.nome ?? '';

  // ── Notificação sonora + badge no título quando entra novo na fila ──────────────
  // Usa a fila completa (não filtrada) para detectar mudanças reais.
  const awaitingCount = queue.filter((t) => t.status === 'emitted').length;
  const prevAwaitingIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentIds = new Set(queue.filter((t) => t.status === 'emitted').map((t) => t.id));
    const prev = prevAwaitingIdsRef.current;
    // Detecta IDs novos em relação ao snapshot anterior (ignora primeira carga)
    if (prev) {
      const hasNew = Array.from(currentIds).some((id) => !prev.has(id));
      if (hasNew) {
        try {
          const audio = new Audio('/sounds/notification.mp3');
          audio.play().catch(() => { /* autoplay pode estar bloqueado */ });
        } catch { /* ambiente sem Audio */ }
      }
    }
    prevAwaitingIdsRef.current = currentIds;
  }, [queue]);

  // Badge numérico no título da aba do navegador
  useEffect(() => {
    const base = 'GiraHub — Porta';
    document.title = awaitingCount > 0 ? `(${awaitingCount}) ${base}` : base;
    return () => { document.title = base; };
  }, [awaitingCount]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <AdminLayout title="Visão da Porta" maxWidth="md">
        <Alert severity="warning" sx={{ mt: 2 }}>
          Você não tem permissão para visualizar a porta. Contate o administrador do sistema.
        </Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Visão da Porta" maxWidth="md">
      <Box sx={{ pb: 6 }}>

        {/* ── Header: gira selector + polling badge ── */}
        <Box data-tour="porta-header" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h5" fontWeight={700}>Visão da porta</Typography>
              {selectedGiraName && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{selectedGiraName}</Typography>
              )}
            </Box>
            <Tooltip title={lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Atualização automática a cada 8s'}>
              <Box data-tour="porta-ws-status" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'default' }}>
                <FiberManualRecordIcon sx={{ fontSize: 10, color: selectedGiraId ? 'success.main' : 'text.disabled', animation: selectedGiraId ? 'pulse 2s infinite' : 'none',
                  '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Aguardando…'}
                </Typography>
              </Box>
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2, alignItems: 'center' }}>
            <FormControl
              data-tour="porta-gira-select"
              size="small"
              sx={{ minWidth: 240, maxWidth: { xs: '100%', sm: 320 }, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
            >
              <InputLabel>Selecione a gira</InputLabel>
              <Select value={selectedGiraId} onChange={(e) => setSelectedGiraId(e.target.value)} label="Selecione a gira">
                {giras.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {g.is_active && <FiberManualRecordIcon sx={{ fontSize: 8, color: 'success.main' }} />}
                      {g.nome}
                      {!g.is_active && <Chip label="inativa" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {selectedGiraId && config?.enable_walk_in && canInsert && (
                <Button
                  data-tour="porta-walkin"
                  variant="outlined"
                  size="small"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => setWalkInCreateOpen(true)}
                  sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  Walk-in
                </Button>
              )}

              {selectedGiraId && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<TvRoundedIcon />}
                  onClick={() => window.open(`/admin/porta/kiosk?gira=${selectedGiraId}`, '_blank')}
                  sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  Modo TV
                </Button>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── Stats strip ── */}
        {stats && (
          <Paper
            data-tour="porta-stats"
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mb: 3, overflow: 'hidden' }}
          >
            {/* 4 cols on mobile/tablet, 8 cols on desktop */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' },
                '& > *': {
                  borderRight: '1px solid',
                  borderBottom: { xs: '1px solid', md: 'none' },
                  borderColor: 'divider',
                  // Remove border on last of each row
                  '&:nth-of-type(4n)': { borderRight: { xs: 'none', md: '1px solid' } },
                  '&:nth-of-type(8n)': { borderRight: 'none' },
                  // Remove bottom border on last row (rows 5-8 on mobile)
                  '&:nth-of-type(n+5)': { borderBottom: { xs: 'none', md: 'none' } },
                },
              }}
            >
              <StatCell label="Total"        value={stats.total}          />
              <StatCell label="Atendidos"    value={stats.completed}      color={theme.palette.success.main} accent={theme.palette.success.main} />
              <StatCell label="Em atend."    value={stats.in_progress}    color={theme.palette.info.main}    />
              <StatCell label="Aguardando"   value={stats.awaiting}       />
              <StatCell label="Walk-in"      value={stats.walk_in}        color="#0ea5e9"                    />
              <StatCell label="Preferenciais" value={stats.preferenciais} color={theme.palette.warning.main} />
              <StatCell label="Ausentes"     value={stats.no_show}        color={theme.palette.error.main}   accent={stats.no_show > 0 ? theme.palette.error.main : undefined} />
              <StatCell label="Check-in"     value={stats.checked_in}     color="#8b5cf6"                    />
            </Box>
          </Paper>
        )}

        {/* ── Search ── */}
        <TextField
          data-tour="porta-busca"
          placeholder="Buscar por nome…"
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" color={search ? 'primary' : 'disabled'} />
              </InputAdornment>
            ),
          }}
        />

        {loading && !queue.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : !selectedGiraId ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography color="text.secondary">Selecione uma gira para ver a fila.</Typography>
          </Box>
        ) : (
          <>
            {/* ── Próximo na fila (HERO CARD) ── */}
            {nextInLine && (
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 2, sm: 3 },
                  mb: 3,
                  border: '2px solid',
                  borderColor: 'primary.main',
                  borderRadius: 3,
                  bgcolor: isDark
                    ? 'rgba(99,102,241,0.08)'
                    : 'rgba(99,102,241,0.04)',
                  position: 'relative',
                  overflow: 'hidden',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 3,
                    bgcolor: 'primary.main',
                  },
                }}
              >
                <Typography
                  variant="overline"
                  color="primary.main"
                  fontWeight={700}
                  sx={{ letterSpacing: '0.12em', fontSize: '0.65rem' }}
                >
                  Próximo na fila
                </Typography>

                <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mt: 0.75, flexDirection: { xs: 'column', sm: 'row' } }}>
                  {/* Número grande */}
                  <Box
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: { xs: 72, sm: 88 }, height: { xs: 72, sm: 88 }, flexShrink: 0,
                      borderRadius: 3,
                      bgcolor: 'primary.main',
                    }}
                  >
                    <Typography
                      variant="h3"
                      fontWeight={900}
                      sx={{ color: '#fff', fontFamily: 'monospace', fontSize: { xs: '1.75rem', sm: '2rem' } }}
                    >
                      {nextInLine.numero_formatado || `#${nextInLine.numero}`}
                    </Typography>
                  </Box>

                  {/* Info */}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
                      {nextInLine.is_sponsor   && <SponsorChip isDark={isDark} />}
                      {nextInLine.is_walk_in   && <WalkInChip  isDark={isDark} />}
                      {nextInLine.preferencial && (
                        <Chip icon={<StarRoundedIcon sx={{ fontSize: '14px !important' }} />} label={priorityLabel(nextInLine)} color="warning" size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700 }} />
                      )}
                    </Box>
                    <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700} sx={{ lineHeight: 1.2 }}>
                      {nextInLine.consulente_nome || '—'}
                    </Typography>
                    {nextInLine.consulente_telefone && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {nextInLine.consulente_telefone}
                      </Typography>
                    )}
                  </Box>

                  {/* Primary CTA — large */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                      variant="contained"
                      size="large"
                      disableElevation
                      startIcon={<PersonRoundedIcon />}
                      onClick={() => setAttendTarget(nextInLine)}
                      disabled={actionLoading === nextInLine.id}
                      fullWidth={isMobile}
                      sx={{ fontWeight: 700, px: 3 }}
                    >
                      Atender
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<CancelRoundedIcon />}
                      onClick={() => handleNoShow(nextInLine.id)}
                      disabled={actionLoading === nextInLine.id}
                      fullWidth={isMobile}
                    >
                      Não compareceu
                    </Button>
                  </Box>
                </Box>
              </Paper>
            )}

            {/* ── Em Atendimento ── */}
            {inProgressQueue.length > 0 && (
              <Box sx={{ mb: 3 }} data-tour="porta-em-atendimento">
                <SectionHeader label="Em atendimento" count={inProgressQueue.length} accentColor={theme.palette.info.main} />
                <Stack spacing={1}>
                  {inProgressQueue.map((item) => (
                    <QueueCard
                      key={item.id} item={item} isNext={false} isMobile={isMobile} isDark={isDark}
                      actionLoading={actionLoading}
                      onNoShow={handleNoShow} onUndo={handleUndo}
                      onEditWalkIn={(t) => setWalkInEditTarget(t)}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* ── Fila de Espera ── */}
            <Box data-tour="porta-fila" sx={{ mb: 3 }}>
              <SectionHeader
                label="Fila de espera"
                count={waitingQueue.length}
                accentColor={theme.palette.primary.main}
              />
              {waitingQueue.length === 0 ? (
                <Paper elevation={0} sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Fila vazia</Typography>
                </Paper>
              ) : (
                <Stack spacing={1}>
                  {waitingQueue.map((item) => (
                    <QueueCard
                      key={item.id} item={item} isNext={nextInLine?.id === item.id} isMobile={isMobile} isDark={isDark}
                      actionLoading={actionLoading}
                      onCheckin={handleCheckin} onUndoCheckin={handleUndoCheckin}
                      onAttend={(t) => setAttendTarget(t)}
                      onNoShow={handleNoShow} onUndo={handleUndo}
                      onEditWalkIn={(t) => setWalkInEditTarget(t)}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* ── Finalizados (colapsável) ── */}
            {doneQueue.length > 0 && (
              <Box>
                <SectionHeader
                  label="Finalizados"
                  count={doneQueue.length}
                  accentColor="text.disabled"
                  action={
                    <Button
                      size="small"
                      variant="text"
                      color="inherit"
                      endIcon={doneExpanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                      onClick={() => setDoneExpanded((p) => !p)}
                      sx={{ color: 'text.secondary', fontSize: '0.78rem' }}
                    >
                      {doneExpanded ? 'Ocultar' : 'Ver todos'}
                    </Button>
                  }
                />
                <Collapse in={doneExpanded}>
                  <Stack spacing={1}>
                    {doneQueue.map((item) => (
                      <QueueCard
                        key={item.id} item={item} isNext={false} isMobile={isMobile} isDark={isDark}
                        actionLoading={actionLoading}
                        onUndo={handleUndo}
                        onEditAttend={(t) => setEditTarget(t)}
                        onEditWalkIn={(t) => setWalkInEditTarget(t)}
                      />
                    ))}
                  </Stack>
                </Collapse>
                {!doneExpanded && (
                  <Paper
                    elevation={0}
                    onClick={() => setDoneExpanded(true)}
                    sx={{
                      border: '1px dashed', borderColor: 'divider', borderRadius: 2,
                      py: 2, textAlign: 'center', cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {doneQueue.length} finalizado{doneQueue.length !== 1 ? 's' : ''} — clique para expandir
                    </Typography>
                  </Paper>
                )}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Modals ── */}
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
        initialValues={{ medium_nome: editTarget?.medium_nome || '', cambone_nome: editTarget?.cambone_nome || '', atendimento_descricao: editTarget?.atendimento_descricao || '' }}
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
        initialValues={{ nome: walkInEditTarget?.consulente_nome || '', email: walkInEditTarget?.consulente_email || '', telefone: walkInEditTarget?.consulente_telefone || '', priority_category: walkInEditTarget?.priority_category ?? null }}
        onConfirm={handleEditWalkIn}
        onClose={() => setWalkInEditTarget(null)}
        loading={actionLoading === walkInEditTarget?.id}
      />

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
}
