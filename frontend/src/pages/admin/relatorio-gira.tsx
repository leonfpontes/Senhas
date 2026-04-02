/**
 * Relatório de Gira — exibe tickets de uma gira com médium, cambone e observações.
 * Feature gate: relatorio_gira (tier >= 1: Basic, Pro, Premium).
 *
 * Estratégia de filtragem:
 *  - status_filter: server-side (parâmetro de query)
 *  - Texto, médium, cambone, tag: client-side sobre o conjunto completo carregado (até 500 tickets)
 */
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  InputAdornment,
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
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/GetApp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import LockIcon from '@mui/icons-material/Lock';
import SearchIcon from '@mui/icons-material/Search';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useSubscription } from '../../hooks/useSubscription';

interface Ticket {
  id: string;
  numero: number;
  status: string;
  consulente_nome?: string;
  preferencial?: boolean;
  is_sponsor?: boolean;
  is_walk_in?: boolean;
  medium_nome?: string;
  cambone_nome?: string;
  observacoes?: string;
  atendimento_descricao?: string;
  created_at: string;
}

type GiraFilter = 'all' | 'active' | 'inactive';
type TagFilter = '' | 'Comum' | 'Preferencial' | 'Associado' | 'Walk-in';

function getTag(t: Ticket): { label: string; color: string; bg: string } {
  if (t.is_sponsor)   return { label: 'Associado',    color: '#b8860b', bg: '#fef9e7' };
  if (t.preferencial) return { label: 'Preferencial', color: '#e65100', bg: '#fff3e0' };
  if (t.is_walk_in)   return { label: 'Walk-in',      color: '#1565c0', bg: '#e3f2fd' };
  return                       { label: 'Comum',       color: '#546e7a', bg: '#f5f5f5' };
}

/** Normaliza string para comparação case-insensitive sem acentos */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const PAGE_SIZE = 50;

export default function RelatorioGiraPage() {
  return (
    <AdminLayout title="Relatório de Gira">
      <RelatorioGiraContent />
    </AdminLayout>
  );
}

function RelatorioGiraContent() {
  const router = useRouter();
  const { can } = useSubscription();

  // Feature gate — redireciona para /admin/plano se não tiver acesso
  useEffect(() => {
    if (can('relatorio_gira') === false) {
      router.replace('/admin/plano');
    }
  }, [can, router]);

  // ── Filtros de seleção de gira (server-side) ──────────────────────
  const [giras, setGiras] = useState<{ id: string; nome: string; is_active: boolean }[]>([]);
  const [giraId, setGiraId]         = useState<string>('');
  const [giraFilter, setGiraFilter] = useState<GiraFilter>('all');
  const [dateFrom, setDateFrom]     = useState<string>('');
  const [dateTo, setDateTo]         = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('completed');

  // ── Dados brutos carregados da API ────────────────────────────────
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(false);

  // ── Filtros client-side ───────────────────────────────────────────
  const [searchText, setSearchText]       = useState<string>('');
  const [mediumFilter, setMediumFilter]   = useState<string>('');
  const [camboneFilter, setCamboneFilter] = useState<string>('');
  const [tagFilter, setTagFilter]         = useState<TagFilter>('');

  // ── Paginação client-side (sobre resultado filtrado) ──────────────
  const [page, setPage] = useState(0);

  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // ─── Carrega lista de giras disponíveis ───────────────────────────
  const loadGiras = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (giraFilter === 'active')   params.append('is_active', 'true');
      if (giraFilter === 'inactive') params.append('is_active', 'false');
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to', dateTo);
      const res = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : res.data.items ?? [];
      setGiras(data);
      if (giraId && !data.some((g: any) => g.id === giraId)) {
        setGiraId('');
      }
    } catch (err) {
      console.error('Erro ao carregar giras:', err);
    }
  }, [giraFilter, dateFrom, dateTo, giraId]);

  // ─── Carrega todos os tickets de uma gira (até 500) ───────────────
  const loadTickets = useCallback(async () => {
    if (!giraId) {
      setAllTickets([]);
      return;
    }
    setLoading(true);
    try {
      let url = `/api/v1/admin/giras/${giraId}/tickets?skip=0&limit=500`;
      if (statusFilter) url += `&status_filter=${statusFilter}`;
      const res = await apiClient.get(url);
      setAllTickets(res.data.items ?? []);
    } catch (err) {
      console.error('Erro ao carregar tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [giraId, statusFilter]);

  useEffect(() => {
    const token =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('access_token'));
    if (!token) { router.replace('/login'); return; }
    loadGiras();
  }, [giraFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadTickets();
    // Ao trocar de gira ou status, limpa filtros client-side e volta à página 0
    setSearchText('');
    setMediumFilter('');
    setCamboneFilter('');
    setTagFilter('');
    setPage(0);
  }, [giraId, statusFilter]);

  // ─── Listas únicas para dropdowns ─────────────────────────────────
  const uniqueMediums = useMemo(() => {
    const names = allTickets
      .map((t) => t.medium_nome?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allTickets]);

  const uniqueCambones = useMemo(() => {
    const names = allTickets
      .map((t) => t.cambone_nome?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allTickets]);

  // ─── Filtragem client-side ────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    const needle = searchText.length >= 3 ? normalize(searchText) : '';

    return allTickets.filter((t) => {
      if (needle) {
        const nome = normalize(t.consulente_nome ?? '');
        const obs  = normalize(t.atendimento_descricao ?? t.observacoes ?? '');
        if (!nome.includes(needle) && !obs.includes(needle)) return false;
      }
      if (mediumFilter && (t.medium_nome?.trim() || '') !== mediumFilter) return false;
      if (camboneFilter && (t.cambone_nome?.trim() || '') !== camboneFilter) return false;
      if (tagFilter && getTag(t).label !== tagFilter) return false;
      return true;
    });
  }, [allTickets, searchText, mediumFilter, camboneFilter, tagFilter]);

  useEffect(() => { setPage(0); }, [searchText, mediumFilter, camboneFilter, tagFilter]);

  const pagedTickets = useMemo(
    () => filteredTickets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredTickets, page],
  );

  // ─── Exportar CSV (client-side, a partir dos dados já carregados) ──
  const handleExportCSV = () => {
    if (!giraId || filteredTickets.length === 0) return;

    const escape = (v: string | undefined | null) => {
      if (v == null) return '';
      const s = String(v);
      // Envolve em aspas se contiver vírgula, aspas ou quebra de linha
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = ['Senha', 'Nome', 'Tag', 'Status', 'Médium', 'Cambone', 'Observações'];
    const rows = filteredTickets.map((t) => [
      `#${String(t.numero).padStart(4, '0')}`,
      t.consulente_nome ?? '',
      getTag(t).label,
      t.status,
      t.medium_nome ?? '',
      t.cambone_nome ?? '',
      t.atendimento_descricao ?? '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(escape).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const giraName = giras.find((g) => g.id === giraId)?.nome ?? 'relatorio';
    link.download = `relatorio-${giraName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleClearGiraFilters = () => {
    setGiraFilter('all');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('completed');
    setGiraId('');
    setPage(0);
  };

  const handleClearSearchFilters = () => {
    setSearchText('');
    setMediumFilter('');
    setCamboneFilter('');
    setTagFilter('');
    setPage(0);
  };

  const hasActiveSearchFilters = Boolean(searchText || mediumFilter || camboneFilter || tagFilter);

  const activeGiraFilterCount = [
    dateFrom,
    dateTo,
    giraFilter !== 'all' ? giraFilter : '',
    statusFilter !== 'completed' ? statusFilter : '',
  ].filter(Boolean).length;

  // ─── Gate de acesso ───────────────────────────────────────────────
  if (!can('relatorio_gira')) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 8, gap: 2 }}>
        <LockIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary">
          Recurso disponível nos planos Basic, Pro e Premium.
        </Typography>
        <Button variant="contained" onClick={() => router.push('/admin/plano')}>
          Ver planos
        </Button>
      </Box>
    );
  }

  return (
    <>
      {/* ── Seletor de Gira + filtros de gira ── */}
      <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 2 }, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
          <InputLabel>Selecione uma Gira</InputLabel>
          <Select
            value={giraId}
            onChange={(e) => { setGiraId(e.target.value); setPage(0); }}
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

        {/* Toggle de filtros — apenas mobile */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<FilterListIcon />}
          endIcon={filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setFiltersExpanded((p) => !p)}
          sx={{ display: { xs: 'flex', sm: 'none' }, width: '100%', justifyContent: 'space-between' }}
        >
          <Badge badgeContent={activeGiraFilterCount} color="primary" sx={{ flexGrow: 1, textAlign: 'left' }}>
            Filtros de gira
          </Badge>
        </Button>

        {/* Filtros de gira — desktop sempre visível */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexWrap: 'wrap', gap: 2, alignItems: 'center', flexGrow: 1 }}>
          <FormControl size="small" sx={{ minWidth: 130 }}>
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

          <TextField size="small" label="Data de" type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }} sx={{ minWidth: 160 }} />

          <TextField size="small" label="Data até" type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }} sx={{ minWidth: 160 }} />

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

          {(dateFrom || dateTo || giraFilter !== 'all' || statusFilter !== 'completed') && (
            <Button size="small" onClick={handleClearGiraFilters}>Limpar</Button>
          )}

          {giraId && (
            <Box sx={{ ml: 'auto' }}>
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCSV}>
                Exportar CSV
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Filtros de gira colapsáveis — apenas mobile */}
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
          <TextField size="small" label="Data de" type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }} fullWidth />
          <TextField size="small" label="Data até" type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setGiraId(''); setPage(0); }}
            InputLabelProps={{ shrink: true }} fullWidth />
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
          {(dateFrom || dateTo || giraFilter !== 'all' || statusFilter !== 'completed') && (
            <Button size="small" variant="text" onClick={handleClearGiraFilters}>Limpar filtros de gira</Button>
          )}
          {giraId && (
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} fullWidth onClick={handleExportCSV}>
              Exportar CSV
            </Button>
          )}
        </Box>
      </Collapse>

      {/* ── Filtros de busca nos tickets (client-side) ── */}
      {giraId && !loading && (
        <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label="Buscar por nome ou observações"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color={searchText.length >= 3 ? 'primary' : 'disabled'} />
                </InputAdornment>
              ),
            }}
            helperText={searchText.length > 0 && searchText.length < 3 ? 'Digite ao menos 3 caracteres' : ''}
            sx={{ minWidth: { xs: '100%', sm: 260 } }}
          />

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <InputLabel>Médium</InputLabel>
            <Select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              label="Médium"
            >
              <MenuItem value="">Todos</MenuItem>
              {uniqueMediums.map((name) => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <InputLabel>Cambone</InputLabel>
            <Select
              value={camboneFilter}
              onChange={(e) => setCamboneFilter(e.target.value)}
              label="Cambone"
            >
              <MenuItem value="">Todos</MenuItem>
              {uniqueCambones.map((name) => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <InputLabel>Tag</InputLabel>
            <Select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value as TagFilter)}
              label="Tag"
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="Comum">Comum</MenuItem>
              <MenuItem value="Preferencial">Preferencial</MenuItem>
              <MenuItem value="Associado">Associado</MenuItem>
              <MenuItem value="Walk-in">Walk-in</MenuItem>
            </Select>
          </FormControl>

          {hasActiveSearchFilters && (
            <Button size="small" variant="text" onClick={handleClearSearchFilters} sx={{ alignSelf: 'center' }}>
              Limpar busca
            </Button>
          )}

          {hasActiveSearchFilters && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
              {filteredTickets.length} de {allTickets.length} ticket{allTickets.length !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
      )}

      {/* Alerta de volume alto */}
      {giraId && allTickets.length > 500 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Esta gira tem mais de <strong>500</strong> registros. A exportação do CSV pode demorar alguns segundos.
        </Alert>
      )}

      {/* Estado vazio */}
      {!giraId && (
        <Box sx={{ mt: 6, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body1">Selecione uma gira para visualizar o relatório.</Typography>
        </Box>
      )}

      {/* Tabela */}
      {giraId && (
        <TableContainer component={Paper} sx={{ mt: 1, overflowX: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell>Senha</TableCell>
                    <TableCell>Nome</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Tag</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Médium</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Cambone</TableCell>
                    <TableCell>Observações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedTickets.length > 0 ? (
                    pagedTickets.map((ticket) => {
                      const tag = getTag(ticket);
                      return (
                        <TableRow key={ticket.id}>
                          <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            #{String(ticket.numero).padStart(4, '0')}
                          </TableCell>
                          <TableCell>{ticket.consulente_nome || '-'}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                            <Chip
                              label={tag.label}
                              size="small"
                              sx={{ bgcolor: tag.bg, color: tag.color, fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            {ticket.medium_nome || '-'}
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            {ticket.cambone_nome || '-'}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {ticket.atendimento_descricao || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        {hasActiveSearchFilters
                          ? 'Nenhum ticket encontrado para os filtros aplicados.'
                          : 'Nenhum ticket encontrado.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {filteredTickets.length > PAGE_SIZE && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <Pagination
                    count={Math.ceil(filteredTickets.length / PAGE_SIZE)}
                    page={page + 1}
                    onChange={(_, p) => setPage(p - 1)}
                  />
                </Box>
              )}
            </>
          )}
        </TableContainer>
      )}
    </>
  );
}
