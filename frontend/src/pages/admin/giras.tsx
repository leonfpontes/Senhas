/**
 * T073: Admin Giras Page - Giras table with create/edit drawers, delete confirm, and senha config drawer
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  Menu,
  MenuItem as MuiMenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  CircularProgress,
  IconButton,
  LinearProgress,
  Snackbar,
  Tooltip,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { PageHeader, ConfirmDialog } from '@/components/admin';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import StarIcon from '@mui/icons-material/Star';
import LockIcon from '@mui/icons-material/Lock';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import AdminLayout from './admin_layout';
import { apiClient, extractApiErrorMessage } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';

interface Gira {
  id: string;
  nome: string;
  descricao?: string;
  data_inicio: string;
  data_fim?: string;
  local?: string;
  is_active: boolean;
  max_tickets?: number | null;
  release_start_at?: string | null;
  release_end_at?: string | null;
  recados?: string;
}

interface SenhaConfig {
  max_tickets: number;
  release_start_at: string;
  release_end_at: string;
  current_count: number;
  public_link: string;
  sponsor_max_tickets?: number | null;
  sponsor_release_start_at?: string | null;
  sponsor_release_end_at?: string | null;
  sponsor_current_count?: number;
  sponsor_public_link?: string;
  waitlist_confirmation_hours?: number | null;
}

interface TimeSlotRow {
  id?: string;
  horario: string; // "HH:MM"
  capacidade_maxima: string;
  total_emitido?: number;
  vagas_disponiveis?: number;
}

const timeToInputValue = (horario: string): string => horario.slice(0, 5);

const emptySlotRow = (): TimeSlotRow => ({ horario: '', capacidade_maxima: '' });

const EMPTY_FORM = { nome: '', descricao: '', data_inicio: '', recados: '' };
const EMPTY_SENHA_FORM = {
  max_tickets: '', release_start_at: '', release_end_at: '',
  sponsor_max_tickets: '', sponsor_release_start_at: '', sponsor_release_end_at: '',
  waitlist_confirmation_hours: '',
};

// Convert a UTC ISO string from the API (e.g. "2026-03-31T15:00:00+00:00") to
// the browser's local time in YYYY-MM-DDTHH:mm format for datetime-local inputs.
// This is the inverse of `new Date(localStr).toISOString()` used when sending.
const isoToLocalDatetimeInput = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function GiraUsageBar({ used, max }: { used: number; max: number }) {
  const isUnlimited = max < 0;
  const pct = !isUnlimited && max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const atLimit = !isUnlimited && used >= max;
  return (
    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: atLimit ? 'warning.main' : 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600} color="text.secondary">
          Giras criadas este mês
        </Typography>
        <Typography variant="body2" fontWeight={700} color={atLimit ? 'warning.main' : 'text.primary'}>
          {used} / {max}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            bgcolor: atLimit ? 'warning.main' : pct >= 80 ? 'warning.light' : 'primary.main',
          },
        }}
      />
      {atLimit && (
        <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
          Limite mensal atingido. <Link href="/admin/plano" style={{ fontWeight: 600, color: 'inherit' }}>Faça upgrade</Link> para criar mais giras.
        </Typography>
      )}
    </Box>
  );
}

export default function AdminGirasPage() {
  return (
    <AdminLayout title="Gerenciar Giras">
      <AdminGirasContent />
    </AdminLayout>
  );
}

function AdminGirasContent() {
  const { subscription, can, loading: subLoading, canCreateGira: canCreateGiraFn, refresh: refreshSubscription } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('giras', 'view');
  const canInsert = canGroup('giras', 'insert');
  const canEdit = canGroup('giras', 'edit');
  const canDelete = canGroup('giras', 'delete');
  const canViewPorta = canGroup('porta', 'view');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [giras, setGiras] = useState<Gira[]>([]);
  const [loading, setLoading] = useState(true);
  const [unifiedLinks, setUnifiedLinks] = useState<{ public_link: string; sponsor_public_link: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuGira, setMenuGira] = useState<Gira | null>(null);

  const canCreateGira = canCreateGiraFn();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentGira, setCurrentGira] = useState<Gira | null>(null);
  const [formData, setFormData] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Gira | null>(null);

  // Senha config drawer
  const [senhaDrawerOpen, setSenhaDrawerOpen] = useState(false);
  const [senhaTarget, setSenhaTarget] = useState<Gira | null>(null);
  const [senhaForm, setSenhaForm] = useState<typeof EMPTY_SENHA_FORM>(EMPTY_SENHA_FORM);
  const [senhaConfig, setSenhaConfig] = useState<SenhaConfig | null>(null);
  const [senhaInitial, setSenhaInitial] = useState<typeof EMPTY_SENHA_FORM>(EMPTY_SENHA_FORM);
  const [senhaSaving, setSenhaSaving] = useState(false);
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaTouched, setSenhaTouched] = useState<Record<string, boolean>>({});

  // Release confirm dialog
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);

  // Horários de atendimento (agendamento por horário)
  const [timeSlotSchedulingEnabled, setTimeSlotSchedulingEnabled] = useState(false);
  const [useTimeSlots, setUseTimeSlots] = useState(false);
  const [useTimeSlotsInitial, setUseTimeSlotsInitial] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [timeSlotsInitial, setTimeSlotsInitial] = useState<TimeSlotRow[]>([]);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => {
    const controller = new AbortController();
    loadGiras(controller.signal);
    loadUnifiedLinks(controller.signal);
    loadTimeSlotSchedulingToggle(controller.signal);
    return () => controller.abort();
    // loadGiras/loadUnifiedLinks/loadTimeSlotSchedulingToggle aren't memoized —
    // including them would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const loadTimeSlotSchedulingToggle = async (signal?: AbortSignal) => {
    if (!canView) return;
    try {
      const response = await apiClient.get('/api/v1/admin/tenant/config', { signal });
      setTimeSlotSchedulingEnabled(!!response.data.enable_time_slot_scheduling);
    } catch (error) {
      if (error instanceof Error && (error.name === 'CanceledError' || error.name === 'AbortError')) return;
      // Sem permissão de CONFIGURACOES ou outro erro — mantém a seção oculta.
      setTimeSlotSchedulingEnabled(false);
    }
  };

  const loadGiras = async (signal?: AbortSignal) => {
    if (!canView) { setLoading(false); return; }
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/admin/giras', { signal });
      setGiras(response.data.items || response.data);
    } catch (error) {
      if (error instanceof Error && (error.name === 'CanceledError' || error.name === 'AbortError')) return;
      console.error('Error loading giras:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnifiedLinks = async (signal?: AbortSignal) => {
    if (!canView) return;
    try {
      const response = await apiClient.get('/api/v1/admin/giras/unified-links', { signal });
      setUnifiedLinks(response.data);
    } catch (error) {
      if (error instanceof Error && (error.name === 'CanceledError' || error.name === 'AbortError')) return;
      console.error('Error loading unified links:', error);
    }
  };

  // --- Drawer helpers ---
  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setCurrentGira(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (gira: Gira) => {
    setCurrentGira(gira);
    setFormData({
      nome: gira.nome,
      descricao: gira.descricao || '',
      data_inicio: isoToLocalDatetimeInput(gira.data_inicio),
      recados: gira.recados || '',
    });
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentGira(null);
    setFormData(EMPTY_FORM);
    setTouched({});
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? Object.values(formData).some((v) => v !== '')
      : currentGira != null &&
        (formData.nome !== currentGira.nome ||
          formData.descricao !== (currentGira.descricao || '') ||
          formData.recados !== (currentGira.recados || ''));

  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const dataError = touched.data_inicio && !formData.data_inicio ? 'Data de início é obrigatória' : '';
  const saveDisabled = !formData.nome.trim() || !formData.data_inicio;

  const handleSave = async () => {
    setTouched({ nome: true, data_inicio: true });
    if (saveDisabled) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      // Convert datetime-local string ("2026-04-19T10:00") to UTC ISO string
      // so the backend stores the correct moment in time.
      const toUtcIso = (localStr: string) =>
        localStr ? new Date(localStr).toISOString() : localStr;
      const payload = {
        ...formData,
        data_inicio: toUtcIso(formData.data_inicio),
      };
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/giras', payload);
      } else if (currentGira) {
        await apiClient.put(`/api/v1/admin/giras/${currentGira.id}`, payload);
      }
      closeDrawer();
      loadGiras();
      refreshSubscription();
    } catch (error) {
      console.error('Error saving gira:', error);
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDeleteClick = (gira: Gira) => {
    setDeleteTarget(gira);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    try {
      await apiClient.delete(`/api/v1/admin/giras/${deleteTarget.id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      loadGiras();
      refreshSubscription();
    } catch (error) {
      console.error('Error deleting gira:', error);
    }
  };

  // --- Senha Config Drawer ---
  const openSenhaDrawer = async (gira: Gira) => {
    setSenhaTarget(gira);
    setSenhaForm(EMPTY_SENHA_FORM);
    setSenhaInitial(EMPTY_SENHA_FORM);
    setSenhaTouched({});
    setSenhaConfig(null);
    setSenhaDrawerOpen(true);
    setSenhaLoading(true);
    try {
      const response = await apiClient.get(`/api/v1/admin/giras/${gira.id}/senhas`);
      const config: SenhaConfig = response.data;
      setSenhaConfig(config);
      const loaded = {
        max_tickets: config.max_tickets ? String(config.max_tickets) : '',
        release_start_at: isoToLocalDatetimeInput(config.release_start_at),
        release_end_at: isoToLocalDatetimeInput(config.release_end_at),
        sponsor_max_tickets: config.sponsor_max_tickets ? String(config.sponsor_max_tickets) : '',
        sponsor_release_start_at: isoToLocalDatetimeInput(config.sponsor_release_start_at),
        sponsor_release_end_at: isoToLocalDatetimeInput(config.sponsor_release_end_at),
        waitlist_confirmation_hours: config.waitlist_confirmation_hours ? String(config.waitlist_confirmation_hours) : '',
      };
      setSenhaForm(loaded);
      setSenhaInitial(loaded);
    } catch {
      // No config yet — form stays empty
    } finally {
      setSenhaLoading(false);
    }

    if (timeSlotSchedulingEnabled) {
      try {
        const response = await apiClient.get(`/api/v1/admin/giras/${gira.id}/time-slots`);
        const loadedSlots: TimeSlotRow[] = (response.data.slots || []).map((s: {
          id: string; horario: string; capacidade_maxima: number; total_emitido: number; vagas_disponiveis: number;
        }) => ({
          id: s.id,
          horario: timeToInputValue(s.horario),
          capacidade_maxima: String(s.capacidade_maxima),
          total_emitido: s.total_emitido,
          vagas_disponiveis: s.vagas_disponiveis,
        }));
        setUseTimeSlots(!!response.data.use_time_slots);
        setUseTimeSlotsInitial(!!response.data.use_time_slots);
        setTimeSlots(loadedSlots);
        setTimeSlotsInitial(loadedSlots);
      } catch {
        setUseTimeSlots(false);
        setUseTimeSlotsInitial(false);
        setTimeSlots([]);
        setTimeSlotsInitial([]);
      }
    }
  };

  const closeSenhaDrawer = () => {
    setSenhaDrawerOpen(false);
    setSenhaTarget(null);
    setSenhaConfig(null);
    setSenhaForm(EMPTY_SENHA_FORM);
    setSenhaTouched({});
    setUseTimeSlots(false);
    setUseTimeSlotsInitial(false);
    setTimeSlots([]);
    setTimeSlotsInitial([]);
  };

  // --- Horários de atendimento ---
  const handleToggleUseTimeSlots = async (checked: boolean) => {
    setUseTimeSlots(checked);
    if (checked && timeSlots.length === 0) {
      try {
        const response = await apiClient.get('/api/v1/admin/config/time-slot-templates');
        const templateSlots: TimeSlotRow[] = (response.data || []).map((t: { horario: string; capacidade_maxima: number }) => ({
          horario: timeToInputValue(t.horario),
          capacidade_maxima: String(t.capacidade_maxima),
        }));
        setTimeSlots(templateSlots.length > 0 ? templateSlots : [emptySlotRow()]);
      } catch {
        setTimeSlots([emptySlotRow()]);
      }
    }
  };

  const updateSlotRow = (index: number, field: 'horario' | 'capacidade_maxima', value: string) => {
    setTimeSlots((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addSlotRow = () => setTimeSlots((prev) => [...prev, emptySlotRow()]);

  const removeSlotRow = (index: number) => setTimeSlots((prev) => prev.filter((_, i) => i !== index));

  const timeSlotsValid = !useTimeSlots || (
    timeSlots.length > 0 &&
    timeSlots.every((s) => s.horario && Number(s.capacidade_maxima) >= 1) &&
    new Set(timeSlots.map((s) => s.horario)).size === timeSlots.length
  );

  const timeSlotsDirty = useTimeSlots !== useTimeSlotsInitial ||
    JSON.stringify(timeSlots.map((s) => ({ horario: s.horario, capacidade_maxima: s.capacidade_maxima }))) !==
    JSON.stringify(timeSlotsInitial.map((s) => ({ horario: s.horario, capacidade_maxima: s.capacidade_maxima })));

  const handleSenhaChange = (field: string, value: string) => {
    setSenhaForm((prev) => ({ ...prev, [field]: value }));
    setSenhaTouched((prev) => ({ ...prev, [field]: true }));
  };

  const senhaMaxError = senhaTouched.max_tickets && (!senhaForm.max_tickets || Number(senhaForm.max_tickets) < 1)
    ? 'Mínimo 1 senha' : '';
  const senhaStartError = senhaTouched.release_start_at && !senhaForm.release_start_at
    ? 'Início é obrigatório' : '';
  const senhaEndError = senhaTouched.release_end_at && !senhaForm.release_end_at
    ? 'Fim é obrigatório' : '';
  const senhaSaveDisabled = !senhaForm.max_tickets || Number(senhaForm.max_tickets) < 1
    || !senhaForm.release_start_at || !senhaForm.release_end_at
    || !timeSlotsValid;

  const senhaDirty = JSON.stringify(senhaForm) !== JSON.stringify(senhaInitial) || timeSlotsDirty;

  const handleSenhaSave = async () => {
    setSenhaTouched({ max_tickets: true, release_start_at: true, release_end_at: true });
    if (senhaSaveDisabled || !senhaTarget || !canEdit) return;
    setSenhaSaving(true);
    try {
      const payload: Record<string, unknown> = {
        max_tickets: Number(senhaForm.max_tickets),
        release_start_at: new Date(senhaForm.release_start_at).toISOString(),
        release_end_at: new Date(senhaForm.release_end_at).toISOString(),
      };
      if (senhaForm.sponsor_max_tickets && Number(senhaForm.sponsor_max_tickets) > 0) {
        payload.sponsor_max_tickets = Number(senhaForm.sponsor_max_tickets);
        payload.sponsor_release_start_at = senhaForm.sponsor_release_start_at
          ? new Date(senhaForm.sponsor_release_start_at).toISOString()
          : payload.release_start_at;
        payload.sponsor_release_end_at = senhaForm.sponsor_release_end_at
          ? new Date(senhaForm.sponsor_release_end_at).toISOString()
          : payload.release_end_at;
      }
      if (can('fila_espera') && senhaForm.waitlist_confirmation_hours) {
        payload.waitlist_confirmation_hours = Number(senhaForm.waitlist_confirmation_hours);
      }
      const response = await apiClient.put(`/api/v1/admin/giras/${senhaTarget.id}/senhas`, payload);
      setSenhaConfig(response.data);
      // Sync senhaInitial with current form so senhaDirty resets to false
      // after saving. Without this, the "Descartar alterações?" dialog would
      // appear even though the form was just successfully saved.
      setSenhaInitial({ ...senhaForm });

      if (timeSlotSchedulingEnabled) {
        const slotsResponse = await apiClient.put(`/api/v1/admin/giras/${senhaTarget.id}/time-slots`, {
          use_time_slots: useTimeSlots,
          slots: useTimeSlots
            ? timeSlots.map((s) => ({ horario: s.horario, capacidade_maxima: Number(s.capacidade_maxima) }))
            : [],
        });
        const savedSlots: TimeSlotRow[] = (slotsResponse.data.slots || []).map((s: {
          id: string; horario: string; capacidade_maxima: number; total_emitido: number; vagas_disponiveis: number;
        }) => ({
          id: s.id,
          horario: timeToInputValue(s.horario),
          capacidade_maxima: String(s.capacidade_maxima),
          total_emitido: s.total_emitido,
          vagas_disponiveis: s.vagas_disponiveis,
        }));
        setUseTimeSlots(!!slotsResponse.data.use_time_slots);
        setUseTimeSlotsInitial(!!slotsResponse.data.use_time_slots);
        setTimeSlots(savedSlots);
        setTimeSlotsInitial(savedSlots);
      }

      setSnackbar({ open: true, message: 'Configuração de senhas salva!', severity: 'success' });
      loadGiras();
    } catch (error) {
      const msg = extractApiErrorMessage(error, 'Erro ao salvar configuração');
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSenhaSaving(false);
    }
  };

  const handleReleaseNow = async () => {
    if (!senhaTarget || !canEdit) return;
    setReleaseConfirmOpen(false);
    setSenhaSaving(true);
    try {
      const response = await apiClient.post(`/api/v1/admin/giras/${senhaTarget.id}/release-now`);
      setSenhaConfig(response.data);
      const released = {
        max_tickets: response.data.max_tickets ? String(response.data.max_tickets) : '',
        release_start_at: isoToLocalDatetimeInput(response.data.release_start_at),
        release_end_at: isoToLocalDatetimeInput(response.data.release_end_at),
        sponsor_max_tickets: response.data.sponsor_max_tickets ? String(response.data.sponsor_max_tickets) : '',
        sponsor_release_start_at: isoToLocalDatetimeInput(response.data.sponsor_release_start_at),
        sponsor_release_end_at: isoToLocalDatetimeInput(response.data.sponsor_release_end_at),
        waitlist_confirmation_hours: response.data.waitlist_confirmation_hours ? String(response.data.waitlist_confirmation_hours) : '',
      };
      setSenhaForm(released);
      setSenhaInitial(released);
      setSnackbar({ open: true, message: 'Senhas liberadas agora!', severity: 'success' });
      loadGiras();
    } catch (error) {
      const msg = extractApiErrorMessage(error, 'Erro ao liberar senhas');
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSenhaSaving(false);
    }
  };

  const copyPublicLink = async (link: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setSnackbar({ open: true, message: 'Link copiado!', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Não foi possível copiar o link', severity: 'error' });
    }
  };

  const getSenhaChip = (gira: Gira) => {
    if (!gira.max_tickets) return <Chip label="Não configurado" size="small" variant="outlined" />;
    const now = new Date();
    const end = gira.release_end_at ? new Date(gira.release_end_at) : null;
    const start = gira.release_start_at ? new Date(gira.release_start_at) : null;
    if (end && now > end) return <Chip label="Encerrado" size="small" color="default" />;
    if (start && now >= start && end && now < end) return <Chip label="Aberto" size="small" color="success" />;
    if (start && now < start) return <Chip label="Agendado" size="small" color="info" />;
    return <Chip label="Configurado" size="small" color="warning" />;
  };

  if (!canView) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        Você não tem permissão para visualizar giras. Contate o administrador do sistema.
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Gestão de Giras"
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => loadGiras()} disabled={loading} size="small">
              Atualizar
            </Button>
            {canInsert && (
              <Tooltip title={!canCreateGira && !subLoading ? (subscription?.max_giras_per_month != null && subscription.max_giras_per_month >= 0 ? `Limite de ${subscription.max_giras_per_month} gira(s)/mês atingido. Faça upgrade do plano.` : 'Sem assinatura ativa. Faça upgrade do plano.') : ''}>
                <span>
                  <Button data-tour="giras-nova" variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={!canCreateGira} size="small">
                    Nova Gira
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>
        }
      />

      {/* Gira usage progress bar — only for plans with finite limits */}
      {subscription && subscription.max_giras_per_month >= 0 && (
        <Box data-tour="giras-usage" sx={{ mb: 3 }}>
          <GiraUsageBar used={subscription.current_giras_this_month} max={subscription.max_giras_per_month} />
        </Box>
      )}

      {unifiedLinks && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Links únicos do terreiro
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Sempre apontam para a próxima gira (ou a que estiver aberta). Compartilhe uma vez só — não precisa trocar o link a cada gira.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Senha comum: {unifiedLinks.public_link}
              </Typography>
              <IconButton size="small" onClick={() => copyPublicLink(unifiedLinks.public_link)}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" component="a" href={unifiedLinks.public_link} target="_blank" rel="noopener noreferrer">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Senha associado: {unifiedLinks.sponsor_public_link}
              </Typography>
              <IconButton size="small" onClick={() => copyPublicLink(unifiedLinks.sponsor_public_link)}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" component="a" href={unifiedLinks.sponsor_public_link} target="_blank" rel="noopener noreferrer">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      )}

      <TableContainer data-tour="giras-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Data Início</TableCell>
                <TableCell>Senhas</TableCell>
                <TableCell>Status</TableCell>
                {(canEdit || canDelete || canViewPorta) && <TableCell align="right">Ações</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {giras.map((gira) => (
                <TableRow key={gira.id}>
                  <TableCell>{gira.nome}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {new Date(gira.data_inicio).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>{getSenhaChip(gira)}</TableCell>
                  <TableCell>
                    <Chip
                      label={gira.is_active ? 'Ativa' : 'Inativa'}
                      size="small"
                      color={gira.is_active ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  {(canEdit || canDelete || canViewPorta) && (
                    <TableCell align="right">
                      {isMobile ? (
                        <>
                          <IconButton
                            data-tour="giras-acoes"
                            size="small"
                            onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuGira(gira); }}
                          >
                            <MoreVertIcon />
                          </IconButton>
                          <Menu
                            anchorEl={menuAnchor}
                            open={Boolean(menuAnchor) && menuGira?.id === gira.id}
                            onClose={() => { setMenuAnchor(null); setMenuGira(null); }}
                          >
                            {canViewPorta && !!gira.max_tickets && (
                              <MuiMenuItem
                                component={Link}
                                href={`/admin/porta?gira=${gira.id}`}
                                onClick={() => { setMenuAnchor(null); setMenuGira(null); }}
                              >
                                <MeetingRoomIcon fontSize="small" sx={{ mr: 1 }} /> Abrir na Porta
                              </MuiMenuItem>
                            )}
                            {canEdit && (
                              <MuiMenuItem onClick={() => { openSenhaDrawer(gira); setMenuAnchor(null); setMenuGira(null); }}>
                                <ConfirmationNumberIcon fontSize="small" sx={{ mr: 1 }} /> Configurar Senhas
                              </MuiMenuItem>
                            )}
                            {canEdit && (
                              <MuiMenuItem onClick={() => { openEdit(gira); setMenuAnchor(null); setMenuGira(null); }}>
                                <EditIcon fontSize="small" sx={{ mr: 1 }} /> Editar
                              </MuiMenuItem>
                            )}
                            {canDelete && (
                              <MuiMenuItem onClick={() => { handleDeleteClick(gira); setMenuAnchor(null); setMenuGira(null); }} sx={{ color: 'error.main' }}>
                                <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Deletar
                              </MuiMenuItem>
                            )}
                          </Menu>
                        </>
                      ) : (
                        <>
                          {canViewPorta && !!gira.max_tickets && (
                            <Tooltip title="Abrir na Porta">
                              <IconButton size="small" component={Link} href={`/admin/porta?gira=${gira.id}`}>
                                <MeetingRoomIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit && (
                            <Tooltip title="Configurar Senhas">
                              <IconButton size="small" onClick={() => openSenhaDrawer(gira)}>
                                <ConfirmationNumberIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit && (
                            <Tooltip title="Editar">
                              <IconButton size="small" onClick={() => openEdit(gira)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDelete && (
                            <Tooltip title="Deletar">
                              <IconButton size="small" onClick={() => handleDeleteClick(gira)}>
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Create / Edit Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'Nova Gira' : 'Editar Gira'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre uma nova gira (sessão espiritual) para o seu terreiro.'
            : 'Altere as informações da gira selecionada.'
        }
        icon={<EventIcon />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Criar' : 'Salvar'}
        saving={saving}
        saveDisabled={saveDisabled}
        isDirty={isDirty}
      >
        <TextField
          label="Nome"
          value={formData.nome}
          onChange={(e) => handleChange('nome', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, nome: true }))}
          fullWidth
          required
          error={!!nomeError}
          helperText={nomeError}
        />
        <TextField
          label="Descrição"
          value={formData.descricao}
          onChange={(e) => handleChange('descricao', e.target.value)}
          fullWidth
          multiline
          rows={2}
        />
        <TextField
          label="Recados"
          value={formData.recados}
          onChange={(e) => handleChange('recados', e.target.value)}
          fullWidth
          multiline
          rows={3}
          helperText="Opcional. Aparece no email da senha — investimento, itens de doação, avisos etc."
        />
        <TextField
          label="Data Início"
          type="datetime-local"
          value={formData.data_inicio}
          onChange={(e) => handleChange('data_inicio', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, data_inicio: true }))}
          fullWidth
          required
          InputLabelProps={{ shrink: true }}
          error={!!dataError}
          helperText={dataError}
        />
      </CrudDrawer>

      {/* Senha Config Drawer */}
      <CrudDrawer
        open={senhaDrawerOpen}
        onClose={closeSenhaDrawer}
        title="Configurar Senhas"
        subtitle={senhaTarget ? `Defina a quantidade e janela de emissão para "${senhaTarget.nome}".` : ''}
        icon={<ConfirmationNumberIcon />}
        onSave={handleSenhaSave}
        saveLabel="Salvar Configuração"
        saving={senhaSaving}
        saveDisabled={senhaSaveDisabled}
        isDirty={senhaDirty}
      >
        {senhaLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TextField
              label="Quantidade de Senhas"
              type="number"
              value={senhaForm.max_tickets}
              onChange={(e) => handleSenhaChange('max_tickets', e.target.value)}
              onBlur={() => setSenhaTouched((p) => ({ ...p, max_tickets: true }))}
              fullWidth
              required
              inputProps={{ min: 1 }}
              error={!!senhaMaxError}
              helperText={senhaMaxError || 'Total de senhas disponíveis para esta gira'}
            />
            <TextField
              label="Início da Liberação"
              type="datetime-local"
              value={senhaForm.release_start_at}
              onChange={(e) => handleSenhaChange('release_start_at', e.target.value)}
              onBlur={() => setSenhaTouched((p) => ({ ...p, release_start_at: true }))}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              error={!!senhaStartError}
              helperText={senhaStartError || 'Quando o público poderá emitir senhas'}
            />
            <TextField
              label="Fim da Liberação"
              type="datetime-local"
              value={senhaForm.release_end_at}
              onChange={(e) => handleSenhaChange('release_end_at', e.target.value)}
              onBlur={() => setSenhaTouched((p) => ({ ...p, release_end_at: true }))}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              error={!!senhaEndError}
              helperText={senhaEndError || 'Quando a emissão será encerrada'}
            />

            {can('fila_espera') && (
              <TextField
                label="Prazo de confirmação da fila de espera (horas)"
                type="number"
                value={senhaForm.waitlist_confirmation_hours}
                onChange={(e) => handleSenhaChange('waitlist_confirmation_hours', e.target.value)}
                fullWidth
                inputProps={{ min: 1 }}
                helperText="Quando uma vaga abre para quem está na fila, esse é o prazo para confirmar antes de passar para o próximo. Padrão: 24h."
              />
            )}

            {/* Current count + progress */}
            {senhaConfig && senhaConfig.max_tickets > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Senhas emitidas: {senhaConfig.current_count} / {senhaConfig.max_tickets}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (senhaConfig.current_count / senhaConfig.max_tickets) * 100)}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            {/* Public link */}
            {senhaConfig?.public_link && (
              <Box sx={{ mt: 1, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">Link Público</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {senhaConfig.public_link}
                  </Typography>
                  <Tooltip title="Copiar link">
                    <IconButton size="small" onClick={() => copyPublicLink(senhaConfig.public_link)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Abrir link">
                    <IconButton size="small" component="a" href={senhaConfig.public_link} target="_blank" rel="noopener noreferrer">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            )}

            {/* Release Now button */}
            <Box sx={{ mt: 1 }}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RocketLaunchIcon />}
                onClick={() => setReleaseConfirmOpen(true)}
                fullWidth
              >
                Liberar Agora
              </Button>
            </Box>

            {/* ═══ Horários de Atendimento (agendamento por horário) ═══ */}
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AccessTimeIcon color="action" />
                <Typography variant="subtitle1" fontWeight="bold">
                  Horários de Atendimento
                </Typography>
              </Box>

              {!subLoading && !can('agendamento_por_horario') ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, borderRadius: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                  <LockIcon sx={{ fontSize: 20, color: 'text.disabled', mt: 0.2, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      Disponível a partir do plano Pro
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                      Faça upgrade para deixar o consulente escolher um horário de atendimento ao emitir a senha.
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ mt: 1, textTransform: 'none' }}
                      onClick={() => { window.location.href = '/admin/plano'; }}
                    >
                      Ver Planos
                    </Button>
                  </Box>
                </Box>
              ) : !timeSlotSchedulingEnabled ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Habilite em{' '}
                  <Link href="/admin/config" style={{ fontWeight: 600 }}>Configurações → Funcionalidades</Link>
                  {' '}para usar horários de atendimento.
                </Typography>
              ) : (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={useTimeSlots}
                        onChange={(e) => handleToggleUseTimeSlots(e.target.checked)}
                      />
                    }
                    label="Consulente escolhe um horário ao emitir a senha"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Divide as {senhaForm.max_tickets || 'X'} senhas em janelas de horário (ex: 20h, 20h30, 21h) para
                    evitar acúmulo de pessoas na porta.
                  </Typography>

                  {useTimeSlots && (
                    <>
                      {timeSlots.map((slot, index) => (
                        <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
                          <TextField
                            label="Horário"
                            type="time"
                            value={slot.horario}
                            onChange={(e) => updateSlotRow(index, 'horario', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            label="Vagas"
                            type="number"
                            value={slot.capacidade_maxima}
                            onChange={(e) => updateSlotRow(index, 'capacidade_maxima', e.target.value)}
                            inputProps={{ min: 1 }}
                            size="small"
                            sx={{ flex: 1 }}
                            helperText={
                              slot.vagas_disponiveis !== undefined
                                ? `${slot.vagas_disponiveis} disponíveis`
                                : undefined
                            }
                          />
                          <IconButton size="small" onClick={() => removeSlotRow(index)} sx={{ mt: 0.5 }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button size="small" startIcon={<AddIcon />} onClick={addSlotRow}>
                        Adicionar horário
                      </Button>
                      {!timeSlotsValid && timeSlots.length > 0 && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          Preencha todos os horários com vagas ≥ 1 e sem horários repetidos.
                        </Typography>
                      )}
                    </>
                  )}
                </>
              )}
            </Box>

            {/* ═══ Sponsor Section ═══ */}
            <Box sx={{ mt: 3, pt: 2, borderTop: '2px solid #daa520' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <StarIcon sx={{ color: '#daa520' }} />
                <Typography variant="subtitle1" fontWeight="bold" color="#b8860b">
                  Senhas de Associados
                </Typography>
              </Box>

              {!subLoading && !can('associados') ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, borderRadius: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                  <LockIcon sx={{ fontSize: 20, color: 'text.disabled', mt: 0.2, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      Disponível a partir do plano Pro
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                      Faça upgrade para configurar senhas de associados.
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ mt: 1, textTransform: 'none' }}
                      onClick={() => { window.location.href = '/admin/plano'; }}
                    >
                      Ver Planos
                    </Button>
                  </Box>
                </Box>
              ) : (
              <>
              <TextField
                label="Quantidade de Senhas (Associado)"
                type="number"
                value={senhaForm.sponsor_max_tickets}
                onChange={(e) => handleSenhaChange('sponsor_max_tickets', e.target.value)}
                fullWidth
                inputProps={{ min: 0 }}
                helperText="Deixe 0 ou vazio para desabilitar senhas de associado"
              />
              {senhaForm.sponsor_max_tickets && Number(senhaForm.sponsor_max_tickets) > 0 && (
                <>
                  <TextField
                    label="Início da Liberação (Associado)"
                    type="datetime-local"
                    value={senhaForm.sponsor_release_start_at}
                    onChange={(e) => handleSenhaChange('sponsor_release_start_at', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Se vazio, usa o mesmo horário das senhas comuns"
                  />
                  <TextField
                    label="Fim da Liberação (Associado)"
                    type="datetime-local"
                    value={senhaForm.sponsor_release_end_at}
                    onChange={(e) => handleSenhaChange('sponsor_release_end_at', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Se vazio, usa o mesmo horário das senhas comuns"
                  />

                  {/* Sponsor count + progress */}
                  {senhaConfig && senhaConfig.sponsor_max_tickets && senhaConfig.sponsor_max_tickets > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Senhas associado emitidas: {senhaConfig.sponsor_current_count || 0} / {senhaConfig.sponsor_max_tickets}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, ((senhaConfig.sponsor_current_count || 0) / senhaConfig.sponsor_max_tickets) * 100)}
                        sx={{ height: 8, borderRadius: 4 }}
                        color="warning"
                      />
                    </Box>
                  )}

                  {/* Sponsor public link */}
                  {senhaConfig?.sponsor_public_link && (
                    <Box sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <StarIcon sx={{ fontSize: 14, color: '#b8860b' }} />
                        <Typography variant="caption" sx={{ color: '#7d6608', fontWeight: 600 }}>Link Associado</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem' }}
                        >
                          {senhaConfig.sponsor_public_link}
                        </Typography>
                        <Tooltip title="Copiar link">
                          <IconButton size="small" onClick={() => copyPublicLink(senhaConfig.sponsor_public_link || '')}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Abrir link">
                          <IconButton size="small" component="a" href={senhaConfig.sponsor_public_link} target="_blank" rel="noopener noreferrer">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  )}
                </>
              )}
              </>
              )}
            </Box>
          </>
        )}
      </CrudDrawer>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        title="Confirmar exclusão"
        message={`Tem certeza que deseja deletar a gira "${deleteTarget?.nome}"?`}
        confirmText="Deletar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />

      {/* Release Now Confirm Dialog */}
      <ConfirmDialog
        open={releaseConfirmOpen}
        title="Liberar Senhas Agora?"
        message={`A emissão de senhas para "${senhaTarget?.nome}" será aberta imediatamente. O público poderá emitir senhas a partir de agora.`}
        confirmText="Liberar Agora"
        cancelText="Cancelar"
        onConfirm={handleReleaseNow}
        onCancel={() => setReleaseConfirmOpen(false)}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
