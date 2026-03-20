/**
 * T074: Admin Tickets Page - Pagination, filtering, bulk actions
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
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
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/GetApp';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import AdminLayout from './admin_layout';
import BulkActionsBar from '../../components/admin/BulkActionsBar';
import { apiClient } from '../../services/api_client';

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
  created_at: string;
}

type GiraFilter = 'all' | 'active' | 'inactive';

export default function AdminTickets() {
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

  return (
    <AdminLayout title="Tickets">
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Giras</InputLabel>
          <Select
            value={giraFilter}
            onChange={(e) => {
              setGiraFilter(e.target.value as GiraFilter);
              setGiraId('');
              setPage(0);
            }}
            label="Giras"
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
          onChange={(e) => {
            setDateFrom(e.target.value);
            setGiraId('');
            setPage(0);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />

        <TextField
          size="small"
          label="Data até"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setGiraId('');
            setPage(0);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />

        <FormControl size="small" sx={{ minWidth: 220 }}>
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

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            label="Status"
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="emitted">Emitidos</MenuItem>
            <MenuItem value="called">Chamados</MenuItem>
            <MenuItem value="completed">Concluídos</MenuItem>
            <MenuItem value="cancelled">Cancelados</MenuItem>
          </Select>
        </FormControl>

        {(dateFrom || dateTo || giraFilter !== 'all') && (
          <Button
            size="small"
            onClick={() => {
              setGiraFilter('all');
              setDateFrom('');
              setDateTo('');
              setGiraId('');
              setPage(0);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </Box>

      {selectedTickets.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedTickets.size}
          ticketIds={Array.from(selectedTickets)}
          onRefresh={loadTickets}
          onClearSelection={() => setSelectedTickets(new Set())}
        />
      )}

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedTickets.size === tickets.length && tickets.length > 0}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Número</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Telefone</TableCell>
                  <TableCell>Tag</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Data Emissão</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.length > 0 ? (
                  tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedTickets.has(ticket.id)}
                          onChange={() => handleSelectTicket(ticket.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>#{String(ticket.numero).padStart(4, '0')}</TableCell>
                      <TableCell>{ticket.consulente_nome || '-'}</TableCell>
                      <TableCell>{ticket.consulente_email || '-'}</TableCell>
                      <TableCell>{ticket.consulente_telefone || '-'}</TableCell>
                      <TableCell>
                        {ticket.is_sponsor ? (
                          <Chip icon={<StarIcon />} label="Associado" size="small" sx={{ bgcolor: '#fef9e7', color: '#b8860b', '& .MuiChip-icon': { color: '#daa520' } }} />
                        ) : ticket.preferencial ? (
                          <Chip icon={<StarIcon />} label="Preferencial" color="warning" size="small" variant="outlined" />
                        ) : (
                          <Chip label="Comum" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(ticket.status)}
                          color={getStatusColor(ticket.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(ticket.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
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
    </AdminLayout>
  );
}
