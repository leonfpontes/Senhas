/**
 * T074: Admin Tickets Page - Pagination, filtering, bulk actions
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Badge,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Chip,
  Pagination,
  TextField,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Alert,
  Snackbar,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import AdminLayout from '../admin_layout';
import BulkActionsBar from '../../../components/admin/BulkActionsBar';
import CrudDrawer from '../../../components/CrudDrawer';
import { apiClient } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';

interface Ticket {
  id: string;
  numero: number;
  status: string;
  consulente_nome?: string;
  consulente_email?: string;
  consulente_telefone?: string;
  preferencial?: boolean;
  is_sponsor?: boolean;
  observacoes?: string;
  chamado_em?: string;
  finalizado_em?: string;
  medium_nome?: string;
  cambone_nome?: string;
  atendimento_descricao?: string;
  created_at: string;
  resend_email_id?: string;
  email_sent_at?: string;
  email_provider?: string;
}

type GiraFilter = 'all' | 'active' | 'inactive';

interface WaitlistItem {
  id: string;
  numero: number;
  consulente_nome?: string;
  consulente_email?: string;
  is_sponsor?: boolean;
  priority_category?: string;
  status: 'aguardando' | 'aguardando_confirmacao' | 'expirado' | 'emitido';
  position?: number;
  promoted_at?: string;
  confirmation_expires_at?: string;
  created_at: string;
}

export default function AdminTicketsPage() {
  return (
    <AdminLayout title="Tickets">
      <AdminTicketsContent />
    </AdminLayout>
  );
}

function AdminTicketsContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const hasBulk = true;
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [giraId, setGiraId] = useState<string>('');
  const [giras, setGiras] = useState<{ id: string; nome: string; is_active: boolean; data_inicio: string }[]>([]);
  const [giraFilter, setGiraFilter] = useState<GiraFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Free-text search (debounced). Filters the current page client-side by
  // ticket number, consulente name or email. The /tickets endpoint does not
  // accept a `search`/`q` param, so filtering is done locally.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Drawer state for attend info editing
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [editTicketNumero, setEditTicketNumero] = useState<number>(0);
  const [formData, setFormData] = useState({ medium_nome: '', cambone_nome: '', atendimento_descricao: '' });
  const [originalData, setOriginalData] = useState({ medium_nome: '', cambone_nome: '', atendimento_descricao: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ticket: Ticket; giraId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDeleteDialog = (ticket: Ticket) => {
    if (!giraId) return;
    setDeleteTarget({ ticket, giraId });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/giras/${deleteTarget.giraId}/tickets/${deleteTarget.ticket.id}`);
      setSuccess(`Senha #${String(deleteTarget.ticket.numero).padStart(4, '0')} excluída com sucesso. A vaga foi devolvida à gira.`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadTickets();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao excluir a senha.');
    } finally {
      setDeleting(false);
    }
  };

  const loadGiras = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (giraFilter === 'active') params.append('is_active', 'true');
      if (giraFilter === 'inactive') params.append('is_active', 'false');
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const response = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const data = Array.isArray(response.data) ? response.data : response.data.items || [];
      setGiras(data);
      // If current selected gira is not in filtered results, clear it
      if (giraId && !data.some((g: any) => g.id === giraId)) {
        setGiraId('');
      }
    } catch (error) {
      console.error('Error loading giras:', error);
    }
  };

  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistExpanded, setWaitlistExpanded] = useState(false);
  const [waitlistActionId, setWaitlistActionId] = useState<string | null>(null);

  const loadWaitlist = async () => {
    if (!giraId || !can('fila_espera')) {
      setWaitlist([]);
      return;
    }
    try {
      setWaitlistLoading(true);
      const response = await apiClient.get(`/api/v1/admin/giras/${giraId}/waitlist`);
      setWaitlist(response.data);
    } catch (error) {
      console.error('Error loading waitlist:', error);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handlePromoteWaitlist = async (item: WaitlistItem, requireConfirmation: boolean) => {
    if (!giraId) return;
    setWaitlistActionId(item.id);
    try {
      await apiClient.post(`/api/v1/admin/giras/${giraId}/waitlist/${item.id}/promote`, {
        require_confirmation: requireConfirmation,
      });
      setSuccess(
        requireConfirmation
          ? `Senha #${item.numero} promovida — e-mail de confirmação enviado.`
          : `Senha #${item.numero} liberada diretamente, sem precisar de confirmação.`,
      );
      await loadWaitlist();
    } catch (error: any) {
      setError(error?.response?.data?.detail || 'Erro ao promover senha da fila.');
    } finally {
      setWaitlistActionId(null);
    }
  };

  const [releaseConfirmTarget, setReleaseConfirmTarget] = useState<WaitlistItem | null>(null);

  const handleRemoveWaitlist = async (item: WaitlistItem) => {
    if (!giraId) return;
    setWaitlistActionId(item.id);
    try {
      await apiClient.delete(`/api/v1/admin/giras/${giraId}/waitlist/${item.id}`);
      setSuccess(`Senha #${item.numero} removida da fila de espera.`);
      await loadWaitlist();
    } catch (error: any) {
      setError(error?.response?.data?.detail || 'Erro ao remover senha da fila.');
    } finally {
      setWaitlistActionId(null);
    }
  };

  const waitlistStatusLabel: Record<WaitlistItem['status'], string> = {
    aguardando: 'Aguardando',
    aguardando_confirmacao: 'Aguardando confirmação',
    expirado: 'Expirado',
    emitido: 'Liberada',
  };

  const loadTickets = async () => {
    try {
      setLoading(true);
      if (!giraId) {
        setTickets([]);
        return;
      }

      let url = `/api/v1/admin/giras/${giraId}/tickets?skip=${page * limit}&limit=${limit}`;
      if (statusFilter) {
        url += `&status_filter=${statusFilter}`;
      }

      const response = await apiClient.get(url);
      setTickets(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auth is cookie-based (HttpOnly access_token) for normal sessions — it's
    // never in sessionStorage/localStorage except during impersonation. A
    // check against those two alone is always false for a regular login and
    // would bounce every visit straight back to /login before the page even
    // gets a chance to call the API.
    const hasAuthToken =
      Boolean(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      Boolean(typeof document !== 'undefined' && document.cookie.includes('auth_state=1'));
    if (!hasAuthToken) {
      router.replace('/login');
      return;
    }
    loadGiras();
    // loadGiras isn't memoized and router is a stable Next.js reference — safe to omit both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giraFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadTickets();
    // loadTickets isn't memoized — including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, giraId]);

  useEffect(() => {
    loadWaitlist();
    // loadWaitlist isn't memoized — including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giraId]);

  const handleSelectTicket = (id: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTickets(newSelected);
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = new Set(tickets.map((t) => t.id));
      setSelectedTickets(newSelected);
    } else {
      setSelectedTickets(new Set());
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
      emitted: 'default',
      called: 'warning',
      completed: 'success',
      cancelled: 'error',
    };
    return colors[status] || 'default';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      emitted: 'Emitido',
      called: 'Chamado',
      completed: 'Concluído',
      cancelled: 'Cancelado',
      no_show: 'Não compareceu',
    };
    return labels[status] || status;
  };

  const openAttendEdit = (ticket: Ticket) => {
    const data = {
      medium_nome: ticket.medium_nome || '',
      cambone_nome: ticket.cambone_nome || '',
      atendimento_descricao: ticket.atendimento_descricao || '',
    };
    setFormData(data);
    setOriginalData(data);
    setEditTicketId(ticket.id);
    setEditTicketNumero(ticket.numero);
    setDrawerOpen(true);
  };

  const handleSaveAttendInfo = async () => {
    if (!editTicketId) return;
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/admin/tickets/${editTicketId}/attend-info`, {
        medium_nome: formData.medium_nome.trim() || null,
        cambone_nome: formData.cambone_nome.trim() || null,
        atendimento_descricao: formData.atendimento_descricao.trim() || null,
      });
      setDrawerOpen(false);
      setSuccess('Informações de atendimento salvas com sucesso!');
      loadTickets();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao salvar informações de atendimento');
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    formData.medium_nome !== originalData.medium_nome ||
    formData.cambone_nome !== originalData.cambone_nome ||
    formData.atendimento_descricao !== originalData.atendimento_descricao;

  const activeFilterCount = [dateFrom, dateTo, statusFilter, giraFilter !== 'all' ? 'giraFilter' : ''].filter(Boolean).length;

  // Apply free-text search over the loaded page
  const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const displayedTickets = (() => {
    const q = search.trim();
    if (!q) return tickets;
    const needle = normalize(q.replace(/^#/, ''));
    return tickets.filter((t) => {
      const numStr = String(t.numero);
      const numPadded = String(t.numero).padStart(4, '0');
      return (
        numStr.includes(needle) ||
        numPadded.includes(needle) ||
        normalize(t.consulente_nome ?? '').includes(needle) ||
        normalize(t.consulente_email ?? '').includes(needle)
      );
    });
  })();

  return (
    <>
      {/* ── Busca livre por número, nome ou email ── */}
      <TextField
        size="small"
        fullWidth
        placeholder="Buscar por número, nome ou email…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color={searchInput ? 'primary' : 'disabled'} />
            </InputAdornment>
          ),
        }}
      />

      {/* ── Seletor de Gira — sempre visível ── */}
      <Box data-tour="tickets-header" sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 2 }, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        <FormControl data-tour="tickets-gira-select" size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
          <InputLabel>Selecione uma Gira</InputLabel>
          <Select
            value={giraId}
            onChange={(e) => {
              setGiraId(e.target.value);
              setPage(0);
              setSelectedTickets(new Set());
            }}
            label="Selecione uma Gira"
          >
            <MenuItem value="">Nenhuma</MenuItem>
            {giras.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.nome}
                {!g.is_active && (
                  <Chip label="inativa" size="small" color="default" sx={{ ml: 1, height: 20 }} />
                )}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Botão toggle de filtros — apenas mobile */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<FilterListIcon />}
          endIcon={filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setFiltersExpanded((p) => !p)}
          sx={{ display: { xs: 'flex', sm: 'none' }, width: '100%', justifyContent: 'space-between' }}
        >
          <Badge badgeContent={activeFilterCount} color="primary" sx={{ flexGrow: 1, textAlign: 'left' }}>
            Filtros avançados
          </Badge>
        </Button>

        {/* Filtros avançados — colapsam no mobile, sempre visíveis no desktop */}
        <Box
          data-tour="tickets-filtros"
          sx={{
            display: { xs: 'none', sm: 'flex' },
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            flexGrow: 1,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Tipo de Gira</InputLabel>
            <Select
              value={giraFilter}
              onChange={(e) => {
                setGiraFilter(e.target.value as GiraFilter);
                setGiraId('');
                setPage(0);
              }}
              label="Tipo de Gira"
            >
              <MenuItem value="all">Todas</MenuItem>
              <MenuItem value="active">Ativas</MenuItem>
              <MenuItem value="inactive">Inativas</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Data de"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />

          <TextField
            size="small"
            label="Data até"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              label="Status"
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="emitted">Emitidos</MenuItem>
              <MenuItem value="called">Chamados</MenuItem>
              <MenuItem value="completed">Concluídos</MenuItem>
              <MenuItem value="cancelled">Cancelados</MenuItem>
            </Select>
          </FormControl>

          {(dateFrom || dateTo || giraFilter !== 'all' || statusFilter) && (
            <Button size="small" onClick={() => { setGiraFilter('all'); setDateFrom(''); setDateTo(''); setStatusFilter(''); setGiraId(''); setPage(0); }}>
              Limpar filtros
            </Button>
          )}
        </Box>
      </Box>

      {/* Painel colapsável de filtros — apenas mobile */}
      <Collapse in={filtersExpanded} sx={{ display: { xs: 'block', sm: 'none' }, mb: filtersExpanded ? 1.5 : 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Tipo de Gira</InputLabel>
            <Select
              value={giraFilter}
              onChange={(e) => { setGiraFilter(e.target.value as GiraFilter); setGiraId(''); setPage(0); }}
              label="Tipo de Gira"
            >
              <MenuItem value="all">Todas</MenuItem>
              <MenuItem value="active">Ativas</MenuItem>
              <MenuItem value="inactive">Inativas</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Data de"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            size="small"
            label="Data até"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              label="Status"
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="emitted">Emitidos</MenuItem>
              <MenuItem value="called">Chamados</MenuItem>
              <MenuItem value="completed">Concluídos</MenuItem>
              <MenuItem value="cancelled">Cancelados</MenuItem>
            </Select>
          </FormControl>

          {(dateFrom || dateTo || giraFilter !== 'all' || statusFilter) && (
            <Button size="small" variant="text" onClick={() => { setGiraFilter('all'); setDateFrom(''); setDateTo(''); setStatusFilter(''); setGiraId(''); setPage(0); }}>
              Limpar filtros
            </Button>
          )}
        </Box>
      </Collapse>

      {hasBulk && selectedTickets.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedTickets.size}
          ticketIds={Array.from(selectedTickets)}
          onRefresh={loadTickets}
          onClearSelection={() => setSelectedTickets(new Set())}
        />
      )}

      {can('fila_espera') && giraId && (
        <Paper data-tour="tickets-fila-espera" variant="outlined" sx={{ mt: 2, p: 1.5 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
            onClick={() => setWaitlistExpanded((v) => !v)}
          >
            <HourglassEmptyIcon fontSize="small" color="action" />
            <Box sx={{ fontWeight: 600, flex: 1 }}>Fila de espera</Box>
            {waitlist.length > 0 && (
              <Badge badgeContent={waitlist.length} color="warning" sx={{ mr: 2 }} />
            )}
            <IconButton size="small">
              {waitlistExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={waitlistExpanded}>
            <Box sx={{ mt: 1.5 }}>
              {waitlistLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : waitlist.length === 0 ? (
                <Box sx={{ color: 'text.secondary', fontSize: 14, p: 1 }}>
                  Ninguém na fila de espera para esta gira no momento.
                </Box>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Número</TableCell>
                        <TableCell>Nome</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Posição</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="center">Ações</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {waitlist.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.is_sponsor ? 'P' : ''}{String(item.numero).padStart(4, '0')}</TableCell>
                          <TableCell>{item.consulente_nome || '—'}</TableCell>
                          <TableCell>{item.consulente_email || '—'}</TableCell>
                          <TableCell>{item.position ? `${item.position}º` : '—'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={waitlistStatusLabel[item.status]}
                              color={item.status === 'aguardando_confirmacao' ? 'info' : item.status === 'expirado' ? 'default' : 'warning'}
                            />
                          </TableCell>
                          <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                            {item.status === 'aguardando' && canGroup('tickets', 'edit') && (
                              <Tooltip title="Promover fora da ordem (envia e-mail de confirmação, com prazo)">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={waitlistActionId === item.id}
                                    onClick={() => handlePromoteWaitlist(item, true)}
                                  >
                                    <CheckIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {item.status === 'aguardando' && canGroup('tickets', 'edit') && (
                              <Tooltip title="Liberar senha direto, sem exigir confirmação do consulente">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={waitlistActionId === item.id}
                                    onClick={() => setReleaseConfirmTarget(item)}
                                  >
                                    <FlashOnIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {item.status !== 'expirado' && canGroup('tickets', 'delete') && (
                              <Tooltip title="Remover da fila">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={waitlistActionId === item.id}
                                    onClick={() => handleRemoveWaitlist(item)}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Collapse>
        </Paper>
      )}

      <TableContainer data-tour="tickets-tabela" component={Paper} sx={{ mt: 2, overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  {hasBulk && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTickets.size === tickets.length && tickets.length > 0}
                        onChange={handleSelectAll}
                      />
                    </TableCell>
                  )}
                  <TableCell>Número</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Email</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Telefone</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Tag</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Data Emissão</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedTickets.length > 0 ? (
                  displayedTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      {hasBulk && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedTickets.has(ticket.id)}
                            onChange={() => handleSelectTicket(ticket.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 600 }}>#{String(ticket.numero).padStart(4, '0')}</TableCell>
                      <TableCell>{ticket.consulente_nome || '-'}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{ticket.consulente_email || '-'}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{ticket.consulente_telefone || '-'}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {ticket.is_sponsor && (
                            <Chip icon={<StarIcon />} label="Associado" size="small" sx={{ bgcolor: '#fef9e7', color: '#b8860b', '& .MuiChip-icon': { color: '#daa520' } }} />
                          )}
                          {ticket.preferencial && (
                            <Chip icon={<StarIcon />} label="Preferencial" color="warning" size="small" variant="outlined" />
                          )}
                          {!ticket.is_sponsor && !ticket.preferencial && (
                            <Chip label="Comum" size="small" variant="outlined" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(ticket.status)}
                          color={getStatusColor(ticket.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        {new Date(ticket.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Editar atendimento">
                          <IconButton size="small" onClick={() => openAttendEdit(ticket)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {ticket.consulente_email && can('email_transacional') && (
                          <Tooltip title={ticket.email_sent_at ? 'Ver rastreio de e-mail' : 'E-mail não enviado'}>
                            <IconButton
                              size="small"
                              onClick={() => router.push(`/admin/tickets/${ticket.id}/email`)}
                            >
                              <EmailOutlinedIcon
                                fontSize="small"
                                color={
                                  ticket.email_provider === 'failed'
                                    ? 'error'
                                    : ticket.email_sent_at
                                    ? 'primary'
                                    : 'disabled'
                                }
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {(ticket.status === 'emitted' || ticket.status === 'called') && (
                          <Tooltip title="Excluir senha e devolver vaga">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openDeleteDialog(ticket)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      Nenhum ticket encontrado
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

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Atendimento — Senha #${String(editTicketNumero).padStart(4, '0')}`}
        subtitle="Edite as informações de médium, cambone e observações do atendimento."
        icon={<MedicalServicesIcon />}
        onSave={handleSaveAttendInfo}
        saveLabel="Salvar"
        saving={saving}
        isDirty={isDirty}
      >
        <TextField
          label="Médium"
          value={formData.medium_nome}
          onChange={(e) => setFormData((p) => ({ ...p, medium_nome: e.target.value }))}
          fullWidth
          sx={{ mb: 2 }}
        />
        <TextField
          label="Cambone"
          value={formData.cambone_nome}
          onChange={(e) => setFormData((p) => ({ ...p, cambone_nome: e.target.value }))}
          fullWidth
          sx={{ mb: 2 }}
        />
        <TextField
          label="Observações do Atendimento"
          value={formData.atendimento_descricao}
          onChange={(e) => setFormData((p) => ({ ...p, atendimento_descricao: e.target.value }))}
          fullWidth
          multiline
          minRows={3}
        />
      </CrudDrawer>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Excluir senha</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Deseja excluir a senha{' '}
            <strong>#{deleteTarget ? String(deleteTarget.ticket.numero).padStart(4, '0') : ''}</strong>
            {deleteTarget?.ticket.consulente_nome ? ` de ${deleteTarget.ticket.consulente_nome}` : ''}?
            <br /><br />
            O consulente poderá emitir uma nova senha e a vaga será devolvida ao range da gira.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />}
          >
            {deleting ? 'Excluindo...' : 'Excluir senha'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Waitlist: release-without-confirmation dialog */}
      <Dialog open={!!releaseConfirmTarget} onClose={() => setReleaseConfirmTarget(null)}>
        <DialogTitle>Liberar senha sem confirmação</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Deseja liberar a senha{' '}
            <strong>#{releaseConfirmTarget ? String(releaseConfirmTarget.numero).padStart(4, '0') : ''}</strong>
            {releaseConfirmTarget?.consulente_nome ? ` de ${releaseConfirmTarget.consulente_nome}` : ''} diretamente?
            <br /><br />
            A senha vira oficial imediatamente — o consulente não precisa clicar em nenhum link de confirmação.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReleaseConfirmTarget(null)} disabled={!!waitlistActionId}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              const target = releaseConfirmTarget;
              setReleaseConfirmTarget(null);
              if (target) handlePromoteWaitlist(target, false);
            }}
            color="warning"
            variant="contained"
            disabled={!!waitlistActionId}
            startIcon={<FlashOnIcon />}
          >
            Liberar sem confirmação
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>
      </Snackbar>
      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
    </>
  );
}
