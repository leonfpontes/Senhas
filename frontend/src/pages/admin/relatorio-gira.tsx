/**
 * Relatório de Gira — atendimentos de uma gira com médium, cambone e observações.
 * Gate de plano: `relatorio_gira` (Basic, Pro, Premium) via `PlanLocked`.
 *
 * A gira mais recente que já começou vem pré-selecionada na primeira carga.
 * Filtragem:
 *  - status_filter, dateFrom, dateTo: no servidor (Popover "Filtros de gira")
 *  - texto, médium, cambone, tag: no cliente sobre o conjunto completo (até 500 senhas)
 * Exportações: CSV (cliente) e PDF (`useRelatorioPDF`, layout em `components/pdf`).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileText, ListFilter, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useTenant } from '../../providers/ThemeProvider';
import { useRelatorioPDF } from '../../hooks/useRelatorioPDF';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Combobox, DateField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDateBr } from '@/lib/dateBr';
import { IconGira } from '@/lib/icons';
import { minPlanFor } from '@/constants/plans';
import { numeroDaSenha } from '@/components/admin/senhaFormat';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  numero: number;
  numero_formatado?: string | null;
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

interface GiraResumo {
  id: string;
  nome: string;
  data_inicio?: string;
}

export type TagLabel = 'Comum' | 'Preferencial' | 'Associado' | 'Sem senha';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTag(t: Pick<Ticket, 'is_sponsor' | 'preferencial' | 'is_walk_in'>): TagLabel {
  if (t.is_sponsor) return 'Associado';
  if (t.preferencial) return 'Preferencial';
  if (t.is_walk_in) return 'Sem senha';
  return 'Comum';
}

const TAG_CLASS: Record<TagLabel, string> = {
  Associado: 'bg-warning text-warning-foreground',
  Preferencial: 'bg-secondary text-secondary-foreground',
  'Sem senha': 'bg-info text-info-foreground',
  Comum: 'bg-muted text-muted-foreground',
};

export const STATUS_LABELS: Record<string, string> = {
  emitted: 'Emitida',
  called: 'Emitida', // legado: "Chamar" já atende, o app não grava mais "called"
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não veio',
  waitlisted: 'Lista de espera',
  waitlist_expired: 'Espera expirada',
};

/** Gira mais recente que já começou (lista vem do backend por `data_inicio` desc). */
export function pickUltimaGira(giras: GiraResumo[], agora: Date = new Date()): string | null {
  if (giras.length === 0) return null;
  const passada = giras.find((g) => g.data_inicio && new Date(g.data_inicio).getTime() <= agora.getTime());
  return (passada ?? giras[0]).id;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PAGE_SIZE = 50;

function StatPill({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex flex-col items-center justify-center border-b border-r px-1 py-3 text-center [&:nth-child(4n)]:border-r-0 [&:nth-child(n+5)]:border-b-0 md:border-b-0 md:[&:nth-child(4n)]:border-r md:[&:nth-child(8n)]:border-r-0">
      <span className={cn('text-2xl font-extrabold leading-none tabular-nums text-foreground', className)}>{value}</span>
      <span className="mt-1 text-[0.68rem] font-medium leading-tight text-muted-foreground [overflow-wrap:anywhere]">{label}</span>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function RelatorioGiraPage() {
  return (
    <AdminLayout title="Relatório de Gira">
      <RelatorioGiraContent />
    </AdminLayout>
  );
}

function RelatorioGiraContent() {
  const router = useRouter();
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showError } = useSnackbar();
  const { tenantName, logoUrl, config } = useTenant();
  const { generate: generatePDF, loading: loadingPDF } = useRelatorioPDF();
  const canView = canGroup('relatorio_gira', 'view');
  const hasPlan = can('relatorio_gira');

  // ── Seletor de gira ───────────────────────────────────────────────
  const [giras, setGiras] = useState<GiraResumo[]>([]);
  const [girasLoaded, setGirasLoaded] = useState(false);
  const [giraId, setGiraId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('completed');
  const autoSelected = useRef(false);

  // ── Dados ─────────────────────────────────────────────────────────
  const [doorStats, setDoorStats] = useState<DoorStats | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Filtros no cliente ────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [mediumFilter, setMediumFilter] = useState<string | null>(null);
  const [camboneFilter, setCamboneFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<TagLabel | null>(null);

  const loadGiras = useCallback(async () => {
    if (!canView || !hasPlan) return;
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const res = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const data: GiraResumo[] = Array.isArray(res.data) ? res.data : res.data.items ?? [];
      setGiras(data);
      if (!autoSelected.current) {
        autoSelected.current = true;
        setGiraId(pickUltimaGira(data));
      } else {
        setGiraId((cur) => (cur && !data.some((g) => g.id === cur) ? null : cur));
      }
    } catch {
      showError('Erro ao carregar a lista de giras.');
    } finally {
      setGirasLoaded(true);
    }
  }, [dateFrom, dateTo, canView, hasPlan, showError]);

  const loadTickets = useCallback(async () => {
    if (!giraId || !canView) {
      setAllTickets([]);
      return;
    }
    setLoading(true);
    try {
      let url = `/api/v1/admin/giras/${giraId}/tickets?skip=0&limit=500`;
      if (statusFilter) url += `&status_filter=${statusFilter}`;
      const res = await apiClient.get(url);
      setAllTickets(res.data.items ?? []);
    } catch {
      setAllTickets([]);
      showError('Erro ao carregar os atendimentos da gira.');
    } finally {
      setLoading(false);
    }
  }, [giraId, statusFilter, canView, showError]);

  const loadDoorStats = useCallback(async () => {
    if (!giraId || !canView) {
      setDoorStats(null);
      return;
    }
    try {
      const res = await apiClient.get(`/api/v1/admin/giras/${giraId}/door/stats`);
      setDoorStats(res.data);
    } catch {
      setDoorStats(null);
    }
  }, [giraId, canView]);

  useEffect(() => {
    // Sessão normal = cookie HttpOnly (auth_state=1); impersonação = sessionStorage.
    const hasAuthToken =
      Boolean(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
      Boolean(typeof document !== 'undefined' && document.cookie.includes('auth_state=1'));
    if (!hasAuthToken) {
      router.replace('/login');
      return;
    }
    loadGiras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGiras]);

  useEffect(() => {
    loadTickets();
    loadDoorStats();
    setSearchText('');
    setMediumFilter(null);
    setCamboneFilter(null);
    setTagFilter(null);
  }, [loadTickets, loadDoorStats]);

  // ── Listas derivadas ──────────────────────────────────────────────
  const uniqueMediums = useMemo(
    () =>
      Array.from(new Set(allTickets.map((t) => t.medium_nome?.trim()).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [allTickets],
  );
  const uniqueCambones = useMemo(
    () =>
      Array.from(new Set(allTickets.map((t) => t.cambone_nome?.trim()).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [allTickets],
  );

  const filteredTickets = useMemo(() => {
    const needle = searchText.length >= 3 ? normalize(searchText) : '';
    return allTickets.filter((t) => {
      if (needle) {
        const nome = normalize(t.consulente_nome ?? '');
        const obs = normalize(t.atendimento_descricao ?? '');
        if (!nome.includes(needle) && !obs.includes(needle)) return false;
      }
      if (mediumFilter && (t.medium_nome?.trim() || '') !== mediumFilter) return false;
      if (camboneFilter && (t.cambone_nome?.trim() || '') !== camboneFilter) return false;
      if (tagFilter && getTag(t) !== tagFilter) return false;
      return true;
    });
  }, [allTickets, searchText, mediumFilter, camboneFilter, tagFilter]);

  const giraSelecionada = giras.find((g) => g.id === giraId);

  // ── Exportar CSV ──────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!giraId || filteredTickets.length === 0) return;
    const escape = (v: string | undefined | null) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Senha', 'Nome', 'Tag', 'Status', 'Médium', 'Cambone', 'Observações'];
    const rows = filteredTickets.map((t) => [
      numeroDaSenha(t),
      t.consulente_nome ?? '',
      getTag(t),
      STATUS_LABELS[t.status] ?? t.status,
      t.medium_nome ?? '',
      t.cambone_nome ?? '',
      t.atendimento_descricao ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-${(giraSelecionada?.nome ?? 'gira').replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── Exportar PDF ──────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!giraId || !doorStats) return;
    await generatePDF({
      tickets: filteredTickets,
      doorStats,
      gira: { nome: giraSelecionada?.nome ?? 'Gira', data: giraSelecionada?.data_inicio },
      tenant: {
        nome: tenantName ?? 'Terreiro',
        logoUrl: logoUrl ?? undefined,
        primaryColor: config?.colors?.primary ?? '#6366f1',
        secondaryColor: config?.colors?.secondary ?? '#8b5cf6',
      },
    });
  };

  const handleClearGiraFilters = () => {
    setDateFrom(null);
    setDateTo(null);
    setStatusFilter('completed');
  };
  const handleClearSearchFilters = () => {
    setSearchText('');
    setMediumFilter(null);
    setCamboneFilter(null);
    setTagFilter(null);
  };

  const hasActiveSearchFilters = Boolean(searchText || mediumFilter || camboneFilter || tagFilter);
  const activeGiraFilterCount = [dateFrom, dateTo, statusFilter !== 'completed' ? 'x' : ''].filter(Boolean).length;
  const activeSearchFilterCount = [mediumFilter, camboneFilter, tagFilter].filter(Boolean).length;

  const giraOptions = useMemo(
    () =>
      giras.map((g) => ({
        value: g.id,
        label: g.data_inicio ? `${g.nome} — ${formatDateBr(g.data_inicio)}` : g.nome,
      })),
    [giras],
  );

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: 'Senha',
        meta: { cellClassName: 'whitespace-nowrap font-mono font-bold' },
        cell: ({ row }) => numeroDaSenha(row.original),
      },
      {
        accessorKey: 'consulente_nome',
        header: 'Nome',
        cell: ({ getValue }) => getValue<string | undefined>() || '—',
      },
      {
        id: 'tag',
        header: 'Tag',
        accessorFn: (t) => getTag(t),
        cell: ({ getValue }) => {
          const tag = getValue<TagLabel>();
          return <Badge className={cn('border-transparent', TAG_CLASS[tag])}>{tag}</Badge>;
        },
      },
      {
        accessorKey: 'medium_nome',
        header: 'Médium',
        meta: { cellClassName: 'text-muted-foreground' },
        cell: ({ getValue }) => getValue<string | undefined>() || '—',
      },
      {
        accessorKey: 'cambone_nome',
        header: 'Cambone',
        meta: { cellClassName: 'text-muted-foreground' },
        cell: ({ getValue }) => getValue<string | undefined>() || '—',
      },
      {
        accessorKey: 'atendimento_descricao',
        header: 'Observações',
        enableSorting: false,
        meta: { cellClassName: 'max-w-[18rem] whitespace-pre-wrap break-words text-muted-foreground' },
        cell: ({ getValue }) => getValue<string | undefined>() || '—',
      },
    ],
    [],
  );

  const renderCard = (t: Ticket) => {
    const tag = getTag(t);
    return (
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-mono text-sm font-bold">{numeroDaSenha(t)}</span>
            <p className="m-0 truncate text-sm font-medium">{t.consulente_nome || '—'}</p>
          </div>
          <Badge className={cn('border-transparent', TAG_CLASS[tag])}>{tag}</Badge>
        </div>
        {(t.medium_nome || t.cambone_nome) && (
          <p className="m-0 text-xs text-muted-foreground">
            {t.medium_nome && <>Médium: {t.medium_nome}</>}
            {t.medium_nome && t.cambone_nome && ' · '}
            {t.cambone_nome && <>Cambone: {t.cambone_nome}</>}
          </p>
        )}
        {t.atendimento_descricao && (
          <p className="m-0 whitespace-pre-wrap break-words text-sm text-muted-foreground">{t.atendimento_descricao}</p>
        )}
      </div>
    );
  };

  // ── Gates ─────────────────────────────────────────────────────────
  if (subLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!hasPlan) return <PlanLocked feature="Relatório de gira" minPlan={minPlanFor('relatorio_gira').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar o relatório de gira." />;

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="relatorio-header">
        <PageHeader
          title="Relatório de gira"
          subtitle="Atendimentos da gira com médium, cambone e observações"
          className="mb-0"
          actions={
            giraId ? (
              <div data-tour="relatorio-export" className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={filteredTickets.length === 0}>
                  <Download />
                  CSV
                </Button>
                <Button size="sm" onClick={handleExportPDF} disabled={loadingPDF || !doorStats}>
                  {loadingPDF ? <Loader2 className="animate-spin" /> : <FileText />}
                  {loadingPDF ? 'Gerando…' : 'PDF'}
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>

      {/* Seletor de gira + filtros de gira */}
      <Card data-tour="relatorio-filtros-gira" className="gap-0 py-4">
        <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-end">
          <Combobox
            label="Gira"
            options={giraOptions}
            value={giraId}
            onChange={setGiraId}
            placeholder={girasLoaded && giras.length === 0 ? 'Nenhuma gira encontrada' : 'Selecione uma gira'}
            searchPlaceholder="Buscar gira..."
            emptyText="Nenhuma gira encontrada."
            className="sm:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={activeGiraFilterCount > 0 ? 'secondary' : 'outline'} size="sm" className="h-9">
                  <ListFilter />
                  Filtros de gira
                  {activeGiraFilterCount > 0 && (
                    <Badge className="ml-1 h-5 min-w-5 rounded-full px-1.5">{activeGiraFilterCount}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <DateField label="De" size="small" value={dateFrom} max={dateTo ?? undefined} onChange={setDateFrom} />
                  <DateField label="Até" size="small" value={dateTo} min={dateFrom ?? undefined} onChange={setDateTo} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rel-status">Status da senha</Label>
                  <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger id="rel-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="emitted">Emitidas</SelectItem>
                      <SelectItem value="completed">Concluídas</SelectItem>
                      <SelectItem value="no_show">Não veio</SelectItem>
                      <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {activeGiraFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearGiraFilters} className="self-end">
                    <X />
                    Limpar filtros
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* KPIs da porta */}
      {giraId && doorStats && (
        <Card data-tour="relatorio-kpis" className="gap-0 overflow-hidden py-0">
          <div className="grid grid-cols-4 md:grid-cols-8">
            <StatPill label="Total" value={doorStats.total} />
            <StatPill label="Concluídos" value={doorStats.completed} className="text-success" />
            <StatPill label="Aguardando" value={doorStats.awaiting} />
            <StatPill label="Chegaram" value={doorStats.checked_in} />
            <StatPill label="Não veio" value={doorStats.no_show} className="text-destructive" />
            <StatPill label="Sem senha" value={doorStats.walk_in} className="text-info" />
            <StatPill label="Preferenciais" value={doorStats.preferenciais} />
            <StatPill label="Associados" value={doorStats.patrocinados} className="text-warning" />
          </div>
        </Card>
      )}

      {!giraId && girasLoaded && (
        <EmptyState
          icon={<IconGira />}
          title={giras.length === 0 ? 'Nenhuma gira encontrada' : 'Selecione uma gira'}
          description={
            giras.length === 0
              ? 'Ajuste os filtros de gira ou cadastre uma gira.'
              : 'Escolha uma gira acima para ver o relatório de atendimentos.'
          }
        />
      )}

      {giraId && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <TextField
              aria-label="Buscar por nome ou observações"
              placeholder="Buscar por nome ou observações…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              startAdornment={<Search />}
              size="small"
              helperText={searchText.length > 0 && searchText.length < 3 ? 'Digite ao menos 3 caracteres' : undefined}
              className="sm:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={activeSearchFilterCount > 0 ? 'secondary' : 'outline'} size="sm" className="h-8">
                    <SlidersHorizontal />
                    Filtros
                    {activeSearchFilterCount > 0 && (
                      <Badge className="ml-1 h-5 min-w-5 rounded-full px-1.5">{activeSearchFilterCount}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3">
                  <Combobox
                    label="Médium"
                    options={uniqueMediums.map((n) => ({ value: n, label: n }))}
                    value={mediumFilter}
                    onChange={setMediumFilter}
                    placeholder="Todos"
                    clearable
                  />
                  <Combobox
                    label="Cambone"
                    options={uniqueCambones.map((n) => ({ value: n, label: n }))}
                    value={camboneFilter}
                    onChange={setCamboneFilter}
                    placeholder="Todos"
                    clearable
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rel-tag">Tag</Label>
                    <Select value={tagFilter ?? 'all'} onValueChange={(v) => setTagFilter(v === 'all' ? null : (v as TagLabel))}>
                      <SelectTrigger id="rel-tag" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="Comum">Comum</SelectItem>
                        <SelectItem value="Preferencial">Preferencial</SelectItem>
                        <SelectItem value="Associado">Associado</SelectItem>
                        <SelectItem value="Sem senha">Sem senha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
              {hasActiveSearchFilters && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleClearSearchFilters}>
                    <X />
                    Limpar
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {filteredTickets.length} de {allTickets.length} senha{allTickets.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          {allTickets.length >= 500 && (
            <Alert variant="warning">
              <AlertDescription>
                Esta gira tem 500 registros ou mais — apenas os primeiros 500 são exibidos.
              </AlertDescription>
            </Alert>
          )}

          <div data-tour="relatorio-tabela">
            <DataTable
              columns={columns}
              data={filteredTickets}
              getRowId={(t) => t.id}
              loading={loading}
              pageSize={PAGE_SIZE}
              renderCard={renderCard}
              dense
              emptyMessage={
                hasActiveSearchFilters
                  ? 'Nenhuma senha encontrada para os filtros aplicados.'
                  : 'Nenhuma senha encontrada para esta gira.'
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
