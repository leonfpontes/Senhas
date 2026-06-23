/**
 * Relatório de Gira — exibe tickets de uma gira com médium, cambone e observações.
 * Feature gate: relatorio_gira (tier >= 1: Basic, Pro, Premium).
 *
 * Filtragem:
 *  - status_filter, dateFrom, dateTo, giraFilter: server-side
 *  - texto, médium, cambone, tag: client-side sobre o conjunto completo (até 500 tickets)
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
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
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useSubscription } from '../../hooks/useSubscription';
import { useTenant } from '../../providers/ThemeProvider';
import { useRelatorioPDF } from '../../hooks/useRelatorioPDF';
import { useAdminTheme } from '@/providers/AdminThemeProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  checkin_em?: string | null;
  created_at: string;
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

type GiraFilter = 'all' | 'active' | 'inactive';
type TagFilter  = '' | 'Comum' | 'Preferencial' | 'Associado' | 'Walk-in';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTag(t: Ticket): { label: string; color: string; bg: string } {
  if (t.is_sponsor)   return { label: 'Associado',    color: '#92400e', bg: '#fef3c7' };
  if (t.preferencial) return { label: 'Preferencial', color: '#9a3412', bg: '#fff7ed' };
  if (t.is_walk_in)   return { label: 'Walk-in',      color: '#1e40af', bg: '#eff6ff' };
  return                       { label: 'Comum',       color: '#374151', bg: '#f3f4f6' };
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PAGE_SIZE = 50;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 1.5, px: 0.5 }}>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1, color: color || 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 500, color: 'text.secondary', mt: 0.25, textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </Typography>
    </Box>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function RelatorioGiraPage() {
  return (
    <AdminLayout title="Relatório de Gira">
      <RelatorioGiraContent />
    </AdminLayout>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function RelatorioGiraContent() {
  const router = useRouter();
  const { can }                                  = useSubscription();
  const { tenantName, logoUrl, config }          = useTenant();
  const { generate: generatePDF, loading: loadingPDF } = useRelatorioPDF();
  const { isDark }                               = useAdminTheme();

  // Feature gate
  useEffect(() => {
    if (can('relatorio_gira') === false) router.replace('/admin/plano');
  }, [can, router]);

  // ── Gira selector state ───────────────────────────────────────────
  const [giras, setGiras]             = useState<{ id: string; nome: string; is_active: boolean; data_inicio?: string }[]>([]);
  const [giraId, setGiraId]           = useState<string>('');
  const [giraFilter, setGiraFilter]   = useState<GiraFilter>('all');
  const [dateFrom, setDateFrom]       = useState<string>('');
  const [dateTo, setDateTo]           = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('completed');

  // ── Data state ────────────────────────────────────────────────────
  const [doorStats, setDoorStats]   = useState<DoorStats | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(false);

  // ── Client-side search filters ────────────────────────────────────
  const [searchText, setSearchText]       = useState<string>('');
  const [mediumFilter, setMediumFilter]   = useState<string>('');
  const [camboneFilter, setCamboneFilter] = useState<string>('');
  const [tagFilter, setTagFilter]         = useState<TagFilter>('');
  const [page, setPage]                   = useState(0);

  // ── UI state ──────────────────────────────────────────────────────
  const [giraFiltersOpen, setGiraFiltersOpen] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);

  // ── Load giras ────────────────────────────────────────────────────
  const loadGiras = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (giraFilter === 'active')   params.append('is_active', 'true');
      if (giraFilter === 'inactive') params.append('is_active', 'false');
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to', dateTo);
      const res  = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : res.data.items ?? [];
      setGiras(data);
      if (giraId && !data.some((g: any) => g.id === giraId)) setGiraId('');
    } catch { /* non-critical */ }
  }, [giraFilter, dateFrom, dateTo, giraId]);

  // ── Load tickets ──────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!giraId) { setAllTickets([]); return; }
    setLoading(true);
    try {
      let url = `/api/v1/admin/giras/${giraId}/tickets?skip=0&limit=500`;
      if (statusFilter) url += `&status_filter=${statusFilter}`;
      const res = await apiClient.get(url);
      setAllTickets(res.data.items ?? []);
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, [giraId, statusFilter]);

  // ── Load door stats (for PDF + KPIs) ─────────────────────────────
  const loadDoorStats = useCallback(async () => {
    if (!giraId) { setDoorStats(null); return; }
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${giraId}/door/stats`);
      setDoorStats(res.data);
    } catch { setDoorStats(null); }
  }, [giraId]);

  useEffect(() => {
    const token =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      (typeof localStorage   !== 'undefined' && localStorage.getItem('access_token'));
    if (!token) { router.replace('/login'); return; }
    loadGiras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giraFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadTickets();
    loadDoorStats();
    setSearchText(''); setMediumFilter(''); setCamboneFilter(''); setTagFilter(''); setPage(0);
  }, [giraId, statusFilter]);

  // ── Derived lists ─────────────────────────────────────────────────
  const uniqueMediums = useMemo(() =>
    Array.from(new Set(allTickets.map((t) => t.medium_nome?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [allTickets],
  );
  const uniqueCambones = useMemo(() =>
    Array.from(new Set(allTickets.map((t) => t.cambone_nome?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [allTickets],
  );

  // ── Client-side filtering ─────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    const needle = searchText.length >= 3 ? normalize(searchText) : '';
    return allTickets.filter((t) => {
      if (needle) {
        const nome = normalize(t.consulente_nome ?? '');
        const obs  = normalize(t.atendimento_descricao ?? '');
        if (!nome.includes(needle) && !obs.includes(needle)) return false;
      }
      if (mediumFilter  && (t.medium_nome?.trim()  || '') !== mediumFilter)  return false;
      if (camboneFilter && (t.cambone_nome?.trim()  || '') !== camboneFilter) return false;
      if (tagFilter     && getTag(t).label !== tagFilter)                     return false;
      return true;
    });
  }, [allTickets, searchText, mediumFilter, camboneFilter, tagFilter]);

  useEffect(() => { setPage(0); }, [searchText, mediumFilter, camboneFilter, tagFilter]);

  const pagedTickets = useMemo(
    () => filteredTickets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredTickets, page],
  );

  // ── Export CSV ────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!giraId || filteredTickets.length === 0) return;
    const escape = (v: string | undefined | null) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Senha', 'Nome', 'Tag', 'Status', 'Médium', 'Cambone', 'Observações'];
    const rows = filteredTickets.map((t) => [
      `#${String(t.numero).padStart(4, '0')}`,
      t.consulente_nome ?? '', getTag(t).label, t.status,
      t.medium_nome ?? '', t.cambone_nome ?? '', t.atendimento_descricao ?? '',
    ]);
    const csv  = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `relatorio-${(giras.find((g) => g.id === giraId)?.nome ?? 'gira').replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── Export PDF ────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!giraId || !doorStats) return;
    const g = giras.find((x) => x.id === giraId);
    await generatePDF({
      tickets: filteredTickets,
      doorStats,
      gira: { nome: g?.nome ?? 'Gira', data: g?.data_inicio },
      tenant: {
        nome: tenantName ?? 'Terreiro',
        logoUrl: logoUrl ?? undefined,
        primaryColor:   config?.colors?.primary   ?? '#6366f1',
        secondaryColor: config?.colors?.secondary ?? '#8b5cf6',
      },
    });
  };

  const handleClearGiraFilters = () => {
    setGiraFilter('all'); setDateFrom(''); setDateTo(''); setStatusFilter('completed'); setGiraId(''); setPage(0);
  };
  const handleClearSearchFilters = () => {
    setSearchText(''); setMediumFilter(''); setCamboneFilter(''); setTagFilter(''); setPage(0);
  };

  const hasActiveSearchFilters     = Boolean(searchText || mediumFilter || camboneFilter || tagFilter);
  const activeGiraFilterCount      = [dateFrom, dateTo, giraFilter !== 'all' ? giraFilter : '', statusFilter !== 'completed' ? statusFilter : ''].filter(Boolean).length;
  const selectedGiraName           = giras.find((g) => g.id === giraId)?.nome ?? '';

  // ── Feature gate UI ───────────────────────────────────────────────
  if (!can('relatorio_gira')) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 8, gap: 2, textAlign: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'action.selected', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LockOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
        </Box>
        <Typography variant="h6" fontWeight={700}>Relatório de gira</Typography>
        <Typography variant="body2" color="text.secondary">
          Disponível nos planos Basic, Pro e Premium.
        </Typography>
        <Button variant="contained" disableElevation onClick={() => router.push('/admin/plano')}>
          Ver planos
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Header ── */}
      <Box data-tour="relatorio-header" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Relatório de gira</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Selecione uma gira para visualizar os atendimentos
          </Typography>
        </Box>

        {/* Export actions — only when a gira is selected */}
        {giraId && (
          <Box data-tour="relatorio-export" sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadRoundedIcon sx={{ fontSize: 17 }} />}
              onClick={handleExportCSV}
              disabled={filteredTickets.length === 0}
            >
              CSV
            </Button>
            <Button
              size="small"
              variant="contained"
              disableElevation
              startIcon={loadingPDF ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfRoundedIcon sx={{ fontSize: 17 }} />}
              onClick={handleExportPDF}
              disabled={loadingPDF || !doorStats}
            >
              {loadingPDF ? 'Gerando…' : 'PDF'}
            </Button>
          </Box>
        )}
      </Box>

      {/* ── Gira selector + gira-level filters ── */}
      <Paper data-tour="relatorio-filtros-gira" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 3 }}>
        {/* Main row: gira select + filter toggle */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 280 }, flex: { sm: '0 0 280px' } }}>
            <InputLabel>Selecione uma gira</InputLabel>
            <Select
              value={giraId}
              onChange={(e) => { setGiraId(e.target.value); setPage(0); }}
              label="Selecione uma gira"
            >
              <MenuItem value=""><em>Nenhuma</em></MenuItem>
              {giras.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <span style={{ flex: 1 }}>{g.nome}</span>
                    {!g.is_active && <Chip label="inativa" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant={giraFiltersOpen || activeGiraFilterCount > 0 ? 'contained' : 'outlined'}
            disableElevation
            startIcon={<FilterListRoundedIcon sx={{ fontSize: 17 }} />}
            onClick={() => setGiraFiltersOpen((p) => !p)}
            sx={{ flexShrink: 0 }}
          >
            <Badge badgeContent={activeGiraFilterCount} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16 } }}>
              Filtros de gira
            </Badge>
          </Button>

          {activeGiraFilterCount > 0 && (
            <Button size="small" variant="text" onClick={handleClearGiraFilters} sx={{ color: 'text.secondary' }}>
              Limpar
            </Button>
          )}
        </Box>

        {/* Collapsible gira filters */}
        <Collapse in={giraFiltersOpen}>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Tipo de gira</InputLabel>
              <Select value={giraFilter} onChange={(e) => { setGiraFilter(e.target.value as GiraFilter); setGiraId(''); setPage(0); }} label="Tipo de gira">
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

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status do ticket</InputLabel>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} label="Status do ticket">
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="emitted">Emitidos</MenuItem>
                <MenuItem value="called">Chamados</MenuItem>
                <MenuItem value="completed">Concluídos</MenuItem>
                <MenuItem value="cancelled">Cancelados</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Collapse>
      </Paper>

      {/* ── KPI strip (when gira is selected and doorStats loaded) ── */}
      {giraId && doorStats && (
        <Paper
          data-tour="relatorio-kpis"
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mb: 3, overflow: 'hidden' }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' },
              '& > *': {
                borderRight: '1px solid',
                borderBottom: { xs: '1px solid', md: 'none' },
                borderColor: 'divider',
                '&:nth-of-type(4n)': { borderRight: { xs: 'none', md: '1px solid' } },
                '&:nth-of-type(8n)': { borderRight: 'none' },
                '&:nth-of-type(n+5)': { borderBottom: { xs: 'none', md: 'none' } },
              },
            }}
          >
            <StatPill label="Total"         value={doorStats.total}          />
            <StatPill label="Concluídos"    value={doorStats.completed}      color="#16a34a" />
            <StatPill label="Aguardando"    value={doorStats.awaiting}       />
            <StatPill label="Em atend."     value={doorStats.in_progress}    />
            <StatPill label="No-show"       value={doorStats.no_show}        color="#dc2626" />
            <StatPill label="Walk-in"       value={doorStats.walk_in}        color="#2563eb" />
            <StatPill label="Preferenciais" value={doorStats.preferenciais}  color="#9a3412" />
            <StatPill label="Associados"    value={doorStats.patrocinados}   color="#92400e" />
          </Box>
        </Paper>
      )}

      {/* ── Empty state ── */}
      {!giraId && (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Selecione uma gira acima para visualizar o relatório.
          </Typography>
        </Box>
      )}

      {/* ── Search filters + table ── */}
      {giraId && (
        <>
          {/* Search filter bar */}
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="Buscar por nome ou observações…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" color={searchText.length >= 3 ? 'primary' : 'disabled'} />
                    </InputAdornment>
                  ),
                }}
                helperText={searchText.length > 0 && searchText.length < 3 ? 'Digite ao menos 3 caracteres' : ''}
                sx={{ flex: '1 1 220px', minWidth: 180 }}
              />

              <Button
                size="small"
                variant={searchFiltersOpen || Boolean(mediumFilter || camboneFilter || tagFilter) ? 'contained' : 'outlined'}
                disableElevation
                startIcon={<TuneRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => setSearchFiltersOpen((p) => !p)}
              >
                <Badge badgeContent={[mediumFilter, camboneFilter, tagFilter].filter(Boolean).length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16 } }}>
                  Filtros
                </Badge>
              </Button>

              {hasActiveSearchFilters && (
                <>
                  <Button size="small" variant="text" onClick={handleClearSearchFilters} sx={{ color: 'text.secondary' }}>
                    Limpar
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {filteredTickets.length} de {allTickets.length} ticket{allTickets.length !== 1 ? 's' : ''}
                  </Typography>
                </>
              )}
            </Box>

            <Collapse in={searchFiltersOpen}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Médium</InputLabel>
                  <Select value={mediumFilter} onChange={(e) => setMediumFilter(e.target.value)} label="Médium">
                    <MenuItem value="">Todos</MenuItem>
                    {uniqueMediums.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Cambone</InputLabel>
                  <Select value={camboneFilter} onChange={(e) => setCamboneFilter(e.target.value)} label="Cambone">
                    <MenuItem value="">Todos</MenuItem>
                    {uniqueCambones.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Tag</InputLabel>
                  <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value as TagFilter)} label="Tag">
                    <MenuItem value="">Todas</MenuItem>
                    <MenuItem value="Comum">Comum</MenuItem>
                    <MenuItem value="Preferencial">Preferencial</MenuItem>
                    <MenuItem value="Associado">Associado</MenuItem>
                    <MenuItem value="Walk-in">Walk-in</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Collapse>
          </Paper>

          {allTickets.length > 500 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              Esta gira tem mais de <strong>500</strong> registros — apenas os primeiros 500 são exibidos.
            </Alert>
          )}

          {/* Table */}
          <Paper
            data-tour="relatorio-tabela"
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <TableContainer>
                  <Table size="small" sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.5 }}>Senha</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Nome</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', display: { xs: 'none', sm: 'table-cell' } }}>Tag</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', display: { xs: 'none', md: 'table-cell' } }}>Médium</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', display: { xs: 'none', md: 'table-cell' } }}>Cambone</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Observações</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pagedTickets.length > 0 ? (
                        pagedTickets.map((ticket) => {
                          const tag = getTag(ticket);
                          return (
                            <TableRow key={ticket.id} hover>
                              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                                #{String(ticket.numero).padStart(4, '0')}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{ticket.consulente_nome || '—'}</TableCell>
                              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                <Chip
                                  label={tag.label}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: tag.bg, color: tag.color }}
                                />
                              </TableCell>
                              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, fontSize: '0.82rem', color: 'text.secondary' }}>
                                {ticket.medium_nome || '—'}
                              </TableCell>
                              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, fontSize: '0.82rem', color: 'text.secondary' }}>
                                {ticket.cambone_nome || '—'}
                              </TableCell>
                              <TableCell sx={{ maxWidth: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem', color: 'text.secondary' }}>
                                {ticket.atendimento_descricao || '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                            {hasActiveSearchFilters
                              ? 'Nenhum ticket encontrado para os filtros aplicados.'
                              : 'Nenhum ticket encontrado para esta gira.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {filteredTickets.length > PAGE_SIZE && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Pagination
                      count={Math.ceil(filteredTickets.length / PAGE_SIZE)}
                      page={page + 1}
                      onChange={(_, p) => setPage(p - 1)}
                      size="small"
                    />
                  </Box>
                )}
              </>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
