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
  useTheme,
  useMediaQuery,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/GetApp';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import EditIcon from '@mui/icons-material/Edit';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import AdminLayout from '../admin_layout';
import BulkActionsBar from '../../../components/admin/BulkActionsBar';
import CrudDrawer from '../../../components/CrudDrawer';
import { apiClient } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';

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

export default function AdminTicketsPage() {
  return (
    <AdminLayout title="Tickets">
      <AdminTicketsContent />
    </AdminLayout>
  );
}

function AdminTicketsContent() {
  const { can } = useSubscription();
  const hasBulk = true;
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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

  // Drawer state for attend info editing
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [editTicketNumero, setEditTicketNumero] = useState<number>(0);
  const [formData, setFormData] = useState({ medium_nome: '', cambone_nome: '', atendimento_descricao: '' });
  const [originalData, setOriginalData] = useState({ medium_nome: '', cambone_nome: '', atendimento_descricao: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

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
    const token =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('access_token'));
    if (!token) {
      router.replace('/login');
      return;
    }
    loadGiras();
  }, [giraFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadTickets();
  }, [page, statusFilter, giraId]);

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

  return (
    <>
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

      <TableContainer data-tour="tickets-tabela" component={Paper} sx={{ mt: 2, overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
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
                {tickets.length > 0 ? (
                  tickets.map((ticket) => (
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

      <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>
      </Snackbar>
      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
    </>
  );
}
