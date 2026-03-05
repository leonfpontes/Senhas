/**
 * T076: Admin Audit Trail Page - Audit log viewer, filter, export
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
  Info as InfoIcon,
} from '@mui/icons-material';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  details?: Record<string, any>;
  created_at: string;
}

export default function AdminAuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('');

  useEffect(() => {
    loadAuditLogs();
  }, [page, actionFilter, resourceTypeFilter]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      let url = `/api/v1/admin/audit-logs?skip=${page * limit}&limit=${limit}`;

      if (actionFilter) {
        url += `&action_filter=${actionFilter}`;
      }
      if (resourceTypeFilter) {
        url += `&resource_type_filter=${resourceTypeFilter}`;
      }

      const response = await apiClient.get(url);
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await apiClient.get('/api/v1/admin/audit-logs?limit=10000', {
        responseType: 'blob',
      });

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
    <AdminLayout title="Auditoria">
      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 150, mr: 2 }}>
          <InputLabel>Ação</InputLabel>
          <Select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            label="Ação"
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="create">Criar</MenuItem>
            <MenuItem value="update">Atualizar</MenuItem>
            <MenuItem value="delete">Deletar</MenuItem>
            <MenuItem value="login">Login</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150, mr: 2 }}>
          <InputLabel>Tipo de Recurso</InputLabel>
          <Select
            value={resourceTypeFilter}
            onChange={(e) => {
              setResourceTypeFilter(e.target.value);
              setPage(0);
            }}
            label="Tipo de Recurso"
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="User">Usuário</MenuItem>
            <MenuItem value="Ticket">Ticket</MenuItem>
            <MenuItem value="Gira">Gira</MenuItem>
            <MenuItem value="TenantConfig">Configuração</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
        >
          Exportar
        </Button>
      </Box>

      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Ação</TableCell>
                  <TableCell>Recurso</TableCell>
                  <TableCell>ID do Recurso</TableCell>
                  <TableCell>Detalhes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            display: 'inline-block',
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 0.5,
                            backgroundColor:
                              log.action === 'create'
                                ? '#c8e6c9'
                                : log.action === 'delete'
                                  ? '#ffcdd2'
                                  : '#fff9c4',
                            color:
                              log.action === 'create'
                                ? '#2e7d32'
                                : log.action === 'delete'
                                  ? '#c62828'
                                  : '#f57f17',
                          }}
                        >
                          {log.action.toUpperCase()}
                        </Box>
                      </TableCell>
                      <TableCell>{log.resource_type}</TableCell>
                      <TableCell>{log.resource_id?.toString().slice(0, 8) || '-'}</TableCell>
                      <TableCell>
                        {log.details ? JSON.stringify(log.details).slice(0, 50) + '...' : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Nenhum log encontrado
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
