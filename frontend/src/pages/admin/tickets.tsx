/**
 * T074: Admin Tickets Page - Pagination, filtering, bulk actions
 */
'use client';

import React, { useEffect, useState } from 'react';
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
import {
  GetApp as DownloadIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import AdminLayout from './admin_layout';
import BulkActionsBar from '../../components/admin/BulkActionsBar';
import { apiClient } from '../../services/api_client';

interface Ticket {
  id: string;
  numero: number;
  status: string;
  email?: string;
  name?: string;
  chamado_em?: string;
  finalizado_em?: string;
  created_at: string;
}

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [giraId, setGiraId] = useState<string>('');

  useEffect(() => {
    loadTickets();
  }, [page, statusFilter, giraId]);

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

  return (
    <AdminLayout title="Tickets">
      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 200, mr: 2 }}>
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
            {/* Load giras dynamically */}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150, mr: 2 }}>
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
                  <TableCell>Email</TableCell>
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
                      <TableCell>#{String(ticket.numero).padStart(4, '0')}</TableCell>
                      <TableCell>{ticket.email || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={ticket.status}
                          color={getStatusColor(ticket.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
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
